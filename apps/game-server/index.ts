import { GameServer } from './src/app/GameServer.ts';

async function bootstrap() {
  const server = new GameServer();
  await server.start();
}

void bootstrap();
