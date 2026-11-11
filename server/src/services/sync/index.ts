/**
 * Sincronizzazione tra dispositivi attraverso una cartella di un servizio cloud (Google Drive per
 * desktop, Dropbox, OneDrive, iCloud Drive, Nextcloud, Syncthing…). PERSONA resta local-first:
 * nessun account, nessuna chiave di servizi esterni; il client cloud del sistema trasporta i file.
 *
 * Un giro di sincronizzazione:
 *  1. legge i nuovi blocchi degli altri dispositivi (e i propri non ancora noti, dopo un ripristino);
 *  2. li applica al database in un'unica transazione (merge.ts: vince la modifica più recente);
 *  3. scrive le modifiche locali in un nuovo blocco nella propria sottocartella;
 *  4. ogni tanto compatta i propri blocchi in un'istantanea completa.
 */
import type { ErrorCode, SyncDevice, SyncPeerBlock, SyncRunResult, SyncStatus } from '@persona/shared';
import { syncConfigSchema, type SyncConfigInput } from '@persona/shared';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { AppContext } from '../../context.js';
import { AppError, nowIso, parseJson, validate } from '../../lib/util.js';
import { scheduleIndexing } from '../embeddings.js';
import { getPreferences, updatePreferences } from '../preferences.js';
import {
  type DeviceManifest,
  deriveKey,
  deviceDir,
  type FolderManifest,
  keyMatches,
  listDevices,
  listSegments,
  newEncryption,
  readDeviceManifest,
  readFolderManifest,
  readSegment,
  removeFile,
  type Segment,
  type SyncRecord,
  writeDeviceManifest,
  writeFolderManifest,
  writeSegment,
} from './format.js';
import {
  applyRecords,
  backfillVersions,
  collectDirty,
  collectSnapshot,
  countDirty,
  countPending,
  discardInitialData,
  isPristine,
  markSent,
  resetForNewFolder,
} from './merge.js';

export const syncTuning = {
  /** Dopo quanti blocchi propri si scrive un'istantanea completa e si eliminano i precedenti. */
  compactAfter: 100,
};
/** Dimensione indicativa (JSON non compresso) di un blocco. */
const SEGMENT_BYTES = 4 * 1024 * 1024;
/** Primo giro dopo l'avvio. */
const STARTUP_DELAY_MS = 10_000;

interface MetaRow {
  device_id: string;
  device_name: string | null;
  bound_to: string | null;
  folder: string | null;
  enabled: number;
  interval_minutes: number;
  sync_set_id: string | null;
  encryption_key: string | null;
  last_seq: number;
  last_sync_at: string | null;
  last_error: string | null;
  last_result: string | null;
  last_import_at: string | null;
}

interface PeerRow {
  device_id: string;
  name: string | null;
  app_version: string | null;
  applied_seq: number;
  last_seq: number;
  last_seen_at: string | null;
  blocked: SyncPeerBlock | null;
}

interface Runtime {
  timer: NodeJS.Timeout | null;
  running: Promise<SyncRunResult> | null;
  /** Coda: giri, cambi di configurazione e ripristini non si sovrappongono mai. */
  lock: Promise<unknown>;
  stopped: boolean;
}

const runtimes = new WeakMap<AppContext, Runtime>();
function runtime(ctx: AppContext): Runtime {
  let rt = runtimes.get(ctx);
  if (!rt) runtimes.set(ctx, (rt = { timer: null, running: null, lock: Promise.resolve(), stopped: false }));
  return rt;
}

function exclusive<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const rt = runtime(ctx);
  const next = rt.lock.then(fn, fn);
  rt.lock = next.catch(() => undefined);
  return next;
}

function readMeta(ctx: AppContext): MetaRow {
  return ctx.dbm.sqlite.prepare('SELECT * FROM sync_meta WHERE id = 1').get() as MetaRow;
}

function updateMeta(ctx: AppContext, patch: Partial<MetaRow>): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  ctx.dbm.sqlite.prepare(`UPDATE sync_meta SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = 1`).run(patch);
}

const newDeviceId = () => randomUUID().replace(/-/g, '');

/* ------------------------------------------------------------------ */
/* Identità del dispositivo                                            */
/* ------------------------------------------------------------------ */

