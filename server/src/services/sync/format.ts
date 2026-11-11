/**
 * Formato della cartella di sincronizzazione (dentro Google Drive, Dropbox, OneDrive, iCloud…):
 *
 *   <cartella>/persona-sync.json              identità della cartella (syncId) ed eventuale cifratura
 *   <cartella>/devices/<deviceId>/device.json nome, ultimo blocco pubblicato, versione dell'app
 *   <cartella>/devices/<deviceId>/0000000001.pseg  blocchi di modifiche (JSON compresso, eventualmente cifrato)
 *
 * Ogni dispositivo scrive SOLO nella propria sottocartella: il client cloud non deve mai unire
 * versioni dello stesso file scritte da due computer. Il database SQLite non viene mai copiato
 * nella cartella. I file si scrivono con nome temporaneo e poi si rinominano.
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, type ScryptOptions } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);
const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: ScryptOptions) => Promise<Buffer>;

export const FOLDER_MANIFEST = 'persona-sync.json';
export const DEVICES_DIR = 'devices';
export const DEVICE_MANIFEST = 'device.json';
const SEGMENT_RE = /^(\d{10})\.pseg$/;
const DEVICE_RE = /^[0-9a-f]{32}$/;

/* ------------------------------------------------------------------ */
/* Cifratura facoltativa (AES-256-GCM, chiave da passphrase con scrypt) */
/* ------------------------------------------------------------------ */

export interface FolderEncryption {
  cipher: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: string;
  N: number;
  r: number;
  p: number;
  /** Testo noto cifrato con la chiave: verifica la passphrase senza conservarla. */
  check: string;
}

const MAGIC = Buffer.from('PSE1');
const CHECK_TEXT = 'persona-sync-check';

export async function deriveKey(passphrase: string, enc: Pick<FolderEncryption, 'salt' | 'N' | 'r' | 'p'>): Promise<Buffer> {
  return scrypt(passphrase.normalize('NFC'), Buffer.from(enc.salt, 'base64'), 32, {
    N: enc.N,
    r: enc.r,
    p: enc.p,
    maxmem: 256 * enc.N * enc.r,
  });
}

