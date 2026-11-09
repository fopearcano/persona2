/**
 * Contorno della costruzione McKee: la storia di riferimento (un progetto) e il suo cast.
 *
 * Un personaggio può far parte di più progetti; il costruttore lavora con una storia per
 * volta (genere, cast, relazioni). La costruzione resta unica per l'identità: la stessa
 * persona ha la stessa costruzione in tutte le storie.
 */
import type { BuildContext, CastMember } from '@persona/shared';
import type { McKeeCharacter, McKeeStory } from '@persona/shared/mckee';
import { characterDesignForAnalysis, characterDesignSection } from '@persona/shared/mckee';
import type { Character } from '@persona/shared';
import type { AppContext } from '../context.js';
import { AppError } from '../lib/util.js';
import { buildFromRow, getCharacterRow } from './characters.js';
import { getProject } from './projects.js';

interface CastRow {
  id: string;
  name: string;
  portrait: string | null;
  occupation: string | null;
  build: string | null;
  bigFive: string | null;
}

function toMember(r: CastRow): CastMember {
  return { id: r.id, name: r.name, portrait: r.portrait, occupation: r.occupation, build: buildFromRow(r) };
}

/** Cast di un progetto con le costruzioni (per il cast map e le verifiche del cast). */
export function projectCast(ctx: AppContext, projectId: string): CastMember[] {
  getProject(ctx, projectId);
  const rows = ctx.dbm.sqlite
    .prepare(
      `SELECT c.id, c.name, c.portrait, c.occupation, c.build, c.big_five AS bigFive
         FROM characters c JOIN project_characters pc ON pc.character_id = c.id
        WHERE pc.project_id = ? AND c.status = 'active'
        ORDER BY pc.added_at ASC`,
    )
    .all(projectId) as CastRow[];
  return rows.map(toMember);
}

/** Progetti del personaggio (ordine di aggiunta). */
function characterProjects(ctx: AppContext, characterId: string): { id: string; name: string }[] {
  return ctx.dbm.sqlite
    .prepare(
      `SELECT p.id, p.name FROM projects p JOIN project_characters pc ON pc.project_id = p.id
        WHERE pc.character_id = ? ORDER BY pc.added_at ASC`,
    )
    .all(characterId) as { id: string; name: string }[];
}

/**
 * Storia di riferimento per una costruzione: quella richiesta se il personaggio ne fa parte,
 * altrimenti il primo progetto del personaggio, altrimenti nessuna.
 */
export function buildContext(ctx: AppContext, characterId: string, projectId?: string | null): BuildContext {
  getCharacterRow(ctx, characterId);
  const projects = characterProjects(ctx, characterId);
  const chosen = (projectId && projects.find((p) => p.id === projectId)) || projects[0] || null;
  if (!chosen) return { project: null, projects, cast: [] };
  const project = getProject(ctx, chosen.id);
  return {
    project: { id: project.id, name: project.name, story: project.story },
    projects,
    cast: projectCast(ctx, project.id).filter((m) => m.id !== characterId),
  };
}

export function toMcKee(c: Pick<Character, 'id' | 'name' | 'build'> | CastMember): McKeeCharacter {
  return { ...c.build, id: c.id, name: c.name };
}

export function toMcKeeStory(p: BuildContext['project']): McKeeStory | null {
  return p ? { ...p.story, id: p.id, title: p.name } : null;
}

/** Nomi dei personaggi a cui puntano le relazioni della costruzione. */
export function relationshipNames(ctx: AppContext, c: Pick<Character, 'build'>): Map<string, string> {
  const ids = [...new Set(c.build.relationships.map((r) => r.targetId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = ctx.dbm.sqlite
    .prepare(`SELECT id, name FROM characters WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { id: string; name: string }[];
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Sezione del prompt con il profilo McKee (null se assente o disattivato). */
export function designSection(ctx: AppContext, c: Character, purpose: 'character' | 'analysis'): string | null {
  const names = relationshipNames(ctx, c);
  return purpose === 'analysis' ? characterDesignForAnalysis(c.build, { name: c.name, names }) : characterDesignSection(c.build, { name: c.name, names });
}

export function assertMember(ctx: AppContext, projectId: string, characterId: string): void {
  const ok = ctx.dbm.sqlite.prepare('SELECT 1 FROM project_characters WHERE project_id = ? AND character_id = ?').get(projectId, characterId);
  if (!ok) throw new AppError('validation', 'Il personaggio non fa parte di questo progetto');
}
