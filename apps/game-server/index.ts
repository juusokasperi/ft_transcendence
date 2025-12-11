/**
 * Entry point for the game-server process.
 *
 * Responsibilities:
 *   - construct a GameServer (which wires config, Redis, HTTP, WS, etc.)
 *   - start the WebSocket listener used for online Pong matches
 *
 * This module is executed by:
 *   - dev: `docker-compose.yml` → `game-server` service → `pnpm dev`
 *     which runs `tsx index.ts` in `apps/game-server`.
 *   - prod: `docker-compose-prod.yml` → `game-server` services built via
 *     `node.template.dockerfile` and started with `node dist/index.js`.
 *
 * In both cases, **this file is the only place** where `new GameServer()`
 * is instantiated; all other wiring happens inside the GameServer class.
 */
import { GameServer } from './src/app/GameServer.ts';

/**
 * Bootstrap the GameServer and start listening.
 *
 * Called once at process startup; any unhandled rejection here should cause
 * the container/process to crash so orchestration can restart it.
 */
async function bootstrap() {
  const server = new GameServer();
  await server.start();
}

// Fire-and-forget startup; top-level void ensures we don't await in module scope.
void bootstrap();
