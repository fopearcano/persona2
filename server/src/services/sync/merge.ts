/**
 * Operazioni sul database per la sincronizzazione: raccolta delle modifiche locali e unione di
 * quelle ricevute, riga per riga.
 *
 * Regole di unione:
 * - prevale la versione più recente (`at`, poi `dev` come spareggio): l'ordine in cui arrivano i
 *   blocchi non conta e tutti i dispositivi convergono allo stesso stato;
 * - un'eliminazione è una lapide con la sua versione: vince solo se è più recente della modifica;
 * - una riga che rimanda a un'altra non ancora arrivata resta in attesa (`sync_pending`);
 *   se invece quella riga è stata eliminata, prevale l'eliminazione (o il riferimento si azzera
 *   per i collegamenti facoltativi, come la configurazione del modello);
 * - due righe diverse per la stessa coppia univoca (es. lo stesso personaggio aggiunto allo stesso
 *   progetto su due dispositivi) si risolvono tenendo quella con l'id minore, ovunque;
 * - le colonne locali (chiave API, embedding, statistiche di recupero) non si inviano e non si
 *   sovrascrivono; gli embedding si azzerano se il contenuto cambia, per essere ricalcolati.
 */
import type Database from 'better-sqlite3';
import { SYNC_TABLES, type SyncTable, syncedColumns, tableColumns } from '../../db/sync-triggers.js';
import type { SyncRecord } from './format.js';

type Sqlite = Database.Database;

interface ForeignKey {
  from: string;
  parent: string;
  onDelete: string;
}

