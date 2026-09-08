import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const target = process.env.SERVER_URL ?? 'http://localhost:8787';
const sharedSrc = fileURLToPath(new URL('../shared/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    // dddice-js (three.js) is a lazy chunk loaded only when 3D dice are enabled.
    chunkSizeWarningLimit: 1400,
  },
  resolve: {
    alias: [{ find: '@dnd-table/shared', replacement: sharedSrc + '/index.ts' }],
  },
  server: {
    host: true, // expose on LAN
    port: 5173,
    proxy: {
      '/ws': { target: target.replace('http', 'ws'), ws: true },
      '/health': { target },
      '/upload': { target },
      '/uploads': { target },
    },
  },
});
