import type { Memory, MemoryConsistencyIssue, MemoryConsistencyReport, MemoryInput, MemorySource, MemoryUpdate } from '@persona/shared';
import { memoryInputSchema, memoryPromoteSchema, memoryQuerySchema, memoryUpdateSchema } from '@persona/shared';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { memories, memorySources, scenarioParticipants, scenarios } from '../db/schema.js';
import { collectChat } from '../llm/types.js';
import { AppError, compactWhitespace, newId, notFound, nowIso, parseJson, preview, validate } from '../lib/util.js';
import { getCharacter, getCharacterRow } from './characters.js';
import { resolveEngine } from './model-configs.js';
import { scheduleIndexing } from './embeddings.js';
import { consistencyPrompt } from './prompts.js';
import { buildFtsQuery } from './retrieval.js';

type MemoryRow = typeof memories.$inferSelect;
type SourceRow = typeof memorySources.$inferSelect;

function toSource(s: SourceRow): MemorySource {
  return {
    id: s.id,
    memoryId: s.memoryId,
    conversationId: s.conversationId,
    messageId: s.messageId,
    scenarioId: s.scenarioId,
    fromSeq: s.fromSeq,
    toSeq: s.toSeq,
    note: s.note,
    createdAt: s.createdAt,
  };
}

function toMemory(m: MemoryRow, sources: SourceRow[]): Memory {
  return {
    id: m.id,
    characterId: m.characterId,
    category: m.category as Memory['category'],
    scenarioId: m.scenarioId,
    content: m.content,
    importance: m.importance,
    epistemicStatus: m.epistemicStatus as Memory['epistemicStatus'],
    language: m.language,
    status: m.status as Memory['status'],
    origin: m.origin as Memory['origin'],
    pinned: m.pinned,
    promotedFromId: m.promotedFromId,
    retrievalCount: m.retrievalCount,
    lastRetrievedAt: m.lastRetrievedAt,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sources: sources.filter((s) => s.memoryId === m.id).map(toSource),
  };
}

function withSources(ctx: AppContext, rows: MemoryRow[]): Memory[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sources: SourceRow[] = [];
  // SQLite ha un limite di parametri: procedi a blocchi.
  for (let i = 0; i < ids.length; i += 500) {
    sources.push(
      ...ctx.dbm.db
        .select()
        .from(memorySources)
        .where(inArray(memorySources.memoryId, ids.slice(i, i + 500)))
        .orderBy(asc(memorySources.createdAt))
        .all(),
    );
  }
  return rows.map((r) => toMemory(r, sources));
}

export function getMemory(ctx: AppContext, id: string): Memory {
  const row = ctx.dbm.db.select().from(memories).where(eq(memories.id, id)).get();
  if (!row) throw notFound('Memoria', id);
  return withSources(ctx, [row])[0];
}

/**
 * Tutte le memorie di un personaggio o di uno scenario, senza limite e in ordine di creazione:
 * per esportazioni e salvataggi, che non devono mai troncare i dati.
 */
export function listAllMemories(ctx: AppContext, filter: { characterId?: string; scenarioId?: string }): Memory[] {
  const conds: SQL[] = [];
  if (filter.characterId) conds.push(eq(memories.characterId, filter.characterId));
  if (filter.scenarioId) conds.push(eq(memories.scenarioId, filter.scenarioId));
  if (conds.length === 0) throw new AppError('validation', 'Filtro obbligatorio');
  const rows = ctx.dbm.db
    .select()
    .from(memories)
    .where(and(...conds))
    .orderBy(asc(memories.createdAt), asc(memories.id))
    .all();
  return withSources(ctx, rows);
}

export function listMemories(ctx: AppContext, query: unknown): Memory[] {
  const q = validate(memoryQuerySchema, query);
  const conds: SQL[] = [];
  if (q.characterId) conds.push(eq(memories.characterId, q.characterId));
  if (q.category) conds.push(eq(memories.category, q.category));
  if (q.scenarioId) conds.push(eq(memories.scenarioId, q.scenarioId));
  if (q.status) conds.push(eq(memories.status, q.status));
  if (q.q && q.q.trim()) {
    const fts = buildFtsQuery(q.q);
    if (!fts) return [];
    let ids: string[] = [];
    try {
      ids = (
        ctx.dbm.sqlite.prepare(`SELECT memory_id AS id FROM memories_fts WHERE memories_fts MATCH ? LIMIT 2000`).all(fts) as {
          id: string;
        }[]
      ).map((r) => r.id);
    } catch {
      ids = [];
    }
    if (ids.length === 0) return [];
    conds.push(inArray(memories.id, ids.slice(0, 900)));
  }
  const rows = ctx.dbm.db
    .select()
    .from(memories)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(memories.pinned), desc(memories.importance), desc(memories.createdAt))
    .limit(q.limit)
    .all();
  return withSources(ctx, rows);
}

