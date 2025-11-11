import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  root: '.',
  plugins: [tsconfigPaths()],
  build: {
    ssr: path.resolve(__dirname, 'index.ts'), // entry point
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`), // include node: prefix variants
        'fastify',
        'axios',
        'dotenv',
        'ioredis',
        'uuid',
        'ws',
      ],
      output: {
        entryFileNames: `[name].js`,
      },
    },
  },
  esbuild: {
    target: 'node22',
  },
});
