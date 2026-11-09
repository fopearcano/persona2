import type { Character, ModelConfig } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, createTestEnv, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

describe('model configurations', () => {
  it('seeds LM Studio and mock configurations', async () => {
    const list = (await env.app.inject({ method: 'GET', url: '/api/model-configs' })).json() as ModelConfig[];
    expect(list.map((c) => c.providerType).sort()).toEqual(['lmstudio', 'mock']);
    expect(list.find((c) => c.providerType === 'lmstudio')?.baseUrl).toBe('http://127.0.0.1:9/v1');
    expect(list.filter((c) => c.isDefault)).toHaveLength(1);
  });

  it('never returns API keys to the client', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/model-configs',
      payload: { name: 'OpenAI', providerType: 'openai', model: 'gpt-x', apiKey: 'sk-secret-123' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).not.toContain('sk-secret-123');
    expect(res.json().hasApiKey).toBe(true);
    expect(res.json().baseUrl).toBe('https://api.openai.com/v1');
    const list = await env.app.inject({ method: 'GET', url: '/api/model-configs' });
    expect(list.body).not.toContain('sk-secret-123');
    // Aggiornamento senza apiKey: la chiave resta.
    const upd = await env.app.inject({ method: 'PUT', url: `/api/model-configs/${res.json().id}`, payload: { name: 'OpenAI 2', providerType: 'openai', model: 'gpt-y' } });
    expect(upd.json().hasApiKey).toBe(true);
    const cleared = await env.app.inject({ method: 'PUT', url: `/api/model-configs/${res.json().id}`, payload: { name: 'OpenAI 2', providerType: 'openai', model: 'gpt-y', apiKey: '' } });
    expect(cleared.json().hasApiKey).toBe(false);
  });

  it('tests connections and discovers models', async () => {
    const ok = (await env.app.inject({ method: 'POST', url: `/api/model-configs/${env.mockConfigId}/test`, payload: {} })).json();
    expect(ok.ok).toBe(true);
    expect(ok.completionOk).toBe(true);
    expect(ok.models.map((m: { id: string }) => m.id)).toContain('mock-persona');

    const lm = ((await env.app.inject({ method: 'GET', url: '/api/model-configs' })).json() as ModelConfig[]).find((c) => c.providerType === 'lmstudio')!;
    const down = (await env.app.inject({ method: 'POST', url: `/api/model-configs/${lm.id}/test`, payload: {} })).json();
    expect(down.ok).toBe(false);
    expect(down.error.code).toBe('llm_unavailable');

    const probe = await env.app.inject({ method: 'POST', url: '/api/model-configs/probe', payload: { providerType: 'mock' } });
    expect(probe.json()).toHaveLength(4);
  });

  it('changing the model preserves identity and memory', async () => {
    const c = await createCharacter(env);
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'semantic', content: 'Preferisce il caffè turco' } });
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    await send(env, conv.id, { content: 'Ciao' });

    const second = (
      await env.app.inject({ method: 'POST', url: '/api/model-configs', payload: { name: 'Altro mock', providerType: 'mock', model: 'mock-slow' } })
    ).json();
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: second.id } });
    const events = await send(env, conv.id, { content: 'Ciao di nuovo' });
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.message.model).toBe('mock-slow');

    // Eliminare la configurazione non tocca il personaggio.
    await env.app.inject({ method: 'DELETE', url: `/api/model-configs/${second.id}` });
    const after = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}` })).json() as Character;
    expect(after.modelConfigId).toBeNull();
    expect(after.identityVersion).toBe(c.identityVersion);
    expect(after.biography).toBe(c.biography);
    const mems = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${c.id}` })).json();
    expect(mems).toHaveLength(1);
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json();
    expect(detail.messages).toHaveLength(4);
  });
});

describe('engine status', () => {
  it('reports whether a character engine is reachable before sending', async () => {
    const c = await createCharacter(env);
    const ok = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/engine-status` })).json();
    expect(ok).toMatchObject({ available: true, providerType: 'mock', model: 'mock-persona', loaded: true, error: null });

    const configs = (await env.app.inject({ method: 'GET', url: '/api/model-configs' })).json() as ModelConfig[];
    const lm = configs.find((x) => x.providerType === 'lmstudio')!;
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: lm.id } });
    const down = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/engine-status` })).json();
    expect(down).toMatchObject({ available: false, providerType: 'lmstudio', configName: 'LM Studio (locale)' });
    expect(down.error.code).toBe('llm_unavailable');

    const missing = (
      await env.app.inject({ method: 'POST', url: '/api/model-configs', payload: { name: 'Sbagliato', providerType: 'mock', model: 'non-esiste' } })
    ).json();
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: missing.id } });
    const nf = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/engine-status` })).json();
    expect(nf.error.code).toBe('llm_model_not_found');
  });
});

describe('preferences', () => {
  it('persists language and theme preferences across restarts', async () => {
    const initial = (await env.app.inject({ method: 'GET', url: '/api/preferences' })).json();
    expect(initial.uiLanguage).toBe('it');
    expect(initial.theme).toBe('dark');
    const upd = await env.app.inject({
      method: 'PUT',
      url: '/api/preferences',
      payload: { uiLanguage: 'en', theme: 'light', conversationLanguage: 'ru', memory: { processThreshold: 20 } },
    });
    expect(upd.statusCode).toBe(200);
    await env.restart();
    const prefs = (await env.app.inject({ method: 'GET', url: '/api/preferences' })).json();
    expect(prefs.uiLanguage).toBe('en');
    expect(prefs.theme).toBe('light');
    expect(prefs.conversationLanguage).toBe('ru');
    expect(prefs.memory.processThreshold).toBe(20);
    expect(prefs.memory.keepRecentMessages).toBe(8);
    // Nuove conversazioni ereditano la lingua di conversazione predefinita.
    const c = await createCharacter(env);
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    expect(conv.language).toBe('ru');
    expect(conv.title).toBe('New conversation');
    await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { uiLanguage: 'de' } });
    const de = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    expect(de.title).toBe('Neues Gespräch');
  });

  it('validates preference values', async () => {
    const res = await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { theme: 'neon' } });
    expect(res.statusCode).toBe(400);
  });
});
