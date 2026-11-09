import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { type AppConfig, loadConfig } from './config.js';
import type { AppContext } from './context.js';
import { DatabaseManager } from './db/client.js';
import { createProviderFactory, type ProviderFactory } from './llm/registry.js';
import { LlmError } from './llm/types.js';
import { AppError } from './lib/util.js';
import { registerRoutes } from './routes/index.js';
import { seedModelConfigs } from './services/model-configs.js';
import { ensureDefaultProject } from './services/projects.js';

export interface BuildOptions {
  config?: Partial<AppConfig>;
  logger?: boolean;
  providers?: ProviderFactory;
  seed?: boolean;
}

/**
 * Crea l'applicazione Fastify. Separata dall'avvio del server per poter essere
 * usata nei test (app.inject) e, in futuro, incorporata in un processo Electron.
 */
export async function buildApp(opts: BuildOptions = {}): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const config = loadConfig(opts.config);
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 64 * 1024 * 1024,
  });
  const dbm = new DatabaseManager(config.databaseFile, config.migrationsDir);
  const ctx: AppContext = {
    dbm,
    config,
    providers: opts.providers ?? createProviderFactory({ mockDelayMs: config.mockDelayMs }),
    log: app.log,
    background: new Set(),
  };

  // Sicurezza locale: accetta solo richieste indirizzate a localhost (protezione da DNS
  // rebinding) e rifiuta le scritture provenienti da altre origini (CSRF dal browser).
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1', ...config.allowedHosts]);
  const hostOf = (value: string) => value.replace(/:\d+$/, '').toLowerCase();
  app.removeContentTypeParser('text/plain');
  app.addHook('onRequest', async (req, reply) => {
    const host = hostOf(req.headers.host ?? '');
    if (!allowedHosts.has(host)) {
      return reply.code(403).send({ error: { code: 'validation', message: `Host non consentito: ${host}` } });
    }
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      let originHost = '';
      try {
        originHost = new URL(origin).hostname.toLowerCase();
      } catch {
        originHost = '';
      }
      if (!allowedHosts.has(originHost) && !allowedHosts.has(`[${originHost}]`)) {
        return reply.code(403).send({ error: { code: 'validation', message: `Origine non consentita: ${origin}` } });
      }
    }
  });

  // Ripristino del database: corpo binario.
  app.addContentTypeParser(['application/octet-stream', 'application/vnd.sqlite3', 'application/pdf'], { parseAs: 'buffer', bodyLimit: 1024 * 1024 * 1024 }, (_req, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'validation', message: err.message, details: err.issues } });
    }
    if (err instanceof LlmError) {
      return reply.code(502).send({ error: { code: err.code, message: err.message } });
    }
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: 'validation', message: e.message ?? 'Bad request' } });
    }
    request.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: e.message ?? 'Internal error' } });
  });

  await registerRoutes(app, ctx);

  if (config.webDistDir) {
    await app.register(fastifyStatic, { root: config.webDistDir, prefix: '/', wildcard: false });
    // Fallback SPA: le rotte del frontend vengono servite da index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } }));
  }

  if (opts.seed !== false) {
    seedModelConfigs(ctx);
    // Una tantum: primo progetto, con i personaggi e gli scenari creati prima dei progetti.
    ensureDefaultProject(ctx);
  }

  app.addHook('onClose', async () => {
    dbm.close();
  });
  return { app, ctx };
}
