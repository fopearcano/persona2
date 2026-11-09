/**
 * Esportazione/importazione di uno scenario completo (formato `persona.scenario`):
 * universo narrativo, identità dei partecipanti, relazioni, eventi, memorie contestuali
 * e sessioni. Vedi docs/export-format.md.
 */
import type { Scenario, ScenarioDetail, ScenarioExportV1 } from '@persona/shared';
import {
  CHARACTER_EXPORT_FORMAT,
  SCENARIO_EXPORT_FORMAT,
  SCENARIO_EXPORT_VERSION,
  scenarioImportOptionsSchema,
  scenarioInputSchema,
} from '@persona/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import {
  characters,
  conversationParticipants,
  conversationSummaries,
  conversations,
  memories,
  memorySources,
  messages,
  scenarioEvents,
  scenarioParticipants,
  scenarioRelationships,
  scenarios,
} from '../db/schema.js';
import { assertPersonaFile } from '../lib/import-check.js';
import { AppError, newId, nowIso, validate } from '../lib/util.js';
import { scheduleIndexing } from './embeddings.js';
import { ensureMembership, projectExists } from './project-membership.js';
import { listAllMemories } from './memory.js';
import { exportCharacter, importCharacter } from './portability.js';
import { getScenario } from './scenarios.js';

export function exportScenario(ctx: AppContext, id: string, opts: { sessions: boolean }): ScenarioExportV1 {
  const s = getScenario(ctx, id);
  const charExports = s.participants.map((p) =>
    exportCharacter(ctx, p.characterId, { conversations: false, contextual: false, knowledge: true }),
  );
  const mems = listAllMemories(ctx, { scenarioId: id }).map((m) => ({
    id: m.id,
    characterId: m.characterId,
    category: m.category,
    scenarioId: m.scenarioId,
    content: m.content,
    importance: m.importance,
    epistemicStatus: m.epistemicStatus,
    language: m.language,
    status: m.status,
    origin: m.origin,
    pinned: m.pinned,
    promotedFromId: m.promotedFromId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sources: m.sources.map((src) => ({
      conversationId: src.conversationId,
      messageId: src.messageId,
      scenarioId: src.scenarioId,
      fromSeq: src.fromSeq,
      toSeq: src.toSeq,
      note: src.note,
    })),
  }));
  const sessions: ScenarioExportV1['sessions'] = [];
  if (opts.sessions) {
    const convs = ctx.dbm.db.select().from(conversations).where(eq(conversations.scenarioId, id)).orderBy(asc(conversations.createdAt)).all();
    for (const c of convs) {
      const parts = ctx.dbm.db
        .select({ id: conversationParticipants.characterId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, c.id))
        .orderBy(asc(conversationParticipants.sortOrder))
        .all()
        .map((r) => r.id);
      const msgs = ctx.dbm.db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(asc(messages.seq), asc(messages.createdAt)).all();
      const sums = ctx.dbm.db.select().from(conversationSummaries).where(eq(conversationSummaries.conversationId, c.id)).all();
      sessions.push({
        id: c.id,
        kind: c.kind as 'scenario' | 'simulation',
        scenarioId: c.scenarioId,
        title: c.title,
        language: c.language,
        defaultMode: c.defaultMode as 'dialogue',
        turnMode: c.turnMode as 'manual',
        characterId: c.characterId,
        participantIds: parts,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: msgs.map((m) => ({
          id: m.id,
          seq: m.seq,
          role: m.role as 'author',
          characterId: m.characterId,
          speakerName: m.speakerName,
          content: m.content,
          mode: m.mode as 'dialogue',
          language: m.language,
          status: m.status as 'complete',
          model: m.model,
          createdAt: m.createdAt,
        })),
        summaries: sums.map((x) => ({ fromSeq: x.fromSeq, toSeq: x.toSeq, content: x.content, createdAt: x.createdAt })),
      });
    }
  }
  return {
    format: SCENARIO_EXPORT_FORMAT,
    version: SCENARIO_EXPORT_VERSION,
    exportedAt: nowIso(),
    app: { name: 'PERSONA', version: ctx.config.version },
    scenario: {
      id: s.id,
      title: s.title,
      description: s.description,
      setting: s.setting,
      timeline: s.timeline,
      environment: s.environment,
      initialSituation: s.initialSituation,
      currentSituation: s.currentSituation,
      knowledge: s.knowledge,
      language: s.language,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    },
    characters: charExports,
    participants: s.participants.map((p) => ({
      characterId: p.characterId,
      role: p.role,
      roleDescription: p.roleDescription,
      knowledge: p.knowledge,
      objectives: p.objectives,
      sortOrder: p.sortOrder,
    })),
    relationships: s.relationships.map((r) => ({ fromCharacterId: r.fromCharacterId, toCharacterId: r.toCharacterId, description: r.description })),
    events: s.events.map((e) => ({ title: e.title, content: e.content, fictionalTime: e.fictionalTime, sortOrder: e.sortOrder, createdAt: e.createdAt })),
    memories: mems,
    sessions,
  };
}

