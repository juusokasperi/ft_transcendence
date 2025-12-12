import jwt from 'jsonwebtoken';
import { SECRET, API_URL } from '../utils/config.ts';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';

/**
 * Verify a site token (frontend auth cookie) and extract user identity.
 *
 * The token is a JWT signed with the same SECRET as the backend; payload
 * contains `username` and `uuid`.
 */
export async function verifySiteToken(token: string): Promise<{ username: string; uuid: string }> {
  const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
  return { uuid: payload.uuid, username: payload.username };
}

/**
 * Fetch the user's MMR from the backend API using their site token.
 *
 * Returns:
 *  - a numeric ranking when available,
 *  - or a default 1000 if ranking is missing,
 *  - or null when the request fails.
 */
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
    return typeof data.ranking === 'number' ? data.ranking : 1000;
  } catch {
    log('Auth: failed to fetch MMR');
    return null;
  }
}

/**
 * Extract the `token` cookie from an incoming WS upgrade request.
 *
 * If the cookie or token is missing, sends an AUTH error to the client and
 * closes the socket.
 */
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

/**
 * Authenticate a newly connected matchmaking client based on the site token.
 *
 * Steps:
 *   - verify the JWT (username + uuid)
 *   - if the user is already connected, close the previous socket
 *   - fetch MMR from the backend
 *   - populate ClientInfo fields and mark as authenticated
 */
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
  // If user is already connected, close the old connection and allow the new one.
  const existingClient = findExistingClient(user.uuid, clients);
  if (existingClient) {
    log('User reconnecting, closing old connection', {
      oldClientId: existingClient.id,
      newClientId: client.id,
      uuid: user.uuid,
    });
    existingClient.socket.send(
      JSON.stringify({ type: 'INFO', message: 'New connection detected, closing this one' }),
    );
    existingClient.socket.close();
    clients.delete(existingClient.id);
  }
  // Fetch user MMR from backend
  const mmr = await fetchUserMMR(user.uuid, token);
  if (typeof mmr !== 'number') {
    log("Error: Couldn't fetch users MMR", { clientId: client.id });
    client.socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'MMR not found' }));
    client.socket.close();
    return false;
  }
  // Populate client info
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

function findExistingClient(
  uuid: string,
  clients: Map<string, ClientInfo>,
): ClientInfo | undefined {
  for (const client of clients.values()) {
    if (client.uuid === uuid && client.authenticated) return client;
  }
  return undefined;
}

/**
 * Guard that ensures a client is authenticated before proceeding.
 *
 * Sends an AUTH error when the client is not authenticated.
 */
export function isAuthenticated(client: ClientInfo): boolean {
  if (!client.authenticated)
    client.socket.send(
      JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Not authenticated' }),
    );
  return client.authenticated;
}
