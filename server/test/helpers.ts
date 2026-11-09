import type { StreamEvent } from '@persona/shared';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { type AppContext, settleBackground } from '../src/context.js';

export interface TestEnv {
  app: FastifyInstance;
  ctx: AppContext;
  dir: string;
  mockConfigId: string;
  /** Riavvia l'applicazione sullo stesso database (simula un riavvio). */
  restart(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestEnv(opts: { dir?: string } = {}): Promise<TestEnv> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'persona-test-'));
  const start = async () =>
    buildApp({
      config: {
        dataDir: dir,
        databaseFile: join(dir, 'persona.db'),
        backupsDir: join(dir, 'backups'),
        mockDelayMs: 0,
        webDistDir: null,
        lmStudioUrl: 'http://127.0.0.1:9/v1',
      },
    });
  let built = await start();
  const env: TestEnv = {
    app: built.app,
    ctx: built.ctx,
    dir,
    mockConfigId: '',
    async restart() {
      await settleBackground(env.ctx);
      await env.app.close();
      built = await start();
      env.app = built.app;
      env.ctx = built.ctx;
    },
    async close() {
      await settleBackground(env.ctx);
      await env.app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  // Il provider mock diventa il predefinito: i test non richiedono LM Studio.
  const configs = (await env.app.inject({ method: 'GET', url: '/api/model-configs' })).json() as { id: string; providerType: string }[];
  const mock = configs.find((c) => c.providerType === 'mock')!;
  env.mockConfigId = mock.id;
  await env.app.inject({
    method: 'PUT',
    url: `/api/model-configs/${mock.id}`,
    payload: { name: 'Mock', providerType: 'mock', model: 'mock-persona', isDefault: true, contextLength: 8192, maxTokens: 512 },
  });
  return env;
}

export function parseSse(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)) as StreamEvent);
}

export const astrophysicist = {
  name: 'Irina Volkova',
  age: '52',
  origin: 'Novosibirsk, Russia',
  occupation: 'Astrofisica',
  education: 'Dottorato in astrofisica teorica (MSU)',
  biography: 'Cresciuta in Siberia, ha lavorato a Pulkovo e poi all’ESO. Studia la dinamica delle stelle binarie.',
  temperament: 'Riflessiva, impaziente con la superficialità',
  register: 'Colloquiale-tecnico',
  humor: 'Ironia asciutta',
  traits: [
    { category: 'personality', content: 'Curiosa e meticolosa' },
    { category: 'fear', content: 'Perdere la vista' },
    { category: 'value', content: 'Onestà intellettuale' },
  ],
  languages: [
    { code: 'ru', proficiency: 'native', isNative: true },
    { code: 'en', proficiency: 'fluent', isNative: false },
    { code: 'it', proficiency: 'intermediate', isNative: false },
  ],
  expertise: [
    { domain: 'Cosmologia', level: 'expert', subtopics: ['materia oscura', 'radiazione cosmica di fondo'] },
    { domain: 'Meccanica orbitale', level: 'expert', subtopics: ['problema dei tre corpi'] },
  ],
};

export async function createCharacter(env: TestEnv, overrides: Record<string, unknown> = {}) {
  const res = await env.app.inject({ method: 'POST', url: '/api/characters', payload: { ...astrophysicist, ...overrides } });
  if (res.statusCode !== 201) throw new Error(`create character failed: ${res.body}`);
  return res.json() as import('@persona/shared').Character;
}

export async function send(env: TestEnv, conversationId: string, payload: Record<string, unknown>) {
  const res = await env.app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/messages`, payload });
  return parseSse(res.body);
}
