/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backend = process.env.PERSONA_BACKEND_URL ?? `http://127.0.0.1:${process.env.PERSONA_PORT ?? 4317}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Solo localhost per impostazione predefinita.
    host: '127.0.0.1',
    port: 5173,
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
});