/** Impronta di computer + percorso del database. */
function fingerprint(ctx: AppContext): string {
  return createHash('sha256').update(`${hostname()}\u0000${resolve(ctx.dbm.file)}`).digest('hex').slice(0, 32);
}

/**
 * Se il database è stato copiato da un altro computer (o spostato), il dispositivo prende una
 * nuova identità: due copie non devono mai scrivere nella stessa sottocartella. Le modifiche già
 * pubblicate con l'identità precedente restano come quelle di un altro dispositivo.
 */
export function checkDeviceBinding(ctx: AppContext): boolean {
  const meta = readMeta(ctx);
  const fp = fingerprint(ctx);
  if (meta.bound_to === fp) return false;
  if (meta.bound_to === null) {
    updateMeta(ctx, { bound_to: fp });
    return false;
  }
  const sqlite = ctx.dbm.sqlite;
  sqlite.transaction(() => {
    if (meta.last_seq > 0) {
      sqlite
        .prepare('INSERT OR REPLACE INTO sync_peers (device_id, name, applied_seq, last_seq) VALUES (?, ?, ?, ?)')
        .run(meta.device_id, meta.device_name, meta.last_seq, meta.last_seq);
    }
    updateMeta(ctx, { device_id: newDeviceId(), bound_to: fp, last_seq: 0 });
  })();
  return true;
}

/* ------------------------------------------------------------------ */
/* Stato e configurazione                                              */
/* ------------------------------------------------------------------ */

const defaultName = () => hostname() || 'PERSONA';

export function getSyncStatus(ctx: AppContext): SyncStatus {
  const meta = readMeta(ctx);
  const sqlite = ctx.dbm.sqlite;
  const peers = sqlite.prepare('SELECT * FROM sync_peers ORDER BY last_seen_at DESC').all() as PeerRow[];
  const self: SyncDevice = {
    id: meta.device_id,
    name: meta.device_name || defaultName(),
    self: true,
    appVersion: ctx.config.version,
    lastSeq: meta.last_seq,
    appliedSeq: meta.last_seq,
    lastSeenAt: meta.last_sync_at,
    blocked: null,
  };
  return {
    configured: !!meta.folder,
    enabled: !!meta.folder && !!meta.enabled,
    folder: meta.folder,
    deviceId: meta.device_id,
    deviceName: self.name,
    intervalMinutes: meta.interval_minutes,
    encrypted: !!meta.encryption_key,
    running: !!runtime(ctx).running,
    lastSyncAt: meta.last_sync_at,
    lastError: parseJson<{ code: ErrorCode; message: string } | null>(meta.last_error, null),
    lastResult: parseJson<SyncRunResult | null>(meta.last_result, null),
    lastImportAt: meta.last_import_at,
    unsent: countDirty(sqlite),
    pending: countPending(sqlite),
    devices: [
      self,
      ...peers.map((p) => ({
        id: p.device_id,
        name: p.name || p.device_id.slice(0, 8),
        self: false,
        appVersion: p.app_version,
        lastSeq: p.last_seq,
        appliedSeq: p.applied_seq,
        lastSeenAt: p.last_seen_at,
        blocked: p.blocked,
      })),
    ],
  };
}

const folderError = (reason: string, message: string) => new AppError('sync_folder', message, 409, { reason });
const passphraseError = (reason: 'required' | 'invalid' | 'unexpected', message: string) =>
  new AppError('sync_passphrase', message, 409, { reason });

/** Crea la cartella se manca (solo l'ultimo livello) e verifica che sia scrivibile. */
async function prepareFolder(root: string): Promise<void> {
  const parent = dirname(root);
  const parentOk = await stat(parent).then((s) => s.isDirectory(), () => false);
  if (!parentOk) throw folderError('unreachable', `Cartella non raggiungibile: ${parent}`);
  await mkdir(root, { recursive: false }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EEXIST') throw folderError('unwritable', `Impossibile creare ${root}: ${err.message}`);
  });
  const isDir = await stat(root).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw folderError('not_directory', `Non è una cartella: ${root}`);
  const probe = join(root, `.persona-write-test-${process.pid}`);
  try {
    await writeFile(probe, 'ok');
    await rm(probe, { force: true });
  } catch (err) {
    throw folderError('unwritable', `Impossibile scrivere in ${root}: ${(err as Error).message}`);
  }
}

