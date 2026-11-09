import type {
  ContextMeta,
  Conversation,
  ConversationCreate,
  ConversationDetail,
  ConversationSummary,
  Message,
  MessageRevision,
} from '@persona/shared';
import { conversationCreateSchema, conversationUpdateSchema, messageUpdateSchema } from '@persona/shared';
import { and, asc, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import {
  conversationParticipants,
  conversationSummaries,
  conversations,
  messageRevisions,
  messages,
} from '../db/schema.js';
import { AppError, newId, notFound, nowIso, parseJson, validate } from '../lib/util.js';
import { getCharacterRow } from './characters.js';
import { getPreferences } from './preferences.js';
import { getParticipant, getScenarioRow } from './scenarios.js';

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

/** Titolo provvisorio nella lingua dell'interfaccia (sostituito dal titolo automatico). */
const DEFAULT_TITLE_BY_LANGUAGE: Record<string, string> = {
  it: 'Nuova conversazione',
  en: 'New conversation',
  fr: 'Nouvelle conversation',
  es: 'Nueva conversación',
  de: 'Neues Gespräch',
  pt: 'Nova conversa',
};

export function defaultTitle(ctx: AppContext): string {
  const lang = getPreferences(ctx).uiLanguage.split('-')[0];
  return DEFAULT_TITLE_BY_LANGUAGE[lang] ?? DEFAULT_TITLE_BY_LANGUAGE.en;
}
export const DEFAULT_TITLES = new Set(Object.values(DEFAULT_TITLE_BY_LANGUAGE));

export function toMessage(m: MessageRow): Message {
  return {
    id: m.id,
    conversationId: m.conversationId,
    seq: m.seq,
    role: m.role as Message['role'],
    characterId: m.characterId,
    speakerName: m.speakerName,
    content: m.content,
    reasoning: m.reasoning,
    mode: m.mode as Message['mode'],
    language: m.language,
    status: m.status as Message['status'],
    providerType: (m.providerType as Message['providerType']) ?? null,
    model: m.model,
    contextMeta: parseJson<ContextMeta | null>(m.contextMeta, null),
    regeneratedFromId: m.regeneratedFromId,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
  };
}

function toSummary(s: typeof conversationSummaries.$inferSelect): ConversationSummary {
  return {
    id: s.id,
    conversationId: s.conversationId,
    fromSeq: s.fromSeq,
    toSeq: s.toSeq,
    content: s.content,
    model: s.model,
    createdAt: s.createdAt,
  };
}

export function getConversationRow(ctx: AppContext, id: string): ConversationRow {
  const row = ctx.dbm.db.select().from(conversations).where(eq(conversations.id, id)).get();
  if (!row) throw notFound('Conversazione', id);
  return row;
}

export function participantIds(ctx: AppContext, conversationId: string): string[] {
  return ctx.dbm.db
    .select({ id: conversationParticipants.characterId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId))
    .orderBy(asc(conversationParticipants.sortOrder))
    .all()
    .map((r) => r.id);
}

function toConversation(ctx: AppContext, row: ConversationRow): Conversation {
  const stats = ctx.dbm.sqlite
    .prepare(
      `SELECT count(*) AS n, max(created_at) AS last FROM messages WHERE conversation_id = ? AND status != 'superseded'`,
    )
    .get(row.id) as { n: number; last: string | null };
  return {
    id: row.id,
    kind: row.kind as Conversation['kind'],
    characterId: row.characterId,
    scenarioId: row.scenarioId,
    title: row.title,
    language: row.language,
    defaultMode: row.defaultMode as Conversation['defaultMode'],
    turnMode: row.turnMode as Conversation['turnMode'],
    archived: row.archived,
    summarizedSeq: row.summarizedSeq,
    memoryProcessedSeq: row.memoryProcessedSeq,
    participantIds: participantIds(ctx, row.id),
    messageCount: stats.n,
    lastMessageAt: stats.last,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getConversation(ctx: AppContext, id: string): Conversation {
  return toConversation(ctx, getConversationRow(ctx, id));
}

export function listConversations(
  ctx: AppContext,
  q: { characterId?: string; scenarioId?: string; kind?: string; includeArchived?: boolean; projectId?: string },
): Conversation[] {
  const conds: SQL[] = [];
  if (q.projectId) {
    // Sessioni e simulazioni del progetto: quelle dei suoi scenari.
    const ids = (ctx.dbm.sqlite.prepare('SELECT id FROM scenarios WHERE project_id = ?').all(q.projectId) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    conds.push(inArray(conversations.scenarioId, ids));
  }
  if (q.kind) conds.push(eq(conversations.kind, q.kind));
  if (q.scenarioId) conds.push(eq(conversations.scenarioId, q.scenarioId));
  if (!q.includeArchived) conds.push(eq(conversations.archived, false));
  if (q.characterId) {
    const ids = ctx.dbm.db
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.characterId, q.characterId))
      .all()
      .map((r) => r.id);
    if (ids.length === 0) return [];
    conds.push(inArray(conversations.id, ids));
  }
  return ctx.dbm.db
    .select()
    .from(conversations)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(conversations.updatedAt))
    .all()
    .map((r) => toConversation(ctx, r));
}

export function createConversation(ctx: AppContext, input: ConversationCreate): Conversation {
  const data = validate(conversationCreateSchema, input);
  let participants: string[] = [];
  let language = data.language;
  if (data.kind === 'lab') {
    getCharacterRow(ctx, data.characterId!);
    participants = [data.characterId!];
  } else {
    const scenario = getScenarioRow(ctx, data.scenarioId!);
    participants = data.kind === 'scenario' ? [data.characterId!] : [...new Set(data.participantIds)];
    for (const cid of participants) {
      getCharacterRow(ctx, cid);
      if (!getParticipant(ctx, scenario.id, cid)) {
        throw new AppError('validation', `Il personaggio ${cid} non partecipa allo scenario`);
      }
    }
    language ??= scenario.language ?? undefined;
  }
  language ??= getPreferences(ctx).conversationLanguage;
  const id = newId();
  const ts = nowIso();
  ctx.dbm.db.transaction((tx) => {
    tx.insert(conversations)
      .values({
        id,
        kind: data.kind,
        characterId: data.kind === 'simulation' ? null : data.characterId,
        scenarioId: data.scenarioId,
        title: data.title ?? defaultTitle(ctx),
        language: language!,
        defaultMode: data.defaultMode,
        turnMode: data.turnMode,
        archived: false,
        summarizedSeq: 0,
        memoryProcessedSeq: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    participants.forEach((cid, i) =>
      tx.insert(conversationParticipants).values({ id: newId(), conversationId: id, characterId: cid, sortOrder: i }).run(),
    );
  });
  return getConversation(ctx, id);
}

export function updateConversation(ctx: AppContext, id: string, input: unknown): Conversation {
  const row = getConversationRow(ctx, id);
  const data = validate(conversationUpdateSchema, input);
  const { participantIds: newParticipants, ...rest } = data;
  ctx.dbm.db.update(conversations).set({ ...rest, updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
  if (newParticipants && row.kind === 'simulation') {
    const unique = [...new Set(newParticipants)];
    if (unique.length === 0) throw new AppError('validation', 'Una simulazione richiede almeno un partecipante');
    for (const cid of unique) {
      if (!getParticipant(ctx, row.scenarioId!, cid)) throw new AppError('validation', `Il personaggio ${cid} non partecipa allo scenario`);
    }
    ctx.dbm.db.transaction((tx) => {
      tx.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, id)).run();
      unique.forEach((cid, i) =>
        tx.insert(conversationParticipants).values({ id: newId(), conversationId: id, characterId: cid, sortOrder: i }).run(),
      );
    });
  }
  return getConversation(ctx, id);
}

export function deleteConversation(ctx: AppContext, id: string): void {
  getConversationRow(ctx, id);
  ctx.dbm.db.delete(conversations).where(eq(conversations.id, id)).run();
}

export function touchConversation(ctx: AppContext, id: string): void {
  ctx.dbm.db.update(conversations).set({ updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function listSummaries(ctx: AppContext, conversationId: string): ConversationSummary[] {
  return ctx.dbm.db
    .select()
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(asc(conversationSummaries.toSeq), asc(conversationSummaries.createdAt))
    .all()
    .map(toSummary);
}

export function latestSummary(ctx: AppContext, conversationId: string): ConversationSummary | null {
  const row = ctx.dbm.db
    .select()
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(desc(conversationSummaries.toSeq), desc(conversationSummaries.createdAt))
    .get();
  return row ? toSummary(row) : null;
}

export function getConversationDetail(ctx: AppContext, id: string, opts: { includeSuperseded?: boolean } = {}): ConversationDetail {
  const conv = getConversation(ctx, id);
  const rows = ctx.dbm.db
    .select()
    .from(messages)
    .where(
      opts.includeSuperseded
        ? eq(messages.conversationId, id)
        : and(eq(messages.conversationId, id), ne(messages.status, 'superseded')),
    )
    .orderBy(asc(messages.seq), asc(messages.createdAt))
    .all();
  return { ...conv, messages: rows.map(toMessage), summaries: listSummaries(ctx, id) };
}

/** Messaggi validi della cronologia (esclude le versioni sostituite e i fallimenti vuoti). */
export function activeMessages(ctx: AppContext, conversationId: string): MessageRow[] {
  return ctx.dbm.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), inArray(messages.status, ['complete', 'incomplete'])))
    .orderBy(asc(messages.seq), asc(messages.createdAt))
    .all();
}

export function nextSeq(ctx: AppContext, conversationId: string): number {
  const row = ctx.dbm.sqlite.prepare(`SELECT coalesce(max(seq), 0) AS s FROM messages WHERE conversation_id = ?`).get(conversationId) as {
    s: number;
  };
  return row.s + 1;
}

export function insertMessage(
  ctx: AppContext,
  data: Partial<MessageRow> & Pick<MessageRow, 'conversationId' | 'role' | 'content'>,
): MessageRow {
  const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as typeof data;
  const row: MessageRow = {
    id: newId(),
    seq: nextSeq(ctx, data.conversationId),
    characterId: null,
    speakerName: null,
    reasoning: null,
    mode: 'dialogue',
    language: null,
    status: 'complete',
    providerType: null,
    model: null,
    contextMeta: null,
    regeneratedFromId: null,
    editedAt: null,
    createdAt: nowIso(),
    ...defined,
  };
  ctx.dbm.db.insert(messages).values(row).run();
  touchConversation(ctx, data.conversationId);
  return row;
}

export function getMessageRow(ctx: AppContext, id: string): MessageRow {
  const row = ctx.dbm.db.select().from(messages).where(eq(messages.id, id)).get();
  if (!row) throw notFound('Messaggio', id);
  return row;
}

export function finalizeMessage(ctx: AppContext, id: string, patch: Partial<MessageRow>): MessageRow {
  ctx.dbm.db.update(messages).set(patch).where(eq(messages.id, id)).run();
  return getMessageRow(ctx, id);
}

/** Modifica di un messaggio: la versione precedente viene conservata. */
export function editMessage(ctx: AppContext, id: string, input: unknown): Message {
  const row = getMessageRow(ctx, id);
  const { content } = validate(messageUpdateSchema, input);
  if (content === row.content) return toMessage(row);
  const ts = nowIso();
  ctx.dbm.db.transaction((tx) => {
    tx.insert(messageRevisions).values({ id: newId(), messageId: id, content: row.content, createdAt: ts }).run();
    tx.update(messages).set({ content, editedAt: ts }).where(eq(messages.id, id)).run();
  });
  return toMessage(getMessageRow(ctx, id));
}

export function listMessageRevisions(ctx: AppContext, id: string): MessageRevision[] {
  getMessageRow(ctx, id);
  return ctx.dbm.db
    .select()
    .from(messageRevisions)
    .where(eq(messageRevisions.messageId, id))
    .orderBy(desc(messageRevisions.createdAt))
    .all();
}

/** Eliminazione esplicita di un messaggio (azione dell'autore). */
export function deleteMessage(ctx: AppContext, id: string): void {
  getMessageRow(ctx, id);
  ctx.dbm.db.delete(messages).where(eq(messages.id, id)).run();
}
