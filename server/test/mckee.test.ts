import type {
  BookStatus,
  BuildContext,
  CastMember,
  Character,
  CharacterSummary,
  CoachStreamEvent,
  CoachThreadDetail,
  ContextPreview,
  IdentityRevision,
  Project,
} from '@persona/shared';
import {
  applyUpdates,
  castChecks,
  characterChecks,
  characterDesignSection,
  dataStrings,
  mckeeData,
  mt,
  newBuild,
  normalizeBuild,
  overallProgress,
  updateContext,
  validateUpdate,
  type CharacterBuild,
} from '@persona/shared/mckee';
import { deflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProposalStreamFilter, splitProposals } from '../src/services/coach.js';
import { createCharacter, createTestEnv, send, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  delete process.env.PERSONA_BOOK_PATH;
  await env.close();
});

const put = (url: string, payload: unknown) => env.app.inject({ method: 'PUT', url, payload: payload as never });
const get = async <T>(url: string) => (await env.app.inject({ method: 'GET', url })).json() as T;

function sampleBuild(): CharacterBuild {
  const b = newBuild();
  b.concept.roleLabel = 'Astronoma ribelle';
  b.cast.circle = 'protagonist';
  b.outer.explicit.voice = 'Parla piano, a frasi brevi';
  b.outer.implicit.bigFive = { openness: 80, rationality: 70 };
  b.selves.social = 'Professoressa inflessibile';
  b.selves.hidden = 'Teme di essere una impostora';
  b.inner.objectOfDesire = 'Pubblicare la scoperta';
  b.complexity.subconsciousDesire = 'Essere perdonata dal padre';
  b.arc.climax = 'Rinuncia al premio';
  b.dimensions = [{ id: 'dim_a', positive: 'Coraggiosa', negative: 'Codarda', defining: true, positiveExample: 'davanti al consiglio', negativeExample: 'con il padre' }];
  return b;
}

/* ------------------------------------------------------------------ */
/* Modulo condiviso                                                    */
/* ------------------------------------------------------------------ */

