import type { ConversationDetail, Message } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settleBackground } from '../src/context.js';
import { createCharacter, createTestEnv, parseSse, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

async function newLab(characterId: string, extra: Record<string, unknown> = {}) {
  const res = await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId, ...extra } });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; language: string };
}

describe('dialogue', () => {
  it('streams a response and stores the conversation', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id);
    const events = await send(env, conv.id, { content: 'Parlami della materia oscura' });
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('author_message');
    expect(types).toContain('start');
    expect(types).toContain('context');
    expect(types.filter((t) => t === 'delta').length).toBeGreaterThan(3);
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.message.content).toContain('[Irina Volkova]');
    expect(done && done.type === 'done' && done.message.status).toBe('complete');

    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(detail.messages.map((m) => m.role)).toEqual(['author', 'character']);
    expect(detail.messages[1].contextMeta?.speakerId).toBe(c.id);
  });

  it('restores a conversation after an application restart', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id, { title: 'Sessione di prova' });
    await send(env, conv.id, { content: 'Prima domanda sulle orbite' });
    await env.restart();
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(detail.title).toBe('Sessione di prova');
    expect(detail.messages).toHaveLength(2);
    const events = await send(env, conv.id, { content: 'Seconda domanda' });
    expect(events.at(-1)?.type).toBe('done');
    const list = (await env.app.inject({ method: 'GET', url: `/api/conversations?characterId=${c.id}` })).json();
    expect(list[0].messageCount).toBe(4);
  });

  it('regenerates without losing the previous version and keeps edit history', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id);
    const events = await send(env, conv.id, { content: 'Ciao Irina' });
    const first = events.find((e) => e.type === 'done') as { message: Message };
    const regen = parseSse(
      (await env.app.inject({ method: 'POST', url: `/api/messages/${first.message.id}/regenerate`, payload: {} })).body,
    );
    const second = regen.find((e) => e.type === 'done') as { message: Message };
    expect(second.message.regeneratedFromId).toBe(first.message.id);
    expect(second.message.seq).toBe(first.message.seq);

    const visible = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(visible.messages).toHaveLength(2);
    const all = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}?superseded=1` })).json() as ConversationDetail;
    expect(all.messages.find((m) => m.id === first.message.id)?.status).toBe('superseded');

    const author = visible.messages[0];
    const edited = await env.app.inject({ method: 'PUT', url: `/api/messages/${author.id}`, payload: { content: 'Buongiorno Irina' } });
    expect(edited.json().editedAt).toBeTruthy();
    const revs = (await env.app.inject({ method: 'GET', url: `/api/messages/${author.id}/revisions` })).json();
    expect(revs[0].content).toBe('Ciao Irina');
  });

  it('handles an unavailable model gracefully without losing the author message', async () => {
    const c = await createCharacter(env);
    const failing = (
      await env.app.inject({ method: 'POST', url: '/api/model-configs', payload: { name: 'Fail', providerType: 'mock', model: 'mock-fail' } })
    ).json();
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: failing.id } });
    const conv = await newLab(c.id);
    const events = await send(env, conv.id, { content: 'Domanda importante' });
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' && err.error.code).toBe('llm_unavailable');
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(detail.messages[0].content).toBe('Domanda importante');
    expect(detail.messages[1].status).toBe('error');

    // Riprova con un modello funzionante: la risposta fallita viene sostituita.
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: null } });
    const retry = parseSse((await env.app.inject({ method: 'POST', url: `/api/messages/${detail.messages[1].id}/regenerate`, payload: {} })).body);
    expect(retry.at(-1)?.type).toBe('done');
  });

  it('reports an unreachable LM Studio endpoint as llm_unavailable', async () => {
    const c = await createCharacter(env);
    const configs = (await env.app.inject({ method: 'GET', url: '/api/model-configs' })).json() as { id: string; providerType: string }[];
    const lm = configs.find((x) => x.providerType === 'lmstudio')!;
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: lm.id } });
    const conv = await newLab(c.id);
    const events = await send(env, conv.id, { content: 'Ciao' });
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' && err.error.code).toBe('llm_unavailable');
  });

  it('switches response language within the same conversation', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id, { language: 'it' });
    const a = (await send(env, conv.id, { content: 'Ciao' })).find((e) => e.type === 'done') as { message: Message };
    expect(a.message.content).toContain('lingua: it');
    const b = (await send(env, conv.id, { content: 'Hello', language: 'en' })).find((e) => e.type === 'done') as { message: Message };
    expect(b.message.content).toContain('lingua: en');
    await env.app.inject({ method: 'PUT', url: `/api/conversations/${conv.id}`, payload: { language: 'ru' } });
    const d = (await send(env, conv.id, { content: 'Привет' })).find((e) => e.type === 'done') as { message: Message };
    expect(d.message.content).toContain('lingua: ru');
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(detail.messages).toHaveLength(6);
  });

  it('keeps external analysis separate from character speech', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id);
    await send(env, conv.id, { content: 'Che cosa pensi della cosmologia?' });
    const events = await send(env, conv.id, { content: 'È coerente il suo atteggiamento?', mode: 'analysis' });
    const done = events.find((e) => e.type === 'done') as { message: Message };
    expect(done.message.role).toBe('analysis');
    expect(done.message.contextMeta?.purpose).toBe('analysis');
    expect(done.message.content).toContain('analisi esterna');

    // Il personaggio non "sente" l'analisi nel turno successivo.
    const preview = (
      await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Continuiamo' } })
    ).json() as { messages: { role: string; content: string }[] };
    const joined = preview.messages.map((m) => m.content).join('\n');
    expect(joined).not.toContain('È coerente il suo atteggiamento?');
    expect(joined).toContain('Che cosa pensi della cosmologia?');
  });

  it('auto-titles a conversation after the first exchange', async () => {
    const c = await createCharacter(env);
    const conv = await newLab(c.id);
    await send(env, conv.id, { content: 'Le stelle binarie' });
    await settleBackground(env.ctx);
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json();
    expect(detail.title).toMatch(/^Conversazione:/);
  });
});
