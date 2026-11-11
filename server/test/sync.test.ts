import type { Character, Memory, ModelConfig, ProjectSummary, ScenarioDetail, SyncStatus } from '@persona/shared';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { settleBackground } from '../src/context.js';
import { NOT_SYNCED, SYNC_TABLE_NAMES } from '../src/db/sync-triggers.js';
import { readSegment, writeSegment } from '../src/services/sync/format.js';
import { detectSyncFolders } from '../src/services/sync/folders.js';
import { syncTuning } from '../src/services/sync/index.js';
import { createCharacter, createTestEnv, type TestEnv } from './helpers.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
  syncTuning.compactAfter = 100;
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Cartella "cloud" condivisa (come se fosse sincronizzata da Google Drive). */
function cloudFolder(): string {
  return join(tempDir('persona-cloud-'), 'PERSONA');
}

async function device(opts: { dir?: string } = {}): Promise<TestEnv> {
  const env = await createTestEnv(opts);
  cleanup.push(() => env.close());
  await env.app.inject({ method: 'PUT', url: '/api/preferences', payload: { memory: { autoProcess: false } } });
  return env;
}

const call = async <T = unknown>(env: TestEnv, method: string, url: string, payload?: unknown) => {
  const res = await env.app.inject({ method: method as 'GET', url, payload: payload as never });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
};

