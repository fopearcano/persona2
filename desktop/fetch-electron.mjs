/**
 * Scarica gli archivi di Electron necessari agli installer, con tentativi ripetuti e verifica
 * SHA-256 contro i checksum ufficiali distribuiti con il pacchetto npm "electron".
 * Il risultato è una cartella da passare a electron-builder come `electronDist`.
 *
 *   node fetch-electron.mjs <cartella> <piattaforma-arch>...   es. linux-x64 win32-x64 darwin-arm64
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);
const { version } = require('electron/package.json');
const checksums = require('electron/checksums.json');
const [dest, ...targets] = process.argv.slice(2);
if (!dest || targets.length === 0) {
  console.error('Uso: node fetch-electron.mjs <cartella> <piattaforma-arch>...');
  process.exit(2);
}
mkdirSync(dest, { recursive: true });

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

const ATTEMPTS = 25;
for (const target of targets) {
  const name = `electron-v${version}-${target}.zip`;
  const expected = checksums[name];
  if (!expected) throw new Error(`Checksum sconosciuto per ${name}`);
  const file = join(dest, name);
  if (existsSync(file) && (await sha256(file)) === expected) {
    console.log(`${name}: già presente e verificato`);
    continue;
  }
  const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
  for (let attempt = 1; ; attempt++) {
    const tmp = `${file}.part`;
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      const actual = await sha256(tmp);
      if (actual !== expected) throw new Error(`checksum non valido (${actual})`);
      renameSync(tmp, file);
      console.log(`${name}: scaricato e verificato`);
      break;
    } catch (err) {
      rmSync(tmp, { force: true });
      if (attempt >= ATTEMPTS) throw new Error(`${name}: download non riuscito dopo ${attempt} tentativi: ${err.message}`);
      const wait = Math.min(45, 5 * attempt);
      console.warn(`${name}: tentativo ${attempt} non riuscito (${err.message}); nuovo tentativo tra ${wait} s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}
