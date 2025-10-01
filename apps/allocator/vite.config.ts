import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { builtinModules } from 'module';

export default defineConfig({
	  resolve: {
    alias: {
      // Map workspace packages to their source
      // '@pong/game-logic': path.resolve(__dirname, '../../packages/pong/game-logic/src/index.ts'),
      '@pong/shared': path.resolve(__dirname, '../../packages/pong/shared/src/'),
    }
  },
  root: '.',
  plugins: [tsconfigPaths()],
  build: {
    ssr: path.resolve(__dirname, 'index.ts'), // entry point
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: [...builtinModules], // don't bundle Node built-ins
      output: {
        entryFileNames: `[name].js`,
      },
    },
  },
  esbuild: {
    target: 'node22',
  },
});
