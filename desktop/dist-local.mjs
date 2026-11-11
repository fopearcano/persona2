/**
 * Crea gli installer per il sistema su cui gira, con gli stessi passi del workflow di release:
 * bundle del backend → Electron scaricato con tentativi ripetuti e verificato (SHA-256) →
 * electron-builder con quell'Electron (niente download interni che falliscono a metà) →
 * nuovi tentativi se electron-builder non riesce a scaricare i suoi strumenti.
 *
 *   npm run desktop:dist      (dalla root: build del frontend + dipendenze desktop + questo script)
 *
 * Risultato in desktop/release/. Windows → NSIS (.exe), Linux → AppImage + deb, macOS → dmg (Intel x64).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
process.chdir(here);

const TARGETS = {
  win32: { electron: 'win32-x64', flag: '--win' },
  linux: { electron: 'linux-x64', flag: '--linux' },
  // L'installer macOS è solo Intel (x64); sui Mac Apple funziona con Rosetta 2.
  darwin: { electron: 'darwin-x64', flag: '--mac' },
};
const target = TARGETS[process.platform];
if (!target) {
  console.error(`Sistema non supportato per gli installer: ${process.platform}`);
  process.exit(1);
}
if (!existsSync(join(here, 'node_modules', 'electron-builder'))) {
  console.error('Dipendenze dell\'app desktop mancanti: eseguire "npm run desktop:install" nella root (oppure "npm run desktop:dist").');
  process.exit(1);
}

/** Esegue uno script con Node (senza shell: nessun problema con spazi nei percorsi su Windows). */
function node(args, env = {}) {
  console.log(`\n> node ${args.join(' ')}`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status === 0;
}

const builder = join(here, 'node_modules', 'electron-builder', 'cli.js');
if (!node(['build.mjs'])) process.exit(1);
if (!node(['fetch-electron.mjs', 'electron-zips', target.electron])) process.exit(1);

const ATTEMPTS = 4;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const ok = node(
    [builder, '--config', 'electron-builder.config.cjs', target.flag, '--publish', 'never', '-c.electronDist=electron-zips'],
    // Nessun certificato di firma: installer non firmati (macOS: firma ad hoc).
    { CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_CACHE: join(here, '.eb-cache') },
  );
  if (ok) {
    console.log(`\nInstaller pronti in ${join(here, 'release')}`);
    process.exit(0);
  }
  if (attempt < ATTEMPTS) {
    console.warn(`\nCreazione degli installer non riuscita (tentativo ${attempt} di ${ATTEMPTS}): nuovo tentativo tra 20 s…`);
    await new Promise((r) => setTimeout(r, 20000));
  }
}
console.error('\nCreazione degli installer non riuscita. Se l\'errore riguarda un download, riprovare più tardi; altrimenti conservare il messaggio qui sopra.');
process.exit(1);
