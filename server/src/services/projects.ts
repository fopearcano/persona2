/**
 * Progetti: una storia/opera che raggruppa personaggi, scenari e simulazioni.
 *
 * - I personaggi appartengono ai progetti con una relazione molti-a-molti: la stessa identità
 *   può partecipare a più storie senza essere duplicata (principio di PERSONA).
 * - Gli scenari appartengono a un solo progetto; le simulazioni e le sessioni narrative
 *   seguono il progetto del proprio scenario. Le conversazioni del Laboratorio restano del personaggio.
 * - Eliminare un progetto elimina i suoi scenari (con sessioni e memorie contestuali), mai le
 *   identità, salvo richiesta esplicita per quelle presenti solo in quel progetto.
 */
import type { Project, ProjectExportV1, ProjectInput, ProjectSummary, ScenarioExportV1 } from '@persona/shared';
import {
  CHARACTER_EXPORT_FORMAT,
  PROJECT_EXPORT_FORMAT,
  PROJECT_EXPORT_VERSION,
  projectImportOptionsSchema,
  projectInputSchema,
} from '@persona/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { characters, projectCharacters, projects, scenarioParticipants, scenarios, userPreferences } from '../db/schema.js';
import { assertPersonaFile } from '../lib/import-check.js';
import { AppError, newId, notFound, nowIso, validate } from '../lib/util.js';
import { deleteCharacter, getCharacterRow } from './characters.js';
import { exportCharacter, importCharacter } from './portability.js';
import { getPreferences, updatePreferences } from './preferences.js';
import { ensureMembership } from './project-membership.js';
export { ensureMembership, projectIdsByCharacter } from './project-membership.js';
import { exportScenario, importScenario } from './scenario-portability.js';

type ProjectRow = typeof projects.$inferSelect;

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status as Project['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function getProjectRow(ctx: AppContext, id: string): ProjectRow {
  const row = ctx.dbm.db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw notFound('Progetto', id);
  return row;
}

export function getProject(ctx: AppContext, id: string): Project {
  return toProject(getProjectRow(ctx, id));
}

export function listProjects(ctx: AppContext): ProjectSummary[] {
  return ctx.dbm.sqlite
    .prepare(
      `SELECT p.id, p.name, p.description, p.status, p.created_at AS createdAt, p.updated_at AS updatedAt,
              (SELECT count(*) FROM project_characters pc WHERE pc.project_id = p.id) AS characterCount,
              (SELECT count(*) FROM scenarios s WHERE s.project_id = p.id) AS scenarioCount,
              (SELECT count(*) FROM conversations c JOIN scenarios s ON s.id = c.scenario_id
                WHERE s.project_id = p.id AND c.kind = 'simulation') AS simulationCount,
              max(p.updated_at,
                  coalesce((SELECT max(s.updated_at) FROM scenarios s WHERE s.project_id = p.id), ''),
                  coalesce((SELECT max(c.updated_at) FROM conversations c JOIN scenarios s ON s.id = c.scenario_id
                             WHERE s.project_id = p.id), ''),
                  coalesce((SELECT max(ch.updated_at) FROM characters ch JOIN project_characters pc ON pc.character_id = ch.id
                             WHERE pc.project_id = p.id), '')) AS lastActivityAt
         FROM projects p
        ORDER BY p.status ASC, lastActivityAt DESC`,
    )
    .all() as ProjectSummary[];
}

export function createProject(ctx: AppContext, input: ProjectInput): Project {
  const data = validate(projectInputSchema, input);
  const id = newId();
  const ts = nowIso();
  ctx.dbm.db.insert(projects).values({ id, ...data, createdAt: ts, updatedAt: ts }).run();
  return getProject(ctx, id);
}

export function updateProject(ctx: AppContext, id: string, input: ProjectInput): Project {
  getProjectRow(ctx, id);
  const data = validate(projectInputSchema, input);
  ctx.dbm.db.update(projects).set({ ...data, updatedAt: nowIso() }).where(eq(projects.id, id)).run();
  return getProject(ctx, id);
}

export function touchProject(ctx: AppContext, id: string | null | undefined): void {
  if (id) ctx.dbm.db.update(projects).set({ updatedAt: nowIso() }).where(eq(projects.id, id)).run();
}

/** Personaggi che appartengono SOLO a questo progetto. */
function exclusiveCharacters(ctx: AppContext, projectId: string): string[] {
  return (
    ctx.dbm.sqlite
      .prepare(
        `SELECT pc.character_id AS id FROM project_characters pc
          WHERE pc.project_id = ?
            AND NOT EXISTS (SELECT 1 FROM project_characters o WHERE o.character_id = pc.character_id AND o.project_id != pc.project_id)`,
      )
      .all(projectId) as { id: string }[]
  ).map((r) => r.id);
}

