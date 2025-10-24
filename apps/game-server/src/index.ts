import { GameServer } from './app/GameServer.ts';

async function main() {
  const server = new GameServer();
  await server.start();
}

void main();
