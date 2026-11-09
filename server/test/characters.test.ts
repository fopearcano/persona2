import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

describe('characters', () => {
  it('creates and persists a full identity', async () => {
    const c = await createCharacter(env);
    expect(c.id).toMatch(/[0-9a-f-]{36}/);
    expect(c.identityVersion).toBe(1);
    expect(c.traits).toHaveLength(3);
    expect(c.languages.find((l) => l.code === 'ru')?.isNative).toBe(true);
    expect(c.expertise[0].subtopics).toContain('materia oscura');

    await env.restart();
    const again = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}` })).json();
    expect(again.name).toBe('Irina Volkova');
    expect(again.expertise).toHaveLength(2);
    const list = (await env.app.inject({ method: 'GET', url: '/api/characters' })).json();
    expect(list).toHaveLength(1);
    expect(list[0].expertiseDomains).toEqual(['Cosmologia', 'Meccanica orbitale']);
  });

  it('rejects invalid input with a validation error', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/characters', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation');
  });

  it('records identity revisions and bumps the version only on identity changes', async () => {
    const c = await createCharacter(env);
    const upd = await env.app.inject({
      method: 'PUT',
      url: `/api/characters/${c.id}`,
      payload: { ...c, biography: 'Nuova biografia', revisionReason: 'Revisione' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().identityVersion).toBe(2);

    // Cambiare solo il modello non è una modifica d'identità.
    const model = await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/model`, payload: { modelConfigId: env.mockConfigId } });
    expect(model.json().identityVersion).toBe(2);
    expect(model.json().modelConfigId).toBe(env.mockConfigId);

    // Salvare senza modifiche non crea revisioni.
    const same = await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}`, payload: { ...(upd.json() as object) } });
    expect(same.json().identityVersion).toBe(2);

    const revs = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/revisions` })).json();
    expect(revs).toHaveLength(1);
    expect(revs[0].snapshot.biography).toContain('Siberia');

    const restored = await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/revisions/${revs[0].id}/restore` });
    expect(restored.json().biography).toContain('Siberia');
    expect(restored.json().identityVersion).toBe(3);
  });

  it('duplicates, creates variants, archives and deletes', async () => {
    const c = await createCharacter(env);
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'core', content: 'Ha perso il padre a 12 anni' } });
    const dup = (await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/duplicate`, payload: {} })).json();
    expect(dup.id).not.toBe(c.id);
    expect(dup.parentId).toBeNull();

    const variant = (
      await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/variants`, payload: { name: 'Irina (giovane)', variantNote: 'A 25 anni', copyMemories: 'core' } })
    ).json();
    expect(variant.parentId).toBe(c.id);
    const vm = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${variant.id}` })).json();
    expect(vm).toHaveLength(1);

    // L'originale resta invariato.
    const original = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}` })).json();
    expect(original.identityVersion).toBe(1);

    const archived = await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/status`, payload: { status: 'archived' } });
    expect(archived.json().status).toBe('archived');
    const active = (await env.app.inject({ method: 'GET', url: '/api/characters?status=active' })).json();
    expect(active.map((x: { id: string }) => x.id)).not.toContain(c.id);

    const del = await env.app.inject({ method: 'DELETE', url: `/api/characters/${c.id}` });
    expect(del.statusCode).toBe(204);
    const v2 = (await env.app.inject({ method: 'GET', url: `/api/characters/${variant.id}` })).json();
    expect(v2.parentId).toBeNull();
    expect((await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}` })).statusCode).toBe(404);
  });
});
