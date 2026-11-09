import type { Character, CharacterExportV1, ConversationDetail, IdentityRevision, Memory, ScenarioExportV1 } from '@persona/shared';
import { randomUUID } from 'node:crypto';
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

describe('import/export', () => {
  it('round-trips a character with memories, knowledge and conversations', async () => {
    const c = await createCharacter(env, { bigFive: { openness: 85, conscientiousness: 70, extraversion: null, agreeableness: 40, neuroticism: null } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'core', content: 'Ha perso il padre a 12 anni', importance: 5 } });
    await env.app.inject({
      method: 'POST',
      url: `/api/characters/${c.id}/knowledge`,
      payload: { title: 'Appunti sulle pulsar', kind: 'markdown', content: '# Pulsar\n\nLe pulsar millisecondo sono orologi naturali.', epistemicStatus: 'fact' },
    });
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id, title: 'Sessione 1' } })).json();
    await send(env, conv.id, { content: 'Che cos’è una pulsar?' });

    const exp = await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` });
    expect(exp.headers['content-disposition']).toContain('persona-Irina_Volkova.json');
    const data = exp.json() as CharacterExportV1;
    expect(data.format).toBe('persona.character');
    expect(data.version).toBe(1);
    expect(data.character.bigFive?.openness).toBe(85);
    expect(data.memories).toHaveLength(1);
    expect(data.knowledge).toHaveLength(1);
    expect(data.conversations[0].messages).toHaveLength(2);

    const imp = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: data });
    expect(imp.statusCode).toBe(201);
    const result = imp.json();
    expect(result.character.id).not.toBe(c.id);
    expect(result.character.name).toBe('Irina Volkova');
    expect(result.character.languages.map((l: { code: string }) => l.code)).toEqual(['ru', 'en', 'it']);
    expect(result.imported).toEqual({ memories: 1, knowledge: 1, conversations: 1, messages: 2, revisions: 0 });

    const mems = (await env.app.inject({ method: 'GET', url: `/api/memories?characterId=${result.character.id}` })).json() as Memory[];
    expect(mems[0].content).toBe('Ha perso il padre a 12 anni');
    const convs = (await env.app.inject({ method: 'GET', url: `/api/conversations?characterId=${result.character.id}` })).json();
    const detail = (await env.app.inject({ method: 'GET', url: `/api/conversations/${convs[0].id}` })).json() as ConversationDetail;
    expect(detail.messages[1].characterId).toBe(result.character.id);
    const hits = (await env.app.inject({ method: 'GET', url: `/api/characters/${result.character.id}/knowledge/search?q=orologi` })).json();
    expect(hits).toHaveLength(1);
    // L'originale esiste ancora, invariato.
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);
  });

  it('skips contextual memories whose scenario does not exist', async () => {
    const c = await createCharacter(env);
    const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
    await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: c.id, role: 'Navigatrice' } });
    await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, category: 'contextual', scenarioId: s.id, content: 'Evento di bordo' } });
    const data = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export?contextual=1` })).json() as CharacterExportV1;
    expect(data.memories).toHaveLength(1);
    expect(data.scenarios).toEqual([{ id: s.id, title: 'Aurora' }]);
    await env.app.inject({ method: 'DELETE', url: `/api/scenarios/${s.id}` });
    const result = (await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: data })).json();
    expect(result.skipped.contextualMemories).toBe(1);
    expect(result.imported.memories).toBe(0);
  });

  it('carries the whole persona into another database, history included', async () => {
    const get = async <T>(e: TestEnv, url: string) => (await e.app.inject({ method: 'GET', url })).json() as T;
    const c = await createCharacter(env, {
      portrait: 'data:image/png;base64,iVBORw0KGgo=',
      bigFive: { openness: 85, conscientiousness: 70, extraversion: null, agreeableness: 40, neuroticism: null },
    });
    // Due modifiche d'identità → versione 3 con due revisioni.
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}`, payload: { ...c, age: '53', revisionReason: 'Compleanno' } });
    const v3 = (await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}`, payload: { ...c, age: '54', humor: 'Sarcastico', revisionReason: 'Revisione' } })).json() as Character;
    expect(v3.identityVersion).toBe(3);
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}/status`, payload: { status: 'archived' } });

    const mem = async (payload: Record<string, unknown>) =>
      (await env.app.inject({ method: 'POST', url: '/api/memories', payload: { characterId: c.id, ...payload } })).json() as Memory;
    await mem({ category: 'core', content: 'Ha perso il padre a 12 anni', importance: 5, pinned: true });
    const episodic = await mem({ category: 'episodic', content: 'Ha discusso di pulsar con l’autore', epistemicStatus: 'interpretation', language: 'it' });
    const archived = await mem({ category: 'semantic', content: 'Preferisce il tè al caffè' });
    await env.app.inject({ method: 'PUT', url: `/api/memories/${archived.id}`, payload: { status: 'archived' } });
    const promoted = (await env.app.inject({ method: 'POST', url: `/api/memories/${episodic.id}/promote`, payload: { targetCategory: 'semantic' } })).json() as Memory;
    expect(promoted.promotedFromId).toBe(episodic.id);
    const kb = (
      await env.app.inject({
        method: 'POST',
        url: `/api/characters/${c.id}/knowledge`,
        payload: { title: 'Notes', kind: 'note', content: 'Millisecond pulsars are natural clocks.', language: 'en', enabled: false, epistemicStatus: 'opinion' },
      })
    ).json() as { createdAt: string };

    // Conversazione con risposta rigenerata, analisi esterna e memoria estratta dai messaggi.
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id, title: 'Sessione' } })).json();
    const first = (await send(env, conv.id, { content: 'Che cos’è una pulsar?' })).find((e) => e.type === 'done') as { message: { id: string } };
    parseSse((await env.app.inject({ method: 'POST', url: `/api/messages/${first.message.id}/regenerate`, payload: {} })).body);
    await send(env, conv.id, { content: 'Valuta la coerenza del personaggio', mode: 'analysis' });
    await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/process-memory`, payload: { force: true } });

    const original = await get<Character>(env, `/api/characters/${c.id}`);
    const originalMems = await get<Memory[]>(env, `/api/memories?characterId=${c.id}&limit=1000`);
    const originalConv = await get<ConversationDetail>(env, `/api/conversations/${conv.id}?superseded=1`);
    const data = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` })).json() as CharacterExportV1;
    expect(data.identityRevisions?.map((r) => r.version)).toEqual([1, 2]);
    expect(data.character.status).toBe('archived');

    const other = await createTestEnv();
    try {
      const res = await other.app.inject({ method: 'POST', url: '/api/characters/import', payload: data });
      expect(res.statusCode).toBe(201);
      const out = res.json() as { character: Character; imported: Record<string, number> };
      expect(out.imported).toMatchObject({ revisions: 2, knowledge: 1, conversations: 1 });
      const copy = out.character;

      // Identità: stesso profilo, stessa versione, stessa cronologia, stesso stato.
      const noIds = <T extends object>(rows: T[]) => rows.map(({ id: _id, characterId: _c, ...r }: T & { id?: string; characterId?: string }) => r);
      const strip = ({ id: _i, createdAt: _c, updatedAt: _u, projectIds: _p, modelConfigId: _m, traits, languages, expertise, ...rest }: Character) => ({
        ...rest,
        traits: noIds(traits),
        languages: noIds(languages),
        expertise: noIds(expertise),
      });
      expect(strip(copy)).toEqual(strip(original));
      expect(copy.identityVersion).toBe(3);
      expect(copy.status).toBe('archived');
      const revs = await get<IdentityRevision[]>(other, `/api/characters/${copy.id}/revisions`);
      const origRevs = await get<IdentityRevision[]>(env, `/api/characters/${c.id}/revisions`);
      expect(revs.map((r) => [r.version, r.reason, r.createdAt, r.snapshot])).toEqual(origRevs.map((r) => [r.version, r.reason, r.createdAt, r.snapshot]));
      // La cronologia importata è utilizzabile: ripristinare la v1 crea la v4.
      const restored = (await other.app.inject({ method: 'POST', url: `/api/characters/${copy.id}/revisions/${revs.find((r) => r.version === 1)!.id}/restore` })).json() as Character;
      expect(restored.age).toBe('52');
      expect(restored.identityVersion).toBe(4);

      // Memorie: tutte, con categoria, stato, importanza, fissaggio, statuto e promozione.
      const mems = await get<Memory[]>(other, `/api/memories?characterId=${copy.id}&limit=1000`);
      const view = (list: Memory[]) =>
        list.map((m) => [m.category, m.content, m.status, m.importance, m.pinned, m.epistemicStatus, m.language, m.origin, m.createdAt].join('|')).sort();
      expect(view(mems)).toEqual(view(originalMems));
      const copyEpisodic = mems.find((m) => m.content === episodic.content && m.category === 'episodic')!;
      expect(mems.find((m) => m.content === promoted.content && m.category === 'semantic')?.promotedFromId).toBe(copyEpisodic.id);

      // Conversazione: anche la risposta sostituita e l'analisi; le fonti puntano ai nuovi messaggi.
      const [copyConvSummary] = await get<{ id: string }[]>(other, `/api/conversations?characterId=${copy.id}`);
      const copyConv = await get<ConversationDetail>(other, `/api/conversations/${copyConvSummary.id}?superseded=1`);
      const msgView = (d: ConversationDetail) => d.messages.map((m) => [m.seq, m.role, m.mode, m.status, m.content].join('|'));
      expect(msgView(copyConv)).toEqual(msgView(originalConv));
      expect(copyConv.messages.some((m) => m.status === 'superseded')).toBe(true);
      // Le memorie estratte restano collegate alla conversazione importata (stesso intervallo di messaggi).
      const linked = mems.flatMap((m) => m.sources).filter((x) => x.conversationId);
      const origLinked = originalMems.flatMap((m) => m.sources).filter((x) => x.conversationId);
      expect(origLinked.length).toBeGreaterThan(0);
      expect(linked.map((x) => [x.conversationId, x.fromSeq, x.toSeq])).toEqual(origLinked.map((x) => [copyConv.id, x.fromSeq, x.toSeq]));

      // Base di conoscenza: anche le fonti disattivate, con lingua e data originali.
      const sources = await get<{ title: string; enabled: boolean; language: string; createdAt: string; epistemicStatus: string }[]>(
        other,
        `/api/characters/${copy.id}/knowledge`,
      );
      expect(sources.map((k) => [k.title, k.enabled, k.language, k.createdAt, k.epistemicStatus])).toEqual([['Notes', false, 'en', kb.createdAt, 'opinion']]);
    } finally {
      await other.close();
    }
  });

  it('never truncates memories on export', async () => {
    const c = await createCharacter(env);
    const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
    await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: c.id } });
    const insert = env.ctx.dbm.sqlite.prepare(
      `INSERT INTO memories (id, character_id, category, scenario_id, content, importance, epistemic_status, status, origin, pinned, retrieval_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 3, 'fact', 'active', 'author', 0, 0, ?, ?)`,
    );
    const ts = new Date().toISOString();
    env.ctx.dbm.sqlite.transaction(() => {
      for (let i = 0; i < 1100; i++) insert.run(randomUUID(), c.id, 'semantic', null, `Fatto numero ${i}`, ts, ts);
      for (let i = 0; i < 1050; i++) insert.run(randomUUID(), c.id, 'contextual', s.id, `Evento di bordo ${i}`, ts, ts);
    })();
    const data = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export?contextual=1` })).json() as CharacterExportV1;
    expect(data.memories).toHaveLength(2150);
    const bundle = (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}/export` })).json() as ScenarioExportV1;
    expect(bundle.memories).toHaveLength(1050);
    const imported = (await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: data })).json();
    expect(imported.imported.memories).toBe(2150);
  });

  it('is all-or-nothing', async () => {
    const c = await createCharacter(env);
    const count = async () => ((await env.app.inject({ method: 'GET', url: '/api/characters' })).json() as unknown[]).length;
    const data = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` })).json() as CharacterExportV1;
    const broken = { ...data, knowledge: [{ title: 'x'.repeat(600), kind: 'text', content: 'Testo' }] };
    const res = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: broken });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_import');
    expect(await count()).toBe(1);

    // Scenario: i personaggi importati vengono annullati se lo scenario non è valido.
    const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
    await env.app.inject({ method: 'POST', url: `/api/scenarios/${s.id}/participants`, payload: { characterId: c.id } });
    const bundle = (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}/export` })).json() as ScenarioExportV1;
    const bad = await env.app.inject({ method: 'POST', url: '/api/scenarios/import?characters=new', payload: { ...bundle, scenario: { ...bundle.scenario, title: '' } } });
    expect(bad.statusCode).toBe(400);
    expect(await count()).toBe(1);
    expect(((await env.app.inject({ method: 'GET', url: '/api/scenarios' })).json() as unknown[]).length).toBe(1);
  });

  it('explains files of the wrong kind or from a newer version', async () => {
    const c = await createCharacter(env);
    const s = (await env.app.inject({ method: 'POST', url: '/api/scenarios', payload: { title: 'Aurora' } })).json();
    const scenarioFile = (await env.app.inject({ method: 'GET', url: `/api/scenarios/${s.id}/export` })).json();
    const characterFile = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` })).json() as CharacterExportV1;
    const details = async (url: string, payload: unknown) => {
      const res = await env.app.inject({ method: 'POST', url, payload: payload as object });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_import');
      return res.json().error.details;
    };
    expect(await details('/api/characters/import', scenarioFile)).toMatchObject({ reason: 'wrong_format', expected: 'persona.character', found: 'persona.scenario' });
    expect(await details('/api/projects/import', characterFile)).toMatchObject({ reason: 'wrong_format', found: 'persona.character' });
    expect(await details('/api/scenarios/import', { hello: 'world' })).toMatchObject({ reason: 'not_persona' });
    expect(await details('/api/characters/import', { ...characterFile, version: 2 })).toMatchObject({ reason: 'newer_version', version: 2, supported: 1 });
  });

  it('still opens files from earlier versions without history', async () => {
    const c = await createCharacter(env);
    await env.app.inject({ method: 'PUT', url: `/api/characters/${c.id}`, payload: { ...c, age: '53' } });
    const { identityRevisions: _r, ...data } = (await env.app.inject({ method: 'GET', url: `/api/characters/${c.id}/export` })).json() as CharacterExportV1;
    const { status: _s, ...character } = data.character;
    const res = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: { ...data, character } });
    expect(res.statusCode).toBe(201);
    expect(res.json().character).toMatchObject({ age: '53', identityVersion: 1, status: 'active' });
  });

  it('names downloads safely for any alphabet', async () => {
    const cyr = await createCharacter(env, { name: 'Ирина Волкова' });
    const header = (await env.app.inject({ method: 'GET', url: `/api/characters/${cyr.id}/export` })).headers['content-disposition'] as string;
    expect(header).toContain('filename="persona-personaggio.json"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('persona-Ирина_Волкова.json')}`);
    const latin = await createCharacter(env, { name: 'Zoë Ångström' });
    const h2 = (await env.app.inject({ method: 'GET', url: `/api/characters/${latin.id}/export` })).headers['content-disposition'] as string;
    expect(h2).toContain('filename="persona-Zoe_Angstrom.json"');
  });

  it('rejects invalid import files', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/characters/import', payload: { format: 'other' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_import');
  });
});

