import type { KnowledgeHit, KnowledgeSource, KnowledgeSourceInput } from '@persona/shared';
import { knowledgeSourceInputSchema } from '@persona/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import type { Db } from '../db/client.js';
import { knowledgeChunks, knowledgeSources } from '../db/schema.js';
import { newId, notFound, nowIso, validate } from '../lib/util.js';
import { getCharacterRow } from './characters.js';
import { scheduleIndexing } from './embeddings.js';
import { searchKnowledge } from './retrieval.js';

type SourceRow = typeof knowledgeSources.$inferSelect;

/**
 * Suddivide un documento in frammenti di ~1200 caratteri rispettando paragrafi
 * e titoli Markdown, con una piccola sovrapposizione per non spezzare il contesto.
 */
export function chunkText(text: string, target = 1200, overlap = 150): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}|(?=\n#{1,6}\s)/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (p.length > target * 1.5) {
      if (current) chunks.push(current);
      current = '';
      // Paragrafo molto lungo: spezza per frasi.
      const sentences = p.split(/(?<=[.!?。！？])\s+/);
      let buf = '';
      for (const s of sentences) {
        if ((buf + ' ' + s).length > target && buf) {
          chunks.push(buf.trim());
          buf = buf.slice(-overlap) + ' ' + s;
        } else buf += (buf ? ' ' : '') + s;
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }
    if ((current + '\n\n' + p).length > target && current) {
      chunks.push(current);
      current = current.slice(-overlap) + '\n\n' + p;
    } else {
      current += (current ? '\n\n' : '') + p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.trim()];
}

function toDto(row: SourceRow, chunkCount: number): KnowledgeSource {
  return {
    id: row.id,
    characterId: row.characterId,
    title: row.title,
    kind: row.kind as KnowledgeSource['kind'],
    content: row.content,
    sourceRef: row.sourceRef,
    epistemicStatus: row.epistemicStatus as KnowledgeSource['epistemicStatus'],
    language: row.language,
    enabled: row.enabled,
    chunkCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function countChunks(ctx: AppContext, sourceId: string): number {
  return (ctx.dbm.sqlite.prepare('SELECT count(*) AS n FROM knowledge_chunks WHERE source_id = ?').get(sourceId) as { n: number }).n;
}

function writeChunks(db: Db, source: { id: string; characterId: string; content: string }) {
  db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.id)).run();
  chunkText(source.content).forEach((content, ordinal) =>
    db.insert(knowledgeChunks).values({ id: newId(), sourceId: source.id, characterId: source.characterId, ordinal, content }).run(),
  );
}

export function listKnowledge(ctx: AppContext, characterId: string): KnowledgeSource[] {
  getCharacterRow(ctx, characterId);
  return ctx.dbm.db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.characterId, characterId))
    .orderBy(desc(knowledgeSources.updatedAt))
    .all()
    .map((r) => toDto(r, countChunks(ctx, r.id)));
}

export function getKnowledgeSource(ctx: AppContext, id: string): KnowledgeSource {
  const row = ctx.dbm.db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id)).get();
  if (!row) throw notFound('Fonte', id);
  return toDto(row, countChunks(ctx, id));
}

export function createKnowledgeSource(ctx: AppContext, characterId: string, input: KnowledgeSourceInput, ts = nowIso()): KnowledgeSource {
  getCharacterRow(ctx, characterId);
  const data = validate(knowledgeSourceInputSchema, input);
  const id = newId();
  ctx.dbm.db.transaction((tx) => {
    tx.insert(knowledgeSources).values({ id, characterId, ...data, createdAt: ts, updatedAt: ts }).run();
    writeChunks(tx as unknown as Db, { id, characterId, content: data.content });
  });
  scheduleIndexing(ctx);
  return getKnowledgeSource(ctx, id);
}

export function updateKnowledgeSource(ctx: AppContext, id: string, input: KnowledgeSourceInput): KnowledgeSource {
  const existing = getKnowledgeSource(ctx, id);
  const data = validate(knowledgeSourceInputSchema, input);
  ctx.dbm.db.transaction((tx) => {
    tx.update(knowledgeSources).set({ ...data, updatedAt: nowIso() }).where(eq(knowledgeSources.id, id)).run();
    if (data.content !== existing.content) writeChunks(tx as unknown as Db, { id, characterId: existing.characterId, content: data.content });
  });
  scheduleIndexing(ctx);
  return getKnowledgeSource(ctx, id);
}

export function deleteKnowledgeSource(ctx: AppContext, id: string): void {
  getKnowledgeSource(ctx, id);
  ctx.dbm.db.delete(knowledgeSources).where(eq(knowledgeSources.id, id)).run();
}

export function searchCharacterKnowledge(ctx: AppContext, characterId: string, q: string): KnowledgeHit[] {
  getCharacterRow(ctx, characterId);
  return searchKnowledge(ctx, characterId, q, 20);
}

export function knowledgeChunksOf(ctx: AppContext, sourceId: string) {
  return ctx.dbm.db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId)).orderBy(asc(knowledgeChunks.ordinal)).all();
}
