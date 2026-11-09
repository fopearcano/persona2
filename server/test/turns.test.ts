import type { Message } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConversationRow } from '../src/services/conversations.js';
import { selectSpeaker } from '../src/services/turns.js';
import { createCharacter, createTestEnv, parseSse, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false } } });
});
afterEach(async () => {
  await env.close();
});

async function setup(turnMode: string) {
  const irina = await createCharacter(env);
  const marco = await createCharacter(env, { name: 'Marco Bellini', occupation: 'Ingegnere', traits: [], expertise: [], languages: [] });
  const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
  for (const [cid, role] of [
    [irina.id, 'Navigatrice'],
    [marco.id, 'Ingegnere capo'],
  ]) {
    await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: cid, role } });
  }
  const sim = (
    await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'simulation', scenarioId: s.id, participantIds: [irina.id, marco.id], turnMode } })
  ).json();
  return { irina, marco, sim };
}

describe('automatic turn management', () => {
  it('lets the director choose the addressed character', async () => {
    const { marco, sim } = await setup('auto');
    const events = await send(env, sim.id, { content: 'Marco, il reattore perde pressione: che cosa proponi?' });
    const done = events.find((e) => e.type === 'done') as { message: Message };
    expect(done.message.characterId).toBe(marco.id);
    expect(done.message.contextMeta?.turnSelection).toMatchObject({ mode: 'auto', reason: 'addressed in the last line' });

    // Turno successivo senza indicazioni: il regista evita di far parlare due volte di seguito Marco.
    const next = parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: {} })).body);
    expect((next.find((e) => e.type === 'done') as { message: Message }).message.speakerName).toBe('Irina Volkova');
  });

  it('records manual choices and falls back to rotation when the director fails', async () => {
    const { irina, marco, sim } = await setup('auto');
    const manual = parseSse((await env.app.inject({ method: 'POST', url: `/api/conversations/${sim.id}/turn`, payload: { characterId: marco.id } })).body);
    expect((manual.find((e) => e.type === 'done') as { message: Message }).message.contextMeta?.turnSelection).toEqual({ mode: 'manual', reason: null });

    const failing = (await env.app.inject({ method: 'POST', url: '/api/model-configs', payload: { name: 'Fail', providerType: 'mock', model: 'mock-fail' } })).json();
    await env.app.inject({ method: 'PUT', url: `/api/characters/${irina.id}/model`, payload: { modelConfigId: failing.id } });
    const choice = await selectSpeaker(env.ctx, getConversationRow(env.ctx, sim.id));
    expect(choice?.speakerId).toBe(irina.id); // rotazione: dopo Marco tocca a Irina
    expect(choice?.selection.reason).toMatch(/^fallback/);
  });

  it('keeps manual simulations silent until the author picks a speaker', async () => {
    const { sim } = await setup('manual');
    const events = await send(env, sim.id, { content: 'Silenzio in plancia.' });
    expect(events.map((e) => e.type)).toEqual(['author_message']);
  });
});
