/**
 * Tracciamento delle modifiche per la sincronizzazione tra dispositivi.
 *
 * Ogni tabella sincronizzabile ha trigger che, per ogni riga inserita, modificata o eliminata
 * da questo dispositivo, aggiornano `sync_row_versions` con una nuova versione (`at` in ms,
 * sempre maggiore della versione precedente della riga: orologio ibrido) e la segnano `dirty`.
 * Così nessuna modifica sfugge, qualunque servizio la faccia (anche le eliminazioni a cascata).
 *
 * Mentre si applicano modifiche ricevute da altri dispositivi `sync_meta.applying = 1`: i trigger
 * non le registrano come locali (si limitano a segnare le eliminazioni a cascata come lapidi).
 *
 * I trigger sono creati all'apertura del database (dopo le migrazioni) a partire da `SYNC_TABLES`
 * e dalle colonne reali delle tabelle: se lo schema cambia vengono ricreati. Una nuova tabella va
 * aggiunta a `SYNC_TABLES` (o a `NOT_SYNCED`): lo verifica un test.
 */
import type Database from 'better-sqlite3';

export interface SyncTable {
  name: string;
  /** Colonne che restano sul dispositivo: non vengono inviate e non vengono sovrascritte. */
  local?: string[];
  /** Colonne locali derivate dal contenuto: azzerate quando arriva un contenuto diverso (es. embedding). */
  resetOnChange?: { column: string; reset: string[] };
}

/**
 * Tabelle sincronizzate, in ordine di dipendenza (genitori prima dei figli): l'ordine riduce i
 * passaggi necessari quando si applicano le modifiche ricevute.
 */
export const SYNC_TABLES: SyncTable[] = [
  // Chiave API e configurazione predefinita restano sul dispositivo.
  { name: 'model_configurations', local: ['api_key', 'is_default'] },
  { name: 'projects' },
  { name: 'characters' },
  { name: 'character_traits' },
  { name: 'character_languages' },
  { name: 'expertise' },
  { name: 'identity_revisions' },
  { name: 'knowledge_sources' },
  {
    name: 'knowledge_chunks',
    local: ['embedding', 'embedding_model'],
    resetOnChange: { column: 'content', reset: ['embedding', 'embedding_model'] },
  },
  { name: 'scenarios' },
  {
    name: 'memories',
    // Embedding (ricalcolati su ogni dispositivo) e statistiche di recupero (cambiano a ogni risposta).
    local: ['embedding', 'embedding_model', 'retrieval_count', 'last_retrieved_at'],
    resetOnChange: { column: 'content', reset: ['embedding', 'embedding_model'] },
  },
  { name: 'memory_sources' },
  { name: 'project_characters' },
  { name: 'scenario_participants' },
  { name: 'scenario_relationships' },
  { name: 'scenario_events' },
  { name: 'conversations' },
  { name: 'conversation_participants' },
  { name: 'messages' },
  { name: 'message_revisions' },
  { name: 'conversation_summaries' },
  { name: 'coach_threads' },
  { name: 'coach_messages' },
];

/** Tabelle volutamente escluse: preferenze del dispositivo, stato della sincronizzazione, indici derivati. */
export const NOT_SYNCED = [
  'user_preferences',
  'sync_meta',
  'sync_row_versions',
  'sync_peers',
  'sync_pending',
  '__drizzle_migrations',
];

export const SYNC_TABLE_NAMES = new Set(SYNC_TABLES.map((t) => t.name));

