// packages/pong/render-babylon/vite.config.ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
