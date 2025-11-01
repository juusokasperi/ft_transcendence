import { Client } from './types.ts';
import jwt from 'jsonwebtoken';
import type { IncomingMessage } from 'http';

const SECRET = process.env.SECRET || 'yourSecretForJWTToken';

async function verifySiteToken(token: string): Promise<{ username: string; uuid: string }> {
  const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
  return { uuid: payload.uuid, username: payload.username };
}

function findExistingClient(uuid: string, clients: Map<string, Client>): Client | undefined {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

export async function handleAuth(
  client: Client,
  token: string,
  clients: Map<string, Client>,
): Promise<boolean> {
  let user: { username: string; uuid: string };
  try {
    user = await verifySiteToken(token);
  } catch (err) {
    let message = 'Invalid token';
    if (err && typeof err === 'object' && 'name' in err && err.name === 'TokenExpiredError') {
      message = 'Token expired';
    }
    // log('Error: ' + message, { clientId: client.id });
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message }));
    client.socket.close();
    return false;
  }
  // If user is already connected, close the old connection and allow the new one
  const existingClient = findExistingClient(user.uuid, clients);
  if (existingClient) {
    // log('User reconnecting, closing old connection', {
    //   oldClientId: existingClient.id,
    //   newClientId: client.id,
    //   uuid: user.uuid,
    // });
    existingClient.socket.send(
      JSON.stringify({ type: 'INFO', message: 'New connection detected, closing this one' }),
    );
    existingClient.socket.close();
    clients.delete(existingClient.id);
  }
  client.username = user.username;
  client.uuid = user.uuid;
  // log(`Client authenticated, admitting to chat service`, {
  //   uuid: client.uuid,
  // });
  return true;
}

export function extractToken(socket: WebSocket, req: IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    // log('Auth: cookie header missing');
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  const match = cookieHeader.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2]) {
    // log('Auth: token cookie missing');
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  return match[2];
}
