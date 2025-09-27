import jwt from 'jsonwebtoken';
import { SECRET, API_URL } from '../utils/config.ts';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { ClientInfo } from '../types/types.ts';
import { log } from '../utils/log.ts';

export async function verifySiteToken(
  token: string,
): Promise<{ username: string; uuid: string } | null> {
  try {
    const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
    return { uuid: payload.uuid, username: payload.username };
  } catch {
    return null;
  }
}

//fix the fetch url here..
export async function fetchUserMMR(uuid: string, siteToken: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/users/${uuid}`, {
      headers: { Authorization: `Bearer ${siteToken}` },
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return typeof data.ranking === 'number' ? data.ranking : null;
  } catch {
    return null;
  }
}

export function extractToken(socket: WebSocket, req: IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  const match = cookieHeader.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2]) {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  return match[2];
}

export async function handleAuth(
  client: ClientInfo,
  token: string,
  clients: Map<string, ClientInfo>,
): Promise<boolean> {
  const user = await verifySiteToken(token);
  if (!user) {
    log('Error: Invalid token');
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Invalid token' }));
    client.socket.close();
    return false;
  }
  if (isUserAlreadyConnected(user.uuid, clients)) {
    log('Error: User already connected, closing socket');
    client.socket.send(
      JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'User already connected' }),
    );
    client.socket.close();
    return false;
  }
  const mmr = await fetchUserMMR(user.uuid, token);
  if (typeof mmr !== 'number') {
    log("Error: Couldn't fetch users MMR");
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'MMR not found' }));
    client.socket.close();
    return false;
  }
  client.username = user.username;
  client.uuid = user.uuid;
  client.authenticated = true;
  client.mmr = mmr;
  return true;
}

function isUserAlreadyConnected(uuid: string, clients: Map<string, ClientInfo>): boolean {
  for (const client of clients.values()) {
    if (client.uuid === uuid && client.authenticated) return true;
  }
  return false;
}

export function isAuthenticated(client: ClientInfo): boolean {
  if (!client.authenticated)
    client.socket.send({ type: 'ERROR', code: 'AUTH', message: 'Not authenticated' });
  return client.authenticated;
}
