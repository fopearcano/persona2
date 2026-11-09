import type { Character, ConversationDetail, Memory, Message, ScenarioDetail } from '@persona/shared';
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

async function scenarioWith(title: string, participants: { characterId: string; role: string }[]) {
  const s = (
    await env.app.inject({
      method: 'POST',
      url: '/api/scenarios',
      payload: { title, setting: 'Nave interstellare Aurora', initialSituation: 'Guasto al sistema di navigazione', language: 'en' },
    })
  ).json() as ScenarioDetail;
  for (const p of participants) {
    const res = await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: p });
    expect(res.statusCode).toBe(201);
  }
  return (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}` })).json() as ScenarioDetail;
}

const preview = async (convId: string, payload: Record<string, unknown>) =>
  (await env.app.inject({ method: 'POST', url: `/api/conversations/${convId}/context-preview`, payload })).json() as {
    messages: { role: string; content: string }[];
    meta: { memories: { id: string }[] };
  };

describe('scenarios', () => {
  it('keeps scenario memories isolated and the canonical identity unchanged', async () => {
    const irina = await createCharacter(env);
    const ship = await scenarioWith('Aurora', [{ characterId: irina.id, role: 'Specialista di navigazione astronomica' }]);
    const desert = await scenarioWith('Deserto di Atacama', [{ characterId: irina.id, role: 'Osservatrice' }]);

    const session = (
      await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'scenario', scenarioId: ship.id, characterId: irina.id } })
    ).json();
    expect(session.language).toBe('en');
    const events = await send(env, session.id, { content: 'The star tracker failed; recompute our position from pulsars' });
    const done = events.find((e) => e.type === 'done') as { message: Message };
    expect(done.message.contextMeta?.sections.some((s) => s.key === 'scenario')).toBe(true);

    const processed = (await env.app.inject({ method: 'POST', url: `/api/conversations/${session.id}/process-memory`, payload: {} })).json();
    const contextual = processed.memoriesCreated as Memory[];
    expect(contextual.length).toBeGreaterThan(0);
    for (const m of contextual) {
      expect(m.category).toBe('contextual');
      expect(m.scenarioId).toBe(ship.id);
      expect(m.epistemicStatus).toBe('fiction');
    }

    // Laboratorio: nessuna memoria contestuale, nessun contesto di scenario.
    const lab = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: irina.id } })).json();
    const labPreview = await preview(lab.id, { content: 'pulsars star tracker position' });
    expect(labPreview.messages[0].content).not.toContain('SCENARIO CONTEXT');
    expect(labPreview.meta.memories.map((m) => m.id)).not.toContain(contextual[0].id);

    // Altro scenario: non vede le memorie dell'Aurora.
    const other = (
      await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'scenario', scenarioId: desert.id, characterId: irina.id } })
    ).json();
    const otherPreview = await preview(other.id, { content: 'pulsars star tracker position' });
    expect(otherPreview.meta.memories.map((m) => m.id)).not.toContain(contextual[0].id);
    expect(otherPreview.messages[0].content).toContain('Deserto di Atacama');
    expect(otherPreview.messages[0].content).not.toContain('Scenario: Aurora');

    // Stesso scenario, nuova sessione: le memorie contestuali sono disponibili.
    const again = (
      await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'scenario', scenarioId: ship.id, characterId: irina.id } })
    ).json();
    const againPreview = await preview(again.id, { content: 'pulsars star tracker position' });
    expect(againPreview.meta.memories.map((m) => m.id)).toContain(contextual[0].id);

    // Identità canonica invariata.
    const after = (await env.app.inject({ method: 'GET', url: `/api/characters/${irina.id}` })).json() as Character;
    expect(after.identityVersion).toBe(irina.identityVersion);
    expect(after.biography).toBe(irina.biography);
    const core = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${irina.id}&category=core` })).json();
    expect(core).toHaveLength(0);

    // Promozione esplicita: solo così un'esperienza entra nell'identità personale.
    const promoted = (
      await env.app.inject({ method: 'POST', url: `/api/memories/${contextual[0].id}/promote`, payload: { targetCategory: 'core' } })
    ).json() as Memory;
    expect(promoted.scenarioId).toBeNull();
    expect(promoted.sources[0].scenarioId).toBe(ship.id);
    const labPreview2 = await preview(lab.id, { content: 'Ciao' });
    expect(labPreview2.meta.memories.map((m) => m.id)).toContain(promoted.id);
  });

  it('deleting a scenario removes its sessions and contextual memories but not the character', async () => {
    const irina = await createCharacter(env);
    const ship = await scenarioWith('Aurora', [{ characterId: irina.id, role: 'Navigatrice' }]);
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: irina.id, category: 'contextual', scenarioId: ship.id, content: 'Il motore perde plasma' } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: irina.id, category: 'semantic', content: 'Ama Čajkovskij' } });
    expect((await env.app.inject({ method: 'DELETE', url: `/api/scenarios/${ship.id}` })).statusCode).toBe(204);
    const left = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${irina.id}` })).json() as Memory[];
    expect(left.map((m) => m.category)).toEqual(['semantic']);
    expect((await env.app.inject({ method: 'GET', url: `/api/characters/${irina.id}` })).statusCode).toBe(200);
  });

  it('runs a multi-character simulation with per-speaker context and author-controlled turns', async () => {
    const irina = await createCharacter(env);
    const marco = await createCharacter(env, {
      name: 'Marco Bellini',
      occupation: 'Ingegnere di propulsione',
      expertise: [{ domain: 'Propulsione ionica', level: 'expert' }],
      languages: [{ code: 'it', proficiency: 'native', isNative: true }],
      traits: [],
    });
    const ship = await scenarioWith('Aurora', [
      { characterId: irina.id, role: 'Navigatrice' },
      { characterId: marco.id, role: 'Capo ingegnere' },
    ]);
    await env.app.inject({
      method: 'POST',
      url: `/api/scenarios/${ship.id}/relationships`,
      payload: { fromCharacterId: marco.id, toCharacterId: irina.id, description: 'Diffida dei suoi calcoli' },
    });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: irina.id, category: 'semantic', content: 'Irina preferisce le pulsar millisecondo' } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: marco.id, category: 'semantic', content: 'Marco teme le pulsar e i motori ionici' } });

    const sim = (
      await env.app.inject({
        method: 'POST',
        url: '/api/conversations',
        payload: { kind: 'simulation', scenarioId: ship.id, participantIds: [irina.id, marco.id], title: 'Emergenza' },
      })
    ).json();
    // Narrazione dell'autore: nessuna risposta automatica in modalità manuale.
    const narr = await send(env, sim.id, { content: 'Le luci si spengono. Il navigatore segnala pulsar e motori ionici fuori asse.', role: 'narrator' });
    expect(narr.map((e) => e.type)).toEqual(['author_message']);

    const t1 = parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: { characterId: irina.id } })).body);
    const m1 = (t1.find((e) => e.type === 'done') as { message: Message }).message;
    expect(m1.speakerName).toBe('Irina Volkova');
    const t2 = parseSse(
      (await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: { characterId: marco.id, directive: 'Contesta Irina' } })).body,
    );
    const m2 = (t2.find((e) => e.type === 'done') as { message: Message }).message;
    expect(m2.speakerName).toBe('Marco Bellini');
    expect(m2.contextMeta?.directive).toBe('Contesta Irina');

    // Ogni personaggio riceve la propria identità e solo le proprie memorie.
    const pi = await preview(sim.id, { characterId: irina.id });
    const pm = await preview(sim.id, { characterId: marco.id });
    expect(pi.messages[0].content).toContain('Name: Irina Volkova');
    expect(pi.messages[0].content).not.toContain('Marco teme');
    expect(pi.messages[0].content).toContain('Irina preferisce');
    expect(pm.messages[0].content).toContain('Name: Marco Bellini');
    expect(pm.messages[0].content).not.toContain('Irina preferisce');
    expect(pm.messages[0].content).toContain('Diffida dei suoi calcoli');
    // Prospettiva: le proprie battute come assistant, quelle altrui con il nome.
    const irinaTurns = pi.messages.slice(1);
    expect(irinaTurns.some((t) => t.role === 'assistant')).toBe(true);
    expect(irinaTurns.map((t) => t.content).join('\n')).toContain('[Marco Bellini]:');

    // Rotazione: senza characterId parla il successivo.
    const t3 = parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: {} })).body);
    expect((t3.find((e) => e.type === 'done') as { message: Message }).message.speakerName).toBe('Irina Volkova');

    // Memorie individuali estratte per ciascun partecipante, entro lo scenario.
    const processed = (await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/process-memory`, payload: {} })).json();
    const owners = new Set((processed.memoriesCreated as Memory[]).map((m) => m.characterId));
    expect(owners).toEqual(new Set([irina.id, marco.id]));
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${sim.id}` })).json() as ConversationDetail;
    expect(detail.messages.map((m) => m.role)).toEqual(['narrator', 'character', 'character', 'character']);
  });

  it('rejects characters that are not scenario participants', async () => {
    const irina = await createCharacter(env);
    const ship = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Vuoto' } })).json();
    const res = await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'scenario', scenarioId: ship.id, characterId: irina.id } });
    expect(res.statusCode).toBe(400);
  });
});
