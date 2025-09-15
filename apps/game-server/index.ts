import { WebSocketServer, type WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';

const PORT = Number(process.env.GAME_SERVER_PORT || 55555);
const wss = new WebSocketServer({ port: PORT });

interface Match {
  id: string;
  clients: WebSocket[];
}

const matches = new Map<string, Match>();

wss.on('connection', (socket: WebSocket, req) => {
  // Extract match ID from query parameters
  const url = req.url || '/';
  const matchId = url.split('/')[1];
  if (!matchId) {
    socket.close();
    return;
  }

  let match = matches.get(matchId);
  if (!match) {
    match = { id: matchId, clients: [] };
    matches.set(matchId, match);
  }
  match.clients.push(socket);

  socket.on('message', (msg) => {
    // Forward message to all other clients in the same match
    match.clients.forEach((client) => {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(msg);
      }
    });
  });

  socket.on('close', () => {
    match!.clients = match!.clients.filter((c) => c !== socket);
    if (match!.clients.length === 0) matches.delete(matchId);
  });
});

console.log(`Game server listening on ${PORT}`);