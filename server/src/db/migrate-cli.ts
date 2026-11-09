/** Applica le migrazioni al database configurato: `npm run db:migrate`. */
import { loadConfig } from '../config.js';
import { DatabaseManager } from './client.js';

const config = loadConfig();
const manager = new DatabaseManager(config.databaseFile, config.migrationsDir);
console.log(`Database: ${config.databaseFile}`);
console.log(`Migrazioni applicate: ${manager.schemaVersion()}`);
manager.close();
