/**
 * Smoke test end-to-end facoltativo della costruzione McKee (PERSONA 2) in un browser reale.
 * Come scripts/e2e-smoke.cjs: Playwright con Chromium e un backend su un database VUOTO:
 *   npm run build
 *   PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
 *   node scripts/e2e-mckee.cjs /tmp/persona-shots
 * Usa il provider "Mock" (nessun LM Studio) e un piccolo EPUB generato al volo.
 */
const { mkdirSync } = require('node:fs');
const { deflateRawSync } = require('node:zlib');
const { chromium } = require('playwright');

const BASE = process.env.PERSONA_E2E_URL ?? 'http://127.0.0.1:4399';
const SHOTS = process.argv[2] ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });

async function api(method, url, body, headers) {
  const res = await fetch(BASE + url, {
    method,
    headers: body === undefined ? undefined : (headers ?? { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** EPUB minimo con un capitolo sulle dimensioni. */
function tinyEpub() {
  const files = [
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'],
    ['OEBPS/content.opf', '<package><metadata><dc:title>Character (test copy)</dc:title></metadata><manifest><item id="c9" href="ch9.xhtml"/></manifest><spine><itemref idref="c9"/></spine></package>'],
    [
      'OEBPS/ch9.xhtml',
      '<html><body><h1 class="chapter-number">9</h1><h1 class="chapter-title">THE DIMENSIONAL CHARACTER</h1><h2>The Defining Dimension</h2><p>A dimension is a consistent contradiction. The defining dimension stands forward; remove it and the character vanishes.</p></body></html>',
    ],
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const n = Buffer.from(name);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(data.length, 18);
    loc.writeUInt32LE(raw.length, 22);
    loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(loc, n, data);
    centrals.push(cen, n);
    offset += 30 + n.length + data.length;
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

(async () => {
  // --- Dati di partenza via API ---
  const configs = await api('GET', '/api/model-configs');
  const mock = configs.find((c) => c.providerType === 'mock');
  await api('PUT', `/api/model-configs/${mock.id}`, { name: 'Mock', providerType: 'mock', model: 'mock-persona', isDefault: true, contextLength: 32768, maxTokens: 1024 });
  const project = await api('POST', '/api/projects', {
    name: 'Risacca',
    story: { logline: 'Una biologa marina torna nel paese che l’ha cacciata.', genre: { primary: ['crime', 'redemption'] }, theme: 'La verità costa' },
  });
  await api('PUT', '/api/preferences', { activeProjectId: project.id });
  const mara = await api('POST', '/api/characters', { name: 'Mara Voss', occupation: 'Biologa marina', projectId: project.id });
  const bruno = await api('POST', '/api/characters', { name: 'Bruno Neri', occupation: 'Sindaco', projectId: project.id });
  const lia = await api('POST', '/api/characters', { name: 'Lia Voss', occupation: 'Pescatrice', projectId: project.id });
  const build = mara.build;
  build.concept = { ...build.concept, roleLabel: 'La figlia che ritorna', logline: 'Una scienziata che vuole la verità ma teme di trovarla in famiglia.', inspiration: ['reality', 'events'], tellingDetail: 'Conta le onde prima di parlare.' };
  build.cast = { ...build.cast, circle: 'protagonist', essentials: ['willpower', 'underdog', 'empathy', 'intrigue'], centerOfGood: 'Lealtà verso chi non ha voce' };
  build.outer.explicit = { ...build.outer.explicit, voice: 'Bassa, frasi brevi', gestures: 'Si tocca il polso', profession: 'Biologa marina', home: 'Una barca in secca' };
  build.outer.expressed = { voice: true, gestures: true };
  build.outer.implicit.bigFive = { openness: 85, conscientiousness: 70, extraversion: 30, agreeableness: 45, rationality: 60 };
  build.selves = { ...build.selves, social: 'Professionale, distante', personal: 'Ironica con la sorella', core: 'Si giudica severamente', hidden: 'Vuole il perdono del padre' };
  build.inner.motivations = { meaning: 9, balance: 8, empathy: 6, power: 3 };
  build.inner.incitingIncident = 'La morte sospetta del padre';
  build.inner.superObjective = 'Ristabilire la verità';
  build.inner.objectOfDesire = 'Le prove del delitto';
  build.inner.pressure = { risk: 8, freedom: 6, notes: '' };
  build.inner.dilemma = { kind: 'negative', optionA: 'Denunciare la sorella', optionB: 'Proteggerla e tradire la verità', choice: '' };
  build.dimensions = [
    { id: 'dim_a', positive: 'Coraggiosa', negative: 'Codarda', defining: true, positiveExample: 'davanti al consiglio', negativeExample: 'con la sorella' },
    { id: 'dim_b', positive: 'Sincera', negative: 'Bugiarda' },
  ];
  build.complexity = { ...build.complexity, antagonism: { nature: 6, social: 7, personal: 8, inner: 5 }, capacity: 6, subconsciousDesire: 'Essere riaccolta in famiglia' };
  build.arc = { ...build.arc, need: 'Emozioni mai sentite', type: 'positive', dimensionId: 'dim_a', from: 'Codardia', to: 'Coraggio', turningPoints: [{ id: 't1', label: 'Ritorno', charge: 1 }, { id: 't2', label: 'Il diario', charge: -3 }, { id: 't3', label: 'Confronto', charge: 4 }] };
  build.relationships = [{ id: 'r1', targetId: bruno.id, kind: 'antagonist', effect: 'hinders', draws: 'il coraggio', dimensionId: 'dim_a' }, { id: 'r2', targetId: lia.id, kind: 'family', effect: 'both', draws: 'le bugie', dimensionId: 'dim_b' }];
  await api('PUT', `/api/characters/${mara.id}/build`, { build, revisionReason: 'Prima costruzione' });
  await api('PUT', `/api/characters/${bruno.id}/cast`, { circle: 'first', angle: -0.6 });
  await api('PUT', `/api/characters/${lia.id}/cast`, { circle: 'first', angle: 2.4 });
  await api('POST', '/api/book?filename=character.epub', tinyEpub(), { 'content-type': 'application/octet-stream' });

  // --- Browser ---
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  let failures = 0;
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('OK  ', name);
    } catch (e) {
      failures++;
      console.log('FAIL', name, e.message.split('\n')[0]);
      await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '_')}.png` });
    }
  };

  await step('characters list shows the build button', async () => {
    await page.goto(BASE + '/characters');
    await page.getByRole('button', { name: 'Costruzione McKee' }).first().waitFor({ timeout: 5000 });
  });
  await step('station 09 dimensions', async () => {
    await page.goto(`${BASE}/characters/${mara.id}/build?station=dimensions`);
    await page.getByRole('heading', { name: 'Dimensioni', exact: true, level: 2 }).waitFor({ timeout: 5000 });
    await page.getByText('Ruota delle dimensioni').waitFor();
    await page.screenshot({ path: `${SHOTS}/mckee-dimensions.png` });
  });
  await step('add a dimension and save a new identity version', async () => {
    await page.getByRole('button', { name: /^Leale \/ Traditrice$/ }).click();
    await page.getByText('Modifiche non salvate').waitFor();
    await page.getByLabel('Motivo della modifica (facoltativo)').fill('Terza dimensione');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByText(/versione identità 3/).first().waitFor({ timeout: 5000 });
    const c = await api('GET', `/api/characters/${mara.id}`);
    if (c.build.dimensions.length !== 3) throw new Error(`dimensions: ${c.build.dimensions.length}`);
  });
  await step('station 11 arc chart', async () => {
    await page.goto(`${BASE}/characters/${mara.id}/build?station=arc`);
    await page.getByText('Arco dei punti di svolta').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-arc.png` });
  });
  await step('coach proposal applied to the draft', async () => {
    await page.goto(`${BASE}/characters/${mara.id}/build?station=desire`);
    await page.getByRole('button', { name: 'Coach', exact: true }).click();
    await page.getByRole('button', { name: 'Idee per questa tappa' }).click();
    await page.getByRole('button', { name: 'Applica alla bozza' }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/mckee-coach.png` });
    await page.getByRole('button', { name: 'Applica alla bozza' }).click();
    await page.getByText('Modifiche non salvate').waitFor();
  });
  await step('book tab', async () => {
    await page.getByRole('tab', { name: 'Libro' }).click();
    await page.getByPlaceholder('Cerca nel libro (es. dimensione definitoria)').fill('dimensione definitoria');
    await page.getByRole('button', { name: 'Cerca' }).click();
    await page.getByText('The Defining Dimension').first().waitFor({ timeout: 5000 });
  });
  await step('profile', async () => {
    await page.goto(`${BASE}/characters/${mara.id}/build?station=profile`);
    await page.getByText('Sedici tappe').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-profile.png`, fullPage: true });
  });
  await step('story and cast map', async () => {
    await page.goto(`${BASE}/story/${project.id}`);
    await page.getByRole('button', { name: 'Bruno Neri' }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-story.png`, fullPage: true });
  });
  await step('context preview includes the design', async () => {
    const conv = await api('POST', '/api/conversations', { kind: 'lab', characterId: mara.id });
    const p = await api('POST', `/api/conversations/${conv.id}/context-preview`, { content: 'Chi sei?' });
    if (!p.messages[0].content.includes('# CHARACTER DESIGN')) throw new Error('no design section');
    await page.goto(`${BASE}/dialogue/${mara.id}/${conv.id}`);
    await page.getByPlaceholder(/Scrivi a Mara Voss/).fill('Raccontami di tuo padre');
    await page.keyboard.press('Enter');
    await page.getByText('[Mara Voss]').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Distilla nella costruzione McKee' }).click();
    await page.getByText(/trascrizione/).first().waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/mckee-distill.png` });
  });
  await step('create a character by chatting', async () => {
    await page.goto(BASE + '/characters');
    await page.getByRole('button', { name: 'Crea chattando' }).first().click();
    await page.getByLabel('Nome completo').fill('Teo Ricci');
    await page.getByRole('button', { name: 'Inizia a chattare' }).click();
    await page.getByRole('heading', { name: 'Costruisci Teo Ricci chattando' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: "Inizia l'intervista" }).click();
    await page.getByText('2 campi compilati').first().waitFor({ timeout: 10000 });
    const input = page.getByPlaceholder(/Rispondi o racconta il personaggio/);
    await input.fill('Un faro abbandonato e un guardiano che non dorme mai');
    await input.press('Enter');
    await page.getByText('2 campi compilati').nth(1).waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/mckee-chat.png` });
    // Annulla l'ultima cattura: torna il valore della prima risposta.
    await page.getByRole('button', { name: 'Annulla' }).last().click();
    await page.getByText('Annullato').waitFor();
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByText(/versione identità 2/).first().waitFor({ timeout: 5000 });
    const list = await api('GET', '/api/characters');
    const teo = list.find((c) => c.name === 'Teo Ricci');
    const full = await api('GET', `/api/characters/${teo.id}`);
    if (full.occupation !== 'Biologa marina') throw new Error(`occupation: ${full.occupation}`);
    if (!full.build.concept.logline.startsWith('Iniziamo')) throw new Error(`logline: ${full.build.concept.logline}`);
  });
  await step('english interface', async () => {
    await page.evaluate(() => localStorage.setItem('persona.uiLanguage', 'en'));
    await api('PUT', '/api/preferences', { uiLanguage: 'en' });
    await page.goto(`${BASE}/characters/${mara.id}/build?station=selves`);
    await page.getByRole('heading', { name: 'The Four Selves', exact: true, level: 2 }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-selves-en.png` });
    await api('PUT', '/api/preferences', { uiLanguage: 'it' });
  });
  await step('dark theme and phone width', async () => {
    await page.evaluate(() => localStorage.setItem('persona.uiLanguage', 'it'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${BASE}/characters/${mara.id}/build?station=complexity`);
    await page.getByText('La bilancia della sfavorita').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-dark.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/characters/${mara.id}/build?station=role`);
    await page.getByRole('heading', { name: 'Ruolo nel cast', exact: true, level: 2 }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/mckee-phone.png` });
  });

  await browser.close();
  const relevant = errors.filter((e) => !e.includes('favicon'));
  if (relevant.length) console.log('Console errors:\n' + relevant.join('\n'));
  console.log(failures || relevant.length ? `${failures} failed step(s), ${relevant.length} console error(s)` : 'All McKee steps passed');
  process.exit(failures || relevant.length ? 1 : 0);
})();
