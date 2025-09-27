import Redis from 'ioredis';
import axios from 'axios';
import { REDIS_URL, GAME_NODES } from './config';

const redis = new Redis(REDIS_URL);
const nodes = (GAME_NODES || '')
  .split(',')
  .filter(Boolean)
  .map((addr: string) => {
    const [host, wsPort, httpPort] = addr.split(':');
    return {
      id: `${host}:${wsPort}`,
      http: `http://${host}:${httpPort}`,
      ws: `ws://${host}:${wsPort}`,
    };
  });

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

console.log(`[Scorer] Running scorer`);

setInterval(updateScores, 5000);
updateScores();