const looseString = z.string().nullish().transform((v) => v ?? null);
const bundleSchema = z.object({
  format: z.literal(SCENARIO_EXPORT_FORMAT),
  version: z.literal(SCENARIO_EXPORT_VERSION),
  scenario: z.object({ id: z.string() }).passthrough(),
  characters: z.array(z.object({ format: z.literal(CHARACTER_EXPORT_FORMAT), character: z.object({ id: z.string() }).passthrough() }).passthrough()),
  participants: z.array(
    z.object({
      characterId: z.string(),
      role: looseString,
      roleDescription: looseString,
      knowledge: looseString,
      objectives: looseString,
      sortOrder: z.number().int().default(0),
    }),
  ),
  relationships: z.array(z.object({ fromCharacterId: z.string(), toCharacterId: z.string(), description: z.string().min(1) })).default([]),
  events: z
    .array(z.object({ title: looseString, content: z.string().min(1), fictionalTime: looseString, sortOrder: z.number().int().default(0), createdAt: z.string().optional() }))
    .default([]),
  memories: z
    .array(
      z.object({
        characterId: z.string(),
        content: z.string().min(1),
        importance: z.number().int().min(1).max(5).default(3),
        epistemicStatus: z.enum(['fact', 'interpretation', 'opinion', 'fiction', 'unverified']).default('fiction'),
        language: looseString,
        status: z.enum(['active', 'proposed', 'archived']).default('active'),
        origin: z.enum(['author', 'conversation', 'summary', 'extraction', 'promotion', 'import']).default('import'),
        pinned: z.boolean().default(false),
        createdAt: z.string().optional(),
        sources: z
          .array(z.object({ conversationId: looseString, fromSeq: z.number().int().nullish(), toSeq: z.number().int().nullish(), note: looseString }).passthrough())
          .default([]),
      }),
    )
    .default([]),
  sessions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['scenario', 'simulation']),
        title: z.string().min(1),
        language: z.string().default('auto'),
        defaultMode: z.enum(['dialogue', 'interview', 'analysis']).default('dialogue'),
        turnMode: z.enum(['manual', 'round-robin', 'auto']).default('manual'),
        characterId: looseString,
        participantIds: z.array(z.string()).default([]),
        createdAt: z.string(),
        updatedAt: z.string().optional(),
        messages: z.array(
          z.object({
            seq: z.number().int(),
            role: z.enum(['author', 'character', 'analysis', 'narrator']),
            characterId: looseString,
            speakerName: looseString,
            content: z.string(),
            mode: z.enum(['dialogue', 'interview', 'analysis']).default('dialogue'),
            language: looseString,
            status: z.enum(['complete', 'incomplete', 'error', 'superseded']).default('complete'),
            model: looseString,
            createdAt: z.string(),
          }),
        ),
        summaries: z.array(z.object({ fromSeq: z.number().int(), toSeq: z.number().int(), content: z.string(), createdAt: z.string() })).default([]),
      }),
    )
    .default([]),
});

