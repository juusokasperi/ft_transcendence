import jwt from 'jsonwebtoken';
import { SECRET } from './config.ts';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
export async function verifySiteToken(token: string): Promise<{ username: string, uuid: string } | null> {
  try {
    const payload = jwt.verify(token, SECRET) as { username: string, uuid: string };
    return { uuid: payload.uuid, username: payload.username };
  } catch {
    return null;
  }
};

//fix the fetch url here..
export async function fetchUserMMR(uuid: string, siteToken: string): Promise<number | null> {
  try {
    const res = await fetch(`http://backend:3001/api/users/${uuid}`, {
      headers: { Authorization: `Bearer ${siteToken}`},
    });
    if (!res.ok){
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
  if (!cookieHeader)
  {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  const match = cookieHeader.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2])
  {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  return match[2];
};