interface TableInfo {
  def: SyncTable;
  order: number;
  columns: Set<string>;
  synced: string[];
  syncedSet: Set<string>;
  fks: ForeignKey[];
  uniques: string[][];
  /** Espressione SQL (ms) per la versione iniziale delle righe preesistenti. */
  timeExpr: string;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const infoCache = new WeakMap<Sqlite, Map<string, TableInfo>>();

/** Struttura delle tabelle sincronizzate (colonne, chiavi esterne, vincoli univoci). */
export function tableInfos(sqlite: Sqlite): Map<string, TableInfo> {
  const cached = infoCache.get(sqlite);
  if (cached) return cached;
  const map = new Map<string, TableInfo>();
  SYNC_TABLES.forEach((def, order) => {
    const columns = tableColumns(sqlite, def.name);
    if (columns.length === 0) return;
    const synced = syncedColumns(sqlite, def);
    const fks = (sqlite.prepare(`PRAGMA foreign_key_list(${ident(def.name)})`).all() as { table: string; from: string; on_delete: string }[]).map(
      (f) => ({ from: f.from, parent: f.table, onDelete: f.on_delete.toUpperCase() }),
    );
    const uniques: string[][] = [];
    for (const idx of sqlite.prepare(`PRAGMA index_list(${ident(def.name)})`).all() as { name: string; unique: number; origin: string }[]) {
      if (!idx.unique || idx.origin === 'pk') continue;
      const cols = (sqlite.prepare(`PRAGMA index_info(${ident(idx.name)})`).all() as { name: string }[]).map((c) => c.name);
      if (cols.length > 0 && !cols.includes('id')) uniques.push(cols);
    }
    const times = ['updated_at', 'edited_at', 'created_at', 'added_at'].filter((c) => columns.includes(c));
    const timeExpr = times.length
      ? `coalesce(${times.map((c) => `CAST(unixepoch(${ident(c)}, 'subsec') * 1000 AS INTEGER)`).join(', ')}, 0)`
      : '0';
    map.set(def.name, { def, order, columns: new Set(columns), synced, syncedSet: new Set(synced), fks, uniques, timeExpr });
  });
  infoCache.set(sqlite, map);
  return map;
}

/** Statement preparati, per database. */
const stmtCache = new WeakMap<Sqlite, Map<string, Database.Statement>>();
function stmt(sqlite: Sqlite, sql: string): Database.Statement {
  let m = stmtCache.get(sqlite);
  if (!m) stmtCache.set(sqlite, (m = new Map()));
  let s = m.get(sql);
  if (!s) m.set(sql, (s = sqlite.prepare(sql)));
  return s;
}

interface Version {
  at: number;
  dev: string;
  dirty: number;
  deleted: number;
}

/** `a` è più recente di `b`. */
export const isNewer = (a: { at: number; dev: string }, b: { at: number; dev: string }) => a.at > b.at || (a.at === b.at && a.dev > b.dev);

function getVersion(sqlite: Sqlite, tbl: string, id: string): Version | undefined {
  return stmt(sqlite, 'SELECT at, dev, dirty, deleted FROM sync_row_versions WHERE tbl = ? AND row_id = ?').get(tbl, id) as Version | undefined;
}

function setVersion(sqlite: Sqlite, tbl: string, id: string, at: number, dev: string, deleted: 0 | 1): void {
  stmt(sqlite, 'INSERT OR REPLACE INTO sync_row_versions (tbl, row_id, at, dev, dirty, deleted) VALUES (?, ?, ?, ?, 0, ?)').run(tbl, id, at, dev, deleted);
}

export function setApplying(sqlite: Sqlite, on: boolean): void {
  stmt(sqlite, 'UPDATE sync_meta SET applying = ? WHERE id = 1').run(on ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* Modifiche locali                                                    */
/* ------------------------------------------------------------------ */

/**
 * Registra le righe che non hanno ancora una versione (dati precedenti alla sincronizzazione).
 * La versione iniziale è la data di modifica della riga: tra due copie dello stesso dato
 * prevale quella modificata più di recente.
 */
export function backfillVersions(sqlite: Sqlite, deviceId: string): number {
  let n = 0;
  for (const [name, info] of tableInfos(sqlite)) {
    n += stmt(
      sqlite,
      `INSERT INTO sync_row_versions (tbl, row_id, at, dev, dirty, deleted)
         SELECT @tbl, t.id, ${info.timeExpr}, @dev, 1, 0 FROM ${ident(name)} t
          WHERE NOT EXISTS (SELECT 1 FROM sync_row_versions v WHERE v.tbl = @tbl AND v.row_id = t.id)`,
    ).run({ tbl: name, dev: deviceId }).changes;
  }
  return n;
}

function readRow(sqlite: Sqlite, info: TableInfo, id: string): Record<string, unknown> | undefined {
  return stmt(sqlite, `SELECT ${info.synced.map(ident).join(', ')} FROM ${ident(info.def.name)} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
}

function toRecords(sqlite: Sqlite, rows: { tbl: string; row_id: string; at: number; dev: string; deleted: number }[]): SyncRecord[] {
  const infos = tableInfos(sqlite);
  const out: SyncRecord[] = [];
  for (const v of rows) {
    const info = infos.get(v.tbl);
    if (!info) continue;
    const data = v.deleted ? undefined : readRow(sqlite, info, v.row_id);
    out.push(data ? { t: v.tbl, id: v.row_id, at: v.at, dev: v.dev, d: data } : { t: v.tbl, id: v.row_id, at: v.at, dev: v.dev, del: 1 });
  }
  return out;
}

/** Modifiche locali non ancora inviate. */
export function collectDirty(sqlite: Sqlite): SyncRecord[] {
  const rows = stmt(sqlite, 'SELECT tbl, row_id, at, dev, deleted FROM sync_row_versions WHERE dirty = 1 ORDER BY at').all() as {
    tbl: string;
    row_id: string;
    at: number;
    dev: string;
    deleted: number;
  }[];
  return toRecords(sqlite, rows);
}

/** Stato completo (righe e lapidi) per un'istantanea. */
export function collectSnapshot(sqlite: Sqlite): SyncRecord[] {
  const rows = stmt(sqlite, 'SELECT tbl, row_id, at, dev, deleted FROM sync_row_versions ORDER BY at').all() as {
    tbl: string;
    row_id: string;
    at: number;
    dev: string;
    deleted: number;
  }[];
  return toRecords(sqlite, rows);
}

/** Segna come inviate le righe esportate, se nel frattempo non sono cambiate di nuovo. */
export function markSent(sqlite: Sqlite, records: SyncRecord[]): void {
  const s = stmt(sqlite, 'UPDATE sync_row_versions SET dirty = 0 WHERE tbl = ? AND row_id = ? AND at = ? AND dev = ?');
  sqlite.transaction(() => {
    for (const r of records) s.run(r.t, r.id, r.at, r.dev);
  })();
}

export function countDirty(sqlite: Sqlite): number {
  return (stmt(sqlite, 'SELECT count(*) AS n FROM sync_row_versions WHERE dirty = 1').get() as { n: number }).n;
}

export function countPending(sqlite: Sqlite): number {
  return (stmt(sqlite, 'SELECT count(*) AS n FROM sync_pending').get() as { n: number }).n;
}

/* ------------------------------------------------------------------ */
/* Modifiche ricevute                                                  */
/* ------------------------------------------------------------------ */

export interface ApplyStats {
  received: number;
  skipped: number;
  pending: number;
  failed: number;
}

type Outcome = 'applied' | 'skipped' | 'deferred' | 'failed';

function exists(sqlite: Sqlite, table: string, id: unknown): boolean {
  return !!stmt(sqlite, `SELECT 1 FROM ${ident(table)} WHERE id = ?`).get(id);
}

function deleteRow(sqlite: Sqlite, table: string, id: string): void {
  stmt(sqlite, `DELETE FROM ${ident(table)} WHERE id = ?`).run(id);
}

function applyOne(sqlite: Sqlite, infos: Map<string, TableInfo>, r: SyncRecord, onError: (err: unknown, r: SyncRecord) => void): Outcome {
  const info = infos.get(r.t)!;
  const local = getVersion(sqlite, r.t, r.id);
  if (local && !isNewer(r, local)) return 'skipped';

  if (r.del) {
    deleteRow(sqlite, r.t, r.id);
    setVersion(sqlite, r.t, r.id, r.at, r.dev, 1);
    return 'applied';
  }

  // Solo colonne sincronizzate che esistono in questo schema.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.d ?? {})) if (info.syncedSet.has(k)) data[k] = v;
  data.id = r.id;

  // Riferimenti ad altre righe.
  for (const fk of info.fks) {
    const ref = data[fk.from];
    if (ref === null || ref === undefined || exists(sqlite, fk.parent, ref)) continue;
    const parent = getVersion(sqlite, fk.parent, String(ref));
    if (parent?.deleted) {
      if (fk.onDelete === 'SET NULL') {
        data[fk.from] = null;
        continue;
      }
      // La riga collegata è stata eliminata: prevale l'eliminazione.
      if (exists(sqlite, r.t, r.id)) deleteRow(sqlite, r.t, r.id);
      setVersion(sqlite, r.t, r.id, r.at, r.dev, 1);
      return 'skipped';
    }
    return 'deferred'; // non ancora arrivata
  }

  // Vincoli univoci oltre all'id (es. personaggio-progetto): resta la riga con l'id minore.
  for (const cols of info.uniques) {
    if (cols.some((c) => data[c] === null || data[c] === undefined)) continue;
    const other = stmt(sqlite, `SELECT id FROM ${ident(r.t)} WHERE ${cols.map((c) => `${ident(c)} = ?`).join(' AND ')} AND id != ?`).get(
      ...cols.map((c) => data[c]),
      r.id,
    ) as { id: string } | undefined;
    if (!other) continue;
    if (r.id < other.id) {
      deleteRow(sqlite, r.t, other.id);
    } else {
      setVersion(sqlite, r.t, r.id, r.at, r.dev, 1);
      return 'skipped';
    }
  }

  try {
    const current = stmt(sqlite, `SELECT * FROM ${ident(r.t)} WHERE id = ?`).get(r.id) as Record<string, unknown> | undefined;
    const cols = Object.keys(data);
    if (current) {
      const set = cols.filter((c) => c !== 'id').map((c) => `${ident(c)} = @${c}`);
      const rc = info.def.resetOnChange;
      if (rc && rc.column in data && current[rc.column] !== data[rc.column]) {
        for (const c of rc.reset) if (info.columns.has(c)) set.push(`${ident(c)} = NULL`);
      }
      if (set.length > 0) stmt(sqlite, `UPDATE ${ident(r.t)} SET ${set.join(', ')} WHERE id = @id`).run(data);
    } else {
      stmt(sqlite, `INSERT INTO ${ident(r.t)} (${cols.map(ident).join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(data);
    }
  } catch (err) {
    onError(err, r);
    return 'failed';
  }
  setVersion(sqlite, r.t, r.id, r.at, r.dev, 0);
  return 'applied';
}

/**
 * Applica le righe ricevute (più quelle in attesa dai giri precedenti). Va chiamata dentro una
 * transazione: i trigger non registrano queste modifiche come locali.
 */
export function applyRecords(sqlite: Sqlite, incoming: SyncRecord[], onError: (err: unknown, r: SyncRecord) => void = () => {}): ApplyStats {
  const infos = tableInfos(sqlite);
  const winners = new Map<string, SyncRecord>();
  const consider = (r: SyncRecord) => {
    if (!infos.has(r.t) || typeof r.id !== 'string' || typeof r.at !== 'number' || typeof r.dev !== 'string') return;
    const key = `${r.t}\u0000${r.id}`;
    const cur = winners.get(key);
    if (!cur || isNewer(r, cur)) winners.set(key, r);
  };
  const pendingRows = stmt(sqlite, 'SELECT tbl, row_id, at, dev, data FROM sync_pending').all() as {
    tbl: string;
    row_id: string;
    at: number;
    dev: string;
    data: string;
  }[];
  for (const p of pendingRows) consider({ t: p.tbl, id: p.row_id, at: p.at, dev: p.dev, d: JSON.parse(p.data) as Record<string, unknown> });
  for (const r of incoming) consider(r);

  const stats: ApplyStats = { received: 0, skipped: 0, pending: 0, failed: 0 };
  let todo = [...winners.values()].sort((a, b) => infos.get(a.t)!.order - infos.get(b.t)!.order);
  setApplying(sqlite, true);
  try {
    // Più passaggi: una riga può aspettare un'altra arrivata nello stesso giro.
    for (;;) {
      const deferred: SyncRecord[] = [];
      for (const r of todo) {
        const outcome = applyOne(sqlite, infos, r, onError);
        if (outcome === 'deferred') deferred.push(r);
        else if (outcome === 'applied') stats.received++;
        else if (outcome === 'failed') stats.failed++;
        else stats.skipped++;
      }
      if (deferred.length === 0 || deferred.length === todo.length) {
        todo = deferred;
        break;
      }
      todo = deferred;
    }
  } finally {
    setApplying(sqlite, false);
  }

  stmt(sqlite, 'DELETE FROM sync_pending').run();
  const keep = stmt(sqlite, 'INSERT INTO sync_pending (tbl, row_id, at, dev, data) VALUES (?, ?, ?, ?, ?)');
  for (const r of todo) keep.run(r.t, r.id, r.at, r.dev, JSON.stringify(r.d ?? {}));
  stats.pending = todo.length;
  return stats;
}

/* ------------------------------------------------------------------ */
/* Primo collegamento di un dispositivo vuoto                          */
/* ------------------------------------------------------------------ */

const count = (sqlite: Sqlite, sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;

/**
 * Il database contiene solo ciò che PERSONA crea al primo avvio (configurazioni dei modelli mai
 * modificate e un progetto vuoto)? Allora, collegandosi a una cartella con i dati di altri
 * dispositivi, quelle configurazioni iniziali si scartano invece di duplicarle ovunque.
 */
export function isPristine(sqlite: Sqlite): boolean {
  const empty = ['characters', 'scenarios', 'conversations', 'memories', 'knowledge_sources', 'coach_threads'].every(
    (t) => count(sqlite, `SELECT count(*) AS n FROM ${t}`) === 0,
  );
  if (!empty) return false;
  const touchedProjects = count(sqlite, `SELECT count(*) AS n FROM projects WHERE story IS NOT NULL OR description IS NOT NULL OR created_at != updated_at`);
  const touchedModels = count(sqlite, `SELECT count(*) AS n FROM model_configurations WHERE created_at != updated_at OR api_key IS NOT NULL`);
  return touchedProjects === 0 && touchedModels === 0;
}

/** Elimina le configurazioni iniziali mai inviate (vedi `isPristine`). Restituisce gli id eliminati. */
export function discardInitialData(sqlite: Sqlite): { projects: string[]; models: string[] } {
  const ids = (t: string) => (sqlite.prepare(`SELECT id FROM ${t}`).all() as { id: string }[]).map((r) => r.id);
  const out = { projects: ids('projects'), models: ids('model_configurations') };
  setApplying(sqlite, true);
  try {
    sqlite.prepare('DELETE FROM projects').run();
    sqlite.prepare('DELETE FROM model_configurations').run();
    sqlite.prepare(`DELETE FROM sync_row_versions WHERE tbl IN ('projects', 'model_configurations')`).run();
  } finally {
    setApplying(sqlite, false);
  }
  return out;
}

/** Dopo un cambio di cartella: tutto va inviato di nuovo. */
export function resetForNewFolder(sqlite: Sqlite): void {
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE sync_meta SET last_seq = 0, last_import_at = NULL, last_result = NULL, last_error = NULL WHERE id = 1').run();
    sqlite.prepare('DELETE FROM sync_peers').run();
    sqlite.prepare('DELETE FROM sync_pending').run();
    sqlite.prepare('UPDATE sync_row_versions SET dirty = 1').run();
  })();
}
