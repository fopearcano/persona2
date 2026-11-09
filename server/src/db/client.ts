import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS_DIR } from '../config.js';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;
export type Sqlite = Database.Database;

interface Handle {
  sqlite: Sqlite;
  db: Db;
}

const REQUIRED_TABLES = ['characters', 'memories', 'conversations', 'messages', 'scenarios'];

function open(file: string, migrationsFolder: string): Handle {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { sqlite, db };
}

/**
 * Gestisce la connessione SQLite. Permette la sostituzione a caldo del database
 * (ripristino da backup) senza riavviare il server: i servizi leggono sempre
 * `manager.db` al momento dell'uso.
 */
export class DatabaseManager {
  private handle: Handle;
  /** Incrementato a ogni sostituzione del database (invalida le cache in memoria). */
  generation = 0;

  constructor(
    public readonly file: string,
    private readonly migrationsDir: string = MIGRATIONS_DIR,
  ) {
    this.handle = open(file, migrationsDir);
  }

  get db(): Db {
    return this.handle.db;
  }

  get sqlite(): Sqlite {
    return this.handle.sqlite;
  }

  /** Numero di migrazioni applicate (versione dello schema). */
  schemaVersion(): number {
    const row = this.sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number };
    return row.n;
  }

  /** Backup consistente (API online di SQLite), sicuro anche in modalità WAL. */
  async backupTo(dest: string): Promise<void> {
    mkdirSync(dirname(dest), { recursive: true });
    await this.sqlite.backup(dest);
  }

  /** Verifica che un file sia un database PERSONA valido. Lancia un errore altrimenti. */
  static validateBackupFile(file: string): void {
    let probe: Sqlite | null = null;
    try {
      probe = new Database(file, { readonly: true, fileMustExist: true });
      const integrity = probe.pragma('quick_check', { simple: true });
      if (integrity !== 'ok') throw new Error(`integrity check failed: ${String(integrity)}`);
      const rows = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
      const names = new Set(rows.map((r) => r.name));
      for (const t of REQUIRED_TABLES) {
        if (!names.has(t)) throw new Error(`missing table ${t}`);
      }
    } finally {
      probe?.close();
    }
  }

  /**
   * Sostituisce il database corrente con il file indicato.
   * Prima crea una copia di sicurezza del database attuale (`safetyCopy`).
   */
  async restoreFrom(source: string, safetyCopy: string): Promise<void> {
    if (this.file === ':memory:') throw new Error('cannot restore an in-memory database');
    DatabaseManager.validateBackupFile(source);
    await this.backupTo(safetyCopy);
    this.handle.sqlite.close();
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(this.file + suffix)) rmSync(this.file + suffix);
    }
    this.generation++;
    try {
      copyFileSync(source, this.file);
      this.handle = open(this.file, this.migrationsDir);
    } catch (err) {
      // Ripristino fallito: torna alla copia di sicurezza.
      copyFileSync(safetyCopy, this.file);
      this.handle = open(this.file, this.migrationsDir);
      throw err;
    }
  }

  close(): void {
    this.handle.sqlite.close();
  }
}
