/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Le variabili PERSONA_* valgono anche dal file .env nella root (come per il backend);
  // quelle esportate nella shell hanno la precedenza.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...loadEnv(mode, root, 'PERSONA_'), ...process.env };
  const backend = env.PERSONA_BACKEND_URL ?? `http://127.0.0.1:${env.PERSONA_PORT ?? 4317}`;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Solo localhost per impostazione predefinita.
      host: '127.0.0.1',
      // 5111 (non 5173, spesso già occupata da altri progetti Vite); PERSONA_WEB_PORT per cambiarla.
      port: Number(env.PERSONA_WEB_PORT || 5111),
      strictPort: false,
      proxy: {
        '/api': { target: backend, changeOrigin: false },
      },
    },
    preview: { host: '127.0.0.1', port: 4173 },
    build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 1200 },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
