import type { Character, CharacterSummary, Memory, ProjectExportV1, ProjectSummary, ScenarioDetail } from '@persona/shared';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, createTestEnv, parseSse, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false } } });
});
afterEach(async () => {
  await env.close();
});

const json = async <T = unknown>(method: string, url: string, payload?: unknown) => {
  const res = await env.app.inject({ method: method as 'GET', url, payload: payload as never });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
};
const newProject = async (name: string) => (await json<{ id: string }>('POST', '/api/projects', { name, description: `Storia ${name}` })).body;
const listChars = async (projectId?: string) =>
  (await json<CharacterSummary[]>('GET', `/api/characters${projectId ? `?projectId=${projectId}` : ''}`)).body;

describe('projects', () => {
  it('starts with a default active project and keeps it across restarts', async () => {
    const projects = (await json<ProjectSummary[]>('GET', '/api/projects')).body;
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Il mio progetto');
    expect((await json<{ activeProjectId: string }>('GET', '/api/preferences')).body.activeProjectId).toBe(projects[0].id);
    await env.restart();
    expect((await json<ProjectSummary[]>('GET', '/api/projects')).body).toHaveLength(1);
  });

  it('migrates characters and scenarios created before projects existed', async () => {
    const c = await createCharacter(env);
    const s = (await json<ScenarioDetail>('POST', '/api/scenarios', { title: 'Vecchio scenario' })).body;
    expect(s.projectId).toBeNull();
    // Simula un database precedente all'introduzione dei progetti.
    env.ctx.dbm.sqlite.exec(`DELETE FROM projects; DELETE FROM user_preferences WHERE key = 'projects.initialized';`);
    await env.restart();
    const [project] = (await json<ProjectSummary[]>('GET', '/api/projects')).body;
    expect(project.characterCount).toBe(1);
    expect(project.scenarioCount).toBe(1);
    expect((await listChars(project.id)).map((x) => x.id)).toEqual([c.id]);
    expect((await json<ScenarioDetail>('GET', `/api/scenarios/${s.id}`)).body.projectId).toBe(project.id);
  });

  it('divides characters per project while letting one identity join several stories', async () => {
    const a = await newProject('Aurora');
    const b = await newProject('Deserto');
    const irina = (await json<Character>('POST', '/api/characters', { name: 'Irina', projectId: a.id })).body;
    const marco = (await json<Character>('POST', '/api/characters', { name: 'Marco', projectId: b.id })).body;
    const free = await createCharacter(env, { name: 'Senza storia' });
    expect(irina.projectIds).toEqual([a.id]);

    expect((await listChars(a.id)).map((x) => x.name)).toEqual(['Irina']);
    expect((await listChars(b.id)).map((x) => x.name)).toEqual(['Marco']);
    expect((await listChars('none')).map((x) => x.id)).toEqual([free.id]);
    expect(await listChars()).toHaveLength(3);

    // La stessa identità entra in un'altra storia senza duplicarsi né cambiare versione.
    const added = await json<Character>('POST', `/api/projects/${b.id}/characters`, { characterId: irina.id });
    expect(added.status).toBe(201);
    expect(added.body.projectIds.sort()).toEqual([a.id, b.id].sort());
    expect(added.body.identityVersion).toBe(1);
    expect((await listChars(b.id)).map((x) => x.name).sort()).toEqual(['Irina', 'Marco']);
    expect(await listChars()).toHaveLength(3);

    // Copie e varianti nascono negli stessi progetti dell'originale.
    const variant = (await json<Character>('POST', `/api/characters/${irina.id}/variants`, { name: 'Irina giovane' })).body;
    expect(variant.projectIds.sort()).toEqual([a.id, b.id].sort());

    expect((await json('DELETE', `/api/projects/${b.id}/characters/${irina.id}`)).status).toBe(204);
    expect((await json<Character>('GET', `/api/characters/${irina.id}`)).body.projectIds).toEqual([a.id]);
    expect((await json('POST', '/api/characters', { name: 'X', projectId: 'inesistente' })).status).toBe(404);
  });

  it('keeps scenarios and simulations inside their project', async () => {
    const a = await newProject('Aurora');
    const b = await newProject('Deserto');
    const irina = await createCharacter(env);
    const s = (await json<ScenarioDetail>('POST', '/api/scenarios', { title: 'Nave', projectId: a.id })).body;
    expect(s.projectId).toBe(a.id);
    expect((await json<ScenarioDetail[]>('GET', `/api/scenarios?projectId=${a.id}`)).body.map((x) => x.id)).toEqual([s.id]);
    expect((await json<ScenarioDetail[]>('GET', `/api/scenarios?projectId=${b.id}`)).body).toHaveLength(0);

    // Chi partecipa a uno scenario entra nel progetto della storia.
    await json('POST', `/api/scenarios/${s.id}/participants`, { characterId: irina.id, role: 'Navigatrice' });
    expect((await json<Character>('GET', `/api/characters/${irina.id}`)).body.projectIds).toEqual([a.id]);
    const blocked = await json<{ error: { code: string } }>('DELETE', `/api/projects/${a.id}/characters/${irina.id}`);
    expect(blocked.status).toBe(409);

    const sim = (
      await json<{ id: string }>('POST', '/api/conversations', { kind: 'simulation', scenarioId: s.id, participantIds: [irina.id] })
    ).body;
    expect((await json<{ id: string }[]>('GET', `/api/conversations?kind=simulation&projectId=${a.id}`)).body.map((x) => x.id)).toEqual([sim.id]);
    expect((await json<unknown[]>('GET', `/api/conversations?kind=simulation&projectId=${b.id}`)).body).toHaveLength(0);

    // Spostando lo scenario, i partecipanti entrano nel nuovo progetto.
    const moved = (await json<ScenarioDetail>('PUT', `/api/scenarios/${s.id}`, { title: 'Nave', projectId: b.id })).body;
    expect(moved.projectId).toBe(b.id);
    expect((await json<Character>('GET', `/api/characters/${irina.id}`)).body.projectIds.sort()).toEqual([a.id, b.id].sort());
    // Una modifica senza projectId non sposta lo scenario.
    expect((await json<ScenarioDetail>('PUT', `/api/scenarios/${s.id}`, { title: 'Nave 2' })).body.projectId).toBe(b.id);
  });

  it('deletes a project with its scenarios but never shared identities', async () => {
    const a = await newProject('Aurora');
    const b = await newProject('Deserto');
    await json('PUT', '/api/preferences', { activeProjectId: a.id });
    const only = (await json<Character>('POST', '/api/characters', { name: 'Solo Aurora', projectId: a.id })).body;
    const shared = (await json<Character>('POST', '/api/characters', { name: 'Condiviso', projectId: a.id })).body;
    await json('POST', `/api/projects/${b.id}/characters`, { characterId: shared.id });
    await json('POST', '/api/memories', { characterId: shared.id, category: 'semantic', content: 'Ricordo personale' });
    const s = (await json<ScenarioDetail>('POST', '/api/scenarios', { title: 'Nave', projectId: a.id })).body;
    await json('POST', `/api/scenarios/${s.id}/participants`, { characterId: shared.id });
    await json('POST', '/api/memories', { characterId: shared.id, category: 'contextual', scenarioId: s.id, content: 'Evento di bordo' });

    const res = await json<{ deletedScenarios: number; deletedCharacters: number }>('DELETE', `/api/projects/${a.id}?deleteCharacters=1`);
    expect(res.body).toEqual({ deletedScenarios: 1, deletedCharacters: 1 });
    expect((await json('GET', `/api/scenarios/${s.id}`)).status).toBe(404);
    expect((await json('GET', `/api/characters/${only.id}`)).status).toBe(404);
    const left = (await json<Character>('GET', `/api/characters/${shared.id}`)).body;
    expect(left.projectIds).toEqual([b.id]);
    const mems = (await json<Memory[]>('GET', `/api/memories?characterId=${shared.id}`)).body;
    expect(mems.map((m) => m.content)).toEqual(['Ricordo personale']);
    expect((await json<{ activeProjectId: string | null }>('GET', '/api/preferences')).body.activeProjectId).toBeNull();
  });

  it('remembers the active project and rejects unknown ones', async () => {
    const a = await newProject('Aurora');
    expect((await json('PUT', '/api/preferences', { activeProjectId: 'inesistente' })).status).toBe(404);
    await json('PUT', '/api/preferences', { activeProjectId: a.id });
    await env.restart();
    expect((await json<{ activeProjectId: string }>('GET', '/api/preferences')).body.activeProjectId).toBe(a.id);
    await json('PUT', '/api/preferences', { activeProjectId: null });
    expect((await json<{ activeProjectId: string | null }>('GET', '/api/preferences')).body.activeProjectId).toBeNull();
  });
});