async function connect(env: TestEnv, folder: string, extra: Record<string, unknown> = {}): Promise<SyncStatus> {
  const res = await call<SyncStatus>(env, 'PUT', '/api/sync', { folder, intervalMinutes: 0, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

async function syncNow(env: TestEnv): Promise<SyncStatus> {
  const res = await call<SyncStatus>(env, 'POST', '/api/sync/run');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

const getCharacter = (env: TestEnv, id: string) => call<Character>(env, 'GET', `/api/characters/${id}`);

/** Testo di tutti i blocchi presenti nella cartella (decompressi). */
function folderText(folder: string): string {
  let out = '';
  for (const dev of readdirSync(join(folder, 'devices'))) {
    for (const f of readdirSync(join(folder, 'devices', dev))) {
      const raw = readFileSync(join(folder, 'devices', dev, f));
      out += f.endsWith('.pseg') ? (raw.subarray(0, 4).toString() === 'PSE1' ? raw.toString('latin1') : gunzipSync(raw).toString()) : raw.toString();
    }
  }
  return out;
}

describe('sync between devices through a cloud folder', () => {
  it('shares characters, memories, projects and conversations, and never copies the database file', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const irina = await createCharacter(a);
    await call(a, 'POST', '/api/memories', { characterId: irina.id, category: 'core', content: 'Ha visto la cometa a nove anni' });
    const project = (await call<{ id: string }>(a, 'POST', '/api/projects', { name: 'Osservatorio' })).body;
    await call(a, 'POST', `/api/projects/${project.id}/characters`, { characterId: irina.id });
    const conv = (await call<{ id: string }>(a, 'POST', '/api/conversations', { kind: 'lab', characterId: irina.id })).body;
    await a.app.inject({ method: 'POST', url: `/api/conversations/${conv.id}/messages`, payload: { content: 'Buonasera, dottoressa' } });
    await settleBackground(a.ctx);

    await connect(a, folder);
    const first = await syncNow(a);
    expect(first.lastResult!.sent).toBeGreaterThan(10);
    expect(existsSync(join(folder, 'persona-sync.json'))).toBe(true);
    expect(readdirSync(folder).some((f) => f.endsWith('.db'))).toBe(false);

    await connect(b, folder);
    const got = await syncNow(b);
    expect(got.lastResult!.received).toBeGreaterThan(10);
    expect(got.lastImportAt).not.toBeNull();
    expect(got.devices.map((d) => d.id)).toContain(first.deviceId);

    const onB = await getCharacter(b, irina.id);
    expect(onB.status).toBe(200);
    expect(onB.body.name).toBe('Irina Volkova');
    expect(onB.body.traits).toHaveLength(3);
    const memories = (await call<{ items: Memory[] }>(b, 'GET', `/api/memories?characterId=${irina.id}`)).body;
    expect(JSON.stringify(memories)).toContain('cometa');
    const projectsOnB = (await call<ProjectSummary[]>(b, 'GET', '/api/projects')).body;
    expect(projectsOnB.find((p) => p.id === project.id)?.characterCount).toBe(1);
    const messages = (await call<{ messages: { content: string }[] }>(b, 'GET', `/api/conversations/${conv.id}`)).body;
    expect(JSON.stringify(messages)).toContain('Buonasera, dottoressa');
  });

  it('carries edits back and forth, keeps the identity history and propagates deletions', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const c = await createCharacter(a);
    await connect(a, folder);
    await syncNow(a);
    await connect(b, folder);
    await syncNow(b);

    const current = (await getCharacter(b, c.id)).body;
    const edited = await call<Character>(b, 'PUT', `/api/characters/${c.id}`, { ...current, occupation: 'Direttrice di osservatorio' });
    expect(edited.status).toBe(200);
    await syncNow(b);
    await syncNow(a);
    const onA = (await getCharacter(a, c.id)).body;
    expect(onA.occupation).toBe('Direttrice di osservatorio');
    expect(onA.identityVersion).toBe(edited.body.identityVersion);
    const revisions = (await call<unknown[]>(a, 'GET', `/api/characters/${c.id}/revisions`)).body;
    expect(revisions.length).toBeGreaterThanOrEqual(1);

    // Nessuna modifica in sospeso dopo aver applicato quelle ricevute (niente rimbalzi).
    expect((await syncNow(a)).lastResult!.sent).toBe(0);

    expect((await call(a, 'DELETE', `/api/characters/${c.id}`)).status).toBe(204);
    await syncNow(a);
    await syncNow(b);
    expect((await getCharacter(b, c.id)).status).toBe(404);
    const orphan = b.ctx.dbm.sqlite.prepare('SELECT count(*) AS n FROM character_traits WHERE character_id = ?').get(c.id) as { n: number };
    expect(orphan.n).toBe(0);
  });

  it('resolves concurrent edits with the most recent one, everywhere', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const c = await createCharacter(a);
    await connect(a, folder);
    await syncNow(a);
    await connect(b, folder);
    await syncNow(b);

    const base = (await getCharacter(a, c.id)).body;
    await call(a, 'PUT', `/api/characters/${c.id}`, { ...base, humor: 'Prima versione' });
    await new Promise((r) => setTimeout(r, 15));
    await call(b, 'PUT', `/api/characters/${c.id}`, { ...base, humor: 'Seconda versione' });
    await syncNow(a);
    await syncNow(b);
    await syncNow(a);
    expect((await getCharacter(a, c.id)).body.humor).toBe('Seconda versione');
    expect((await getCharacter(b, c.id)).body.humor).toBe('Seconda versione');
    // Entrambe le modifiche restano nella cronologia dell'identità.
    const count = (env: TestEnv) =>
      (env.ctx.dbm.sqlite.prepare('SELECT count(*) AS n FROM identity_revisions WHERE character_id = ?').get(c.id) as { n: number }).n;
    expect(count(a)).toBe(count(b));
    expect(count(a)).toBeGreaterThanOrEqual(2);
  });

  it('converges when the same character joins the same project on two devices', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const c = await createCharacter(a);
    const p = (await call<{ id: string }>(a, 'POST', '/api/projects', { name: 'Due dispositivi' })).body;
    await connect(a, folder);
    await syncNow(a);
    await connect(b, folder);
    await syncNow(b);

    await call(a, 'POST', `/api/projects/${p.id}/characters`, { characterId: c.id });
    await call(b, 'POST', `/api/projects/${p.id}/characters`, { characterId: c.id });
    await syncNow(a);
    await syncNow(b);
    await syncNow(a);
    const rows = (env: TestEnv) =>
      env.ctx.dbm.sqlite.prepare('SELECT id FROM project_characters WHERE project_id = ? AND character_id = ?').all(p.id, c.id) as { id: string }[];
    expect(rows(a)).toHaveLength(1);
    expect(rows(b)).toEqual(rows(a));
  });

  it('keeps rows whose parent has not arrived yet and applies them later', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const c = await device();
    const p = (await call<{ id: string }>(a, 'POST', '/api/projects', { name: 'Arriva dopo' })).body;
    const statusA = await connect(a, folder);
    await syncNow(a);
    await connect(b, folder);
    await syncNow(b);
    const scenario = (await call<ScenarioDetail>(b, 'POST', '/api/scenarios', { title: 'Notte al telescopio', projectId: p.id })).body;
    await syncNow(b);

    // Il servizio cloud non ha ancora scaricato i file del dispositivo A su C.
    const aDir = join(folder, 'devices', statusA.deviceId);
    renameSync(aDir, `${aDir}.hidden`);
    await connect(c, folder);
    const partial = await syncNow(c);
    expect(partial.pending).toBeGreaterThan(0);
    expect((await call(c, 'GET', `/api/scenarios/${scenario.id}`)).status).toBe(404);

    renameSync(`${aDir}.hidden`, aDir);
    const full = await syncNow(c);
    expect(full.pending).toBe(0);
    const s = await call<ScenarioDetail>(c, 'GET', `/api/scenarios/${scenario.id}`);
    expect(s.status).toBe(200);
    expect(s.body.projectId).toBe(p.id);
  });

  it('encrypts the shared folder with a passphrase', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    await createCharacter(a, { name: 'Segretissima Valdés' });
    const st = await connect(a, folder, { passphrase: 'una frase lunga e segreta' });
    expect(st.encrypted).toBe(true);
    await syncNow(a);
    const manifest = readFileSync(join(folder, 'persona-sync.json'), 'utf8');
    expect(manifest).not.toContain('una frase');
    expect(folderText(folder)).not.toContain('Segretissima');

    const missing = await call<{ error: { code: string; details: { reason: string } } }>(b, 'PUT', '/api/sync', { folder, intervalMinutes: 0 });
    expect(missing.status).toBe(409);
    expect(missing.body.error).toMatchObject({ code: 'sync_passphrase', details: { reason: 'required' } });
    const wrong = await call<{ error: { code: string; details: { reason: string } } }>(b, 'PUT', '/api/sync', {
      folder,
      intervalMinutes: 0,
      passphrase: 'passphrase sbagliata',
    });
    expect(wrong.body.error).toMatchObject({ code: 'sync_passphrase', details: { reason: 'invalid' } });

    await connect(b, folder, { passphrase: 'una frase lunga e segreta' });
    await syncNow(b);
    const list = (await call<{ name: string }[]>(b, 'GET', '/api/characters')).body;
    expect(list.map((c) => c.name)).toContain('Segretissima Valdés');
    // La chiave resta sul dispositivo: lo stato non la espone.
    expect(JSON.stringify((await call(b, 'GET', '/api/sync')).body)).not.toMatch(/encryption_?key|frase/i);
  });

  it('keeps API keys, the default engine, embeddings and retrieval statistics on each device', async () => {
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const cfg = (
      await call<ModelConfig>(a, 'POST', '/api/model-configs', {
        name: 'OpenAI',
        providerType: 'openai',
        model: 'gpt-x',
        apiKey: 'sk-segreta-di-A',
      })
    ).body;
    const c = await createCharacter(a);
    const mem = (await call<Memory>(a, 'POST', '/api/memories', { characterId: c.id, category: 'semantic', content: 'Ama il tè nero' })).body;
    await connect(a, folder);
    await syncNow(a);
    expect(folderText(folder)).not.toContain('sk-segreta-di-A');

    await connect(b, folder);
    await syncNow(b);
    const onB = (await call<ModelConfig[]>(b, 'GET', '/api/model-configs')).body.find((m) => m.id === cfg.id)!;
    expect(onB.hasApiKey).toBe(false);
    expect((await call<ModelConfig[]>(b, 'GET', '/api/model-configs')).body.filter((m) => m.isDefault)).toHaveLength(1);
    await call(b, 'PUT', `/api/model-configs/${cfg.id}`, { ...onB, apiKey: 'sk-di-B' });
    b.ctx.dbm.sqlite.prepare(`UPDATE memories SET embedding = 'AAAA', embedding_model = 'm' WHERE id = ?`).run(mem.id);

    // Le statistiche di recupero cambiano a ogni risposta ma non sono modifiche da inviare.
    const dirtyBefore = (await call<SyncStatus>(a, 'GET', '/api/sync')).body.unsent;
    a.ctx.dbm.sqlite.prepare('UPDATE memories SET retrieval_count = retrieval_count + 1 WHERE id = ?').run(mem.id);
    expect((await call<SyncStatus>(a, 'GET', '/api/sync')).body.unsent).toBe(dirtyBefore);

    await call(a, 'PUT', `/api/model-configs/${cfg.id}`, { name: 'OpenAI (lavoro)', providerType: 'openai', model: 'gpt-x' });
    await call(a, 'PUT', `/api/memories/${mem.id}`, { content: 'Ama il tè verde' });
    await syncNow(a);
    await syncNow(b);
    const row = b.ctx.dbm.sqlite.prepare('SELECT name, api_key FROM model_configurations WHERE id = ?').get(cfg.id) as { name: string; api_key: string };
    expect(row).toEqual({ name: 'OpenAI (lavoro)', api_key: 'sk-di-B' });
    const memRow = b.ctx.dbm.sqlite.prepare('SELECT content, embedding FROM memories WHERE id = ?').get(mem.id) as { content: string; embedding: string | null };
    expect(memRow).toEqual({ content: 'Ama il tè verde', embedding: null });
  });

  it('lets a fresh device adopt the shared data instead of duplicating its first-run setup', async () => {
    const folder = cloudFolder();
    const a = await device();
    await createCharacter(a);
    await connect(a, folder);
    await syncNow(a);
    const configsA = (await call<ModelConfig[]>(a, 'GET', '/api/model-configs')).body.map((m) => m.id).sort();
    const projectsA = (await call<ProjectSummary[]>(a, 'GET', '/api/projects')).body.map((p) => p.id).sort();

    // Installazione nuova, così come la crea PERSONA al primo avvio.
    const dir = tempDir('persona-fresh-');
    const fresh = await buildApp({ config: { dataDir: dir, databaseFile: join(dir, 'persona.db'), backupsDir: join(dir, 'backups'), webDistDir: null } });
    cleanup.push(() => fresh.app.close());
    const freshEnv = { app: fresh.app, ctx: fresh.ctx } as TestEnv;
    await connect(freshEnv, folder);
    const st = await syncNow(freshEnv);
    expect(st.lastResult!.adopted).toBe(true);
    const configsB = (await call<ModelConfig[]>(freshEnv, 'GET', '/api/model-configs')).body;
    expect(configsB.map((m) => m.id).sort()).toEqual(configsA);
    expect(configsB.filter((m) => m.isDefault)).toHaveLength(1);
    expect((await call<ProjectSummary[]>(freshEnv, 'GET', '/api/projects')).body.map((p) => p.id).sort()).toEqual(projectsA);

    await syncNow(a);
    expect((await call<ModelConfig[]>(a, 'GET', '/api/model-configs')).body).toHaveLength(configsA.length);
  });

  it('gives a copied database its own device identity', async () => {
    const folder = cloudFolder();
    const a = await device();
    await createCharacter(a);
    const st = await connect(a, folder);
    await syncNow(a);

    const dir = tempDir('persona-copy-');
    await a.ctx.dbm.backupTo(join(dir, 'persona.db'));
    const copy = await device({ dir });
    const copied = (await call<SyncStatus>(copy, 'GET', '/api/sync')).body;
    expect(copied.deviceId).not.toBe(st.deviceId);
    expect(copied.devices.some((d) => d.id === st.deviceId && !d.self)).toBe(true);

    const extra = await createCharacter(copy, { name: 'Nata sulla copia' });
    await syncNow(copy);
    await syncNow(a);
    expect((await getCharacter(a, extra.id)).status).toBe(200);
    expect(readdirSync(join(folder, 'devices')).sort()).toEqual([st.deviceId, copied.deviceId].sort());
  });

  it('waits for devices that run a newer PERSONA', async () => {
    const folder = cloudFolder();
    const a = await device();
    await connect(a, folder);
    const future = 'f'.repeat(32);
    await writeSegment(
      join(folder, 'devices', future),
      {
        format: 'persona.sync.segment',
        version: 1,
        device: future,
        seq: 1,
        createdAt: new Date().toISOString(),
        schema: 999,
        appVersion: '9.0.0',
        snapshot: false,
        records: [{ t: 'projects', id: 'p-futuro', at: Date.now(), dev: future, d: { id: 'p-futuro', name: 'Dal futuro', status: 'active', created_at: 'x', updated_at: 'x' } }],
      },
      null,
    );
    const st = await syncNow(a);
    expect(st.devices.find((d) => d.id === future)?.blocked).toBe('newer_version');
    expect((await call(a, 'GET', '/api/projects/p-futuro')).status).toBe(404);
  });

  it('compacts its change files into a snapshot that new devices start from', async () => {
    syncTuning.compactAfter = 3;
    const folder = cloudFolder();
    const a = await device();
    const b = await device();
    const st = await connect(a, folder);
    await connect(b, folder);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      ids.push((await createCharacter(a, { name: `Personaggio ${i}` })).id);
      await syncNow(a);
    }
    await syncNow(b); // B è arrivato al blocco 2
    for (let i = 2; i < 5; i++) {
      ids.push((await createCharacter(a, { name: `Personaggio ${i}` })).id);
      await syncNow(a);
    }
    const files = readdirSync(join(folder, 'devices', st.deviceId)).filter((f) => f.endsWith('.pseg')).sort();
    expect(files.length).toBeLessThanOrEqual(3);
    const oldest = await readSegment(join(folder, 'devices', st.deviceId, files[0]), null);
    expect(oldest.snapshot).toBe(true);
    expect(oldest.seq).toBeGreaterThan(1);

    const c = await device();
    await connect(c, folder);
    await syncNow(c);
    await syncNow(b);
    for (const id of ids) {
      expect((await getCharacter(c, id)).status).toBe(200);
      expect((await getCharacter(b, id)).status).toBe(200);
    }
  });

  it('sends pending changes when the app closes', async () => {
    const folder = cloudFolder();
    const dir = tempDir('persona-close-');
    const a = await createTestEnv({ dir: join(dir, 'a') });
    const st = await connect(a, folder);
    await createCharacter(a, { name: 'Ultima modifica' });
    await settleBackground(a.ctx);
    await a.app.close();
    expect(folderText(folder)).toContain('Ultima modifica');
    expect(existsSync(join(folder, 'devices', st.deviceId, 'device.json'))).toBe(true);
  });

  it('validates folders and reports when sync is not configured', async () => {
    const a = await device();
    expect((await call<{ error: { code: string } }>(a, 'POST', '/api/sync/run')).body.error.code).toBe('sync_not_configured');
    const relative = await call<{ error: { code: string; details: { reason: string } } }>(a, 'PUT', '/api/sync', { folder: 'Drive/PERSONA' });
    expect(relative.body.error).toMatchObject({ code: 'sync_folder', details: { reason: 'not_absolute' } });
    const unreachable = await call<{ error: { code: string; details: { reason: string } } }>(a, 'PUT', '/api/sync', {
      folder: join(tempDir('persona-x-'), 'manca', 'PERSONA'),
    });
    expect(unreachable.body.error).toMatchObject({ code: 'sync_folder', details: { reason: 'unreachable' } });

    const folder = cloudFolder();
    await connect(a, folder);
    const b = await device();
    const unexpected = await call<{ error: { code: string; details: { reason: string } } }>(b, 'PUT', '/api/sync', { folder, passphrase: 'una passphrase qualsiasi' });
    expect(unexpected.body.error).toMatchObject({ code: 'sync_passphrase', details: { reason: 'unexpected' } });

    const off = await call<SyncStatus>(a, 'PUT', '/api/sync', { folder: null });
    expect(off.body).toMatchObject({ configured: false, enabled: false });
  });

  it('tracks every table of the database (or excludes it on purpose)', async () => {
    const a = await device();
    const tables = (a.ctx.dbm.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
      .map((r) => r.name)
      .filter((n) => !/_fts($|_)/.test(n));
    const unknown = tables.filter((t) => !SYNC_TABLE_NAMES.has(t) && !NOT_SYNCED.includes(t));
    expect(unknown).toEqual([]);
    const triggers = a.ctx.dbm.sqlite.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_track_%'`).get() as {
      n: number;
    };
    expect(triggers.n).toBe(SYNC_TABLE_NAMES.size * 4);
  });
});

