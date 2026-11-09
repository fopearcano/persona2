/**
 * Recupero semantico con embedding locali (facoltativo).
 *
 * - Gli embedding sono calcolati da un endpoint compatibile OpenAI (/v1/embeddings),
 *   tipicamente un modello multilingue caricato in LM Studio: ciò consente di recuperare
 *   una memoria scritta in russo a partire da una domanda in italiano.
 * - Sono salvati accanto al testo (memories.embedding, knowledge_chunks.embedding) insieme
 *   al nome del modello: cambiando modello i vettori vengono ricalcolati.
 * - Il recupero resta ibrido: FTS5 lessicale + similarità coseno. Se il servizio di
 *   embedding non risponde si torna al solo recupero lessicale, senza errori per l'utente.
 */
import type { EmbeddingStatus, EmbeddingTestResult } from '@persona/shared';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { trackBackground } from '../context.js';
import { modelConfigurations } from '../db/schema.js';
import { LlmError, type LlmProvider } from '../llm/types.js';
import { AppError, nowIso } from '../lib/util.js';
import { getPreferences } from './preferences.js';

/* ------------------------------------------------------------------ */
/* Codifica dei vettori                                                */
/* ------------------------------------------------------------------ */

export function encodeVector(v: ArrayLike<number>): string {
  const f = Float32Array.from(v);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString('base64');
}