describe('saving projects to file', () => {
  async function buildStory() {
    const a = await newProject('Aurora');
    const irina = (await json<Character>('POST', '/api/characters', { ...{ name: 'Irina Volkova', occupation: 'Astrofisica' }, projectId: a.id })).body;
    const marco = (await json<Character>('POST', '/api/characters', { name: 'Marco Bellini', projectId: a.id })).body;
    await json('POST', '/api/memories', { characterId: irina.id, category: 'core', content: 'Ha perso il padre a 12 anni' });
    const lab = (await json<{ id: string }>('POST', '/api/conversations', { kind: 'lab', characterId: irina.id })).body;
    await send(env, lab.id, { content: 'Parliamo di pulsar' });
    const s = (await json<ScenarioDetail>('POST', '/api/scenarios', { title: 'Nave Aurora', projectId: a.id })).body;
    await json('POST', `/api/scenarios/${s.id}/participants`, { characterId: irina.id, role: 'Navigatrice' });
    await json('POST', `/api/scenarios/${s.id}/participants`, { characterId: marco.id, role: 'Ingegnere' });
    await json('POST', `/api/scenarios/${s.id}/events`, { content: 'Guasto al giroscopio' });
    const sim = (
      await json<{ id: string }>('POST', '/api/conversations', { kind: 'simulation', scenarioId: s.id, participantIds: [irina.id, marco.id] })
    ).body;
    await send(env, sim.id, { content: 'Allarme.', role: 'narrator' });
    parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: { characterId: marco.id } })).body);
    await json('POST', '/api/memories', { characterId: marco.id, category: 'contextual', scenarioId: s.id, content: 'Il reattore perde pressione' });
    return { a, irina, marco, s };
  }

  it('saves a whole story and reopens it in another database', async () => {
    const { a } = await buildStory();
    const exp = await env.app.inject({ method: 'GET', url: `/api/projects/${a.id}/export` });
    expect(exp.headers['content-disposition']).toContain('persona-progetto-Aurora.json');
    const bundle = exp.json() as ProjectExportV1;
    expect(bundle.format).toBe('persona.project');
    expect(bundle.characters.map((c) => c.character.name).sort()).toEqual(['Irina Volkova', 'Marco Bellini']);
    expect(bundle.scenarios).toHaveLength(1);
    expect(bundle.scenarios[0].characters).toHaveLength(0);
    expect(bundle.scenarios[0].sessions[0].messages.map((m) => m.role)).toEqual(['narrator', 'character']);

    const other = await createTestEnv({ dir: mkdtempSync(join(tmpdir(), 'persona-project-')) });
    try {
      const res = await other.app.inject({ method: 'POST', url: '/api/projects/import', payload: bundle });
      expect(res.statusCode).toBe(201);
      const out = res.json();
      expect(out.characters).toEqual({ reused: 0, imported: 2 });
      expect(out.imported).toMatchObject({ scenarios: 1, sessions: 1 });
      const pid = out.project.id as string;
      expect(out.project.name).toBe('Aurora');
      const chars = (await other.app.inject({ method: 'GET', url: `/api/characters?projectId=${pid}` })).json() as CharacterSummary[];
      expect(chars.map((c) => c.name).sort()).toEqual(['Irina Volkova', 'Marco Bellini']);
      const irina = chars.find((c) => c.name === 'Irina Volkova')!;
      const mems = (await other.app.inject({ method: 'GET', url: `/api/memories?characterId=${irina.id}` })).json() as Memory[];
      expect(mems.some((m) => m.category === 'core')).toBe(true);
      const labs = (await other.app.inject({ method: 'GET', url: `/api/conversations?characterId=${irina.id}&kind=lab` })).json();
      expect(labs).toHaveLength(1);
      const scen = (await other.app.inject({ method: 'GET', url: `/api/scenarios?projectId=${pid}` })).json() as ScenarioDetail[];
      expect(scen.map((s) => s.title)).toEqual(['Nave Aurora']);
      const sims = (await other.app.inject({ method: 'GET', url: `/api/conversations?kind=simulation&projectId=${pid}` })).json();
      expect(sims).toHaveLength(1);
      const ctxMem = (await other.app.inject({ method: 'GET', url: `/api/memories?scenarioId=${scen[0].id}` })).json() as Memory[];
      expect(ctxMem.map((m) => m.content)).toContain('Il reattore perde pressione');
    } finally {
      await other.close();
    }
  });

  it('reuses or duplicates identities when reopening in the same database', async () => {
    const { a, irina } = await buildStory();
    const bundle = (await json<ProjectExportV1>('GET', `/api/projects/${a.id}/export?conversations=0`)).body;
    expect(bundle.characters[0].conversations).toHaveLength(0);
    const reused = (await json<{ characters: { reused: number; imported: number }; project: { id: string; name: string } }>('POST', '/api/projects/import', bundle)).body;
    expect(reused.characters).toEqual({ reused: 2, imported: 0 });
    // Il progetto riaperto accanto all'originale non ne duplica il nome.
    expect(reused.project.name).toBe(`${bundle.project.name} (2)`);
    expect((await json<Character>('GET', `/api/characters/${irina.id}`)).body.projectIds).toHaveLength(2);
    const copied = (await json<{ characters: { reused: number; imported: number }; project: { name: string } }>('POST', '/api/projects/import?characters=new', bundle)).body;
    expect(copied.characters).toEqual({ reused: 0, imported: 2 });
    expect(copied.project.name).toBe(`${bundle.project.name} (3)`);
    expect(await listChars()).toHaveLength(4);
  });

  it('is all-or-nothing on invalid files', async () => {
    const { a } = await buildStory();
    const before = { projects: (await json<unknown[]>('GET', '/api/projects')).body.length, characters: (await listChars()).length };
    const bundle = (await json<ProjectExportV1>('GET', `/api/projects/${a.id}/export`)).body;
    const broken = { ...bundle, scenarios: [{ format: 'persona.scenario', version: 1 }] };
    const res = await json<{ error: { code: string } }>('POST', '/api/projects/import?characters=new', broken);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_import');
    expect((await json<unknown[]>('GET', '/api/projects')).body.length).toBe(before.projects);
    expect((await listChars()).length).toBe(before.characters);
    expect((await json('POST', '/api/projects/import', { format: 'altro' })).status).toBe(400);
  });
});