async function readManifestSafe(root: string): Promise<FolderManifest | null> {
  try {
    return await readFolderManifest(root);
  } catch {
    throw folderError('invalid_manifest', `persona-sync.json non valido in ${root}`);
  }
}

/** Collega, scollega o modifica la sincronizzazione. */
export async function updateSyncConfig(ctx: AppContext, input: SyncConfigInput): Promise<SyncStatus> {
  const data = validate(syncConfigSchema, input);
  const rt = runtime(ctx);
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  try {
    return await exclusive(ctx, () => applyConfig(ctx, data));
  } finally {
    if (!rt.timer) reschedule(ctx);
  }
}

async function applyConfig(ctx: AppContext, data: SyncConfigInput): Promise<SyncStatus> {
  const meta = readMeta(ctx);
  const patch: Partial<MetaRow> = {};

  if (data.folder === null) {
    Object.assign(patch, { folder: null, enabled: 0, encryption_key: null, last_error: null });
  } else if (data.folder !== undefined || (data.passphrase !== undefined && meta.folder)) {
    const raw = data.folder ?? meta.folder!;
    if (!isAbsolute(raw)) throw folderError('not_absolute', 'Indicare il percorso completo della cartella');
    const root = resolve(raw);
    await prepareFolder(root);
    let manifest = await readManifestSafe(root);
    let key: Buffer | null = null;
    if (!manifest) {
      // Prima volta: questo dispositivo crea la cartella condivisa.
      let encryption: FolderManifest['encryption'] = null;
      if (data.passphrase) {
        const made = await newEncryption(data.passphrase);
        encryption = made.encryption;
        key = made.key;
      }
      manifest = { format: 'persona.sync', version: 1, syncId: randomUUID(), createdAt: nowIso(), encryption };
      await writeFolderManifest(root, manifest);
    } else if (manifest.encryption) {
      if (data.passphrase) {
        key = await deriveKey(data.passphrase, manifest.encryption);
        if (!keyMatches(key, manifest.encryption)) throw passphraseError('invalid', 'Passphrase errata per questa cartella');
      } else {
        const stored = manifest.syncId === meta.sync_set_id && meta.encryption_key ? Buffer.from(meta.encryption_key, 'base64') : null;
        if (!stored || !keyMatches(stored, manifest.encryption)) {
          throw passphraseError('required', 'La cartella è cifrata: inserire la passphrase usata sugli altri dispositivi');
        }
        key = stored;
      }
    } else if (data.passphrase) {
      throw passphraseError('unexpected', 'La cartella esiste già senza cifratura: lasciare vuota la passphrase');
    }
    if (manifest.syncId !== meta.sync_set_id) resetForNewFolder(ctx.dbm.sqlite);
    Object.assign(patch, {
      folder: root,
      sync_set_id: manifest.syncId,
      encryption_key: key ? key.toString('base64') : null,
      enabled: data.enabled === false ? 0 : 1,
      last_error: null,
    });
  }
  if (data.deviceName !== undefined) patch.device_name = data.deviceName;
  if (data.intervalMinutes !== undefined) patch.interval_minutes = data.intervalMinutes;
  if (data.enabled !== undefined && data.folder === undefined) {
    if (data.enabled && !meta.folder && !patch.folder) throw new AppError('sync_not_configured', 'Scegliere prima una cartella', 409);
    patch.enabled = data.enabled ? 1 : 0;
  }
  updateMeta(ctx, patch);
  const next = readMeta(ctx);
  // Appena collegata (o riattivata), un primo giro a breve.
  const justEnabled = !!next.folder && !!next.enabled && (!meta.enabled || meta.folder !== next.folder);
  reschedule(ctx, justEnabled ? 1500 : undefined);
  return getSyncStatus(ctx);
}

/* ------------------------------------------------------------------ */
/* Giro di sincronizzazione                                            */
/* ------------------------------------------------------------------ */