const TRIGGER_PREFIX = 'sync_track_';
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Colonne di una tabella (nell'ordine dello schema). */
export function tableColumns(sqlite: Database.Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${ident(table)})`).all() as { name: string }[]).map((c) => c.name);
}

/** Colonne inviate agli altri dispositivi. */
export function syncedColumns(sqlite: Database.Database, table: SyncTable): string[] {
  const local = new Set(table.local ?? []);
  return tableColumns(sqlite, table.name).filter((c) => !local.has(c));
}

const ACTIVE = `(SELECT applying FROM sync_meta WHERE id = 1) = 0`;
const APPLYING = `(SELECT applying FROM sync_meta WHERE id = 1) = 1`;

function versionUpsert(table: string, rowRef: string, deleted: 0 | 1): string {
  // Nuova versione: adesso (ms), ma comunque dopo la versione corrente della riga, così una
  // modifica locale prevale sempre sulla versione da cui è partita (anche con orologi sfasati).
  return `INSERT OR REPLACE INTO sync_row_versions (tbl, row_id, at, dev, dirty, deleted) VALUES (
    ${lit(table)}, ${rowRef},
    max(CAST(unixepoch('subsec') * 1000 AS INTEGER),
        coalesce((SELECT at + 1 FROM sync_row_versions WHERE tbl = ${lit(table)} AND row_id = ${rowRef}), 0)),
    (SELECT device_id FROM sync_meta WHERE id = 1), 1, ${deleted});`;
}

/** SQL dei trigger di una tabella. */
export function triggerSql(sqlite: Database.Database, table: SyncTable): { name: string; sql: string }[] {
  const t = table.name;
  const cols = syncedColumns(sqlite, table);
  if (cols.length === 0) throw new Error(`Tabella sincronizzabile inesistente: ${t}`);
  if (!cols.includes('id')) throw new Error(`La tabella ${t} non ha una colonna id`);
  const name = (op: string) => `${TRIGGER_PREFIX}${t}_${op}`;
  return [
    {
      name: name('ins'),
      sql: `CREATE TRIGGER ${ident(name('ins'))} AFTER INSERT ON ${ident(t)} WHEN ${ACTIVE} BEGIN ${versionUpsert(t, 'NEW.id', 0)} END`,
    },
    {
      // Solo le colonne sincronizzate: aggiornare embedding o statistiche non è una modifica da inviare.
      name: name('upd'),
      sql: `CREATE TRIGGER ${ident(name('upd'))} AFTER UPDATE OF ${cols.map(ident).join(', ')} ON ${ident(t)} WHEN ${ACTIVE} BEGIN ${versionUpsert(t, 'NEW.id', 0)} END`,
    },
    {
      name: name('del'),
      sql: `CREATE TRIGGER ${ident(name('del'))} AFTER DELETE ON ${ident(t)} WHEN ${ACTIVE} BEGIN ${versionUpsert(t, 'OLD.id', 1)} END`,
    },
    {
      // Eliminazioni a cascata durante l'applicazione di modifiche ricevute: lapide senza nuova versione.
      name: name('del_applying'),
      sql: `CREATE TRIGGER ${ident(name('del_applying'))} AFTER DELETE ON ${ident(t)} WHEN ${APPLYING} BEGIN
        UPDATE sync_row_versions SET deleted = 1 WHERE tbl = ${lit(t)} AND row_id = OLD.id; END`,
    },
  ];
}

/**
 * Crea (o ricrea, se lo schema è cambiato) i trigger di tracciamento. Idempotente; da chiamare
 * dopo le migrazioni a ogni apertura del database.
 */
export function installSyncTriggers(sqlite: Database.Database): void {
  const tables = new Set(
    (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((r) => r.name),
  );
  if (!tables.has('sync_meta')) return; // database precedente alla migrazione 0006 (non dovrebbe accadere)
  sqlite.prepare(`INSERT OR IGNORE INTO sync_meta (id, device_id) VALUES (1, lower(hex(randomblob(16))))`).run();
  // Un'eventuale applicazione interrotta (crash) non deve disattivare il tracciamento.
  sqlite.prepare(`UPDATE sync_meta SET applying = 0 WHERE id = 1 AND applying != 0`).run();

  const wanted = new Map<string, string>();
  for (const table of SYNC_TABLES) {
    if (!tables.has(table.name)) continue;
    for (const trig of triggerSql(sqlite, table)) wanted.set(trig.name, trig.sql);
  }
  const existing = new Map(
    (
      sqlite.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\\_track\\_%' ESCAPE '\\'`).all() as {
        name: string;
        sql: string;
      }[]
    ).map((r) => [r.name, r.sql]),
  );
  const same = existing.size === wanted.size && [...wanted].every(([name, sql]) => existing.get(name) === sql);
  if (same) return;
  sqlite.transaction(() => {
    for (const name of existing.keys()) sqlite.exec(`DROP TRIGGER IF EXISTS ${ident(name)}`);
    for (const sql of wanted.values()) sqlite.exec(sql);
  })();
}