export interface DeleteProjectResult {
  deletedScenarios: number;
  deletedCharacters: number;
}

export function deleteProject(ctx: AppContext, id: string, opts: { deleteCharacters: boolean }): DeleteProjectResult {
  getProjectRow(ctx, id);
  const toDelete = opts.deleteCharacters ? exclusiveCharacters(ctx, id) : [];
  const scenarioIds = ctx.dbm.db.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.projectId, id)).all();
  ctx.dbm.db.transaction((tx) => {
    // Gli scenari (con sessioni e memorie contestuali) seguono il progetto.
    tx.delete(scenarios).where(eq(scenarios.projectId, id)).run();
    tx.delete(projects).where(eq(projects.id, id)).run();
  });
  for (const cid of toDelete) deleteCharacter(ctx, cid);
  if (getPreferences(ctx).activeProjectId === id) updatePreferences(ctx, { activeProjectId: null });
  return { deletedScenarios: scenarioIds.length, deletedCharacters: toDelete.length };
}

/* ------------------------------------------------------------------ */
/* Appartenenza dei personaggi                                         */
/* ------------------------------------------------------------------ */

export function addCharacterToProject(ctx: AppContext, projectId: string, characterId: string): void {
  getProjectRow(ctx, projectId);
  getCharacterRow(ctx, characterId);
  ensureMembership(ctx, projectId, [characterId]);
  touchProject(ctx, projectId);
}

/**
 * Toglie un personaggio da un progetto (l'identità resta). Non è consentito se il personaggio
 * partecipa ancora a scenari del progetto: va prima tolto dagli scenari.
 */
export function removeCharacterFromProject(ctx: AppContext, projectId: string, characterId: string): void {
  getProjectRow(ctx, projectId);
  const inScenarios = ctx.dbm.db
    .select({ title: scenarios.title })
    .from(scenarioParticipants)
    .innerJoin(scenarios, eq(scenarios.id, scenarioParticipants.scenarioId))
    .where(and(eq(scenarios.projectId, projectId), eq(scenarioParticipants.characterId, characterId)))
    .all();
  if (inScenarios.length) {
    throw new AppError(
      'conflict',
      `Il personaggio partecipa ancora a scenari del progetto: ${inScenarios.map((s) => s.title).join(', ')}`,
      409,
      { scenarios: inScenarios.map((s) => s.title) },
    );
  }
  ctx.dbm.db
    .delete(projectCharacters)
    .where(and(eq(projectCharacters.projectId, projectId), eq(projectCharacters.characterId, characterId)))
    .run();
  touchProject(ctx, projectId);
}

/* ------------------------------------------------------------------ */
/* Migrazione iniziale                                                 */
/* ------------------------------------------------------------------ */

const DEFAULT_PROJECT_NAME: Record<string, string> = {
  it: 'Il mio progetto',
  en: 'My project',
  fr: 'Mon projet',
  es: 'Mi proyecto',
  de: 'Mein Projekt',
  pt: 'Meu projeto',
};
const INIT_KEY = 'projects.initialized';

/**
 * Eseguita una sola volta all'avvio: crea un primo progetto, vi assegna personaggi e scenari
 * già esistenti (installazioni precedenti all'introduzione dei progetti) e lo rende attivo.
 */
export function ensureDefaultProject(ctx: AppContext): void {
  const done = ctx.dbm.db.select().from(userPreferences).where(eq(userPreferences.key, INIT_KEY)).get();
  if (done) return;
  const existing = ctx.dbm.db.select({ id: projects.id }).from(projects).limit(1).all();
  if (existing.length === 0) {
    const lang = getPreferences(ctx).uiLanguage.split('-')[0];
    const project = createProject(ctx, { name: DEFAULT_PROJECT_NAME[lang] ?? DEFAULT_PROJECT_NAME.en });
    const allCharacters = ctx.dbm.db.select({ id: characters.id }).from(characters).all().map((c) => c.id);
    ensureMembership(ctx, project.id, allCharacters);
    ctx.dbm.sqlite.prepare(`UPDATE scenarios SET project_id = ? WHERE project_id IS NULL`).run(project.id);
    if (!getPreferences(ctx).activeProjectId) updatePreferences(ctx, { activeProjectId: project.id });
  }
  ctx.dbm.db.insert(userPreferences).values({ key: INIT_KEY, value: 'true', updatedAt: nowIso() }).onConflictDoNothing().run();
}

/* ------------------------------------------------------------------ */
/* Salvataggio su file (persona.project)                               */
/* ------------------------------------------------------------------ */

