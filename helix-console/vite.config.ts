/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served by pentaho-war at /pentaho/console/. In dev, everything else under /pentaho (REST API,
// plugins, the login page) is proxied to a Pentaho Server, so signing in at
// http://localhost:5173/pentaho/Login gives the console a same-origin session, as in production.
// Point it at another server with HELIX_SERVER=http://localhost:8090.
const server = process.env.HELIX_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  base: '/pentaho/console/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '^/pentaho/(?!console(/|$))': { target: server, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