function assertScenarioScope(ctx: AppContext, characterId: string, scenarioId: string | null) {
  if (!scenarioId) return;
  const sc = ctx.dbm.db.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.id, scenarioId)).get();
  if (!sc) throw new AppError('validation', `Scenario inesistente: ${scenarioId}`);
  const part = ctx.dbm.db
    .select({ id: scenarioParticipants.id })
    .from(scenarioParticipants)
    .where(and(eq(scenarioParticipants.scenarioId, scenarioId), eq(scenarioParticipants.characterId, characterId)))
    .get();
  if (!part) throw new AppError('validation', 'Il personaggio non partecipa a questo scenario');
}

export interface MemoryProvenance {
  conversationId?: string | null;
  messageId?: string | null;
  scenarioId?: string | null;
  fromSeq?: number | null;
  toSeq?: number | null;
  note?: string | null;
}

export function insertMemory(
  ctx: AppContext,
  data: Omit<MemoryRow, 'id' | 'createdAt' | 'updatedAt' | 'retrievalCount' | 'lastRetrievedAt' | 'embedding' | 'embeddingModel'>,
  provenance: MemoryProvenance | null,
): Memory {
  const id = newId();
  const ts = nowIso();
  ctx.dbm.db.transaction((tx) => {
    tx.insert(memories)
      .values({ ...data, id, retrievalCount: 0, lastRetrievedAt: null, embedding: null, embeddingModel: null, createdAt: ts, updatedAt: ts })
      .run();
    if (provenance) {
      tx.insert(memorySources)
        .values({
          id: newId(),
          memoryId: id,
          conversationId: provenance.conversationId ?? null,
          messageId: provenance.messageId ?? null,
          scenarioId: provenance.scenarioId ?? data.scenarioId ?? null,
          fromSeq: provenance.fromSeq ?? null,
          toSeq: provenance.toSeq ?? null,
          note: provenance.note ?? null,
          createdAt: ts,
        })
        .run();
    }
  });
  scheduleIndexing(ctx);
  return getMemory(ctx, id);
}

/** Creazione manuale da parte dell'autore. */
export function createMemory(ctx: AppContext, input: MemoryInput): Memory {
  const data = validate(memoryInputSchema, input);
  getCharacterRow(ctx, data.characterId);
  assertScenarioScope(ctx, data.characterId, data.scenarioId);
  return insertMemory(
    ctx,
    {
      characterId: data.characterId,
      category: data.category,
      scenarioId: data.scenarioId,
      content: data.content,
      importance: data.importance,
      epistemicStatus: data.epistemicStatus,
      language: data.language,
      status: data.status,
      origin: 'author',
      pinned: data.pinned,
      promotedFromId: null,
    },
    { note: data.note ?? 'Inserita dall’autore', scenarioId: data.scenarioId },
  );
}

export function updateMemory(ctx: AppContext, id: string, input: MemoryUpdate): Memory {
  const existing = getMemory(ctx, id);
  const patch = validate(memoryUpdateSchema, input);
  const contentChanged = patch.content !== undefined && patch.content !== existing.content;
  ctx.dbm.db
    .update(memories)
    .set({
      ...(contentChanged ? { embedding: null, embeddingModel: null } : {}),
      content: patch.content ?? existing.content,
      importance: patch.importance ?? existing.importance,
      epistemicStatus: patch.epistemicStatus ?? existing.epistemicStatus,
      language: patch.language === undefined ? existing.language : patch.language,
      status: patch.status ?? existing.status,
      pinned: patch.pinned ?? existing.pinned,
      updatedAt: nowIso(),
    })
    .where(eq(memories.id, id))
    .run();
  if (contentChanged || patch.status === 'active') scheduleIndexing(ctx);
  return getMemory(ctx, id);
}

export function deleteMemory(ctx: AppContext, id: string): void {
  getMemory(ctx, id);
  ctx.dbm.db.delete(memories).where(eq(memories.id, id)).run();
}

/** Approvazione esplicita di una memoria proposta (es. proposta di memoria core). */
export function approveMemory(ctx: AppContext, id: string): Memory {
  const m = getMemory(ctx, id);
  if (m.status !== 'proposed') throw new AppError('conflict', 'La memoria non è in attesa di approvazione', 409);
  return updateMemory(ctx, id, { status: 'active' });
}

/**
 * Promozione esplicita: crea una NUOVA memoria personale (semantica o core) a partire
 * da una memoria esistente (tipicamente contestuale). L'originale resta nello scenario.
 */
