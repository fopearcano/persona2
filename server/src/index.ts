import { defaultDataDir, LEGACY_DATA_DIR, loadEnvFiles } from './config.js';
import { startPersonaServer } from './embedded.js';
import { describeDataDirMove, moveLegacyDataDir } from './lib/data-dir.js';

try {
  // Senza PERSONA_DATA_DIR i dati stanno nella cartella utente del sistema: se il repository
  // contiene ancora la vecchia cartella data/, al primo avvio viene spostata lì.
  loadEnvFiles();
  const moved = process.env.PERSONA_DATA_DIR ? null : describeDataDirMove(moveLegacyDataDir(LEGACY_DATA_DIR, defaultDataDir()));
  const server = await startPersonaServer({ logger: true });
  const { app, ctx } = server;
  app.log.info(`PERSONA in ascolto su ${server.url} — dati: ${ctx.config.dataDir}`);
  if (moved) app.log.warn(moved);
  if (!ctx.config.webDistDir && ctx.config.production) {
    app.log.warn('Build del frontend non trovata: eseguire "npm run build" nella root del progetto.');
  }
  const shutdown = async (signal: string) => {
    app.log.info(`${signal}: arresto in corso…`);
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
} catch (err) {
  console.error(err);
  process.exit(1);
}
