/**
 * Avvio "incorporabile" del backend: usato da `index.ts` e pensato per un futuro
 * involucro desktop (es. processo principale di Electron), che potrà chiamare
 *
 *   const persona = await startPersonaServer({ dataDir: app.getPath('userData'), port: 0, webDistDir });
 *   mainWindow.loadURL(persona.url);
 *
 * senza modificare frontend o backend. Nessuna dipendenza da Electron.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import { type AppContext, settleBackground } from './context.js';

export interface StartOptions {
  /** Cartella dei dati (database e backup). */
  dataDir?: string;
  /** 0 = porta libera scelta dal sistema. */
  port?: number;
  host?: string;
  /** Cartella della build del frontend da servire (null = solo API). */
  webDistDir?: string | null;
  logger?: boolean;
  config?: Partial<AppConfig>;
}

export interface RunningServer {
  url: string;
  port: number;
  app: FastifyInstance;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function startPersonaServer(opts: StartOptions = {}): Promise<RunningServer> {
  const overrides: Partial<AppConfig> = { ...opts.config };
  if (opts.dataDir) overrides.dataDir = opts.dataDir;
  if (opts.host) overrides.host = opts.host;
  if (opts.port !== undefined) overrides.port = opts.port;
  if (opts.webDistDir !== undefined) overrides.webDistDir = opts.webDistDir;
  const { app, ctx } = await buildApp({ config: overrides, logger: opts.logger ?? false });
  await app.listen({ host: ctx.config.host, port: ctx.config.port });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : ctx.config.port;
  const host = ctx.config.host.includes(':') ? `[${ctx.config.host}]` : ctx.config.host;
  return {
    url: `http://${host}:${port}`,
    port,
    app,
    ctx,
    async close() {
      await Promise.race([settleBackground(ctx), new Promise((r) => setTimeout(r, 5000))]);
      await app.close();
    },
  };
}