export function promoteMemory(ctx: AppContext, id: string, input: unknown): Memory {
  const opts = validate(memoryPromoteSchema, input);
  const src = getMemory(ctx, id);
  if (src.category === opts.targetCategory && src.scenarioId == null) {
    throw new AppError('conflict', 'La memoria appartiene già a questa categoria', 409);
  }
  const firstSource = src.sources[0];
  return insertMemory(
    ctx,
    {
      characterId: src.characterId,
      category: opts.targetCategory,
      scenarioId: null,
      content: opts.content ?? src.content,
      importance: src.importance,
      epistemicStatus: src.epistemicStatus,
      language: src.language,
      status: 'active',
      origin: 'promotion',
      pinned: false,
      promotedFromId: src.id,
    },
    {
      conversationId: firstSource?.conversationId ?? null,
      messageId: firstSource?.messageId ?? null,
      scenarioId: src.scenarioId,
      fromSeq: firstSource?.fromSeq ?? null,
      toSeq: firstSource?.toSeq ?? null,
      note: opts.note ?? `Promossa dall’autore da memoria ${src.category} (${src.id})`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Verifica di coerenza                                                */
/* ------------------------------------------------------------------ */

function normalizeForDup(text: string) {
  return compactWhitespace(text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ''));
}

export function deterministicConsistency(ctx: AppContext, characterId: string): { issues: MemoryConsistencyIssue[]; all: Memory[] } {
  const all = listMemories(ctx, { characterId, limit: 1000 });
  const issues: MemoryConsistencyIssue[] = [];
  const groups = new Map<string, Memory[]>();
  for (const m of all) {
    if (m.status === 'archived') continue;
    const key = `${m.scenarioId ?? '-'}|${normalizeForDup(m.content)}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  for (const g of groups.values()) {
    if (g.length > 1) {
      issues.push({ kind: 'duplicate', severity: 'info', memoryIds: g.map((m) => m.id), detail: preview(g[0].content, 120) });
    }
  }
  for (const m of all) {
    if (m.category === 'core' && m.epistemicStatus === 'fiction' && m.status === 'active') {
      issues.push({ kind: 'fiction_in_core', severity: 'warning', memoryIds: [m.id], detail: preview(m.content, 120) });
    }
    if ((m.category === 'contextual') !== (m.scenarioId != null)) {
      issues.push({ kind: 'scope', severity: 'warning', memoryIds: [m.id], detail: preview(m.content, 120) });
    }
  }
  const proposed = all.filter((m) => m.status === 'proposed');
  if (proposed.length) {
    issues.push({ kind: 'pending_proposals', severity: 'info', memoryIds: proposed.map((m) => m.id), detail: String(proposed.length) });
  }
  return { issues, all };
}

/**
 * Controllo di coerenza: verifiche deterministiche (duplicati, finzione nella memoria
 * core, perimetro, proposte in attesa) e, se richiesto, analisi semantica tramite LLM
 * delle possibili contraddizioni con l'identità canonica.
 */
export async function checkConsistency(ctx: AppContext, characterId: string, useLlm: boolean): Promise<MemoryConsistencyReport> {
  const character = getCharacter(ctx, characterId);
  const { issues, all } = deterministicConsistency(ctx, characterId);
  const report: MemoryConsistencyReport = {
    characterId,
    checkedAt: nowIso(),
    memoryCount: all.length,
    issues,
    llmChecked: false,
    llmError: null,
  };
  const personal = all.filter((m) => m.status === 'active' && m.scenarioId == null).slice(0, 80);
  if (!useLlm || personal.length === 0) return report;
  try {
    const engine = await resolveEngine(ctx, character.modelConfigId);
    const prompt = consistencyPrompt(character, personal);
    const res = await collectChat(engine.provider, prompt, {
      model: engine.model,
      temperature: 0.1,
      maxTokens: 1200,
      purpose: 'consistency',
    });
    const parsed = parseJsonBlock<{ issues?: { memoryIds?: string[]; detail?: string; ids?: string[] }[] }>(res.content);
    const validIds = new Set(personal.map((m) => m.id));
    for (const it of parsed?.issues ?? []) {
      const ids = (it.memoryIds ?? it.ids ?? []).filter((x) => validIds.has(x));
      if (!it.detail) continue;
      report.issues.push({ kind: 'contradiction', severity: 'warning', memoryIds: ids, detail: String(it.detail).slice(0, 1000) });
    }
    report.llmChecked = true;
  } catch (err) {
    report.llmError = (err as Error).message;
  }
  return report;
}

/** Estrae il primo oggetto JSON da una risposta testuale del modello. */
export function parseJsonBlock<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return parseJson<T | null>(cleaned.slice(start, end + 1), null);
}