export interface ScenarioImportResult {
  scenario: ScenarioDetail;
  characters: { reused: number; imported: number };
  imported: { sessions: number; messages: number; memories: number; events: number };
}

/**
 * Importa uno scenario come NUOVO scenario. I personaggi con lo stesso id già presenti
 * vengono riutilizzati (opzione `reuse`, la loro identità non viene modificata);
 * gli altri sono importati come nuove identità.
 */
export function importScenario(
  ctx: AppContext,
  payload: unknown,
  options: unknown,
  ext: {
    /** Corrispondenza id originale → id locale già risolta (importazione di un progetto). */
    idMap?: Map<string, string>;
    /** Progetto di destinazione dello scenario importato. */
    projectId?: string | null;
  } = {},
): ScenarioImportResult {
  const opts = validate(scenarioImportOptionsSchema, options);
  if (ext.projectId && !projectExists(ctx, ext.projectId)) throw new AppError('validation', `Progetto inesistente: ${ext.projectId}`);
  assertPersonaFile(payload, SCENARIO_EXPORT_FORMAT, SCENARIO_EXPORT_VERSION);
  let data: z.output<typeof bundleSchema>;
  try {
    data = bundleSchema.parse(payload);
  } catch (err) {
    throw new AppError('invalid_import', `File di scenario non valido: ${(err as Error).message.slice(0, 500)}`, 400, { reason: 'invalid' });
  }
  // Tutto o niente: personaggi, scenario e sessioni in un'unica transazione.
  return ctx.dbm.sqlite.transaction(() => writeScenarioImport(ctx, data, opts, ext))();
}

