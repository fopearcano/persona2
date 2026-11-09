import type {
  BigFive,
  Character,
  CharacterInput,
  CharacterProfileFields,
  CharacterSnapshot,
  CharacterSummary,
  IdentityRevision,
} from '@persona/shared';
import {
  characterInputSchema,
  characterStatusSchema,
  duplicateInputSchema,
  NO_PROJECT,
  variantInputSchema,
} from '@persona/shared';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import type { Db } from '../db/client.js';
import {
  characterLanguages,
  characterTraits,
  characters,
  expertise,
  identityRevisions,
  memories,
  memorySources,
  modelConfigurations,
} from '../db/schema.js';
import { AppError, newId, notFound, nowIso, parseJson, validate } from '../lib/util.js';
import { ensureMembership, projectIdsByCharacter } from './project-membership.js';

type CharacterRow = typeof characters.$inferSelect;

export const PROFILE_KEYS = [
  'name',
  'age',
  'origin',
  'culturalBackground',
  'occupation',
  'education',
  'biography',
  'appearance',
  'portrait',
  'temperament',
  'interpersonalStyle',
  'conflictResponse',
  'stressResponse',
  'bigFive',
  'register',
  'vocabulary',
  'formality',
  'humor',
  'assertiveness',
  'argumentativeStyle',
  'conversationalDepth',
  'culturalLinguisticNotes',
  'preferredLanguage',
  'authorNotes',
] as const satisfies readonly (keyof CharacterProfileFields)[];

function profileFromRow(row: CharacterRow): CharacterProfileFields {
  return {
    name: row.name,
    age: row.age,
    origin: row.origin,
    culturalBackground: row.culturalBackground,
    occupation: row.occupation,
    education: row.education,
    biography: row.biography,
    appearance: row.appearance,
    portrait: row.portrait,
    temperament: row.temperament,
    interpersonalStyle: row.interpersonalStyle,
    conflictResponse: row.conflictResponse,
    stressResponse: row.stressResponse,
    bigFive: parseJson<BigFive | null>(row.bigFive, null),
    register: row.register,
    vocabulary: row.vocabulary,
    formality: row.formality,
    humor: row.humor,
    assertiveness: row.assertiveness,
    argumentativeStyle: row.argumentativeStyle,
    conversationalDepth: row.conversationalDepth,
    culturalLinguisticNotes: row.culturalLinguisticNotes,
    preferredLanguage: row.preferredLanguage,
    authorNotes: row.authorNotes,
  };
}

function profileToRow(p: CharacterProfileFields) {
  const { bigFive, ...rest } = p;
  const hasBigFive = bigFive && Object.values(bigFive).some((v) => v != null);
  return { ...rest, bigFive: hasBigFive ? JSON.stringify(bigFive) : null };
}

export function getCharacterRow(ctx: AppContext, id: string): CharacterRow {
  const row = ctx.dbm.db.select().from(characters).where(eq(characters.id, id)).get();
  if (!row) throw notFound('Personaggio', id);
  return row;
}

function hydrate(db: Db, row: CharacterRow): Character {
  const traits = db
    .select()
    .from(characterTraits)
    .where(eq(characterTraits.characterId, row.id))
    .orderBy(asc(characterTraits.sortOrder))
    .all();
  const languages = db
    .select()
    .from(characterLanguages)
    .where(eq(characterLanguages.characterId, row.id))
    .orderBy(asc(characterLanguages.sortOrder))
    .all();
  const exp = db.select().from(expertise).where(eq(expertise.characterId, row.id)).orderBy(asc(expertise.sortOrder)).all();
  return {
    id: row.id,
    ...profileFromRow(row),
    status: row.status as Character['status'],
    parentId: row.parentId,
    variantNote: row.variantNote,
    modelConfigId: row.modelConfigId,
    identityVersion: row.identityVersion,
    projectIds: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    traits: traits.map((t) => ({
      id: t.id,
      category: t.category as Character['traits'][number]['category'],
      content: t.content,
      sortOrder: t.sortOrder,
    })),
    languages: languages.map((l) => ({
      id: l.id,
      code: l.code,
      proficiency: l.proficiency as Character['languages'][number]['proficiency'],
      isNative: l.isNative,
      notes: l.notes,
      sortOrder: l.sortOrder,
    })),
    expertise: exp.map((e) => ({
      id: e.id,
      domain: e.domain,
      level: e.level as Character['expertise'][number]['level'],
      description: e.description,
      subtopics: parseJson<string[]>(e.subtopics, []),
      sortOrder: e.sortOrder,
    })),
  };
}