describe('cloud folder detection', () => {
  const fake = (dirs: string[], listing: Record<string, string[]> = {}) => ({
    isDir: (p: string) => dirs.includes(p),
    list: (p: string) => listing[p] ?? [],
  });

  it('finds Google Drive for desktop on Windows, macOS and Linux folders', () => {
    const win = detectSyncFolders({
      platform: 'win32',
      home: 'C:\\Users\\ada',
      env: { OneDrive: 'C:\\Users\\ada\\OneDrive' },
      ...fake(['G:\\Il mio Drive', 'C:\\Users\\ada\\OneDrive', 'C:\\Users\\ada\\Dropbox']),
    });
    expect(win.map((s) => [s.provider, s.path])).toEqual([
      ['google-drive', 'G:\\Il mio Drive\\PERSONA'],
      ['dropbox', 'C:\\Users\\ada\\Dropbox\\PERSONA'],
      ['onedrive', 'C:\\Users\\ada\\OneDrive\\PERSONA'],
    ]);

    const cloud = '/Users/ada/Library/CloudStorage';
    const mac = detectSyncFolders({
      platform: 'darwin',
      home: '/Users/ada',
      env: {},
      ...fake([`${cloud}/GoogleDrive-ada@example.com/My Drive`, `${cloud}/Dropbox`], { [cloud]: ['GoogleDrive-ada@example.com', 'Dropbox'] }),
    });
    expect(mac.map((s) => s.label)).toEqual(['Google Drive', 'Dropbox']);
    expect(mac[0].root).toBe(`${cloud}/GoogleDrive-ada@example.com/My Drive`);

    const linux = detectSyncFolders({ platform: 'linux', home: '/home/ada', env: {}, ...fake(['/home/ada/Dropbox']) });
    expect(linux).toEqual([{ provider: 'dropbox', label: 'Dropbox', root: '/home/ada/Dropbox', path: '/home/ada/Dropbox/PERSONA' }]);
  });

  it('returns an empty list when nothing is installed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-home-'));
    mkdirSync(join(dir, 'Documents'));
    try {
      expect(detectSyncFolders({ platform: 'linux', home: dir, env: {} })).toEqual([]);
      cpSync(join(dir, 'Documents'), join(dir, 'Dropbox'), { recursive: true });
      expect(detectSyncFolders({ platform: 'linux', home: dir, env: {} }).map((s) => s.provider)).toEqual(['dropbox']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
