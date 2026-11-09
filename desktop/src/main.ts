/**
 * PERSONA desktop: processo principale di Electron.
 *
 * Avvia il backend locale in-process (startPersonaServer, porta libera su 127.0.0.1) e apre
 * l'interfaccia web servita dal backend stesso. I dati stanno nella cartella dell'utente
 * (app.getPath('userData')/data) o in PERSONA_DATA_DIR. Nessun servizio cloud.
 */
import { app, BrowserWindow, dialog, shell } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Bundle del backend generato da build.mjs (server/src/embedded.ts).
import { type RunningServer, startPersonaServer } from '../../server/src/embedded.js';

const here = dirname(fileURLToPath(import.meta.url));
const smokeDir = process.env.PERSONA_DESKTOP_SMOKE;
let server: RunningServer | null = null;
let win: BrowserWindow | null = null;

app.setName('PERSONA');

function isLocal(url: string): boolean {
  return !!server && (url === server.url || url.startsWith(`${server.url}/`));
}

async function createWindow() {
  if (!server) return;
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: 'PERSONA',
    backgroundColor: '#111216',
    show: !smokeDir,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // I link esterni si aprono nel browser predefinito; la finestra resta sull'app locale.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isLocal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  win.on('closed', () => {
    win = null;
  });
  await win.loadURL(server.url);
  if (smokeDir) await runSmoke(win);
}

/** Verifica non interattiva (CI/headless): interfaccia caricata, API e database funzionanti. */
async function runSmoke(w: BrowserWindow) {
  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      ready = await w.webContents.executeJavaScript(`!!document.querySelector('nav a[href="/characters"]')`);
      if (!ready) await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw new Error('UI not rendered');
    const result = await w.webContents.executeJavaScript(`(async () => {
      const health = await (await fetch('/api/health')).json();
      const created = await (await fetch('/api/characters', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Smoke desktop' }) })).json();
      const list = await (await fetch('/api/characters')).json();
      return { title: document.title, lang: document.documentElement.lang, nav: document.querySelectorAll('nav a').length, health, created: created.name, count: list.length };
    })()`);
    mkdirSync(smokeDir!, { recursive: true });
    writeFileSync(join(smokeDir!, 'desktop.png'), (await w.webContents.capturePage()).toPNG());
    const report = JSON.stringify({ ok: true, url: server?.url, dataDir: server?.ctx.config.dataDir, electron: process.versions.electron, ...result });
    // Anche su file: su Windows lo stdout di un'app GUI non è sempre disponibile.
    writeFileSync(join(smokeDir!, 'result.json'), report);
    console.log(`PERSONA_SMOKE ${report}`);
    await server?.close();
    server = null;
    app.exit(0);
  } catch (err) {
    const report = JSON.stringify({ ok: false, error: (err as Error).message });
    try {
      mkdirSync(smokeDir!, { recursive: true });
      writeFileSync(join(smokeDir!, 'result.json'), report);
    } catch {
      /* ignora */
    }
    console.log(`PERSONA_SMOKE ${report}`);
    app.exit(1);
  }
}

if (!app.requestSingleInstanceLock()) {
  // Un solo processo alla volta sullo stesso database.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // Nel pacchetto installato interfaccia e migrazioni sono risorse fuori da app.asar.
      const resources = app.isPackaged ? process.resourcesPath : here;
      server = await startPersonaServer({
        dataDir: process.env.PERSONA_DATA_DIR ?? join(app.getPath('userData'), 'data'),
        port: 0,
        host: '127.0.0.1',
        webDistDir: join(resources, 'web'),
        config: { migrationsDir: join(resources, 'drizzle'), production: true, version: app.getVersion() },
      });
      await createWindow();
    } catch (err) {
      dialog.showErrorBox('PERSONA', `Impossibile avviare il backend locale:\n${(err as Error).message}`);
      app.exit(1);
    }
  });

  app.on('activate', () => {
    if (!win && server) void createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  let closing = false;
  app.on('before-quit', (event) => {
    if (!server || closing) return;
    event.preventDefault();
    closing = true;
    // Attende le elaborazioni in background e chiude il database in modo pulito.
    void server.close().finally(() => {
      server = null;
      app.quit();
    });
  });
}