export function getCharacter(ctx: AppContext, id: string): Character {
  const c = hydrate(ctx.dbm.db, getCharacterRow(ctx, id));
  c.projectIds = projectIdsByCharacter(ctx, [id]).get(id) ?? [];
  return c;
}

export function snapshotOf(c: Character | CharacterSnapshot): CharacterSnapshot {
  const profile = Object.fromEntries(PROFILE_KEYS.map((k) => [k, (c as CharacterProfileFields)[k] ?? null])) as unknown as CharacterProfileFields;
  return {
    ...profile,
    traits: c.traits.map((t, i) => ({ category: t.category, content: t.content, sortOrder: i })),
    languages: c.languages.map((l, i) => ({
      code: l.code,
      proficiency: l.proficiency,
      isNative: l.isNative,
      notes: l.notes ?? null,
      sortOrder: i,
    })),
    expertise: c.expertise.map((e, i) => ({
      domain: e.domain,
      level: e.level,
      description: e.description ?? null,
      subtopics: [...e.subtopics],
      sortOrder: i,
    })),
  };
}

/** `projectId`: id del progetto, NO_PROJECT per i personaggi senza progetto, undefined per tutti. */
export function listCharacters(ctx: AppContext, opts: { status?: string; projectId?: string } = {}): CharacterSummary[] {
  const where: string[] = [];
  if (opts.status) where.push('c.status = @status');
  if (opts.projectId === NO_PROJECT) where.push('NOT EXISTS (SELECT 1 FROM project_characters pc WHERE pc.character_id = c.id)');
  else if (opts.projectId) where.push('EXISTS (SELECT 1 FROM project_characters pc WHERE pc.character_id = c.id AND pc.project_id = @projectId)');
  const rows = ctx.dbm.sqlite
    .prepare(
      `SELECT c.id, c.name, c.occupation, c.origin, c.portrait, c.status, c.parent_id AS parentId,
              c.variant_note AS variantNote, c.identity_version AS identityVersion,
              c.created_at AS createdAt, c.updated_at AS updatedAt,
              (SELECT count(*) FROM memories m WHERE m.character_id = c.id AND m.status != 'archived') AS memoryCount,
              (SELECT count(*) FROM conversation_participants p WHERE p.character_id = c.id) AS conversationCount
         FROM characters c
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.updated_at DESC`,
    )
    .all({ status: opts.status, projectId: opts.projectId }) as Omit<CharacterSummary, 'languages' | 'expertiseDomains' | 'projectIds'>[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const langs = ctx.dbm.db
    .select()
    .from(characterLanguages)
    .where(inArray(characterLanguages.characterId, ids))
    .orderBy(asc(characterLanguages.sortOrder))
    .all();
  const exps = ctx.dbm.db
    .select({ characterId: expertise.characterId, domain: expertise.domain })
    .from(expertise)
    .where(inArray(expertise.characterId, ids))
    .orderBy(asc(expertise.sortOrder))
    .all();
  const memberships = projectIdsByCharacter(ctx, ids);
  return rows.map((r) => ({
    ...r,
    projectIds: memberships.get(r.id) ?? [],
    languages: langs
      .filter((l) => l.characterId === r.id)
      .map((l) => ({ code: l.code, proficiency: l.proficiency as CharacterSummary['languages'][number]['proficiency'], isNative: l.isNative })),
    expertiseDomains: exps.filter((e) => e.characterId === r.id).map((e) => e.domain),
  }));
}

function writeChildren(db: Db, characterId: string, snap: Pick<CharacterSnapshot, 'traits' | 'languages' | 'expertise'>) {
  db.delete(characterTraits).where(eq(characterTraits.characterId, characterId)).run();
  db.delete(characterLanguages).where(eq(characterLanguages.characterId, characterId)).run();
  db.delete(expertise).where(eq(expertise.characterId, characterId)).run();
  snap.traits.forEach((t, i) =>
    db.insert(characterTraits).values({ id: newId(), characterId, category: t.category, content: t.content, sortOrder: i }).run(),
  );
  // Al massimo una lingua madre "principale" non è imposta: si possono avere più lingue native (bilinguismo).
  snap.languages.forEach((l, i) =>
    db
      .insert(characterLanguages)
      .values({
        id: newId(),
        characterId,
        code: l.code,
        proficiency: l.isNative ? 'native' : l.proficiency,
        isNative: l.isNative || l.proficiency === 'native',
        notes: l.notes ?? null,
        sortOrder: i,
      })
      .run(),
  );
  snap.expertise.forEach((e, i) =>
    db
      .insert(expertise)
      .values({
        id: newId(),
        characterId,
        domain: e.domain,
        level: e.level,
        description: e.description ?? null,
        subtopics: JSON.stringify(e.subtopics ?? []),
        sortOrder: i,
      })
      .run(),
  );
}

function assertModelConfig(ctx: AppContext, id: string | null) {
  if (!id) return;
  const row = ctx.dbm.db.select({ id: modelConfigurations.id }).from(modelConfigurations).where(eq(modelConfigurations.id, id)).get();
  if (!row) throw new AppError('validation', `Configurazione modello inesistente: ${id}`);
}

export function createCharacter(
  ctx: AppContext,
  input: CharacterInput,
  extra: { parentId?: string | null; variantNote?: string | null } = {},
): Character {
  const data = validate(characterInputSchema, input);
  assertModelConfig(ctx, data.modelConfigId);
  const id = newId();
  const ts = nowIso();
  const profile = Object.fromEntries(PROFILE_KEYS.map((k) => [k, data[k]])) as unknown as CharacterProfileFields;
  ctx.dbm.db.transaction((tx) => {
    tx.insert(characters)
      .values({
        id,
        ...profileToRow(profile),
        status: 'active',
        parentId: extra.parentId ?? null,
        variantNote: extra.variantNote ?? null,
        modelConfigId: data.modelConfigId,
        identityVersion: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    writeChildren(tx as unknown as Db, id, {
      traits: data.traits.map((t, i) => ({ ...t, sortOrder: i })),
      languages: data.languages.map((l, i) => ({ ...l, notes: l.notes ?? null, sortOrder: i })),
      expertise: data.expertise.map((e, i) => ({ ...e, description: e.description ?? null, sortOrder: i })),
    });
  });
  return getCharacter(ctx, id);
}

/**
 * Aggiorna l'identità canonica. È un'azione esplicita dell'autore: prima della
 * modifica viene salvata un'istantanea nella cronologia (identity_revisions) e
 * la versione dell'identità viene incrementata. Cambiare solo il modello non
 * è una modifica d'identità.
 */
export function updateCharacter(ctx: AppContext, id: string, input: CharacterInput): Character {
  const before = getCharacter(ctx, id);
  const data = validate(characterInputSchema, input);
  assertModelConfig(ctx, data.modelConfigId);
  const profile = Object.fromEntries(PROFILE_KEYS.map((k) => [k, data[k]])) as unknown as CharacterProfileFields;
  const nextSnap = snapshotOf({
    ...profile,
    traits: data.traits.map((t, i) => ({ ...t, sortOrder: i })),
    languages: data.languages.map((l, i) => ({ ...l, notes: l.notes ?? null, sortOrder: i })),
    expertise: data.expertise.map((e, i) => ({ ...e, description: e.description ?? null, sortOrder: i })),
  } as CharacterSnapshot);
  const prevSnap = snapshotOf(before);
  const identityChanged = JSON.stringify(normalizeSnap(prevSnap)) !== JSON.stringify(normalizeSnap(nextSnap));
  const ts = nowIso();
  ctx.dbm.db.transaction((tx) => {
    if (identityChanged) {
      tx.insert(identityRevisions)
        .values({
          id: newId(),
          characterId: id,
          version: before.identityVersion,
          snapshot: JSON.stringify(prevSnap),
          reason: data.revisionReason,
          createdAt: ts,
        })
        .run();
    }
    tx.update(characters)
      .set({
        ...profileToRow(profile),
        modelConfigId: data.modelConfigId,
        identityVersion: identityChanged ? before.identityVersion + 1 : before.identityVersion,
        updatedAt: ts,
      })
      .where(eq(characters.id, id))
      .run();
    if (identityChanged) writeChildren(tx as unknown as Db, id, nextSnap);
  });
  return getCharacter(ctx, id);
}

function normalizeSnap(s: CharacterSnapshot) {
  const bf = s.bigFive && Object.values(s.bigFive).some((v) => v != null) ? s.bigFive : null;
  const langs = s.languages.map((l) => ({
    ...l,
    proficiency: l.isNative ? 'native' : l.proficiency,
    isNative: l.isNative || l.proficiency === 'native',
  }));
  return { ...s, bigFive: bf, languages: langs };
}

export function setCharacterModel(ctx: AppContext, id: string, modelConfigId: string | null): Character {
  getCharacterRow(ctx, id);
  assertModelConfig(ctx, modelConfigId);
  ctx.dbm.db.update(characters).set({ modelConfigId, updatedAt: nowIso() }).where(eq(characters.id, id)).run();
  return getCharacter(ctx, id);
}

export function setCharacterStatus(ctx: AppContext, id: string, input: unknown): Character {
  const { status } = validate(characterStatusSchema, input);
  getCharacterRow(ctx, id);
  ctx.dbm.db.update(characters).set({ status, updatedAt: nowIso() }).where(eq(characters.id, id)).run();
  return getCharacter(ctx, id);
}

export function deleteCharacter(ctx: AppContext, id: string): void {
  getCharacterRow(ctx, id);
  // Le varianti restano: perdono solo il collegamento al genitore.
  ctx.dbm.db.update(characters).set({ parentId: null }).where(eq(characters.parentId, id)).run();
  ctx.dbm.db.delete(characters).where(eq(characters.id, id)).run();
}

function copyMemories(ctx: AppContext, fromId: string, toId: string, mode: 'none' | 'core' | 'personal', fromName: string) {
  if (mode === 'none') return 0;
  const cats = mode === 'core' ? ['core'] : ['core', 'episodic', 'semantic'];
  const rows = ctx.dbm.db
    .select()
    .from(memories)
    .where(and(eq(memories.characterId, fromId), inArray(memories.category, cats), ne(memories.status, 'archived')))
    .all();
  const ts = nowIso();
  for (const m of rows) {
    const id = newId();
    ctx.dbm.db
      .insert(memories)
      .values({ ...m, id, characterId: toId, retrievalCount: 0, lastRetrievedAt: null, createdAt: ts, updatedAt: ts })
      .run();
    ctx.dbm.db
      .insert(memorySources)
      .values({ id: newId(), memoryId: id, note: `Copiata da «${fromName}» (memoria ${m.id})`, createdAt: ts })
      .run();
  }
  return rows.length;
}

function cloneInput(c: Character, name: string): CharacterInput {
  const snap = snapshotOf(c);
  return { ...snap, name, modelConfigId: c.modelConfigId };
}

export function duplicateCharacter(ctx: AppContext, id: string, input: unknown): Character {
  const opts = validate(duplicateInputSchema, input);
  const src = getCharacter(ctx, id);
  const created = createCharacter(ctx, cloneInput(src, opts.name ?? `${src.name} (copia)`));
  copyMemories(ctx, src.id, created.id, opts.copyMemories, src.name);
  // La copia nasce negli stessi progetti dell'originale.
  for (const pid of src.projectIds) ensureMembership(ctx, pid, [created.id]);
  return getCharacter(ctx, created.id);
}

/** Variante derivata: copia indipendente collegata all'originale, che resta invariato. */
export function createVariant(ctx: AppContext, id: string, input: unknown): Character {
  const opts = validate(variantInputSchema, input);
  const src = getCharacter(ctx, id);
  const created = createCharacter(ctx, cloneInput(src, opts.name ?? `${src.name} (variante)`), {
    parentId: src.id,
    variantNote: opts.variantNote,
  });
  copyMemories(ctx, src.id, created.id, opts.copyMemories, src.name);
  for (const pid of src.projectIds) ensureMembership(ctx, pid, [created.id]);
  return getCharacter(ctx, created.id);
}

export function listVariants(ctx: AppContext, id: string) {
  return ctx.dbm.db
    .select({ id: characters.id, name: characters.name, variantNote: characters.variantNote, updatedAt: characters.updatedAt })
    .from(characters)
    .where(eq(characters.parentId, id))
    .all();
}

export function listRevisions(ctx: AppContext, characterId: string): IdentityRevision[] {
  getCharacterRow(ctx, characterId);
  return ctx.dbm.db
    .select()
    .from(identityRevisions)
    .where(eq(identityRevisions.characterId, characterId))
    .orderBy(desc(identityRevisions.version), desc(identityRevisions.createdAt))
    .all()
    .map((r) => ({
      id: r.id,
      characterId: r.characterId,
      version: r.version,
      reason: r.reason,
      createdAt: r.createdAt,
      snapshot: parseJson<CharacterSnapshot>(r.snapshot, {} as CharacterSnapshot),
    }));
}

/** Ripristina una revisione precedente (creando a sua volta una revisione dello stato attuale). */
export function restoreRevision(ctx: AppContext, characterId: string, revisionId: string): Character {
  const current = getCharacter(ctx, characterId);
  const rev = ctx.dbm.db
    .select()
    .from(identityRevisions)
    .where(and(eq(identityRevisions.id, revisionId), eq(identityRevisions.characterId, characterId)))
    .get();
  if (!rev) throw notFound('Revisione', revisionId);
  const snap = parseJson<CharacterSnapshot>(rev.snapshot, {} as CharacterSnapshot);
  return updateCharacter(ctx, characterId, {
    ...snap,
    modelConfigId: current.modelConfigId,
    revisionReason: `Ripristino della versione ${rev.version}`,
  });
}
