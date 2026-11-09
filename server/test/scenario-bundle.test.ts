import type { Memory, ScenarioExportV1 } from '@persona/shared';
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

async function buildUniverse() {
  const irina = await createCharacter(env);
  const marco = await createCharacter(env, { name: 'Marco Bellini', traits: [], expertise: [], languages: [] });
  const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora', setting: 'Nave interstellare' } })).json();
  await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: irina.id, role: 'Navigatrice' } });
  await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: marco.id, role: 'Ingegnere' } });
  await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/relationships`, payload: { fromCharacterId: marco.id, toCharacterId: irina.id, description: 'Rivalità' } });
  await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/events`, payload: { content: 'Guasto al giroscopio', fictionalTime: 'Giorno 12' } });
  const sim = (
    await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'simulation', scenarioId: s.id, participantIds: [irina.id, marco.id] } })
  ).json();
  await send(env, sim.id, { content: 'Allarme rosso.', role: 'narrator' });
  parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: { characterId: marco.id } })).body);
  await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/process-memory`, payload: {} });
  await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: irina.id, category: 'semantic', content: 'Ama il tè' } });
  return { irina, marco, s, sim };
}

describe('scenario bundles', () => {
  it('exports a complete universe and re-imports it reusing existing identities', async () => {
    const { irina, marco, s } = await buildUniverse();
    const bundle = (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}/export` })).json() as ScenarioExportV1;
    expect(bundle.format).toBe('persona.scenario');
    expect(bundle.characters).toHaveLength(2);
    expect(bundle.characters[0].conversations).toHaveLength(0);
    expect(bundle.sessions[0].messages.map((m) => m.role)).toEqual(['narrator', 'character']);
    expect(bundle.memories.length).toBeGreaterThanOrEqual(2);

    const res = await env.app.inject({ method: 'POST', url: '/api/scenarios/import', payload: bundle });
    expect(res.statusCode).toBe(201);
    const out = res.json();
    expect(out.characters).toEqual({ reused: 2, imported: 0 });
    expect(out.scenario.id).not.toBe(s.id);
    expect(out.scenario.participants.map((p: { characterId: string }) => p.characterId).sort()).toEqual([irina.id, marco.id].sort());
    expect(out.scenario.relationships).toHaveLength(1);
    expect(out.imported).toMatchObject({ sessions: 1, messages: 2, events: 1 });

    // Isolamento: le memorie contestuali importate appartengono al nuovo scenario.
    const copied = (await env.app.inject({ method: 'GET', url: `/api/memories?scenarioId=${out.scenario.id}` })).json() as Memory[];
    expect(copied.length).toBe(bundle.memories.length);
    expect(copied.every((m) => m.category === 'contextual')).toBe(true);
    const personal = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${irina.id}&category=semantic` })).json();
    expect(personal).toHaveLength(1); // nessuna duplicazione dell'identità riutilizzata
  });

  it('imports into another database as new identities', async () => {
    const { s } = await buildUniverse();
    const bundle = (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}/export` })).json() as ScenarioExportV1;
    const other = await createTestEnv({ dir: mkdtempSync(join(tmpdir(), 'persona-other-')) });
    try {
      const out = (await other.app.inject({ method: 'POST', url: '/api/scenarios/import', payload: bundle })).json();
      expect(out.characters).toEqual({ reused: 0, imported: 2 });
      const chars = (await other.app.inject({ method: 'GET', url: '/api/characters' })).json();
      expect(chars.map((c: { name: string }) => c.name).sort()).toEqual(['Irina Volkova', 'Marco Bellini']);
      const irinaNew = chars.find((c: { name: string }) => c.name === 'Irina Volkova');
      const mems = (await other.app.inject({ method: 'GET', url: `/api/memories?characterId=${irinaNew.id}` })).json() as Memory[];
      expect(mems.some((m) => m.content === 'Ama il tè' && m.category === 'semantic')).toBe(true);
      const sessions = (await other.app.inject({ method: 'GET', url: `/api/conversations?scenarioId=${out.scenario.id}` })).json();
      const detail = (await other.app.inject({ method: 'GET', url: `/api/conversations/${sessions[0].id}` })).json();
      expect(detail.messages[1].characterId).toBe(chars.find((c: { name: string }) => c.name === 'Marco Bellini').id);
    } finally {
      await other.close();
    }
  });

  it('rejects invalid bundles', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/scenarios/import', payload: { format: 'persona.character', version: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_import');
  });
});
