import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Radice del monorepo (server/src → ../..). */
export const REPO_ROOT = resolve(here, '..', '..');
export const SERVER_ROOT = resolve(here, '..');
export const MIGRATIONS_DIR = resolve(SERVER_ROOT, 'drizzle');
/** Cartella dati delle versioni precedenti avviate dai sorgenti (dentro il repository). */
export const LEGACY_DATA_DIR = resolve(REPO_ROOT, 'data');

/**
 * Cartella dati predefinita: la cartella utente del sistema, la stessa dell'app desktop
 * (`app.getPath('userData')/data` di Electron con nome "PERSONA"). Fuori dal repository,
 * così reinstallare o clonare di nuovo il progetto non perde i dati.
 * - Windows: %APPDATA%\PERSONA\data
 * - macOS:   ~/Library/Application Support/PERSONA/data
 * - Linux:   $XDG_CONFIG_HOME/PERSONA/data (di solito ~/.config/PERSONA/data)
 */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (platform === 'win32') return win32.join(env.APPDATA || win32.join(home, 'AppData', 'Roaming'), 'PERSONA', 'data');
  if (platform === 'darwin') return posix.join(home, 'Library', 'Application Support', 'PERSONA', 'data');
  return posix.join(env.XDG_CONFIG_HOME || posix.join(home, '.config'), 'PERSONA', 'data');
}

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  databaseFile: string;
  backupsDir: string;
  lmStudioUrl: string;
  /** Cartella della build del frontend servita in produzione (null = non servire). */
  webDistDir: string | null;
  production: boolean;
  version: string;
  /** Ritardo artificiale tra i chunk del provider mock (ms). */
  mockDelayMs: number;
  /** Host aggiuntivi accettati oltre a localhost (PERSONA_ALLOWED_HOSTS, separati da virgola). */
  allowedHosts: string[];
  /** Cartella delle migrazioni SQL (configurabile per il pacchetto desktop). */
  migrationsDir: string;
}

function readVersion(): string {
  try {
    return (JSON.parse(readFileSync(resolve(SERVER_ROOT, 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Carica un file .env semplice (KEY=VALUE) senza sovrascrivere variabili già definite. */
function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

/** Legge i file .env (server/.env e .env nella root) senza sovrascrivere le variabili già definite. */
export function loadEnvFiles(): void {
  loadDotEnv(resolve(SERVER_ROOT, '.env'));
  loadDotEnv(resolve(REPO_ROOT, '.env'));
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadEnvFiles();
  const env = process.env;
  const dataDirRaw = env.PERSONA_DATA_DIR || defaultDataDir();
  const dataDir = isAbsolute(dataDirRaw) ? dataDirRaw : resolve(REPO_ROOT, dataDirRaw);
  const production = env.NODE_ENV === 'production';
  const webDist = resolve(REPO_ROOT, 'web', 'dist');
  const base: AppConfig = {
    host: env.PERSONA_HOST ?? '127.0.0.1',
    port: Number(env.PERSONA_PORT ?? 4317),
    dataDir,
    databaseFile: resolve(dataDir, 'persona.db'),
    backupsDir: resolve(dataDir, 'backups'),
    lmStudioUrl: env.PERSONA_LMSTUDIO_URL ?? 'http://localhost:1234/v1',
    webDistDir: production && existsSync(webDist) ? webDist : null,
    production,
    version: env.PERSONA_VERSION ?? readVersion(),
    mockDelayMs: Number(env.PERSONA_MOCK_DELAY_MS ?? 15),
    allowedHosts: (env.PERSONA_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    migrationsDir: env.PERSONA_MIGRATIONS_DIR ?? MIGRATIONS_DIR,
  };
  // Se viene indicata solo la cartella dati, database e backup la seguono.
  if (overrides.dataDir) {
    base.databaseFile = resolve(overrides.dataDir, 'persona.db');
    base.backupsDir = resolve(overrides.dataDir, 'backups');
  }
  return { ...base, ...overrides };
}
