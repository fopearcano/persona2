/**
 * Prepara dist/ per Electron:
 * - dist/main.mjs: processo principale con il backend incorporato (esbuild; i pacchetti npm
 *   restano esterni e vengono risolti da desktop/node_modules);
 * - dist/drizzle: migrazioni SQL;  dist/web: build del frontend (npm run build nella root).
 */
import { build } from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'dist');
const webDist = join(root, 'web', 'dist');

if (!existsSync(join(webDist, 'index.html'))) {
  console.error('Build del frontend mancante: eseguire "npm run build" nella root del progetto.');
  process.exit(1);
}

// @persona/shared viene incluito dai sorgenti TypeScript: non serve installare il monorepo.
const sharedSource = {
  name: 'persona-shared-source',
  setup(b) {
    b.onResolve({ filter: /^@persona\/shared$/ }, () => ({ path: join(root, 'shared', 'src', 'index.ts') }));
  },
};

rmSync(out, { recursive: true, force: true });
await build({
  plugins: [sharedSource],
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(out, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Pacchetti nativi o con file di runtime: installati in desktop/node_modules.
  external: ['electron', 'better-sqlite3', 'fastify', '@fastify/static', 'drizzle-orm', 'drizzle-orm/*', 'unpdf', 'zod'],
  // Alcune dipendenze CommonJS usano require(): lo forniamo anche nel bundle ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
cpSync(join(root, 'server', 'drizzle'), join(out, 'drizzle'), { recursive: true });
cpSync(webDist, join(out, 'web'), { recursive: true });
console.log('desktop/dist pronto');