export function encrypt(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(key: Buffer, data: Buffer): Buffer {
  if (!data.subarray(0, 4).equals(MAGIC)) throw new Error('not encrypted');
  const iv = data.subarray(4, 16);
  const tag = data.subarray(16, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}

export async function newEncryption(passphrase: string): Promise<{ encryption: FolderEncryption; key: Buffer }> {
  const params = { salt: randomBytes(16).toString('base64'), N: 2 ** 15, r: 8, p: 1 };
  const key = await deriveKey(passphrase, params);
  return {
    encryption: { cipher: 'aes-256-gcm', kdf: 'scrypt', ...params, check: encrypt(key, Buffer.from(CHECK_TEXT)).toString('base64') },
    key,
  };
}

export function keyMatches(key: Buffer, enc: FolderEncryption): boolean {
  try {
    return decrypt(key, Buffer.from(enc.check, 'base64')).toString() === CHECK_TEXT;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Manifesti                                                           */
/* ------------------------------------------------------------------ */

export interface FolderManifest {
  format: 'persona.sync';
  version: 1;
  syncId: string;
  createdAt: string;
  encryption: FolderEncryption | null;
}

export interface DeviceManifest {
  format: 'persona.sync.device';
  version: 1;
  device: string;
  name: string;
  lastSeq: number;
  updatedAt: string;
  schema: number;
  appVersion: string;
}

/** Scrittura atomica: file temporaneo nella stessa cartella, poi rinomina. */
export async function writeFileAtomic(file: string, data: Buffer | string): Promise<void> {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, data);
  try {
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(raw) as T;
}

export async function readFolderManifest(root: string): Promise<FolderManifest | null> {
  const m = await readJson<FolderManifest>(join(root, FOLDER_MANIFEST));
  if (!m) return null;
  if (m.format !== 'persona.sync' || typeof m.syncId !== 'string') throw new Error('invalid manifest');
  return m;
}

export async function writeFolderManifest(root: string, manifest: FolderManifest): Promise<void> {
  await writeFileAtomic(join(root, FOLDER_MANIFEST), JSON.stringify(manifest, null, 2));
}

export const deviceDir = (root: string, deviceId: string) => join(root, DEVICES_DIR, deviceId);

export async function readDeviceManifest(root: string, deviceId: string): Promise<DeviceManifest | null> {
  try {
    const m = await readJson<DeviceManifest>(join(deviceDir(root, deviceId), DEVICE_MANIFEST));
    return m && m.format === 'persona.sync.device' ? m : null;
  } catch {
    return null; // file ancora in scaricamento o danneggiato: solo informativo
  }
}

export async function writeDeviceManifest(root: string, manifest: DeviceManifest): Promise<void> {
  const dir = deviceDir(root, manifest.device);
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(join(dir, DEVICE_MANIFEST), JSON.stringify(manifest, null, 2));
}

/** Dispositivi presenti nella cartella. */
export async function listDevices(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, DEVICES_DIR), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && DEVICE_RE.test(e.name)).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Blocchi di modifiche                                                */
/* ------------------------------------------------------------------ */

/** Una riga: versione (at, dev) e colonne, oppure lapide (`del`). */
export interface SyncRecord {
  t: string;
  id: string;
  at: number;
  dev: string;
  del?: 1;
  d?: Record<string, unknown>;
}

export interface Segment {
  format: 'persona.sync.segment';
  version: 1;
  device: string;
  seq: number;
  createdAt: string;
  /** Versione dello schema del database (numero di migrazioni). */
  schema: number;
  appVersion: string;
  /** Inizio di un'istantanea completa: i blocchi precedenti non servono più. */
  snapshot: boolean;
  records: SyncRecord[];
}

export interface SegmentFile {
  seq: number;
  file: string;
  size: number;
}

export const segmentName = (seq: number) => `${String(seq).padStart(10, '0')}.pseg`;

export async function listSegments(dir: string): Promise<SegmentFile[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: SegmentFile[] = [];
  for (const name of names) {
    const m = SEGMENT_RE.exec(name);
    if (!m) continue;
    const file = join(dir, name);
    const size = await stat(file).then((s) => s.size, () => -1);
    if (size >= 0) out.push({ seq: Number(m[1]), file, size });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

export async function writeSegment(dir: string, segment: Segment, key: Buffer | null): Promise<number> {
  await mkdir(dir, { recursive: true });
  let data: Buffer = await gzip(Buffer.from(JSON.stringify(segment)));
  if (key) data = encrypt(key, data);
  await writeFileAtomic(join(dir, segmentName(segment.seq)), data);
  return data.length;
}

export class SegmentError extends Error {
  constructor(
    public readonly reason: 'unreadable' | 'locked',
    message: string,
  ) {
    super(message);
  }
}

export async function readSegment(file: string, key: Buffer | null): Promise<Segment> {
  let data: Buffer;
  try {
    data = Buffer.from(await readFile(file));
  } catch (err) {
    throw new SegmentError('unreadable', (err as Error).message);
  }
  if (data.subarray(0, 4).equals(MAGIC)) {
    if (!key) throw new SegmentError('locked', 'Blocco cifrato senza chiave');
    try {
      data = Buffer.from(decrypt(key, data));
    } catch (err) {
      throw new SegmentError('unreadable', (err as Error).message);
    }
  }
  try {
    const seg = JSON.parse((await gunzip(data)).toString('utf8')) as Segment;
    if (seg.format !== 'persona.sync.segment' || !Array.isArray(seg.records)) throw new Error('invalid segment');
    return seg;
  } catch (err) {
    // Spesso è un file non ancora scaricato del tutto dal client cloud: si riprova la volta dopo.
    throw new SegmentError('unreadable', (err as Error).message);
  }
}

export async function removeFile(file: string): Promise<void> {
  await rm(file, { force: true });
}
