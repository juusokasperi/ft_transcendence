import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const frontendHost = env.FRONTEND_HOST || '0.0.0.0';
  const frontendPort = Number(env.FRONTEND_PORT || 5173);

  const apiTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://backend:3001';
  const mmTarget = (env.VITE_MATCHMAKING_PROXY_TARGET || 'ws://matchmaking-service:4242').replace(
    /^ws/,
    'http',
  );
  const gameTarget = (env.VITE_GAME_WS_PROXY_TARGET || 'ws://game-server:55553').replace(
    /^ws/,
    'http',
  );

  const clientPort = Number(env.PUBLIC_DEV_PORT || 5173);

  return {
    server: {
      host: frontendHost,
      port: frontendPort,
      strictPort: true,
      watch: { usePolling: true },
      hmr: { clientPort, protocol: 'ws' }, // HMR over nginx :8080
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
        '/matchmaking': { target: mmTarget, changeOrigin: true, ws: true },
        '/game-server': { target: gameTarget, changeOrigin: true, ws: true },
      },
    },
    cacheDir: './.vite',
    plugins: [react(), tailwindcss(), tsconfigPaths({ projects: ['./tsconfig.json'] })],
    optimizeDeps: {
      include: ['react-icons/fi'],
    },
    test: { globals: true, environment: 'jsdom' },
  };
});
