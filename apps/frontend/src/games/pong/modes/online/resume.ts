const RESUME_STORE_PREFIX = 'pong:resume:';
const SUPPRESS_KEY = 'pong:resume:suppressUntilMs';
const TOURNAMENT_ROOM_PREFIX = 'pong:resume:tournament:';

export function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1] as string; // safe after length guard above
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function readJwtExpSec(token: string): number | null {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) ? exp : null;
}

function makeResumeKey(roomIdentifier: string, sessionIdentifier: string, jti?: string): string {
  // Include jti so we can cache more than one token per session.
  return `${RESUME_STORE_PREFIX}${roomIdentifier}:${sessionIdentifier}${jti ? `:${jti}` : ''}`;
}

function makeTournamentKey(roomIdentifier: string): string {
  return `${TOURNAMENT_ROOM_PREFIX}${roomIdentifier}`;
}

export function markTournamentRoom(roomIdentifier: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(makeTournamentKey(roomIdentifier), '1');
  } catch {
    // ignore
  }
}

export function isTournamentRoom(roomIdentifier: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(makeTournamentKey(roomIdentifier)) === '1';
  } catch {
    return false;
  }
}

export function clearTournamentRoomMark(roomIdentifier: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(makeTournamentKey(roomIdentifier));
  } catch {
    // ignore
  }
}

export function clearResumeForRoom(roomIdentifier: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const prefix = `${RESUME_STORE_PREFIX}${roomIdentifier}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
    clearTournamentRoomMark(roomIdentifier);
  } catch {
    // ignore
  }
}

export function saveResumeTokenToSession(token: string, expectedRoom: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const payload = parseJwtPayload(token);
  const room = String(payload?.roomIdentifier || '');
  const session = String(payload?.sessionIdentifier || '');
  const jti = String(payload?.jti || '');
  const exp = Number(payload?.exp);
  if (!room || !session || !Number.isFinite(exp)) return;
  if (room !== expectedRoom) return; // do not persist cross-room tokens
  try {
    // Garbage collect expired tokens for this room and keep only a small set of freshest tokens.
    const nowSec = Math.floor(Date.now() / 1000);
    const prefix = `${RESUME_STORE_PREFIX}${room}:`;
    const toRemove: string[] = [];
    const validEntries: Array<{ key: string; expSec: number }> = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) {
        try {
          const raw = sessionStorage.getItem(k);
          if (!raw) {
            toRemove.push(k);
            continue;
          }
          const parsed = JSON.parse(raw);
          if (typeof parsed?.expSec === 'number' && parsed.expSec <= nowSec) toRemove.push(k);
          else if (typeof parsed?.expSec === 'number')
            validEntries.push({ key: k, expSec: parsed.expSec });
        } catch {
          toRemove.push(k);
        }
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));

    // Add the new token and then enforce a small cap (keep the newest 3 by exp).
    const key = makeResumeKey(room, session, jti || undefined);
    sessionStorage.setItem(key, JSON.stringify({ token, expSec: exp }));

    validEntries.push({ key, expSec: exp });
    validEntries.sort((a, b) => b.expSec - a.expSec);
    const excess = validEntries.slice(3);
    excess.forEach(({ key: k }) => sessionStorage.removeItem(k));
  } catch {
    // ignore storage errors (quota, privacy, etc.)
  }
}

export function loadResumeTokenFromSession(room: string): { token: string; expSec: number } | null {
  if (typeof sessionStorage === 'undefined') return null;
  const prefix = `${RESUME_STORE_PREFIX}${room}:`;
  const nowSec = Math.floor(Date.now() / 1000);
  let best: { key: string; token: string; expSec: number } | null = null;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const token = String(parsed?.token || '');
        const expSec = Number(parsed?.expSec);
        if (!token || !Number.isFinite(expSec) || expSec <= nowSec) continue;
        if (!best || expSec > best.expSec) best = { key: k, token, expSec };
      } catch {
        // malformed entry; drop it
        sessionStorage.removeItem(k);
      }
    }
    if (!best) return null;
    return { token: best.token, expSec: best.expSec };
  } catch {
    return null;
  }
}

export function getStoredResumeCandidate(roomIdentifier: string) {
  return loadResumeTokenFromSession(roomIdentifier);
}

export function clearStoredResumeTokens(roomIdentifier: string): void {
  clearResumeForRoom(roomIdentifier);
}

export function findAnyStoredResumeCandidate(): {
  roomIdentifier: string;
  token: string;
  expSec: number;
} | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const untilMsRaw = sessionStorage.getItem(SUPPRESS_KEY);
    const untilMs = untilMsRaw ? Number(untilMsRaw) : 0;
    if (Number.isFinite(untilMs) && untilMs > Date.now()) {
      return null;
    }
  } catch {
    // ignore suppression read errors
  }
  const prefix = RESUME_STORE_PREFIX;
  const nowSec = Math.floor(Date.now() / 1000);
  let best: { roomIdentifier: string; token: string; expSec: number } | null = null;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const token = String(parsed?.token || '');
        const expSec = Number(parsed?.expSec);
        if (!token || !Number.isFinite(expSec) || expSec <= nowSec) continue;
        // Extract roomIdentifier from key: pong:resume:<room>:<session>
        const parts = k.substring(prefix.length).split(':');
        const roomIdentifier = parts[0] ?? '';
        if (!roomIdentifier) continue;
        if (!best || expSec > best.expSec) best = { roomIdentifier, token, expSec };
      } catch {
        sessionStorage.removeItem(k);
      }
    }
    return best;
  } catch {
    return null;
  }
}