export function exportProject(ctx: AppContext, id: string, opts: { conversations: boolean; sessions: boolean }): ProjectExportV1 {
  const p = getProject(ctx, id);
  const scenarioRows = ctx.dbm.db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.projectId, id))
    .orderBy(asc(scenarios.createdAt))
    .all();
  const scenarioBundles: ScenarioExportV1[] = scenarioRows.map((s) => ({ ...exportScenario(ctx, s.id, { sessions: opts.sessions }), characters: [] }));
  // Membri del progetto più eventuali partecipanti agli scenari non ancora membri.
  const memberIds = ctx.dbm.db
    .select({ id: projectCharacters.characterId })
    .from(projectCharacters)
    .where(eq(projectCharacters.projectId, id))
    .orderBy(asc(projectCharacters.addedAt))
    .all()
    .map((r) => r.id);
  const ids = [...new Set([...memberIds, ...scenarioBundles.flatMap((b) => b.participants.map((x) => x.characterId))])];
  return {
    format: PROJECT_EXPORT_FORMAT,
    version: PROJECT_EXPORT_VERSION,
    exportedAt: nowIso(),
    app: { name: 'PERSONA', version: ctx.config.version },
    project: p,
    characters: ids.map((cid) => exportCharacter(ctx, cid, { conversations: opts.conversations, contextual: false, knowledge: true })),
    scenarios: scenarioBundles,
  };
}

const projectBundleSchema = z.object({
  format: z.literal(PROJECT_EXPORT_FORMAT),
  version: z.literal(PROJECT_EXPORT_VERSION),
  project: z.object({ name: z.string().min(1), description: z.string().nullish(), status: z.enum(['active', 'archived']).optional() }),
  characters: z.array(z.object({ format: z.literal(CHARACTER_EXPORT_FORMAT), character: z.object({ id: z.string() }).passthrough() }).passthrough()),
  scenarios: z.array(z.unknown()).default([]),
});

export interface ProjectImportResult {
  project: Project;
  characters: { reused: number; imported: number };
  imported: { scenarios: number; sessions: number; memories: number };
}

/** Nome libero per un progetto aperto da file: "Nome", altrimenti "Nome (2)", "Nome (3)", … */
function availableProjectName(ctx: AppContext, name: string): string {
  const taken = new Set(ctx.dbm.db.select({ name: projects.name }).from(projects).all().map((r) => r.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** Apre un progetto salvato su file come NUOVO progetto; non sovrascrive mai dati esistenti. */
export function importProject(ctx: AppContext, payload: unknown, options: unknown): ProjectImportResult {
  const opts = validate(projectImportOptionsSchema, options);
  assertPersonaFile(payload, PROJECT_EXPORT_FORMAT, PROJECT_EXPORT_VERSION);
  let data: z.output<typeof projectBundleSchema>;
  try {
    data = projectBundleSchema.parse(payload);
  } catch (err) {
    throw new AppError('invalid_import', `File di progetto non valido: ${(err as Error).message.slice(0, 500)}`, 400, { reason: 'invalid' });
  }
  const result: ProjectImportResult = {
    project: null as unknown as Project,
    characters: { reused: 0, imported: 0 },
    imported: { scenarios: 0, sessions: 0, memories: 0 },
  };
  // Tutto o niente: un errore a metà non lascia progetti o personaggi parziali.
  const projectId = ctx.dbm.sqlite.transaction(() => {
    const project = createProject(ctx, {
      name: availableProjectName(ctx, data.project.name),
      description: data.project.description ?? null,
      status: data.project.status ?? 'active',
    });
    const existing = new Set(
      data.characters.length
        ? ctx.dbm.db
            .select({ id: characters.id })
            .from(characters)
            .where(inArray(characters.id, data.characters.map((c) => c.character.id)))
            .all()
            .map((r) => r.id)
        : [],
    );
    const idMap = new Map<string, string>();
    for (const ch of data.characters) {
      const oldId = ch.character.id;
      if (opts.characters === 'reuse' && existing.has(oldId)) {
        idMap.set(oldId, oldId);
        result.characters.reused++;
      } else {
        const imported = importCharacter(ctx, ch, {
          includeConversations: opts.includeConversations,
          includeMemories: true,
          includeKnowledge: true,
        });
        idMap.set(oldId, imported.character.id);
        result.characters.imported++;
      }
    }
    ensureMembership(ctx, project.id, [...idMap.values()]);
    for (const bundle of data.scenarios) {
      const r = importScenario(ctx, bundle, { characters: 'reuse', includeSessions: opts.includeSessions }, { idMap, projectId: project.id });
      result.imported.scenarios++;
      result.imported.sessions += r.imported.sessions;
      result.imported.memories += r.imported.memories;
    }
    return project.id;
  })();
  result.project = getProject(ctx, projectId);
  return result;
}