async function openFolder(ctx: AppContext, meta: MetaRow): Promise<{ root: string; key: Buffer | null }> {
  const root = meta.folder!;
  const ok = await stat(root).then((s) => s.isDirectory(), () => false);
  if (!ok) throw folderError('unreachable', `Cartella di sincronizzazione non raggiungibile: ${root}`);
  const manifest = await readManifestSafe(root);
  if (!manifest) throw folderError('missing_manifest', `In ${root} manca persona-sync.json (cartella non ancora sincronizzata dal servizio cloud?)`);
  if (manifest.syncId !== meta.sync_set_id) throw folderError('changed', 'La cartella condivisa è cambiata: collegarla di nuovo dalle Impostazioni');
  if (!manifest.encryption) return { root, key: null };
  const key = meta.encryption_key ? Buffer.from(meta.encryption_key, 'base64') : null;
  if (!key) throw passphraseError('required', 'La cartella è cifrata: inserire la passphrase');
  if (!keyMatches(key, manifest.encryption)) throw passphraseError('invalid', 'La passphrase salvata non apre più questa cartella');
  return { root, key };
}

interface PeerRead {
  id: string;
  manifest: DeviceManifest | null;
  appliedSeq: number;
  blocked: SyncPeerBlock | null;
}

/** Legge i blocchi successivi a `from` di un dispositivo, fermandosi al primo buco o errore. */
async function readNewSegments(
  dir: string,
  from: number,
  key: Buffer | null,
  schema: number,
  into: SyncRecord[],
): Promise<{ applied: number; blocked: SyncPeerBlock | null }> {
  let cursor = from;
  for (const seg of await listSegments(dir)) {
    if (seg.seq <= cursor) continue;
    let s: Segment;
    try {
      s = await readSegment(seg.file, key);
    } catch {
      // Cifrato senza chiave, danneggiato o non ancora scaricato del tutto: si riprova al giro dopo.
      return { applied: cursor, blocked: 'unreadable' };
    }
    if (s.schema > schema) return { applied: cursor, blocked: 'newer_version' };
    // Un buco è accettabile solo se il blocco è l'inizio di un'istantanea completa.
    if (seg.seq !== cursor + 1 && !s.snapshot) return { applied: cursor, blocked: 'gap' };
    for (const r of s.records) into.push(r);
    cursor = seg.seq;
  }
  return { applied: cursor, blocked: null };
}

