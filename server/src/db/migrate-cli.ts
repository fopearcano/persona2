/** Applica le migrazioni al database configurato: `npm run db:migrate`. */
import { defaultDataDir, LEGACY_DATA_DIR, loadConfig, loadEnvFiles } from '../config.js';
import { describeDataDirMove, moveLegacyDataDir } from '../lib/data-dir.js';
import { DatabaseManager } from './client.js';

loadEnvFiles();
if (!process.env.PERSONA_DATA_DIR) {
  const moved = describeDataDirMove(moveLegacyDataDir(LEGACY_DATA_DIR, defaultDataDir()));
  if (moved) console.log(moved);
}
const config = loadConfig();
const manager = new DatabaseManager(config.databaseFile, config.migrationsDir);
console.log(`Database: ${config.databaseFile}`);
console.log(`Migrazioni applicate: ${manager.schemaVersion()}`);
manager.close();
