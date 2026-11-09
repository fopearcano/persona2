/** Appartenenza dei personaggi ai progetti (modulo senza dipendenze, usato dagli altri servizi). */
import { asc, inArray } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { projectCharacters } from '../db/schema.js';
import { newId, nowIso } from '../lib/util.js';

/** Aggiunge personaggi a un progetto (idempotente). */
export function ensureMembership(ctx: AppContext, projectId: string, characterIds: string[]): void {
  if (characterIds.length === 0) return;
  const ts = nowIso();
  const stmt = ctx.dbm.sqlite.prepare(
    `INSERT OR IGNORE INTO project_characters (id, project_id, character_id, added_at) VALUES (?, ?, ?, ?)`,
  );
  ctx.dbm.sqlite.transaction(() => {
    for (const cid of new Set(characterIds)) stmt.run(newId(), projectId, cid, ts);
  })();
}

export function projectIdsByCharacter(ctx: AppContext, characterIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < characterIds.length; i += 500) {
    const rows = ctx.dbm.db
      .select({ characterId: projectCharacters.characterId, projectId: projectCharacters.projectId })
      .from(projectCharacters)
      .where(inArray(projectCharacters.characterId, characterIds.slice(i, i + 500)))
      .orderBy(asc(projectCharacters.addedAt))
      .all();
    for (const r of rows) out.set(r.characterId, [...(out.get(r.characterId) ?? []), r.projectId]);
  }
  return out;
}

export function projectExists(ctx: AppContext, projectId: string): boolean {
  return !!ctx.dbm.sqlite.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId);
}