function chunkRecords(records: SyncRecord[]): SyncRecord[][] {
  const chunks: SyncRecord[][] = [];
  let current: SyncRecord[] = [];
  let size = 0;
  for (const r of records) {
    const n = JSON.stringify(r).length;
    if (current.length > 0 && size + n > SEGMENT_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(r);
    size += n;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function doRun(ctx: AppContext): Promise<SyncRunResult> {
  const started = Date.now();
  const forked = checkDeviceBinding(ctx);
  let meta = readMeta(ctx);
  if (!meta.folder) throw new AppError('sync_not_configured', 'Sincronizzazione non configurata', 409);
  try {
    const { root, key } = await openFolder(ctx, meta);
    const schema = ctx.dbm.schemaVersion();
    const appVersion = ctx.config.version;
    const ownDir = deviceDir(root, meta.device_id);

    // 1. Lettura: blocchi propri sconosciuti al database (ripristino, interruzione) e degli altri.
    const incoming: SyncRecord[] = [];
    const own = await readNewSegments(ownDir, meta.last_seq, key, Number.MAX_SAFE_INTEGER, incoming);
    const ownSegments = await listSegments(ownDir);
    const ownMax = ownSegments.at(-1)?.seq ?? 0;
    const peerRows = new Map(
      (ctx.dbm.sqlite.prepare('SELECT * FROM sync_peers').all() as PeerRow[]).map((p) => [p.device_id, p]),
    );
    const peers: PeerRead[] = [];
    for (const id of await listDevices(root)) {
      if (id === meta.device_id) continue;
      const before = peerRows.get(id)?.applied_seq ?? 0;
      const r = await readNewSegments(deviceDir(root, id), before, key, schema, incoming);
      peers.push({ id, manifest: await readDeviceManifest(root, id), appliedSeq: r.applied, blocked: r.blocked });
    }

    // 2. Unione, in un'unica transazione.
    const sqlite = ctx.dbm.sqlite;
    let adopted = false;
    let discarded: { projects: string[]; models: string[] } = { projects: [], models: [] };
    const failures: string[] = [];
    const stats = sqlite.transaction(() => {
      if (meta.last_seq === 0 && ownMax === 0 && incoming.length > 0 && isPristine(sqlite)) {
        discarded = discardInitialData(sqlite);
        adopted = true;
      }
      backfillVersions(sqlite, meta.device_id);
      const st = applyRecords(sqlite, incoming, (err, r) => failures.push(`${r.t}/${r.id}: ${(err as Error).message}`));
      const upsertPeer = sqlite.prepare(
        `INSERT INTO sync_peers (device_id, name, app_version, applied_seq, last_seq, last_seen_at, blocked)
         VALUES (@device_id, @name, @app_version, @applied_seq, @last_seq, @last_seen_at, @blocked)
         ON CONFLICT(device_id) DO UPDATE SET name = coalesce(excluded.name, name), app_version = coalesce(excluded.app_version, app_version),
           applied_seq = excluded.applied_seq, last_seq = max(excluded.last_seq, last_seq),
           last_seen_at = coalesce(excluded.last_seen_at, last_seen_at), blocked = excluded.blocked`,
      );
      for (const p of peers) {
        upsertPeer.run({
          device_id: p.id,
          name: p.manifest?.name ?? null,
          app_version: p.manifest?.appVersion ?? null,
          applied_seq: p.appliedSeq,
          last_seq: Math.max(p.manifest?.lastSeq ?? 0, p.appliedSeq),
          last_seen_at: p.manifest?.updatedAt ?? null,
          blocked: p.blocked,
        });
      }
      return st;
    })();
    if (failures.length > 0) ctx.log.warn({ failures: failures.slice(0, 20) }, 'sync: righe non applicate');
    if (adopted) afterAdopt(ctx, discarded);
    if (stats.received > 0 || adopted) {
      ensureLocalDefaultModel(ctx);
      updateMeta(ctx, { last_import_at: nowIso() });
      scheduleIndexing(ctx);
    }

    // 3. Invio delle modifiche locali.
    meta = readMeta(ctx);
    let seq = Math.max(meta.last_seq, ownMax, own.applied);
    const dirty = collectDirty(sqlite);
    const segmentBase = { format: 'persona.sync.segment', version: 1, device: meta.device_id, schema, appVersion } as const;
    for (const chunk of chunkRecords(dirty)) {
      seq++;
      await writeSegment(ownDir, { ...segmentBase, seq, createdAt: nowIso(), snapshot: false, records: chunk }, key);
    }
    markSent(sqlite, dirty);
    const published = seq !== meta.last_seq;
    updateMeta(ctx, { last_seq: seq });

    // 4. Compattazione: un'istantanea completa sostituisce i blocchi propri accumulati.
    let compacted = false;
    const segmentsNow = await listSegments(ownDir);
    if (segmentsNow.length > syncTuning.compactAfter) {
      const chunks = chunkRecords(collectSnapshot(sqlite));
      const first = seq + 1;
      for (const [i, chunk] of chunks.entries()) {
        seq++;
        await writeSegment(ownDir, { ...segmentBase, seq, createdAt: nowIso(), snapshot: i === 0, records: chunk }, key);
      }
      updateMeta(ctx, { last_seq: seq });
      for (const s of segmentsNow) if (s.seq < first) await removeFile(s.file);
      compacted = true;
    }

    // 5. Scheda del dispositivo (solo se cambia qualcosa: niente scritture inutili nel cloud).
    const name = meta.device_name || defaultName();
    const existing = await readDeviceManifest(root, meta.device_id);
    if (published || compacted || !existing || existing.name !== name || existing.appVersion !== appVersion || existing.schema !== schema) {
      await writeDeviceManifest(root, {
        format: 'persona.sync.device',
        version: 1,
        device: meta.device_id,
        name,
        lastSeq: seq,
        updatedAt: nowIso(),
        schema,
        appVersion,
      });
    }

    const result: SyncRunResult = {
      at: nowIso(),
      durationMs: Date.now() - started,
      sent: dirty.length,
      received: stats.received,
      pending: stats.pending,
      skipped: stats.skipped,
      adopted,
      forked,
      compacted,
    };
    updateMeta(ctx, { last_sync_at: result.at, last_result: JSON.stringify(result), last_error: null });
    return result;
  } catch (err) {
    const e = err instanceof AppError ? { code: err.code, message: err.message } : { code: 'internal' as ErrorCode, message: (err as Error).message };
    updateMeta(ctx, { last_error: JSON.stringify(e), last_sync_at: nowIso() });
    throw err;
  }
}

/** Dopo aver scartato le configurazioni iniziali: le preferenze non devono puntare a righe eliminate. */
function afterAdopt(ctx: AppContext, discarded: { projects: string[]; models: string[] }): void {
  const prefs = getPreferences(ctx);
  const patch: { activeProjectId?: null; defaultModelConfigId?: null } = {};
  if (prefs.activeProjectId && discarded.projects.includes(prefs.activeProjectId)) patch.activeProjectId = null;
  if (prefs.defaultModelConfigId && discarded.models.includes(prefs.defaultModelConfigId)) patch.defaultModelConfigId = null;
  if (Object.keys(patch).length > 0) updatePreferences(ctx, patch);
}

/**
 * La configurazione predefinita è del dispositivo (non si sincronizza): se manca, o punta a una
 * configurazione eliminata altrove, si sceglie la più vecchia.
 */
export function ensureLocalDefaultModel(ctx: AppContext): void {
  const sqlite = ctx.dbm.sqlite;
  const prefs = getPreferences(ctx);
  if (prefs.defaultModelConfigId && !sqlite.prepare('SELECT 1 FROM model_configurations WHERE id = ?').get(prefs.defaultModelConfigId)) {
    updatePreferences(ctx, { defaultModelConfigId: null });
  }
  const hasDefault = sqlite.prepare('SELECT 1 FROM model_configurations WHERE is_default = 1').get();
  if (hasDefault) return;
  const first = sqlite.prepare('SELECT id FROM model_configurations ORDER BY created_at LIMIT 1').get() as { id: string } | undefined;
  if (first) sqlite.prepare('UPDATE model_configurations SET is_default = 1 WHERE id = ?').run(first.id);
}

/** Esegue un giro (o restituisce quello già in corso). */
export function runSync(ctx: AppContext): Promise<SyncRunResult> {
  const rt = runtime(ctx);
  if (rt.running) return rt.running;
  const task = exclusive(ctx, () => doRun(ctx)).finally(() => {
    if (rt.running === task) rt.running = null;
  });
  rt.running = task;
  return task;
}

/** Attende la fine delle operazioni in corso (giro, cambio di configurazione, ripristino). */
export async function waitIdle(ctx: AppContext): Promise<void> {
  await runtime(ctx).lock;
}

/* ------------------------------------------------------------------ */
/* Pianificazione                                                      */
/* ------------------------------------------------------------------ */

function reschedule(ctx: AppContext, delayMs?: number): void {
  const rt = runtime(ctx);
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  if (rt.stopped) return;
  const meta = readMeta(ctx);
  if (!meta.folder || !meta.enabled || meta.interval_minutes <= 0) return;
  rt.timer = setTimeout(() => {
    rt.timer = null;
    runSync(ctx)
      .catch((err: unknown) => ctx.log.warn({ err: (err as Error).message }, 'sync failed'))
      .finally(() => reschedule(ctx));
  }, delayMs ?? meta.interval_minutes * 60_000);
  rt.timer.unref();
}

/** All'avvio: verifica l'identità del dispositivo e pianifica il primo giro. */
export function startSyncScheduler(ctx: AppContext): void {
  checkDeviceBinding(ctx);
  reschedule(ctx, STARTUP_DELAY_MS);
}

/** Allo spegnimento: ferma i giri automatici e invia le ultime modifiche (al massimo qualche secondo). */
export async function stopSyncScheduler(ctx: AppContext, flushTimeoutMs = 8000): Promise<void> {
  const rt = runtime(ctx);
  rt.stopped = true;
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  await waitIdle(ctx);
  const meta = readMeta(ctx);
  if (!meta.folder || !meta.enabled || countDirty(ctx.dbm.sqlite) === 0) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    runSync(ctx).catch((err: unknown) => ctx.log.warn({ err: (err as Error).message }, 'sync on shutdown failed')),
    new Promise((r) => {
      timer = setTimeout(r, flushTimeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

/** Ripristino del database: il giro in corso deve finire, poi si riparte con lo stato ripristinato. */
export async function pauseForRestore<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const rt = runtime(ctx);
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  try {
    return await exclusive(ctx, fn);
  } finally {
    checkDeviceBinding(ctx);
    reschedule(ctx);
  }
}
