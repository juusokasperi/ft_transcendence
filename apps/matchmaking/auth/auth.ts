import jwt from 'jsonwebtoken';
import { SECRET, API_URL } from '../utils/config.ts';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { ClientInfo } from '../types/types.ts';
import { log } from '../utils/log.ts';

export async function verifySiteToken(token: string): Promise<{ username: string; uuid: string }> {
  const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
  return { uuid: payload.uuid, username: payload.username };
}

//fix the fetch url here..
export async function fetchUserMMR(uuid: string, siteToken: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/api/users/${uuid}`, {
      headers: { Authorization: `Bearer ${siteToken}` },
    });
    if (!res.ok) {
      log('Auth: /api/users/:uuid responded non-200', { status: res.status });
      return null;
    }
    const data = await res.json();
    return typeof data.ranking === 'number' ? data.ranking : null;
  } catch {
    log('Auth: failed to fetch MMR');
    return null;
  }
}

export function extractToken(socket: WebSocket, req: IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    log('Auth: cookie header missing');
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  const match = cookieHeader.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2]) {
    log('Auth: token cookie missing');
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
  log('Auth: attempt', { remoteId: client.id });
  let user: { username: string; uuid: string };
  try {
    user = await verifySiteToken(token);
  } catch (err) {
    let message = 'Invalid token';
    if (err && typeof err === 'object' && 'name' in err && err.name === 'TokenExpiredError') {
      message = 'Token expired';
    }
    log('Error: ' + message, { clientId: client.id });
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message }));
    client.socket.close();
    return false;
  }
  if (isUserAlreadyConnected(user.uuid, clients)) {
    log('Error: User already connected, closing socket', { clientId: client.id });
    client.socket.send(
      JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'User already connected' }),
    );
    client.socket.close();
    return false;
  }
  const mmr = await fetchUserMMR(user.uuid, token);
  if (typeof mmr !== 'number') {
    log("Error: Couldn't fetch users MMR", { clientId: client.id });
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'MMR not found' }));
    client.socket.close();
    return false;
  }
  client.username = user.username;
  client.uuid = user.uuid;
  client.authenticated = true;
  client.mmr = mmr;
  client.siteToken = token;
  log(`Client authenticated, admitting to MM service`, {
    uuid: client.uuid,
    mmr: client.mmr,
  });
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
    client.socket.send(
      JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Not authenticated' }),
    );
  return client.authenticated;
}
