import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // three.js lives in lazy chunks; the default 500 kB limit only produces noise.
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true, ws: true } },
  },
});
