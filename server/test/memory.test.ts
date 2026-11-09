import type { ConversationDetail, Memory } from '@persona/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFtsQuery, extractTerms } from '../src/services/retrieval.js';
import { createCharacter, createTestEnv, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await env.close();
});

const mem = async (payload: Record<string, unknown>) => {
  const res = await env.app.inject({ method: 'POST', url: '/api/memories', payload });
  return { status: res.statusCode, body: res.json() };
};

describe('lexical retrieval helpers', () => {
  it('extracts terms in several scripts and builds prefix queries', () => {
    expect(extractTerms('Parlami della materia oscura e dei pianeti')).toEqual(expect.arrayContaining(['materia', 'oscura', 'pianeti']));
    expect(extractTerms('Орбитальная механика')).toEqual(expect.arrayContaining(['орбитальная', 'механика']));
    expect(buildFtsQuery('pianeti')).toBe('"piane"*');
    expect(buildFtsQuery('il e la')).toBeNull();
  });
});

describe('memory', () => {
  it('stores, edits, deletes memories with provenance', async () => {
    const c = await createCharacter(env);
    const created = await mem({ characterId: c.id, category: 'semantic', content: 'L’autore sta scrivendo un romanzo su Marte', importance: 4 });
    expect(created.status).toBe(201);
    const m = created.body as Memory;
    expect(m.origin).toBe('author');
    expect(m.sources).toHaveLength(1);

    const upd = await env.app.inject({ method: 'PUT', url: `/api/memories/${m.id}`, payload: { content: 'L’autore scrive un romanzo su Europa', pinned: true } });
    expect(upd.json().pinned).toBe(true);
    // L'indice FTS segue le modifiche.
    const found = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${c.id}&q=Europa` })).json();
    expect(found).toHaveLength(1);
    const notFound = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${c.id}&q=Marte` })).json();
    expect(notFound).toHaveLength(0);

    expect((await env.app.inject({ method: 'DELETE', url: `/api/memories/${m.id}` })).statusCode).toBe(204);
    expect((await env.app.inject({ method: 'GET', url: `/api/memories/${m.id}` })).statusCode).toBe(404);
  });

  it('enforces contextual scope rules', async () => {
    const c = await createCharacter(env);
    const bad = await mem({ characterId: c.id, category: 'contextual', content: 'senza scenario' });
    expect(bad.status).toBe(400);
    const scenario = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Nave' } })).json();
    const notParticipant = await mem({ characterId: c.id, category: 'contextual', scenarioId: scenario.id, content: 'x' });
    expect(notParticipant.status).toBe(400);
    const semanticWithScenario = await mem({ characterId: c.id, category: 'semantic', scenarioId: scenario.id, content: 'x' });
    expect(semanticWithScenario.status).toBe(400);
  });

  it('retrieves relevant memories instead of injecting everything', async () => {
    const c = await createCharacter(env);
    await mem({ characterId: c.id, category: 'semantic', content: 'Il gatto dell’autore si chiama Keplero', importance: 2 });
    await mem({ characterId: c.id, category: 'episodic', content: 'Abbiamo discusso delle lenti gravitazionali e di Einstein', importance: 2 });
    for (let i = 0; i < 10; i++) {
      await mem({ characterId: c.id, category: 'semantic', content: `Ricetta di cucina numero ${i} con basilico`, importance: 1 });
    }
    const res = (
      await env.app.inject({ method: 'POST', url: '/api/memories/retrieve', payload: { characterId: c.id, query: 'Torniamo alle lenti gravitazionali' } })
    ).json();
    expect(res.scoped[0].content).toContain('lenti gravitazionali');
    expect(res.scoped.length).toBe(1);
  });

  it('extracts memories from conversations with provenance and summarizes incrementally', async () => {
    await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false, keepRecentMessages: 2 } } });
    const c = await createCharacter(env);
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    for (const q of ['Parliamo di pulsar', 'E delle nane bianche?', 'Cosa pensi di Hubble?']) await send(env, conv.id, { content: q });

    const res = (await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/process-memory`, payload: { force: true } })).json();
    expect(res.summaryCreated).not.toBeNull();
    expect(res.summaryCreated.toSeq).toBe(4);
    expect(res.memoriesCreated.length).toBeGreaterThan(0);
    const created = res.memoriesCreated[0] as Memory;
    expect(created.category).toBe('semantic');
    expect(created.origin).toBe('extraction');
    expect(created.sources[0].conversationId).toBe(conv.id);
    expect(created.sources[0].toSeq).toBe(6);

    // I riassunti non sostituiscono i messaggi originali.
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${conv.id}` })).json() as ConversationDetail;
    expect(detail.messages).toHaveLength(6);
    expect(detail.summaries).toHaveLength(1);
    expect(detail.summarizedSeq).toBe(4);

    // Il contesto successivo contiene il riassunto e solo i messaggi non riassunti.
    const preview = (
      await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Continuiamo' } })
    ).json();
    expect(preview.meta.summaryId).toBe(res.summaryCreated.id);
    expect(preview.meta.historyOmitted).toBe(4);
    const turns = preview.messages.slice(1).map((m: { content: string }) => m.content).join('\n');
    expect(turns).not.toContain('Parliamo di pulsar');
    expect(turns).toContain('Continuiamo');
  });

  it('never applies proposed core memories without approval, and supports promotion', async () => {
    const c = await createCharacter(env);
    const proposed = (await mem({ characterId: c.id, category: 'core', content: 'Ha deciso di lasciare la ricerca', status: 'proposed' })).body as Memory;
    const before = (await env.app.inject({ method: 'POST', url: `/api/conversations`, payload: { kind: 'lab', characterId: c.id } })).json();
    const preview1 = (await env.app.inject({ method: 'POST', url: `/api/conversations/${before.id}/context-preview`, payload: { content: 'ricerca' } })).json();
    expect(preview1.messages[0].content).not.toContain('lasciare la ricerca');
    const approved = await env.app.inject({ method: 'POST', url: `/api/memories/${proposed.id}/approve` });
    expect(approved.json().status).toBe('active');
    const preview2 = (await env.app.inject({ method: 'POST', url: `/api/conversations/${before.id}/context-preview`, payload: { content: 'ricerca' } })).json();
    expect(preview2.messages[0].content).toContain('lasciare la ricerca');

    const episodic = (await mem({ characterId: c.id, category: 'episodic', content: 'Ha raccontato del viaggio in Cile' })).body as Memory;
    const promoted = (await env.app.inject({ method: 'POST', url: `/api/memories/${episodic.id}/promote`, payload: { targetCategory: 'semantic' } })).json();
    expect(promoted.category).toBe('semantic');
    expect(promoted.promotedFromId).toBe(episodic.id);
    expect((await env.app.inject({ method: 'GET', url: `/api/memories/${episodic.id}` })).statusCode).toBe(200);
  });

  it('reports consistency issues deterministically', async () => {
    const c = await createCharacter(env);
    await mem({ characterId: c.id, category: 'semantic', content: 'Ama il tè nero.' });
    await mem({ characterId: c.id, category: 'semantic', content: 'ama il te nero' });
    await mem({ characterId: c.id, category: 'core', content: 'Ha combattuto un drago', epistemicStatus: 'fiction' });
    const report = (await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/memory/consistency?llm=1` })).json();
    const kinds = report.issues.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain('duplicate');
    expect(kinds).toContain('fiction_in_core');
    expect(report.llmChecked).toBe(true);
  });
});