export function decodeVector(s: string): Float32Array {
  const buf = Buffer.from(s, 'base64');
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Cache dei vettori decodificati (chiave: id|modello), invalidata da scritture e ripristini. */
const cache = new Map<string, Float32Array>();
let cacheGeneration = -1;

function cached(ctx: AppContext, id: string, model: string, encoded: string): Float32Array {
  if (cacheGeneration !== ctx.dbm.generation) {
    cache.clear();
    cacheGeneration = ctx.dbm.generation;
  }
  const key = `${id}|${model}`;
  let v = cache.get(key);
  if (!v) {
    v = decodeVector(encoded);
    if (cache.size > 50_000) cache.clear();
    cache.set(key, v);
  }
  return v;
}

/**
 * Pertinenza semantica normalizzata (0–1) rispetto agli altri candidati: le similarità
 * assolute variano molto tra modelli, quindi si confronta ogni candidato con la media.
 */
export function semanticRelevance(
  ctx: AppContext,
  query: Float32Array,
  model: string,
  rows: { id: string; embedding: string | null; embeddingModel: string | null }[],
): Map<string, number> {
  const sims: [string, number][] = [];
  for (const r of rows) {
    if (!r.embedding || r.embeddingModel !== model) continue;
    sims.push([r.id, cosine(query, cached(ctx, r.id, model, r.embedding))]);
  }
  const out = new Map<string, number>();
  if (sims.length === 0) return out;
  const max = Math.max(...sims.map(([, s]) => s));
  const mean = sims.reduce((n, [, s]) => n + s, 0) / sims.length;
  for (const [id, s] of sims) {
    const rel = sims.length >= 3 && max - mean > 1e-6 ? (s - mean) / (max - mean) : (s - 0.3) / 0.5;
    out.set(id, Math.max(0, Math.min(1, rel)));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Motore di embedding                                                 */
/* ------------------------------------------------------------------ */

export interface Embedder {
  provider: LlmProvider & { embed: NonNullable<LlmProvider['embed']> };
  model: string;
}

async function resolveEmbedder(ctx: AppContext, override?: { modelConfigId?: string | null; model?: string }): Promise<Embedder> {
  const prefs = getPreferences(ctx);
  const configId = override?.modelConfigId ?? prefs.embeddings.modelConfigId ?? prefs.defaultModelConfigId;
  const row =
    (configId && ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.id, configId)).get()) ||
    ctx.dbm.db.select().from(modelConfigurations).where(eq(modelConfigurations.isDefault, true)).get();
  if (!row) throw new AppError('no_model_config', 'Nessuna configurazione per gli embedding', 409);
  const provider = ctx.providers.create(row);
  if (!provider.embed) throw new AppError('embeddings_unsupported', 'Il provider non supporta gli embedding', 400);
  let model = override?.model ?? prefs.embeddings.model;
  if (!model) {
    // Automatico: il primo modello di embedding esposto dal server (LM Studio lo indica nel tipo).
    const models = await provider.listModels();
    model = models.find((m) => m.type === 'embeddings' || /embed/i.test(m.id))?.id ?? '';
    if (!model) throw new LlmError('llm_model_not_found', 'Nessun modello di embedding disponibile sul server');
  }
  return { provider: provider as Embedder['provider'], model };
}

export function embeddingsEnabled(ctx: AppContext): boolean {
  return getPreferences(ctx).embeddings.enabled;
}

/** Embedding della query. Non lancia: restituisce l'errore per l'ispezione del contesto. */
export async function embedQuery(
  ctx: AppContext,
  text: string,
): Promise<{ vector: Float32Array | null; model: string | null; error: string | null }> {
  if (!embeddingsEnabled(ctx) || !text.trim()) return { vector: null, model: null, error: null };
  try {
    const embedder = await resolveEmbedder(ctx);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const [v] = await embedder.provider.embed([text.slice(0, 4000)], embedder.model, controller.signal);
      return { vector: Float32Array.from(v), model: embedder.model, error: null };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { vector: null, model: null, error: (err as Error).message };
  }
}

export async function testEmbeddings(ctx: AppContext, override: { modelConfigId?: string | null; model?: string }): Promise<EmbeddingTestResult> {
  const started = Date.now();
  let model = override.model ?? '';
  try {
    const embedder = await resolveEmbedder(ctx, override);
    model = embedder.model;
    const [a, b] = await embedder.provider.embed(['La stella è esplosa.', 'The star exploded.'], embedder.model);
    return { ok: a.length > 0 && a.length === b.length, model, dimensions: a.length, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    const code = err instanceof LlmError || err instanceof AppError ? err.code : 'llm_error';
    return { ok: false, model, dimensions: null, latencyMs: Date.now() - started, error: { code, message: (err as Error).message } };
  }
}

/* ------------------------------------------------------------------ */
/* Indicizzazione                                                      */
/* ------------------------------------------------------------------ */

const state = { running: false, lastError: null as string | null, lastRunAt: null as string | null };
const BATCH = 32;

/** Indicizza memorie e frammenti senza embedding (o con embedding di un altro modello). */
export async function runIndexing(ctx: AppContext): Promise<void> {
  if (!embeddingsEnabled(ctx) || state.running) return;
  state.running = true;
  state.lastError = null;
  try {
    const embedder = await resolveEmbedder(ctx);
    const targets = [
      { table: 'memories', where: `status != 'archived'` },
      { table: 'knowledge_chunks', where: '1 = 1' },
    ] as const;
    for (const t of targets) {
      for (let guard = 0; guard < 10_000; guard++) {
        const rows = ctx.dbm.sqlite
          .prepare(
            `SELECT id, content FROM ${t.table}
              WHERE ${t.where} AND (embedding IS NULL OR embedding_model IS NOT @model)
              LIMIT @limit`,
          )
          .all({ model: embedder.model, limit: BATCH }) as { id: string; content: string }[];
        if (rows.length === 0) break;
        const vectors = await embedder.provider.embed(
          rows.map((r) => r.content.slice(0, 8000)),
          embedder.model,
        );
        const stmt = ctx.dbm.sqlite.prepare(`UPDATE ${t.table} SET embedding = @e, embedding_model = @m WHERE id = @id`);
        ctx.dbm.sqlite.transaction(() => {
          rows.forEach((r, i) => {
            stmt.run({ e: encodeVector(vectors[i]), m: embedder.model, id: r.id });
            cache.delete(`${r.id}|${embedder.model}`);
          });
        })();
      }
    }
  } catch (err) {
    state.lastError = (err as Error).message;
    ctx.log.warn({ err: state.lastError }, 'embedding indexing failed');
  } finally {
    state.running = false;
    state.lastRunAt = nowIso();
  }
}

/** Pianifica l'indicizzazione in background (no-op se disattivata o già in corso). */
export function scheduleIndexing(ctx: AppContext): void {
  if (!embeddingsEnabled(ctx) || state.running) return;
  trackBackground(ctx, runIndexing(ctx));
}

/** Azzera gli embedding salvati (es. per forzare il ricalcolo completo). */
export function resetEmbeddings(ctx: AppContext): void {
  ctx.dbm.sqlite.exec(`UPDATE memories SET embedding = NULL, embedding_model = NULL; UPDATE knowledge_chunks SET embedding = NULL, embedding_model = NULL;`);
  cache.clear();
}

export function embeddingStatus(ctx: AppContext): EmbeddingStatus {
  const prefs = getPreferences(ctx).embeddings;
  const model = prefs.model || null;
  const count = (sql: string) => (ctx.dbm.sqlite.prepare(sql).get({ model }) as { n: number }).n;
  const modelClause = model ? `embedding_model = @model` : `embedding IS NOT NULL`;
  return {
    enabled: prefs.enabled,
    model,
    memories: {
      indexed: count(`SELECT count(*) AS n FROM memories WHERE status != 'archived' AND ${modelClause}`),
      total: count(`SELECT count(*) AS n FROM memories WHERE status != 'archived'`),
    },
    chunks: {
      indexed: count(`SELECT count(*) AS n FROM knowledge_chunks WHERE ${modelClause}`),
      total: count(`SELECT count(*) AS n FROM knowledge_chunks`),
    },
    running: state.running,
    lastError: state.lastError,
    lastRunAt: state.lastRunAt,
  };
}
