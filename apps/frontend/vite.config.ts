// apps/frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },
    proxy: { '/api': { target: 'http://backend:3001', changeOrigin: true, ws: true } },
  },
  cacheDir: './.vite',
  plugins: [react(), tailwindcss(), tsconfigPaths({ projects: ['./tsconfig.json'] })],
  optimizeDeps: {
    include: ['react-icons/fi'],
  },
  test: { globals: true, environment: 'jsdom' },
});