function writeScenarioImport(
  ctx: AppContext,
  data: z.output<typeof bundleSchema>,
  opts: z.output<typeof scenarioImportOptionsSchema>,
  ext: { idMap?: Map<string, string>; projectId?: string | null },
): ScenarioImportResult {
  const scenarioFields = validate(scenarioInputSchema, data.scenario);
  const idMap = ext.idMap ?? new Map<string, string>();
  const result: ScenarioImportResult = {
    scenario: null as unknown as ScenarioDetail,
    characters: { reused: 0, imported: 0 },
    imported: { sessions: 0, messages: 0, memories: 0, events: 0 },
  };

  const existing = new Set(
    data.characters.length && !ext.idMap
      ? ctx.dbm.db
          .select({ id: characters.id })
          .from(characters)
          .where(inArray(characters.id, data.characters.map((c) => c.character.id)))
          .all()
          .map((r) => r.id)
      : [],
  );
  for (const ch of ext.idMap ? [] : data.characters) {
    const oldId = ch.character.id;
    if (opts.characters === 'reuse' && existing.has(oldId)) {
      idMap.set(oldId, oldId);
      result.characters.reused++;
    } else {
      const imported = importCharacter(ctx, ch, { includeConversations: false, includeMemories: true, includeKnowledge: true });
      idMap.set(oldId, imported.character.id);
      result.characters.imported++;
    }
  }
  const mapChar = (id: string | null | undefined) => (id ? (idMap.get(id) ?? null) : null);

  const scenarioId = newId();
  const ts = nowIso();
  const convMap = new Map<string, string>();
  ctx.dbm.db.transaction((tx) => {
    tx.insert(scenarios)
      .values({
        id: scenarioId,
        ...scenarioFields,
        projectId: ext.projectId ?? null,
        status: scenarioFields.status as Scenario['status'],
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    data.participants.forEach((p, i) => {
      const cid = mapChar(p.characterId);
      if (!cid) return;
      tx.insert(scenarioParticipants)
        .values({ id: newId(), scenarioId, characterId: cid, role: p.role, roleDescription: p.roleDescription, knowledge: p.knowledge, objectives: p.objectives, sortOrder: i, createdAt: ts })
        .run();
    });
    for (const r of data.relationships) {
      const from = mapChar(r.fromCharacterId);
      const to = mapChar(r.toCharacterId);
      if (from && to && from !== to) {
        tx.insert(scenarioRelationships).values({ id: newId(), scenarioId, fromCharacterId: from, toCharacterId: to, description: r.description, createdAt: ts }).run();
      }
    }
    data.events.forEach((e, i) => {
      tx.insert(scenarioEvents)
        .values({ id: newId(), scenarioId, title: e.title, content: e.content, fictionalTime: e.fictionalTime, sortOrder: i, createdAt: e.createdAt ?? ts })
        .run();
      result.imported.events++;
    });

    if (opts.includeSessions) {
      for (const sess of data.sessions) {
        const parts = sess.participantIds.map(mapChar).filter((x): x is string => !!x);
        if (parts.length === 0) continue;
        const cid = newId();
        convMap.set(sess.id, cid);
        const maxSeq = sess.messages.reduce((n, m) => Math.max(n, m.seq), 0);
        tx.insert(conversations)
          .values({
            id: cid,
            kind: sess.kind,
            characterId: sess.kind === 'scenario' ? (mapChar(sess.characterId) ?? parts[0]) : null,
            scenarioId,
            title: sess.title,
            language: sess.language,
            defaultMode: sess.defaultMode,
            turnMode: sess.turnMode,
            archived: false,
            summarizedSeq: sess.summaries.reduce((n, x) => Math.max(n, x.toSeq), 0),
            // Le memorie contestuali arrivano con il file: non rielaborare i messaggi importati.
            memoryProcessedSeq: maxSeq,
            createdAt: sess.createdAt,
            updatedAt: sess.updatedAt ?? sess.createdAt,
          })
          .run();
        parts.forEach((p, i) => tx.insert(conversationParticipants).values({ id: newId(), conversationId: cid, characterId: p, sortOrder: i }).run());
        for (const m of sess.messages) {
          tx.insert(messages)
            .values({
              id: newId(),
              conversationId: cid,
              seq: m.seq,
              role: m.role,
              characterId: mapChar(m.characterId),
              speakerName: m.speakerName,
              content: m.content,
              mode: m.mode,
              language: m.language,
              status: m.status,
              model: m.model,
              createdAt: m.createdAt,
            })
            .run();
          result.imported.messages++;
        }
        for (const x of sess.summaries) {
          tx.insert(conversationSummaries).values({ id: newId(), conversationId: cid, fromSeq: x.fromSeq, toSeq: x.toSeq, content: x.content, createdAt: x.createdAt }).run();
        }
        result.imported.sessions++;
      }
    }

    for (const m of data.memories) {
      const cid = mapChar(m.characterId);
      if (!cid) continue;
      const mid = newId();
      tx.insert(memories)
        .values({
          id: mid,
          characterId: cid,
          category: 'contextual',
          scenarioId,
          content: m.content,
          importance: m.importance,
          epistemicStatus: m.epistemicStatus,
          language: m.language,
          status: m.status,
          origin: m.origin,
          pinned: m.pinned,
          promotedFromId: null,
          retrievalCount: 0,
          createdAt: m.createdAt ?? ts,
          updatedAt: ts,
        })
        .run();
      const sources = m.sources.length ? m.sources : [{ conversationId: null, fromSeq: null, toSeq: null, note: null }];
      for (const src of sources) {
        tx.insert(memorySources)
          .values({
            id: newId(),
            memoryId: mid,
            conversationId: src.conversationId ? (convMap.get(src.conversationId) ?? null) : null,
            scenarioId,
            fromSeq: src.fromSeq ?? null,
            toSeq: src.toSeq ?? null,
            note: [src.note, 'Importata con lo scenario'].filter(Boolean).join(' — '),
            createdAt: ts,
          })
          .run();
      }
      result.imported.memories++;
    }
  });
  if (ext.projectId) {
    ensureMembership(ctx, ext.projectId, data.participants.map((p) => mapChar(p.characterId)).filter((x): x is string => !!x));
  }
  scheduleIndexing(ctx);
  result.scenario = getScenario(ctx, scenarioId);
  return result;
}
