import { startPersonaServer } from './embedded.js';

try {
  const server = await startPersonaServer({ logger: true });
  const { app, ctx } = server;
  app.log.info(`PERSONA in ascolto su ${server.url} — dati: ${ctx.config.dataDir}`);
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
