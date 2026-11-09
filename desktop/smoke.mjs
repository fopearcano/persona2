/**
 * Smoke test dell'app desktop: avvia Electron con un database temporaneo, verifica che
 * interfaccia, API e database funzionino, salva uno screenshot e termina.
 *
 *   node smoke.mjs [cartella-screenshot]              → app in sviluppo (electron .)
 *   node smoke.mjs --packaged [cartella-screenshot]   → eseguibile prodotto da electron-builder
 *
 * Su Linux senza display: `xvfb-run node smoke.mjs …`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const packaged = argv.includes('--packaged');
const shotsArg = argv.find((a) => !a.startsWith('--'));

function packagedExecutable() {
  const rel = join(here, 'release');
  const candidates =
    process.platform === 'win32'
      ? [join(rel, 'win-unpacked', 'PERSONA.exe')]
      : process.platform === 'darwin'
        ? [
            join(rel, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'PERSONA.app', 'Contents', 'MacOS', 'PERSONA'),
            join(rel, 'mac', 'PERSONA.app', 'Contents', 'MacOS', 'PERSONA'),
          ]
        : [join(rel, 'linux-unpacked', 'persona')];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`Eseguibile non trovato: ${candidates.join(', ')}`);
  return found;
}

const require = createRequire(import.meta.url);
const executable = packaged ? packagedExecutable() : require('electron');
const dataDir = mkdtempSync(join(tmpdir(), 'persona-desktop-'));
const shots = shotsArg ?? join(dataDir, 'shots');
const args = packaged ? [] : ['.'];
if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu');
const res = spawnSync(executable, args, {
  cwd: here,
  env: { ...process.env, PERSONA_DATA_DIR: dataDir, PERSONA_DESKTOP_SMOKE: shots },
  encoding: 'utf8',
  timeout: 120_000,
});
let report = `${res.stdout}`.split(/\r?\n/).find((l) => l.startsWith('PERSONA_SMOKE '))?.slice(14) ?? null;
if (!report && existsSync(join(shots, 'result.json'))) report = readFileSync(join(shots, 'result.json'), 'utf8');
console.log(report ? `PERSONA_SMOKE ${report}` : `Nessun risultato (exit ${res.status}, ${res.error?.message ?? ''})\n${res.stdout}\n${res.stderr}`);
try {
  rmSync(dataDir, { recursive: true, force: true });
} catch {
  /* Windows può trattenere brevemente i file */
}
process.exit(report && JSON.parse(report).ok ? 0 : 1);