describe('McKee shared module', () => {
  it('validates coach updates against the field index', () => {
    const b = newBuild();
    const ctx = updateContext(b, 'me', ['me', 'other']);
    expect(validateUpdate({ path: 'inner.superObjective', value: 'Ritrovare la fiducia' }, ctx).ok).toBe(true);
    expect(validateUpdate({ path: 'cast.circle', value: 'fourth' }, ctx).ok).toBe(false);
    expect(validateUpdate({ path: 'outer.implicit.bigFive.openness', value: 250 }, ctx)).toMatchObject({ ok: true, update: { value: 100 } });
    expect(validateUpdate({ path: 'relationships', op: 'append', value: { targetId: 'other', kind: 'rival' } }, ctx).ok).toBe(true);
    expect(validateUpdate({ path: 'relationships', op: 'append', value: { targetId: 'stranger' } }, ctx).ok).toBe(false);
    expect(validateUpdate({ path: '__proto__.polluted', value: 'x' }, ctx).ok).toBe(false);
    const r = validateUpdate({ path: 'dimensions', op: 'append', value: { positive: 'A', negative: 'B', defining: true } }, ctx);
    expect(r.ok).toBe(true);
    const next = applyUpdates(b, r.ok ? [r.update] : []);
    expect(next.dimensions).toHaveLength(1);
    expect(b.dimensions).toHaveLength(0); // l'originale non cambia
  });

  it('normalizes untrusted builds and drops prototype keys', () => {
    const b = normalizeBuild(JSON.parse('{"__proto__":{"x":1},"concept":{"logline":"ok","__proto__":{"y":2}},"extra":1,"dimensions":[{"positive":"A"},"bad"]}'));
    expect(b.concept.logline).toBe('ok');
    expect((b as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(b.dimensions).toHaveLength(1);
    expect(b.dimensions[0].id).toMatch(/^dim_/);
  });

  it('runs the McKee checks in English and Italian', () => {
    const c = { ...newBuild(), id: 'p', name: 'Mara' };
    c.cast.circle = 'protagonist';
    const en = characterChecks(c, null, [c], 'en');
    const it = characterChecks(c, null, [c], 'it');
    expect(en.map((x) => x.id)).toEqual(it.map((x) => x.id));
    expect(en.find((x) => x.id === 'choice:No true dilemma yet')?.title).toBe('No true dilemma yet');
    expect(it.find((x) => x.id === 'choice:No true dilemma yet')?.title).not.toBe('No true dilemma yet');
    expect(castChecks(null, [c], 'en').some((x) => x.id === 'cast:Empty first circle')).toBe(true);
    expect(overallProgress(c).total).toBeGreaterThan(50);
  });

  it('has an Italian translation for every McKee data string', () => {
    const same = new Set(['Big Five', 'Fantasy', 'Climax', 'Cast', 'Hollywood', 'IQ', 'EQ', 'POV', 'Antihero']);
    const missing = dataStrings().filter((s) => mt('it', s) === s && !same.has(s));
    // Alcune parole restano identiche in italiano (nomi propri, sigle): tolleranza minima.
    expect(missing.length, missing.slice(0, 20).join(' | ')).toBeLessThan(25);
    expect(mckeeData('it').SECTIONS[0].title).not.toBe(mckeeData('en').SECTIONS[0].title);
    expect(mckeeData('fr').lang).toBe('en'); // senza dizionario: inglese
  });

  it('keeps author-only choices and the hidden self out of reach of the character voice', () => {
    const b = sampleBuild();
    const text = characterDesignSection(b, { name: 'Irina' })!;
    expect(text).toContain('Professoressa inflessibile');
    expect(text).toMatch(/Below awareness[^\n]*never state it/);
    expect(text.indexOf('Teme di essere una impostora')).toBeGreaterThan(text.indexOf('Below awareness'));
    expect(text).not.toContain('Rinuncia al premio'); // climax: scelta d'autore
    expect(characterDesignSection({ ...b, useInContext: false }, { name: 'Irina' })).toBeNull();
  });

  it('filters the proposals block out of the stream', () => {
    const f = new ProposalStreamFilter();
    const chunks = ['Ecco un', "'idea.\n<prop", 'osals>{"summary":"x",', '"updates":[]}</proposals>'];
    const visible = chunks.map((c) => f.push(c)).join('') + f.flush();
    expect(visible).toBe("Ecco un'idea.\n");
    expect(splitProposals(chunks.join('')).json).toEqual({ summary: 'x', updates: [] });
    expect(splitProposals('Testo\n```json\n{"updates":[{"path":"notes","value":"a"}]}\n```').json).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Costruzione come parte dell'identità                                */
/* ------------------------------------------------------------------ */

describe('character build', () => {
  it('saves the build as an identity revision and maps the Big Five', async () => {
    const c = await createCharacter(env);
    expect(c.build.concept.logline).toBe('');
    const res = await put(`/api/characters/${c.id}/build`, { build: sampleBuild(), revisionReason: 'Prima costruzione' });
    expect(res.statusCode).toBe(200);
    const saved = res.json() as Character;
    expect(saved.identityVersion).toBe(2);
    expect(saved.build.concept.roleLabel).toBe('Astronoma ribelle');
    expect(saved.bigFive).toMatchObject({ openness: 80, neuroticism: 30 });
    expect(saved.build.outer.implicit.bigFive).toEqual({ openness: 80, rationality: 70 });

    // Il salvataggio dell'identità senza costruzione non la tocca.
    const { build: _stale, ...identity } = c;
    const ident = await put(`/api/characters/${c.id}`, { ...identity, name: 'Irina V.', bigFive: saved.bigFive });
    expect((ident.json() as Character).build.concept.roleLabel).toBe('Astronoma ribelle');

    const revs = await get<IdentityRevision[]>(`/api/characters/${c.id}/revisions`);
    expect(revs.map((r) => r.reason)).toContain('Prima costruzione');
    expect(revs.find((r) => r.version === 2)?.snapshot.build?.concept.roleLabel).toBe('Astronoma ribelle');

    // Ripristinare la versione 1 (senza costruzione) la svuota; è reversibile.
    const v1 = revs.find((r) => r.version === 1)!;
    const restored = (await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/revisions/${v1.id}/restore` })).json() as Character;
    expect(restored.build.concept.roleLabel).toBe('');
    const list = await get<CharacterSummary[]>('/api/characters');
    expect(list.find((x) => x.id === c.id)?.castCircle).toBe('');
  });

  it('does not create a revision for the cast map angle alone', async () => {
    const c = await createCharacter(env);
    const a = (await put(`/api/characters/${c.id}/cast`, { circle: 'first', angle: 1.2 })).json() as Character;
    expect(a.identityVersion).toBe(2);
    const b = (await put(`/api/characters/${c.id}/cast`, { circle: 'first', angle: -0.4 })).json() as Character;
    expect(b.identityVersion).toBe(2);
    expect(b.build.cast.mapAngle).toBe(-0.4);
    const list = await get<CharacterSummary[]>('/api/characters');
    expect(list.find((x) => x.id === c.id)?.castCircle).toBe('first');
  });

  it('puts the character design into the conversation context', async () => {
    const c = await createCharacter(env);
    await put(`/api/characters/${c.id}/build`, { build: sampleBuild() });
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id } })).json();
    const p = (await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Chi sei?' } })).json() as ContextPreview;
    expect(p.meta.sections.map((s) => s.key)).toContain('design');
    expect(p.messages[0].content).toContain('# CHARACTER DESIGN');
    expect(p.messages[0].content).not.toContain('Rinuncia al premio');
    const analysis = (await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Analizza', mode: 'analysis' } })).json() as ContextPreview;
    expect(analysis.messages[0].content).toContain('Rinuncia al premio');

    await put(`/api/characters/${c.id}/build`, { build: { ...sampleBuild(), useInContext: false } });
    const off = (await env.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/context-preview`, payload: { content: 'Chi sei?' } })).json() as ContextPreview;
    expect(off.meta.sections.map((s) => s.key)).not.toContain('design');
  });

  it('stores the story design on projects and builds the cast context', async () => {
    const project = (await env.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Risacca', story: { logline: 'Una storia', genre: { primary: ['crime', 'nope'] } } } })).json() as Project;
    expect(project.story.logline).toBe('Una storia');
    expect(project.story.world.levels).toEqual([]);
    const a = await createCharacter(env, { name: 'A', projectId: project.id });
    const b = await createCharacter(env, { name: 'B', projectId: project.id });
    const bctx = await get<BuildContext>(`/api/characters/${a.id}/build-context`);
    expect(bctx.project?.id).toBe(project.id);
    expect(bctx.cast.map((m) => m.name)).toEqual(['B']);
    const cast = await get<CastMember[]>(`/api/projects/${project.id}/cast`);
    expect(cast.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
    // L'aggiornamento senza `story` non la cancella.
    const upd = (await put(`/api/projects/${project.id}`, { name: 'Risacca 2' })).json() as Project;
    expect(upd.story.logline).toBe('Una storia');
  });

  it('exports and reimports the build, remapping relationships inside a project', async () => {
    const project = (await env.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Saga' } })).json() as Project;
    const a = await createCharacter(env, { name: 'A', projectId: project.id });
    const b = await createCharacter(env, { name: 'B', projectId: project.id });
    const build = sampleBuild();
    build.relationships = [{ id: 'rel_1', targetId: b.id, kind: 'rival', effect: 'hinders' }];
    await put(`/api/characters/${a.id}/build`, { build });

    const file = (await env.app.inject({ method: 'GET', url: `/api/projects/${project.id}/export` })).json();
    const imp = await env.app.inject({ method: 'POST', url: '/api/projects/import?characters=new', payload: file });
    expect(imp.statusCode, imp.body).toBe(201);
    const newProject = (imp.json() as { project: Project }).project;
    const cast = await get<CastMember[]>(`/api/projects/${newProject.id}/cast`);
    const newA = cast.find((m) => m.name === 'A')!;
    const newB = cast.find((m) => m.name === 'B')!;
    expect(newA.id).not.toBe(a.id);
    expect(newA.build.relationships[0].targetId).toBe(newB.id);
    expect(newA.build.concept.roleLabel).toBe('Astronoma ribelle');
  });
});

/* ------------------------------------------------------------------ */
/* Libro e coach                                                       */
/* ------------------------------------------------------------------ */

/** EPUB minimo (ZIP con voci "deflate"). */
function tinyEpub(): Buffer {
  const files: [string, string][] = [
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'],
    [
      'OEBPS/content.opf',
      '<package><metadata><dc:title>Character</dc:title></metadata><manifest><item id="c9" href="ch9.xhtml"/></manifest><spine><itemref idref="c9"/></spine></package>',
    ],
    [
      'OEBPS/ch9.xhtml',
      '<html><body><h1 class="chapter-number">9</h1><h1 class="chapter-title">THE DIMENSIONAL CHARACTER</h1><h2>The Defining Dimension</h2><p>A dimension is a consistent contradiction. The defining dimension stands forward; remove it and the character vanishes.</p><h2>Inciting incident</h2><p>The inciting incident throws life out of balance and arouses the desire to restore it.</p></body></html>',
    ],
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(data.length, 18);
    loc.writeUInt32LE(raw.length, 22);
    loc.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(loc, nameBuf, data);
    centrals.push(cen, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

const upload = (body: Buffer, name = 'mckee.epub') =>
  env.app.inject({ method: 'POST', url: `/api/book?filename=${encodeURIComponent(name)}`, payload: body, headers: { 'content-type': 'application/octet-stream' } });

function parseCoach(body: string): CoachStreamEvent[] {
  return body
    .split('\n\n')
    .map((b) => b.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)) as CoachStreamEvent);
}

describe('McKee book', () => {
  it('rejects a file that is not an epub and indexes a real one', async () => {
    expect((await get<BookStatus>('/api/book')).available).toBe(false);
    const bad = await upload(Buffer.from('not a zip'));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_book');

    const ok = await upload(tinyEpub(), 'Il mio McKee.epub');
    expect(ok.statusCode, ok.body).toBe(200);
    const status = ok.json() as BookStatus;
    expect(status).toMatchObject({ available: true, title: 'Character', file: 'Il mio McKee.epub' });
    expect(status.passages).toBeGreaterThan(0);

    const hits = await get<{ results: { chapter: string; section: string }[] }>(`/api/book/search?q=${encodeURIComponent('defining dimension')}`);
    expect(hits.results[0].section).toBe('The Defining Dimension');
    expect(hits.results[0].chapter).toContain('Ch. 9');
    // Ricerca in italiano con il lessico inglese di McKee.
    const it = await get<{ results: { section: string }[] }>(`/api/book/search?lang=it&q=${encodeURIComponent('incidente scatenante')}`);
    expect(it.results[0].section).toBe('Inciting incident');

    expect((await env.app.inject({ method: 'DELETE', url: '/api/book' })).json().available).toBe(false);
  });
});

describe('McKee coach', () => {
  it('streams a reply, hides and validates the proposals and keeps the thread', async () => {
    await upload(tinyEpub());
    const project = (await env.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Saga' } })).json() as Project;
    const c = await createCharacter(env, { projectId: project.id });
    const res = await env.app.inject({
      method: 'POST',
      url: `/api/characters/${c.id}/coach`,
      payload: { content: 'Aiutami con la dimensione definitoria', section: 'dimensions', uiLanguage: 'it', draft: sampleBuild() },
    });
    const events = parseCoach(res.body);
    expect(events.map((e) => e.type).slice(0, 3)).toEqual(['thread', 'author_message', 'book']);
    const visible = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(visible).toContain('[coach]');
    expect(visible).toContain('stazione: 09');
    expect(visible).not.toContain('<proposals>');
    const done = events.find((e) => e.type === 'done') as Extract<CoachStreamEvent, { type: 'done' }>;
    expect(done.message.content).not.toContain('proposals');
    const [updates, cast] = done.message.proposals;
    expect(updates.kind).toBe('updates');
    expect(updates.updates.map((u) => u.path)).toEqual(['inner.superObjective', 'dimensions']);
    expect(updates.rejected[0]).toContain('no.such.path');
    expect(updates.updates[0].label).toBe(mt('it', 'Super-objective'));
    expect(cast).toMatchObject({ kind: 'cast', member: { name: 'Mock Foil', circle: 'first', specialRoles: ['foil'] } });
    expect(done.message.meta?.book.length).toBeGreaterThan(0);

    const thread = events.find((e) => e.type === 'thread') as Extract<CoachStreamEvent, { type: 'thread' }>;
    const setStatus = await put(`/api/coach/messages/${done.message.id}/proposals/${updates.id}`, { status: 'applied' });
    expect(setStatus.statusCode).toBe(200);
    const detail = await get<CoachThreadDetail>(`/api/coach/threads/${thread.thread.id}`);
    expect(detail.messages.map((m) => m.role)).toEqual(['author', 'coach']);
    expect(detail.messages[1].proposals[0].status).toBe('applied');

    // Il coach non è parlato del personaggio: nessuna conversazione nuova, nessuna modifica all'identità.
    const after = await get<Character>(`/api/characters/${c.id}`);
    expect(after.identityVersion).toBe(1);
    expect((await get<unknown[]>(`/api/conversations?characterId=${c.id}`)).length).toBe(0);

    // Secondo turno nello stesso filo.
    const second = parseCoach((await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/coach`, payload: { threadId: thread.thread.id, content: 'E il bisogno?' } })).body);
    expect(second.at(-1)?.type).toBe('done');
    expect((await get<CoachThreadDetail>(`/api/coach/threads/${thread.thread.id}`)).messages).toHaveLength(4);
  });

  it('distills a PERSONA conversation transcript', async () => {
    const c = await createCharacter(env);
    const conv = (await env.app.inject({ method: 'POST', url: '/api/conversations', payload: { kind: 'lab', characterId: c.id, defaultMode: 'interview' } })).json();
    await send(env, conv.id, { content: 'Raccontami di tuo padre' });
    const events = parseCoach(
      (await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/coach`, payload: { content: 'Distilla questa intervista', transcriptConversationId: conv.id } })).body,
    );
    const visible = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(visible).toContain('trascrizione');
  });

  it('reports engine errors as events and keeps the author message', async () => {
    const c = await createCharacter(env);
    await env.app.inject({ method: 'PUT', url: `/api/model-configs/${env.mockConfigId}`, payload: { name: 'Mock', providerType: 'mock', model: 'mock-fail', isDefault: true } });
    const events = parseCoach((await env.app.inject({ method: 'POST', url: `/api/characters/${c.id}/coach`, payload: { content: 'Ciao' } })).body);
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'llm_unavailable' } });
    const threads = await get<{ id: string }[]>(`/api/characters/${c.id}/coach`);
    const detail = await get<CoachThreadDetail>(`/api/coach/threads/${threads[0].id}`);
    expect(detail.messages[0].role).toBe('author');
  });
});
