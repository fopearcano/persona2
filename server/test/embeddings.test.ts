import type { ContextPreview, EmbeddingStatus, Message } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settleBackground } from '../src/context.js';
import { mockVector } from '../src/llm/mock.js';
import { cosine, decodeVector, encodeVector } from '../src/services/embeddings.js';
import { createCharacter, createTestEnv, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false } } });
});
afterEach(async () => {
  await env.close();
});

const enable = (model = 'mock-embed') =>
  env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { embeddings: { enabled: true, modelConfigId: env.mockConfigId, model } } });
const reindex = async (reset = false) =>
  (await env.app.inject({ method: 'POST', url: '/api/embeddings/reindex', payload: { reset } })).json() as EmbeddingStatus;
const retrieve = async (characterId: string, query: string) =>
  (await env.app.inject({ method: 'POST', url: '/api/memories/retrieve', payload: { characterId, query } })).json() as {
    mode: string;
    semanticError: string | null;
    scoped: { id: string; content: string; semantic?: number }[];
  };

describe('vector encoding', () => {
  it('round-trips Float32 vectors through base64', () => {
    const v = [0.5, -1.25, 3, 0];
    expect([...decodeVector(encodeVector(v))]).toEqual(v);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1);
  });
});

describe('semantic retrieval (local embeddings)', () => {
  it('retrieves memories across languages that lexical search cannot match', async () => {
    const c = await createCharacter(env);
    const mem = (content: string) => env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'episodic', content } });
    const target = (await mem('Звезда взорвалась как сверхновая над Новосибирском')).json();
    await mem('Abbiamo parlato di ricette con il basilico');
    await mem('Discussione sui treni regionali e sugli orari');
    await mem('Una lunga passeggiata in montagna sotto la pioggia');

    const lexical = await retrieve(c.id, 'Ricordi quando la stella è esplosa?');
    expect(lexical.mode).toBe('lexical');
    expect(lexical.scoped.map((m) => m.id)).not.toContain(target.id);

    await enable();
    const status = await reindex();
    expect(status.memories).toEqual({ indexed: 4, total: 4 });
    const hybrid = await retrieve(c.id, 'Ricordi quando la stella è esplosa?');
    expect(hybrid.mode).toBe('hybrid');
    expect(hybrid.scoped[0].id).toBe(target.id);
    expect(hybrid.scoped[0].semantic).toBeGreaterThan(0.5);
    expect(hybrid.scoped.length).toBeLessThan(4);
  });

  it('uses hybrid retrieval during generation and reports it in the context metadata', async () => {
    const c = await createCharacter(env);
    const m = (
      await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'semantic', content: 'Il telescopio Dobson dell’autore' } })
    ).json();
    await enable();
    await reindex();
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    const done = (await send(env, conv.id, { content: 'Расскажи про мой телескоп' })).find((e) => e.type === 'done') as { message: Message };
    expect(done.message.contextMeta?.retrieval).toEqual({ mode: 'hybrid', embeddingModel: 'mock-embed', semanticError: null });
    const used = done.message.contextMeta?.memories.find((x) => x.id === m.id);
    expect(used?.semantic).toBeGreaterThan(0);
  });

  it('falls back to lexical retrieval when the embedding service fails', async () => {
    const c = await createCharacter(env);
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'semantic', content: 'Ama il telescopio' } });
    await enable('mock-embed-fail');
    const status = await reindex();
    expect(status.lastError).toContain('embedding');
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    const preview = (
      await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'telescopio' } })
    ).json() as ContextPreview;
    expect(preview.meta.retrieval.mode).toBe('lexical');
    expect(preview.meta.retrieval.semanticError).toBeTruthy();
    expect(preview.meta.memories).toHaveLength(1);
    const events = await send(env, conv.id, { content: 'telescopio' });
    expect(events.at(-1)?.type).toBe('done');
  });

  it('re-embeds edited memories and indexes knowledge chunks', async () => {
    const c = await createCharacter(env);
    await enable();
    const m = (await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'semantic', content: 'Il gatto Keplero' } })).json();
    await env.app.inject({
      method: 'POST',
      url: `/api/characters/${c.id}/knowledge`,
      payload: { title: 'Note', content: 'Сверхновые звезды взрываются в конце жизни.' },
    });
    let status = await reindex();
    expect(status.memories.indexed).toBe(1);
    expect(status.chunks.indexed).toBe(1);
    await env.app.inject({ method: 'PUT', url: `/api/memories/${m.id}`, payload: { content: 'Il padre era astronomo' } });
    await settleBackground(env.ctx);
    status = await reindex();
    expect(status.memories.indexed).toBe(1);
    // Il vettore salvato corrisponde al NUOVO contenuto (ricalcolato dopo la modifica).
    const raw = env.ctx.dbm.sqlite.prepare('SELECT embedding FROM memories WHERE id = ?').get(m.id) as { embedding: string };
    expect(cosine(decodeVector(raw.embedding), Float32Array.from(mockVector('Il padre era astronomo')))).toBeCloseTo(1, 5);

    const hits = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/knowledge/search?q=${encodeURIComponent('esplosione di stelle')}` })).json();
    expect(hits).toHaveLength(0); // la ricerca diretta nella base di conoscenza resta lessicale
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    const preview = (
      await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Perché le stelle esplodono?' } })
    ).json() as ContextPreview;
    expect(preview.meta.knowledge).toHaveLength(1);
  });

  it('tests the embedding endpoint', async () => {
    const ok = (await env.app.inject({ method: 'POST', url: '/api/embeddings/test', payload: { modelConfigId: env.mockConfigId, model: 'mock-embed' } })).json();
    expect(ok).toMatchObject({ ok: true, model: 'mock-embed', dimensions: 96 });
    // Modello automatico: il primo modello di embedding esposto dal server.
    const auto = (await env.app.inject({ method: 'POST', url: '/api/embeddings/test', payload: { modelConfigId: env.mockConfigId } })).json();
    expect(auto.model).toBe('mock-embed');
    const fail = (await env.app.inject({ method: 'POST', url: '/api/embeddings/test', payload: { modelConfigId: env.mockConfigId, model: 'mock-embed-fail' } })).json();
    expect(fail.ok).toBe(false);
    expect(fail.error.code).toBe('llm_unavailable');
  });
});
