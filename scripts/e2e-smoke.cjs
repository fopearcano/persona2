/**
 * Smoke test end-to-end facoltativo (browser reale) del flusso principale di PERSONA.
 * Richiede Playwright con Chromium (`npm i -g playwright && npx playwright install chromium`)
 * e un backend avviato in produzione su un database VUOTO, ad esempio:
 *   npm run build
 *   PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
 *   node scripts/e2e-smoke.cjs /tmp/persona-shots
 * Usa il provider "Mock": non serve LM Studio.
 */
const { mkdirSync, readFileSync } = require('node:fs');
const { chromium } = require('playwright');
const BASE = process.env.PERSONA_E2E_URL ?? 'http://127.0.0.1:4399';
const SHOTS = process.argv[2] ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  // Errori HTTP attesi (es. un file del tipo sbagliato rifiutato con 400) non contano come errori.
  let expectedHttpErrors = 0;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectedHttpErrors > 0 && m.text().startsWith('Failed to load resource')) { expectedHttpErrors--; return; }
    errors.push(m.text());
  });
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

  await step('characters empty', async () => {
    await page.goto(BASE + '/characters');
    await page.getByText('Nessun personaggio').waitFor({ timeout: 5000 });
  });
  await step('set mock default', async () => {
    await page.goto(BASE + '/settings');
    const card = page.locator('div.rounded-lg.border', { has: page.locator('input[value^="Mock"]') });
    await card.getByRole('button', { name: 'Usa come predefinito' }).click();
    await page.getByText('Salvato').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
  });
  await step('create character', async () => {
    await page.goto(BASE + '/characters/new');
    await page.getByLabel('Nome completo').fill('Irina Volkova');
    await page.getByLabel('Professione').fill('Astrofisica');
    await page.getByLabel('Luogo d\'origine').fill('Novosibirsk');
    await page.getByLabel('Biografia').fill('Cresciuta in Siberia, studia la dinamica delle stelle binarie.');
    await page.getByRole('tab', { name: 'Psicologia' }).click();
    const traitInput = page.getByLabel('Aggiungi: Tratti di personalità');
    await traitInput.fill('Curiosa e meticolosa');
    await traitInput.press('Enter');
    await page.getByRole('tab', { name: 'Lingue' }).click();
    await page.getByRole('button', { name: 'Aggiungi lingua' }).click();
    await page.getByRole('button', { name: 'Aggiungi lingua' }).click();
    await page.getByRole('tab', { name: 'Competenze' }).click();
    await page.getByRole('button', { name: 'Aggiungi competenza' }).click();
    await page.getByLabel('Dominio').fill('Cosmologia');
    await page.getByRole('button', { name: 'Crea' }).click();
    await page.waitForURL(/\/characters\/[0-9a-f-]{36}/, { timeout: 5000 });
    await page.getByText('identità v1').waitFor();
    await page.screenshot({ path: `${SHOTS}/editor.png`, fullPage: true });
  });
  await step('edit character creates revision', async () => {
    await page.getByRole('tab', { name: 'Identità' }).click();
    await page.getByLabel('Età').fill('52');
    await page.getByRole('button', { name: 'Salva', exact: true }).click();
    await page.getByText('versione identità 2').waitFor({ timeout: 5000 });
  });
  await step('dialogue streams and persists', async () => {
    await page.getByRole('button', { name: 'Dialoga' }).click();
    await page.getByRole('button', { name: 'Nuova conversazione' }).first().click();
    await page.waitForURL(/\/dialogue\/[^/]+\/[0-9a-f-]{36}/);
    const box = page.getByRole('textbox', { name: /Scrivi a Irina/ });
    await box.fill('Parlami della materia oscura');
    await box.press('Enter');
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/dialogue.png` });
    await page.reload();
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 5000 });
    await page.getByText('Parlami della materia oscura').first().waitFor();
  });
  await step('analysis mode', async () => {
    await page.getByRole('radio', { name: 'Analisi esterna' }).click();
    const box = page.getByRole('textbox', { name: /analisi esterna/i });
    await box.fill('È coerente?');
    await box.press('Enter');
    await page.getByText('[analisi esterna su Irina Volkova]').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/analysis.png` });
  });
  await step('full prompt preview', async () => {
    await page.getByRole('button', { name: 'Anteprima del prompt completo' }).click();
    await page.getByText('CANONICAL IDENTITY (permanent)').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/prompt.png` });
    await page.keyboard.press('Escape');
  });
  await step('process memory', async () => {
    await page.getByRole('button', { name: 'Elabora memoria' }).click();
    await page.getByText(/Memoria elaborata/).waitFor({ timeout: 10000 });
  });
  await step('memory page', async () => {
    await page.goto(BASE + '/memory');
    await page.getByLabel('Seleziona un personaggio').selectOption({ label: 'Irina Volkova' });
    await page.getByText('Mock: si è parlato').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/memory.png`, fullPage: true });
  });
  await step('scenario with participant and session', async () => {
    await page.goto(BASE + '/scenarios');
    await page.getByLabel('Titolo').fill('Nave Aurora');
    await page.getByRole('button', { name: 'Nuovo scenario' }).click();
    await page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/);
    await page.getByLabel('Ambientazione').fill('Nave interstellare in rotta verso Proxima');
    await page.getByLabel('Situazione attuale').fill('Guasto al sistema di navigazione');
    await page.getByRole('button', { name: 'Salva' }).click();
    await page.getByText('Salvato').first().waitFor();
    await page.getByRole('tab', { name: /Partecipanti/ }).click();
    await page.locator('main select').first().selectOption({ label: 'Irina Volkova' });
    await page.getByLabel('Ruolo').first().fill('Specialista di navigazione astronomica');
    await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await page.getByRole('link', { name: 'Irina Volkova' }).waitFor();
    await page.getByRole('tab', { name: 'Sessioni' }).click();
    await page.locator('main select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crea' }).click();
    await page.waitForURL(/sessions\//);
    const box = page.getByRole('textbox', { name: /Scrivi a Irina/ });
    await box.fill('Il sensore stellare è guasto. Che facciamo?');
    await box.press('Enter');
    await page.getByText('[Irina Volkova] Risposta simulata').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/scenario-session.png` });
  });
  await step('semantic retrieval settings', async () => {
    await page.goto(BASE + '/settings');
    const card = page.locator('section', { has: page.getByRole('heading', { name: /Recupero semantico/ }) });
    await card.getByLabel('Attiva il recupero semantico').check();
    await card.getByLabel('Endpoint').selectOption({ label: 'Mock (demo offline, senza LLM)' });
    await card.getByLabel('Modello di embedding').fill('mock-embed');
    await card.getByRole('button', { name: 'Salva' }).click();
    await card.getByRole('button', { name: 'Prova embedding' }).click();
    await card.getByText(/Embedding riuscito: 96 dimensioni/).waitFor({ timeout: 5000 });
    await card.getByRole('button', { name: 'Indicizza ora' }).click();
    await card.getByText(/Indicizzate (\d+)\/\1 memorie/).waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/settings-embeddings.png`, fullPage: true });
  });
  await step('pdf into knowledge base', async () => {
    const chars = await (await page.request.get(BASE + '/api/characters')).json();
    await page.goto(`${BASE}/characters/${chars[0].id}?tab=knowledge`);
    const lines = ['Le pulsar millisecondo', 'sono orologi naturali.'];
    const content = `BT /F1 12 Tf 72 720 Td ${lines.map((l, i) => `${i ? '0 -16 Td ' : ''}(${l}) Tj`).join(' ')} ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'Pulsar.pdf', mimeType: 'application/pdf', buffer: Buffer.from(out, 'latin1') });
    await page.getByText(/Testo estratto da 1 pagine/).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Salva', exact: true }).last().click();
    await page.getByText('1 frammento').waitFor({ timeout: 5000 });
  });
  await step('automatic turns in a simulation', async () => {
    const created = await (await page.request.post(BASE + '/api/characters', { data: { name: 'Marco Bellini', occupation: 'Ingegnere' } })).json();
    const scenarios = await (await page.request.get(BASE + '/api/scenarios')).json();
    await page.request.post(`${BASE}/api/scenarios/${scenarios[0].id}/participants`, { data: { characterId: created.id, role: 'Ingegnere capo' } });
    await page.goto(`${BASE}/simulations?scenarioId=${scenarios[0].id}`);
    await page.getByLabel('Titolo').fill('Emergenza in plancia');
    await page.getByLabel('Gestione dei turni').selectOption('auto');
    await page.getByRole('button', { name: 'Crea simulazione' }).click();
    await page.waitForURL(/\/simulations\/[0-9a-f-]{36}/);
    await page.getByRole('radio', { name: 'Narrazione' }).click();
    const box = page.getByRole('textbox', { name: /Descrivi un evento/ });
    await box.fill('Marco, il reattore perde pressione!');
    await box.press('Enter');
    await page.getByText('[Marco Bellini] Risposta simulata').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Avanza ×3' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.prose-msg').length >= 5, null, { timeout: 20000 });
    await page.getByRole('button', { name: 'Avanza ×3' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/simulation-auto.png` });
  });
  await step('scenario export and import', async () => {
    const scenarios = await (await page.request.get(BASE + '/api/scenarios')).json();
    await page.goto(`${BASE}/scenarios/${scenarios[0].id}`);
    await page.getByRole('button', { name: 'Esporta scenario' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta', exact: true }).click()]);
    const path = await download.path();
    const bundle = JSON.parse(readFileSync(path, 'utf8'));
    if (bundle.format !== 'persona.scenario' || bundle.characters.length !== 2) throw new Error('bad bundle');
    await page.goto(BASE + '/scenarios');
    await page.getByRole('button', { name: 'Importa scenario' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog').getByRole('button', { name: 'Importa' }).click();
    await (await chooser).setFiles(path);
    await page.getByText(/Importato «Nave Aurora»: 0 personaggi nuovi, 2 riutilizzati/).waitFor({ timeout: 5000 });
    await page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/);
  });
  await step('projects: a new story with its own cast', async () => {
    await page.goto(BASE + '/projects');
    await page.locator('main').getByText('Il mio progetto').waitFor({ timeout: 5000 });
    await page.getByLabel('Nome', { exact: true }).fill('Cronache di Marte');
    await page.getByRole('button', { name: 'Nuovo progetto' }).click();
    await page.waitForURL(/\/characters$/);
    await page.getByText('Nessun personaggio in questo progetto').waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('select[aria-label="Progetto attivo"]')?.selectedOptions[0]?.textContent === 'Cronache di Marte');
    await page.getByRole('button', { name: 'Aggiungi personaggio esistente' }).first().click();
    await page.getByRole('dialog').locator('li', { hasText: 'Irina Volkova' }).getByRole('button', { name: 'Aggiungi' }).click();
    await page.getByText('Personaggio aggiunto al progetto').waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.locator('main').getByText('Irina Volkova').waitFor();
    if (await page.locator('main').getByText('Marco Bellini').count()) throw new Error('Marco must not be in the new project');
  });
  await step('projects: scenarios are divided per story', async () => {
    await page.goto(BASE + '/scenarios');
    await page.getByText('Nessuno scenario in questo progetto.').waitFor({ timeout: 5000 });
    await page.getByLabel('Titolo').fill('Base Olympus');
    await page.getByRole('button', { name: 'Nuovo scenario' }).click();
    await page.waitForURL(/\/scenarios\/[0-9a-f-]{36}/);
    await page.getByRole('tab', { name: /Partecipanti/ }).click();
    // Prima i membri del progetto, poi i personaggi di altre storie (entrano nel progetto se aggiunti).
    await page.locator('main select').first().locator('optgroup[label="Da altri progetti"] option', { hasText: 'Marco Bellini' }).waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('main select').first().selectOption({ label: 'Irina Volkova' });
    await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await page.getByRole('link', { name: 'Irina Volkova' }).waitFor();
    await page.goto(BASE + '/scenarios');
    await page.locator('main').getByText('Base Olympus').waitFor();
    if (await page.locator('main').getByText('Nave Aurora').count()) throw new Error('Nave Aurora belongs to another project');
  });
  await step('projects: all-projects view and membership', async () => {
    await page.goto(BASE + '/characters');
    await page.getByLabel('Progetto attivo').selectOption({ label: 'Tutti i progetti' });
    await page.locator('main').getByText('Marco Bellini').waitFor({ timeout: 5000 });
    await page.locator('main li', { hasText: 'Irina Volkova' }).getByText(/Cronache di Marte/).waitFor();
    await page.screenshot({ path: `${SHOTS}/characters-all-projects.png` });
    await page.locator('main li', { hasText: 'Irina Volkova' }).getByRole('link').first().click();
    await page.getByRole('group', { name: 'Progetti' }).getByText('Cronache di Marte').waitFor({ timeout: 5000 });
    await page.getByRole('group', { name: 'Progetti' }).getByText('Il mio progetto').waitFor();
  });
  await step('projects: save to file and open', async () => {
    await page.goto(BASE + '/projects');
    const card = page.locator('main li', { hasText: 'Cronache di Marte' });
    await card.getByRole('button', { name: 'Salva su file' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('dialog').getByRole('button', { name: 'Salva su file' }).click(),
    ]);
    const file = await download.path();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.format !== 'persona.project' || data.characters.length !== 1 || data.scenarios.length !== 1) throw new Error('bad project file');
    await page.getByRole('button', { name: 'Apri da file' }).first().click();
    await page.getByRole('dialog').getByLabel('Importa i personaggi come nuove identità').check();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog').getByRole('button', { name: 'Apri da file' }).click();
    await (await chooser).setFiles(file);
    await page.getByText(/Aperto «Cronache di Marte \(2\)»: 1 personaggi nuovi, 0 riutilizzati, 1 scenari/).waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/projects.png`, fullPage: true });
  });
  await step('persona export and import with history', async () => {
    await page.goto(BASE + '/characters');
    await page.getByLabel('Progetto attivo').selectOption({ label: 'Tutti i progetti' });
    const card = page.locator('main li', { hasText: 'Irina Volkova' }).first();
    await card.getByRole('button', { name: 'Esporta' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('dialog').getByRole('button', { name: 'Esporta', exact: true }).click(),
    ]);
    const file = await download.path();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.format !== 'persona.character' || data.identityRevisions.length !== 1) throw new Error('bad character file');
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    await page.getByRole('dialog').getByText('Includi le memorie').waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog').getByRole('button', { name: 'Importa', exact: true }).click();
    await (await chooser).setFiles(file);
    await page.getByText(/Importato «Irina Volkova»: .*1 versioni precedenti/).waitFor({ timeout: 5000 });
  });
  await step('a file of the wrong kind is explained', async () => {
    const scenarios = await (await page.request.get(BASE + '/api/scenarios')).json();
    const bundle = await (await page.request.get(`${BASE}/api/scenarios/${scenarios[0].id}/export`)).body();
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog').getByRole('button', { name: 'Importa', exact: true }).click();
    expectedHttpErrors = 1;
    await (await chooser).setFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: bundle });
    await page.getByText('Questo file contiene uno scenario: importalo da Scenari → Importa scenario.').waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/import-wrong-file.png` });
    await page.keyboard.press('Escape');
  });
  await step('style: typewriter font, accent color, text size', async () => {
    await page.goto(BASE + '/settings');
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Stile' }) });
    await card.getByLabel('Carattere dei testi').selectOption('typewriter');
    await card.getByRole('button', { name: 'Viola' }).click();
    await card.getByRole('radio', { name: 'Grande', exact: true }).click();
    const read = () =>
      page.evaluate(() => ({
        text: getComputedStyle(document.querySelector('.prose-msg')).fontFamily,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        size: getComputedStyle(document.documentElement).fontSize,
      }));
    const before = await read();
    if (!before.text.startsWith('"Courier Prime"') || before.accent !== '#c4b5fd' || before.size !== '18px') throw new Error(JSON.stringify(before));
    if (!(await page.evaluate(async () => (await document.fonts.load('16px "Courier Prime"')).length > 0))) throw new Error('typewriter font not bundled');
    await page.waitForTimeout(300);
    await card.screenshot({ path: `${SHOTS}/style.png` });
    // Salvato sul backend: sopravvive al ricaricamento anche senza la copia locale.
    await page.evaluate(() => localStorage.removeItem('persona.appearance'));
    await page.reload();
    await card.waitFor();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#c4b5fd');
    await card.getByRole('button', { name: 'Ripristina lo stile predefinito' }).click();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '16px');
  });
  await step('english ui', async () => {
    await page.goto(BASE + '/settings');
    await page.getByLabel("Lingua dell'interfaccia").selectOption('en');
    await page.getByText('Interface language').waitFor();
    await page.goto(BASE + '/characters');
    await page.getByRole('heading', { name: 'Characters' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/characters-en.png` });
    await page.reload();
    await page.getByRole('heading', { name: 'Characters' }).waitFor();
  });
  await step('german ui (lazy-loaded locale)', async () => {
    await page.goto(BASE + '/settings');
    await page.getByLabel('Interface language').selectOption('de');
    await page.getByRole('heading', { name: 'Einstellungen' }).waitFor();
    await page.getByRole('link', { name: 'Gedächtnis' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Einstellungen' }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/settings-de.png` });
    await page.getByLabel('Sprache der Oberfläche').selectOption('en');
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
  });
  await step('light theme', async () => {
    await page.goto(BASE + '/settings');
    await page.getByRole('radio', { name: 'Light' }).click();
    await page.goto(BASE + '/scenarios');
    await page.screenshot({ path: `${SHOTS}/scenarios-light.png` });
  });
  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
  if (failures > 0 || errors.length > 0) process.exit(1);
})();
