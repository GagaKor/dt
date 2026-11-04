import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // three-mesh-bvh has no "exports", so Node would load its UMD "main" and pull in a
    // second, CommonJS copy of three. Point tests at its ESM "module" entry like the bundle.
    alias: [{ find: /^three-mesh-bvh$/, replacement: 'three-mesh-bvh/src/index.js' }],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
