import Redis from 'ioredis';
import axios from 'axios';
import fastify from 'fastify';
import {
  REDIS_URL,
  GAME_NODES_AMOUNT,
  GAME_SERVER_HTTP,
  GAME_SERVER_PORT,
  GAME_SERVER_SERVICE,
} from './config';

const redis = new Redis(REDIS_URL);
const app = fastify({ logger: true });

const nodes = Array.from({ length: GAME_NODES_AMOUNT }, (_, i) => {
  let host = GAME_SERVER_SERVICE;
  if (i > 0) host += `-${i + 1}`;
  return {
    id: `${host}:${GAME_SERVER_PORT}`,
    http: `http://${host}:${GAME_SERVER_HTTP}`,
    ws: `ws://${host}:${GAME_SERVER_PORT}`,
  };
});

app.get('/health', async () => ({ status: 'ok' }));

async function updateScores() {
  for (const node of nodes) {
    try {
      const res = await axios.get(`${node.http}/metrics`);
      const match = res.data.match(/game_server_matches (\d+)/);
      const score = match ? Number(match[1]) : 0;
      await redis.hset(
        'game-node:scores',
        node.id,
        JSON.stringify({
          id: node.id,
          http: node.http,
          ws: node.ws,
          score,
        }),
      );
    } catch (err) {
      await redis.hdel('game-node:scores', node.id);
    }
  }
}

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log(
      `[Scorer] Running scorer with nodes:`,
      nodes.map((n) => n.id),
    );
    setInterval(updateScores, 5000);
    updateScores();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
