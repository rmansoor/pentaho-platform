/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served by pentaho-war at /pentaho/console/. In dev, API calls proxy to a local Pentaho Server.
export default defineConfig({
  base: '/pentaho/console/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/pentaho/api': { target: 'http://localhost:8080', changeOrigin: false },
      '/pentaho/plugin': { target: 'http://localhost:8080', changeOrigin: false },
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