describe('backup and restore', () => {
  it('creates a backup and restores it', async () => {
    const a = await createCharacter(env, { name: 'Prima' });
    const backup = (await env.app.inject({ method: 'POST', url: '/api/backups' })).json();
    expect(backup.fileName).toMatch(/^persona-.*\.db$/);
    await createCharacter(env, { name: 'Seconda' });
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);

    const download = await env.app.inject({ method: 'GET', url: `/api/backups/${backup.fileName}` });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');

    const restored = await env.app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream' },
      payload: download.rawPayload,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().safetyBackup).toMatch(/^persona-pre-restore-/);
    const list = (await env.app.inject({ method: 'GET', url: '/api/characters' })).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([a.id]);

    // La copia di sicurezza contiene lo stato precedente e può essere ripristinata.
    const back = await env.app.inject({ method: 'POST', url: `/api/backups/${restored.json().safetyBackup}/restore` });
    expect(back.statusCode).toBe(200);
    expect((await env.app.inject({ method: 'GET', url: '/api/characters' })).json()).toHaveLength(2);
    const backups = (await env.app.inject({ method: 'GET', url: '/api/backups' })).json();
    expect(backups.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects files that are not PERSONA databases', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('not a database at all'.repeat(50)),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_backup');
    expect((await env.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('rejects path traversal in backup names', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/backups/..%2Fpersona.db' });
    expect(res.statusCode).toBe(400);
  });
});
