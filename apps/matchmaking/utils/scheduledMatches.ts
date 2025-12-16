import axios from 'axios';
import jwt from 'jsonwebtoken';
import type {
  AcceptScheduledRequest,
  CreateTournamentRequest,
  JoinTournamentRequest,
  MatchmakingMessage,
  TournamentBracketSnapshotMessage,
  TournamentLobbyUpdatedMessage,
  TournamentMatchCountdownMessage,
  TournamentMatchCountdownStatus,
  TournamentMatchesReadyMessage,
} from '@pong/shared/protocol/net';
import { createMatch } from './queue.ts';
import { ClientState, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';
import {
  API_URL,
  MATCH_SECRET,
  TOURNAMENT_MATCH_AUTO_START_DELAY_MS,
  TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS,
  TOURNAMENT_MAX_REMINDERS,
  TOURNAMENT_REMINDER_DELAY_MS,
} from './config.ts';
import * as Config from './config.ts';
import { setClientState } from './state.ts';
import {
  clearTournamentMembership,
  setTournamentMembership,
  syncTournamentMembershipSnapshot,
} from './tournamentMembershipRegistry.ts';
import { cancelInviteLobbyForPlayerUuid, TOURNAMENT_INVITE_BLOCK_REASON } from './invites.ts';

/**
 * Tournament scheduling + state sync for matchmaking.
 *
 * This file owns the tournament-specific control plane inside the matchmaking service:
 *   - tournament lifecycle actions (create, join, leave, forfeit)
 *   - in-memory membership tracking and WS subscriptions per tournament
 *   - reacting to Redis stream messages (`TOURNAMENT_MATCHES_READY`, state updates)
 *   - per-match invitation + countdown + auto-start, including absence auto-wins
 *   - periodic full-state sync from backend APIs to keep brackets/lobbies consistent.
 *
 * It is intentionally in-memory and best-effort: if matchmaking restarts,
 * the backend is the source of truth and `restoreTournamentMembership` + Redis streams
 * will rebuild local state for connected clients.
 */

// Some tests partially mock the config module and may omit certain exports.
// Safely resolve absence auto-win delay with a sensible default to avoid
// Vitest "missing export" errors when the mock doesn't define it.
const ABSENCE_AUTO_WIN_MS: number =
  'TOURNAMENT_ABSENCE_AUTO_WIN_MS' in Config &&
  typeof (Config as any).TOURNAMENT_ABSENCE_AUTO_WIN_MS === 'number'
    ? (Config as any).TOURNAMENT_ABSENCE_AUTO_WIN_MS
    : 10_000;

// Matches that have already been launched (so we don't double-handoff on retries).
const scheduledTournamentMatches = new Set<number>();

interface PendingTournamentMatch {
  /** Tournament owning this match. */
  tournamentId: number;
  /** Match payload as received from backend/Redis. */
  match: TournamentMatchesReadyMessage['matches'][number];
  /** Reminder timer used to re-invite when players are missing/offline. */
  reminder?: NodeJS.Timeout;
  /** How many reminder attempts have been made so far. */
  attempts: number;
  countdown?: {
    /** Interval that emits TOURNAMENT_MATCH_COUNTDOWN ticks. */
    interval?: NodeJS.Timeout;
    /** Execution timer that actually starts the match at targetStartEpochMs. */
    execution?: NodeJS.Timeout;
    /** Scheduled absolute start time for the match. */
    targetStartEpochMs: number;
    /** Last broadcast status/seconds to avoid spamming identical countdown frames. */
    lastStatus?: TournamentMatchCountdownStatus;
    lastSecondsRemaining?: number;
  };
  /** Absence grace window timer that may auto-forfeit a missing participant. */
  absenceTimeout?: NodeJS.Timeout;
}

// Pending match invitations keyed by tournamentMatchId.
const pendingTournamentMatches = new Map<number, PendingTournamentMatch>();
// Subscribers per tournamentId (client.id set) for lobby/bracket broadcasts.
const tournamentSubscribers = new Map<number, Set<string>>();

/**
 * Mint a short-lived service JWT for matchmaking → backend tournament endpoints.
 *
 * Used for privileged automation (e.g., auto-forfeit absent players). This token
 * is signed with MATCH_SECRET and validated server-side as a service identity.
 */
function createMatchServiceToken() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ service: 'matchmaking', iat: now, exp: now + 60 }, MATCH_SECRET);
}

/** Lookup a connected matchmaking client by stable user UUID. */
function findClientByUuid(clients: Map<string, ClientInfo>, uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

/**
 * Tournament actions invalidate invite-lobbies.
 *
 * Called before create/join/restore so a user can't be in an invite match and a
 * tournament simultaneously.
 */
function cancelInviteIfNeeded(client: ClientInfo, context: string) {
  if (cancelInviteLobbyForPlayerUuid(client.uuid, { reason: TOURNAMENT_INVITE_BLOCK_REASON })) {
    log('Cancelled invite lobby before tournament action', {
      uuid: client.uuid,
      context,
      tournamentId: client.tournamentId,
    });
  }
}

/**
 * Mirror a client's tournament membership into the in-memory registry.
 *
 * The registry is used by invite flow and by reconnect/resume logic to know that
 * a UUID is "reserved" for tournament context.
 */
function trackClientTournamentMembership(client: ClientInfo, tournamentId: number) {
  if (!client.uuid) return;
  setTournamentMembership(client.uuid, {
    tournamentId,
    participantId: client.tournamentParticipantId,
  });
}

/** Remove a UUID from the in-memory tournament membership registry. */
function clearClientTournamentMembership(client: ClientInfo) {
  if (!client.uuid) return;
  clearTournamentMembership(client.uuid);
}

/**
 * Best-effort WS send. Tournament flows should not crash on broken sockets.
 */
function sendToClient(client: ClientInfo, payload: MatchmakingMessage) {
  try {
    client.socket.send(JSON.stringify(payload));
  } catch (error) {
    log('Failed to send tournament payload to client', { uuid: client.uuid, error }, 'warn');
  }
}

/**
 * Get or create the subscriber set for a tournament.
 *
 * We store `client.id` instead of UUID so we can handle multiple tabs/devices.
 */
function getSubscriberSet(tournamentId: number) {
  let set = tournamentSubscribers.get(tournamentId);
  if (!set) {
    set = new Set<string>();
    tournamentSubscribers.set(tournamentId, set);
  }
  return set;
}

/** Start receiving lobby/bracket/countdown broadcasts for a tournament. */
function subscribeClientToTournament(tournamentId: number, client: ClientInfo) {
  getSubscriberSet(tournamentId).add(client.id);
}

/** Stop receiving tournament broadcasts for this connection. */
function unsubscribeClientFromTournament(tournamentId: number, clientId: string) {
  const set = tournamentSubscribers.get(tournamentId);
  if (!set) return;
  set.delete(clientId);
  if (!set.size) tournamentSubscribers.delete(tournamentId);
}

/**
 * Broadcast a tournament-scoped message to all subscribed clients.
 *
 * Stale client ids are cleaned up opportunistically during broadcast.
 */
function broadcastToTournament(
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  payload:
    | TournamentLobbyUpdatedMessage
    | TournamentBracketSnapshotMessage
    | TournamentMatchesReadyMessage
    | TournamentMatchCountdownMessage,
) {
  const subscribers = tournamentSubscribers.get(tournamentId);
  if (!subscribers || !subscribers.size) return;

  for (const clientId of [...subscribers]) {
    // Clean up stale subscriber ids when a socket has disconnected.
    const client = clients.get(clientId);
    if (!client) {
      subscribers.delete(clientId);
      continue;
    }
    sendToClient(client, payload as MatchmakingMessage);
  }
}

/**
 * Schedule a reminder to re-run `handleSingleTournamentMatch` later.
 *
 * We use this when a match is ready but one/both players are offline. Each reminder
 * re-evaluates availability and may start a countdown when both are present.
 */
function scheduleTournamentReminder(
  match: TournamentMatchesReadyMessage['matches'][number],
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  attempts: number,
) {
  // Give up after TOURNAMENT_MAX_REMINDERS to avoid infinite retries.
  if (attempts >= TOURNAMENT_MAX_REMINDERS) {
    log(
      'Tournament match reminder exhausted',
      { tournamentId, matchId: match.tournamentMatchId },
      'warn',
    );
    const pending = pendingTournamentMatches.get(match.tournamentMatchId);
    if (pending && pending.reminder) {
      clearTimeout(pending.reminder);
      pending.reminder = undefined;
    }
    pendingTournamentMatches.delete(match.tournamentMatchId);
    return;
  }

  // Refresh the pending record and clear any previous reminder.
  const pending = pendingTournamentMatches.get(match.tournamentMatchId);
  if (!pending) return;
  if (pending.reminder) clearTimeout(pending.reminder);

  // Re-run the single-match handler after the configured delay.
  pending.reminder = setTimeout(() => {
    pending.reminder = undefined;
    handleSingleTournamentMatch(match, tournamentId, clients, attempts + 1);
  }, TOURNAMENT_REMINDER_DELAY_MS);

  // Persist attempt count for later logs/flows.
  pending.attempts = attempts;
  log('Queued tournament match reminder', {
    tournamentId,
    matchId: match.tournamentMatchId,
    attempts: attempts + 1,
  });
}

/**
 * Cancel any active countdown timers for a pending match.
 *
 * When `remove` is true we also delete the countdown object so a new one can be started fresh.
 */
function clearTournamentCountdown(pending: PendingTournamentMatch, remove = true) {
  const countdown = pending.countdown;
  if (!countdown) return;
  if (countdown.interval) {
    clearInterval(countdown.interval);
    countdown.interval = undefined;
  }
  if (countdown.execution) {
    clearTimeout(countdown.execution);
    countdown.execution = undefined;
  }
  if (remove) {
    pending.countdown = undefined;
  }
}

/** Cancel the absence grace timer if it exists. */
function clearAbsenceTimeout(pending: PendingTournamentMatch) {
  if (pending.absenceTimeout) {
    clearTimeout(pending.absenceTimeout);
    pending.absenceTimeout = undefined;
  }
}

/**
 * Ask backend to auto-forfeit a participant who never joined their scheduled match.
 *
 * Backend updates bracket state; we then request a full sync to broadcast updates.
 */
async function autoForfeitParticipant(
  tournamentId: number,
  participantId: number,
  clients: Map<string, ClientInfo>,
) {
  const headers = { Authorization: `Bearer ${createMatchServiceToken()}` };
  try {
    log('Auto-forfeit participant due to absence', { tournamentId, participantId });
    await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}/auto-forfeit`,
      {},
      { headers },
    );
    await requestTournamentSync(tournamentId, clients, 'state_updated');
  } catch (error) {
    log(
      'Auto-forfeit API failed',
      { tournamentId, participantId, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
  }
}

/**
 * Start a grace window for a scheduled match where one player is missing.
 *
 * If the missing player does not reconnect within ABSENCE_AUTO_WIN_MS, backend is asked
 * to auto‑forfeit them. If both are present by then, the timer is a no‑op.
 */
function scheduleAbsenceAutoWin(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  missingUserUuid: string,
) {
  clearAbsenceTimeout(pending);
  pending.absenceTimeout = setTimeout(async () => {
    // Re-check availability at expiration time.
    const availability = evaluatePlayerAvailability(pending, clients);
    if (availability.ready) {
      log('Absence window ended: both players present, skipping auto-win', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
      });
      return;
    }
    // Proceed only if exactly one player is still missing and the other is present.
    const stillMissing = availability.missing.includes(missingUserUuid);
    const presentCount = availability.clients.length;
    if (!stillMissing || presentCount !== 1) {
      log('Absence window ended: mismatch in presence state, skipping auto-win', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
        missing: availability.missing,
        present: presentCount,
      });
      return;
    }
    // Resolve the missing participant id and auto-forfeit them.
    const missingParticipant = pending.match.participants.find(
      (p) => p.userUuid === missingUserUuid,
    );
    if (!missingParticipant) {
      log('Absence window ended: missing participant not found', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
      });
      return;
    }
    await autoForfeitParticipant(pending.tournamentId, missingParticipant.participantId, clients);
    // Cleanup pending state after an auto-win decision.
    clearTournamentCountdown(pending);
    clearAbsenceTimeout(pending);
    pendingTournamentMatches.delete(pending.match.tournamentMatchId);
  }, ABSENCE_AUTO_WIN_MS);

  log('Scheduled absence auto-win timer', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    delayMs: ABSENCE_AUTO_WIN_MS,
    missingUserUuid,
  });
}

/**
 * Resolve the two participants of a tournament match into currently connected clients.
 *
 * Returns a parallel array to match.participants; entries may be undefined when offline.
 */
function resolvePlayerClients(
  match: TournamentMatchesReadyMessage['matches'][number],
  clients: Map<string, ClientInfo>,
): Array<ClientInfo | undefined> {
  return match.participants.map((participant) => findClientByUuid(clients, participant.userUuid));
}

/**
 * Determine whether all match participants are present and in the right tournament.
 *
 * A client counts as available only if:
 *   - they are connected, and
 *   - their client.tournamentId matches the pending match tournamentId.
 */
function evaluatePlayerAvailability(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
) {
  const resolved = resolvePlayerClients(pending.match, clients);
  const missing: string[] = [];
  const readyClients: ClientInfo[] = [];

  resolved.forEach((client, index) => {
    const participant = pending.match.participants[index]!;
    if (!client || client.tournamentId !== pending.tournamentId) {
      missing.push(participant.userUuid);
      return;
    }
    readyClients.push(client);
  });

  return {
    ready: missing.length === 0,
    missing,
    clients: readyClients,
  };
}

/**
 * Query backend to see if any participant in this match is already forfeited.
 *
 * This prevents starting countdowns for matches that backend will auto-resolve anyway.
 */
async function isAgainstForfeitedParticipant(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
): Promise<boolean> {
  // Find any authenticated client in this tournament to borrow a site token.
  const tournamentClient = Array.from(clients.values()).find(
    (client) =>
      client.tournamentId === pending.tournamentId && client.authenticated && client.siteToken,
  );
  if (!tournamentClient) return false;
  const token = extractSiteToken(tournamentClient);
  if (!token) return false;
  try {
    // Fetch participant statuses and check if any is forfeited.
    const headers = { Authorization: `Bearer ${token}` };
    const res = await axios.get(`${API_URL}/api/tournaments/${pending.tournamentId}/participants`, {
      headers,
    });
    const statuses = new Map<number, string>(
      (res.data as Array<{ id: number; status: string }>).map((p) => [p.id, p.status]),
    );
    return pending.match.participants.some((p) => statuses.get(p.participantId) === 'forfeited');
  } catch (error) {
    log(
      'Failed to check participant statuses when starting countdown',
      { tournamentId: pending.tournamentId, error },
      'warn',
    );
    return false;
  }
}

/** Convert a target epoch time to a non-negative seconds remaining count. */
function countdownSecondsRemaining(targetStartEpochMs: number) {
  return Math.max(0, Math.ceil((targetStartEpochMs - Date.now()) / 1000));
}

/**
 * Broadcast the current countdown state to tournament subscribers and players.
 *
 * Uses lastStatus/lastSecondsRemaining to avoid sending duplicate frames unless forced.
 */
function emitTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  status: TournamentMatchCountdownStatus,
  secondsRemaining: number,
  options: { force?: boolean; reason?: 'offline' | 'forfeited' | 'stopped' } = {},
) {
  const countdown = pending.countdown;
  if (!countdown) return;

  // Dedupe identical countdown frames unless force=true (e.g., transitions).
  if (!options.force) {
    if (countdown.lastStatus === status && countdown.lastSecondsRemaining === secondsRemaining) {
      return;
    }
  }

  countdown.lastStatus = status;
  countdown.lastSecondsRemaining = secondsRemaining;

  const payload: TournamentMatchCountdownMessage = {
    type: 'TOURNAMENT_MATCH_COUNTDOWN',
    tournamentId: pending.tournamentId,
    tournamentMatchId: pending.match.tournamentMatchId,
    stage: pending.match.stage,
    secondsRemaining,
    targetStartEpochMs: countdown.targetStartEpochMs,
    status,
    reason: options.reason,
  };

  // Broadcast to any UI watching this tournament (not just participants).
  broadcastToTournament(pending.tournamentId, clients, payload);

  // Also send directly to participants in case they're not subscribed yet.
  const playerClients = resolvePlayerClients(pending.match, clients);
  for (const client of playerClients) {
    if (client) {
      sendToClient(client, payload);
    }
  }
}

/**
 * Cancel a running countdown and optionally clear absence timers.
 *
 * Reason is surfaced in the TOURNAMENT_MATCH_COUNTDOWN(cancelled) message.
 */
function cancelTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  reason: 'offline' | 'forfeited' | 'stopped' = 'offline',
) {
  if (!pending.countdown) return;
  const secondsRemaining = countdownSecondsRemaining(pending.countdown.targetStartEpochMs);
  emitTournamentCountdown(pending, clients, 'cancelled', secondsRemaining, {
    force: true,
    reason,
  });
  clearTournamentCountdown(pending);
  if (reason !== 'offline') clearAbsenceTimeout(pending);
  log('Cancelled tournament match countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    reason,
  });
}

/**
 * Finalize a scheduled match start:
 *   - mark started and clear timers
 *   - record matchId as launched
 *   - hand off to a game node via `createMatch(..., 'tournament')`.
 */
async function finalizeTournamentMatchLaunch(
  pending: PendingTournamentMatch,
  playerClients: ClientInfo[],
  clients: Map<string, ClientInfo>,
) {
  emitTournamentCountdown(pending, clients, 'started', 0, { force: true });
  clearTournamentCountdown(pending);
  clearAbsenceTimeout(pending);

  scheduledTournamentMatches.add(pending.match.tournamentMatchId);
  pendingTournamentMatches.delete(pending.match.tournamentMatchId);

  log('Launched tournament match after countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
  });

  await createMatch(playerClients[0]!, playerClients[1]!, 'tournament', {
    tournament: {
      tournamentId: pending.tournamentId,
      tournamentMatchId: pending.match.tournamentMatchId,
      tournamentStage: pending.match.stage,
      participants: pending.match.participants.map((participant) => ({
        participantId: participant.participantId,
        userUuid: participant.userUuid,
        alias: participant.alias,
      })),
    },
  });
}

/**
 * Start (or resume) a countdown for a pending tournament match.
 *
 * The countdown:
 *   - emits TOURNAMENT_MATCH_COUNTDOWN every interval
 *   - auto-starts the match after TOURNAMENT_MATCH_AUTO_START_DELAY_MS
 *   - cancels/reminds if players go offline
 *   - may trigger absence auto-wins when exactly one player is missing.
 */
function startTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
) {
  if (pending.countdown) {
    // Countdown already running (e.g., player reconnected); re-emit current state.
    emitTournamentCountdown(
      pending,
      clients,
      pending.countdown.lastStatus ?? 'running',
      pending.countdown.lastSecondsRemaining ??
        countdownSecondsRemaining(pending.countdown.targetStartEpochMs),
      { force: true },
    );
    return;
  }

  // Initialize a fresh countdown target in absolute epoch ms.
  const targetStartEpochMs = Date.now() + TOURNAMENT_MATCH_AUTO_START_DELAY_MS;
  pending.countdown = {
    targetStartEpochMs,
    lastStatus: undefined,
    lastSecondsRemaining: undefined,
  };

  log('Started tournament match countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    targetStartEpochMs,
  });

  // Emit initial countdown tick immediately.
  emitTournamentCountdown(
    pending,
    clients,
    'running',
    countdownSecondsRemaining(targetStartEpochMs),
    {
      force: true,
    },
  );

  pending.countdown.interval = setInterval(() => {
    // Every tick: check availability and either cancel or update seconds.
    const availability = evaluatePlayerAvailability(pending, clients);
    if (!availability.ready) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (availability.missing.length === 1 && availability.clients.length === 1) {
        scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      return;
    }

    emitTournamentCountdown(
      pending,
      clients,
      'running',
      countdownSecondsRemaining(pending.countdown!.targetStartEpochMs),
    );
  }, TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS);

  pending.countdown.execution = setTimeout(async () => {
    // At execution time: re-check availability, then launch if both present.
    const availability = evaluatePlayerAvailability(pending, clients);
    if (!availability.ready) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (availability.missing.length === 1 && availability.clients.length === 1) {
        scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      return;
    }

    try {
      await finalizeTournamentMatchLaunch(pending, availability.clients, clients);
    } catch (error) {
      clearTournamentCountdown(pending);
      log(
        'Failed to launch tournament match after countdown',
        {
          tournamentId: pending.tournamentId,
          matchId: pending.match.tournamentMatchId,
          error: error instanceof Error ? error.message : 'unknown',
        },
        'warn',
      );
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
    }
  }, TOURNAMENT_MATCH_AUTO_START_DELAY_MS);
}

/**
 * Handle a single match invitation from TOURNAMENT_MATCHES_READY.
 *
 * This is the core per-match orchestrator:
 *   - creates/refreshes a PendingTournamentMatch record
 *   - checks player availability
 *   - notifies participants and starts a countdown when ready
 *   - schedules reminders / absence auto-wins when not ready.
 */
function handleSingleTournamentMatch(
  match: TournamentMatchesReadyMessage['matches'][number],
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  attempts = 0,
) {
  // Ignore matches we've already handed off.
  if (scheduledTournamentMatches.has(match.tournamentMatchId)) return;
  // Only 1v1 matches are supported in the current tournament format.
  if (match.participants.length !== 2) return;

  // Create or refresh the pending record for this tournamentMatchId.
  let pending = pendingTournamentMatches.get(match.tournamentMatchId);
  if (!pending) {
    pending = {
      tournamentId,
      match,
      attempts,
    } satisfies PendingTournamentMatch;
    pendingTournamentMatches.set(match.tournamentMatchId, pending);
  } else {
    pending.tournamentId = tournamentId;
    pending.match = match;
    pending.attempts = attempts;
    clearTournamentCountdown(pending);
  }

  // If any participant is offline/outside this tournament, cancel and retry later.
  const availability = evaluatePlayerAvailability(pending, clients);
  if (!availability.ready) {
    log(
      'Tournament match ready but player unavailable',
      {
        tournamentId,
        matchId: match.tournamentMatchId,
        missingPlayers: availability.missing,
      },
      'warn',
    );
    cancelTournamentCountdown(pending, clients, 'offline');
    // If exactly one player is present, start the absence grace window.
    if (availability.missing.length === 1 && availability.clients.length === 1) {
      scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
    }
    // Schedule a reminder to re-evaluate availability later.
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  // Both players are online: notify them that their scheduled match is ready.
  const notification: TournamentMatchesReadyMessage = {
    type: 'TOURNAMENT_MATCHES_READY',
    tournamentId,
    matches: [match],
  };

  for (const client of availability.clients) {
    sendToClient(client, notification);
  }

  // Start countdown immediately to keep UX snappy; it will cancel if players disappear.
  startTournamentCountdown(pending!, clients);

  // In parallel, check if any participant was forfeited and cancel countdown if so.
  void (async () => {
    const hasForfeit = await isAgainstForfeitedParticipant(pending!, clients);
    if (!hasForfeit) return;
    cancelTournamentCountdown(pending!, clients, 'forfeited');
    log(
      'Skipping countdown for match with forfeited participant',
      { tournamentId, matchId: match.tournamentMatchId },
      'info',
    );
    // Ask for a tournament state sync to reflect any auto-resolved outcomes
    await requestTournamentSync(tournamentId, clients, 'state_updated');
  })();
}

/**
 * Extract the site token used to call backend tournament APIs.
 *
 * Tournament actions are only allowed for authenticated clients with a token.
 */
function extractSiteToken(client: ClientInfo) {
  if (!client.siteToken) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'Authentication required for tournaments',
    });
    return undefined;
  }
  return client.siteToken;
}

/**
 * When a player joins/restores a tournament, check if they have a pending match.
 *
 * If so, we re-run `handleSingleTournamentMatch` to resend invitations/countdowns.
 */
function checkPendingMatchesForPlayer(
  client: ClientInfo,
  tournamentId: number,
  clients: Map<string, ClientInfo>,
) {
  for (const [matchId, pending] of pendingTournamentMatches) {
    if (pending.tournamentId !== tournamentId) continue;

    // Check if this player belongs to the pending match.
    const isPlayerInMatch = pending.match.participants.some(
      (participant) => participant.userUuid === client.uuid,
    );

    if (isPlayerInMatch) {
      log('Resending tournament match invitation to rejoined player', {
        tournamentId,
        matchId,
        playerUuid: client.uuid,
      });

      // Retry the match with current client availability.
      handleSingleTournamentMatch(pending.match, tournamentId, clients, pending.attempts);
    }
  }
}

/**
 * Aggregate tournament snapshot as returned by backend APIs.
 *
 * Used to build WS payloads for lobby + bracket views.
 */
interface TournamentState {
  tournament: {
    id: number;
    status: string;
    maxParticipants: number | null;
  };
  participants: Array<{
    id: number;
    alias: string;
    seed: number | null;
    status: string;
    userUuid: string | null;
  }>;
  matches: TournamentBracketSnapshotMessage['matches'];
}

/**
 * Fetch the latest tournament state from backend.
 *
 * We pull tournament metadata, participants, and matches (with players) and
 * normalize them into a single TournamentState object for WS broadcast.
 */
async function fetchTournamentState(tournamentId: number, token: string): Promise<TournamentState> {
  const headers = { Authorization: `Bearer ${token}` };
  // Fetch core tournament resources in parallel for lower latency.
  const [tournamentRes, participantsRes, matchesRes] = await Promise.all([
    axios.get(`${API_URL}/api/tournaments/${tournamentId}`, { headers }),
    axios.get(`${API_URL}/api/tournaments/${tournamentId}/participants`, { headers }),
    axios.get(`${API_URL}/api/tournaments/${tournamentId}/matches`, { headers }),
  ]);

  // Normalize participant list and index by participantId for later joins.
  const participants = participantsRes.data as Array<{
    id: number;
    alias: string;
    seed: number | null;
    status: string;
    userUuid: string | null;
  }>;
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));

  // Raw bracket matches from backend (without player aliases/scores).
  const rawMatches = matchesRes.data as Array<{
    id: number;
    roundNumber: number;
    roundPosition: number;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
    matchId: number | null;
  }>;

  // Enrich each bracket match with its players and any completed-game score.
  const matches = await Promise.all(
    rawMatches.map(async (match) => {
      // Players endpoint provides participantId + teamNumber for this bracket match.
      const playersRes = await axios.get(
        `${API_URL}/api/tournaments/${tournamentId}/matches/${match.id}/players`,
        { headers },
      );

      // Fetch match result if this bracket match is completed and linked to a game match.
      let team1Score: number | null = null;
      let team2Score: number | null = null;
      if (match.matchId && match.status === 'completed') {
        try {
          const matchRes = await axios.get(`${API_URL}/api/matches/${match.matchId}`, { headers });
          log('Fetched match score from API', { matchId: match.matchId, data: matchRes.data });
          const matchData = matchRes.data as { team1Score: number; team2Score: number };
          team1Score = matchData.team1Score;
          team2Score = matchData.team2Score;
          log('Parsed match scores', { matchId: match.matchId, team1Score, team2Score });
        } catch (error) {
          log('Failed to fetch match score', { matchId: match.matchId, error }, 'warn');
        }
      }

      const players = (playersRes.data as Array<{ participantId: number; teamNumber: number }>).map(
        (player) => {
          // Attach alias/status from participantMap and score from match result.
          const participant = participantMap.get(player.participantId);
          return {
            participantId: player.participantId,
            teamNumber: player.teamNumber,
            alias: participant?.alias ?? 'Unknown',
            status: participant?.status ?? 'pending',
            score: player.teamNumber === 1 ? team1Score : team2Score,
          };
        },
      );
      return {
        tournamentMatchId: match.id,
        roundNumber: match.roundNumber,
        roundPosition: match.roundPosition,
        status: match.status,
        scheduledAt: match.scheduledAt,
        completedAt: match.completedAt,
        matchId: match.matchId,
        players,
      };
    }),
  );

  // Return normalized snapshot for lobby/bracket broadcast.
  return {
    tournament: tournamentRes.data as TournamentState['tournament'],
    participants,
    matches,
  };
}

/**
 * Sync a tournament's lobby + bracket state to all subscribed clients.
 *
 * We fetch a fresh snapshot from backend, broadcast TOURNAMENT_LOBBY_UPDATED and
 * TOURNAMENT_BRACKET_SNAPSHOT, and refresh the in-memory membership snapshot.
 */
async function syncTournamentState(
  tournamentId: number,
  authClient: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  const token = extractSiteToken(authClient);
  if (!token) return;

  try {
    // Pull latest backend state using the provided client's site token.
    const state = await fetchTournamentState(tournamentId, token);

    // Broadcast lobby (participants + status) to watchers.
    const lobbyMessage: TournamentLobbyUpdatedMessage = {
      type: 'TOURNAMENT_LOBBY_UPDATED',
      tournamentId,
      status: state.tournament.status,
      maxParticipants: state.tournament.maxParticipants,
      participants: state.participants.map((participant) => ({
        participantId: participant.id,
        alias: participant.alias,
        userUuid: participant.userUuid,
        seed: participant.seed,
        status: participant.status,
      })),
    };

    syncTournamentMembershipSnapshot(
      tournamentId,
      state.participants.map((participant) => ({
        userUuid: participant.userUuid,
        participantId: participant.id,
        status: participant.status,
      })),
    );
    // Broadcast lobby update to watchers.
    broadcastToTournament(tournamentId, clients, lobbyMessage);

    const bracketMessage: TournamentBracketSnapshotMessage = {
      type: 'TOURNAMENT_BRACKET_SNAPSHOT',
      tournamentId,
      matches: state.matches,
    };
    broadcastToTournament(tournamentId, clients, bracketMessage);
  } catch (error) {
    // If backend fails, surface an error to the requesting client.
    log(
      'Failed to sync tournament state',
      { tournamentId, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
    sendToClient(authClient, {
      type: 'ERROR',
      code: 'TOURNAMENT_API',
      message: 'Failed to refresh tournament state',
    });
  }
}

/**
 * Request a full tournament sync, choosing any connected authenticated client.
 *
 * Redis stream events do not carry site tokens, so we "borrow" one from a live
 * tournament client to fetch backend state.
 */
async function requestTournamentSync(
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  reason: 'matches_ready' | 'state_updated',
) {
  // Find a client in this tournament with a valid site token.
  const tournamentClient = Array.from(clients.values()).find(
    (client) => client.tournamentId === tournamentId && client.authenticated && client.siteToken,
  );

  if (!tournamentClient) {
    log('No tournament clients found for bracket sync', {
      tournamentId,
      reason,
      totalClients: clients.size,
      tournamentClients: Array.from(clients.values()).filter(
        (client) => client.tournamentId === tournamentId,
      ).length,
    });
    return;
  }

  log('Found tournament client for bracket sync', {
    tournamentId,
    clientUuid: tournamentClient.uuid,
    reason,
  });

  try {
    await syncTournamentState(tournamentId, tournamentClient, clients);
    log('Successfully synced tournament state', { tournamentId, reason });
  } catch (error) {
    log(
      'Failed to sync tournament state',
      {
        tournamentId,
        reason,
        error: error instanceof Error ? error.message : 'unknown',
      },
      'warn',
    );
  }
}

/**
 * Uniform error handler for tournament backend API calls.
 *
 * Extracts a human-readable message if backend provided one, logs details, and sends ERROR.
 */
function handleTournamentApiError(client: ClientInfo, error: unknown, fallbackMessage: string) {
  const details =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number; data?: unknown } }).response
      : undefined;
  const serverMessage = (() => {
    const data = details?.data;
    if (!data) return undefined;
    if (typeof data === 'string' && data.trim().length) return data;
    if (typeof data === 'object' && 'message' in (data as Record<string, unknown>)) {
      const value = (data as Record<string, unknown>).message;
      if (typeof value === 'string' && value.trim().length) return value;
    }
    return undefined;
  })();
  log(
    'Tournament API request failed',
    {
      uuid: client.uuid,
      status: details?.status,
      data: details?.data,
      message: error instanceof Error ? error.message : undefined,
    },
    'warn',
  );
  sendToClient(client, {
    type: 'ERROR',
    code: 'TOURNAMENT_API',
    message: serverMessage ?? fallbackMessage,
  });
}

/**
 * Handle Redis `TOURNAMENT_MATCHES_READY` stream events.
 *
 * Called by `MatchmakingRedisBridge` when backend schedules one or more matches.
 * For each match, we run the per‑match invitation/countdown flow, then sync the
 * full bracket so all tournament UIs stay up to date.
 */
export async function handleTournamentMatchesReady(
  payload: TournamentMatchesReadyMessage,
  clients: Map<string, ClientInfo>,
) {
  if (!payload || !Array.isArray(payload.matches)) return;

  log('Handling tournament matches ready', {
    tournamentId: payload.tournamentId,
    matchCount: payload.matches.length,
  });

  // Drive the per-match invitation/countdown flow.
  for (const match of payload.matches) {
    handleSingleTournamentMatch(match, payload.tournamentId, clients);
  }

  // Refresh lobby/bracket snapshot for all connected tournament clients.
  await requestTournamentSync(payload.tournamentId, clients, 'matches_ready');
}

/**
 * Handle Redis `TOURNAMENT_STATE_UPDATED` events.
 *
 * These indicate backend bracket or participant state changes; we request a full
 * snapshot sync to rebroadcast lobby/bracket messages.
 */
export async function handleTournamentStateUpdated(
  payload: { tournamentId: number },
  clients: Map<string, ClientInfo>,
) {
  if (!payload || typeof payload.tournamentId !== 'number') return;
  await requestTournamentSync(payload.tournamentId, clients, 'state_updated');
}

/**
 * Create a new tournament and enroll the requesting client as the first participant.
 *
 * Triggered by `CREATE_TOURNAMENT` from the frontend while the client is IDLE.
 * Uses backend REST APIs for persistence, then broadcasts lobby/bracket snapshots.
 */
export async function handleCreateTournament(
  data: CreateTournamentRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'You must be signed in to create tournaments',
    });
    return;
  }

  const token = extractSiteToken(client);
  if (!token) return;

  // Backend requests are authorized with the user's site token.
  const headers = { Authorization: `Bearer ${token}` };
  const maxParticipants = data.size ?? 4;
  const tournamentName = data.name?.trim().slice(0, 128) || 'Pong Tournament';

  // Entering tournaments cancels any invite lobby this user might be in.
  cancelInviteIfNeeded(client, 'create_tournament');

  try {
    // 1) Check if the user already has an active tournament.
    const activeRes = await axios.get(`${API_URL}/api/tournaments/my/active`, { headers });
    const activePayload = activeRes.data as null | {
      tournament: { id: number };
      participant: { id: number; alias: string };
    };

    if (activePayload) {
      // Reattach to the existing tournament instead of creating a new one.
      client.tournamentId = activePayload.tournament.id;
      client.tournamentParticipantId = activePayload.participant.id;
      subscribeClientToTournament(activePayload.tournament.id, client);

      sendToClient(client, {
        type: 'ERROR',
        code: 'TOURNAMENT_LIMIT',
        message: 'You already have a tournament in progress',
      });

      await syncTournamentState(activePayload.tournament.id, client, clients);
      return;
    }

    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;

    // 2) Create the tournament record in backend.
    const tournamentRes = await axios.post(
      `${API_URL}/api/tournaments`,
      {
        name: tournamentName,
        maxParticipants,
        format: 'single_elimination',
      },
      { headers },
    );

    const tournamentId = (tournamentRes.data as { id: number }).id;

    const alias = client.username.slice(0, 64);
    // 3) Enroll the creator as a participant.
    const participantRes = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (participantRes.data as { participant: { id: number; alias: string } })
      .participant;

    // 4) Update client local state and subscribe them to tournament broadcasts.
    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    subscribeClientToTournament(tournamentId, client);
    trackClientTournamentMembership(client, tournamentId);

    // 5) Broadcast initial lobby/bracket snapshot.
    await syncTournamentState(tournamentId, client, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to create tournament');
  }
}

/**
 * Join an existing tournament as a participant.
 *
 * Triggered by `JOIN_TOURNAMENT` from the frontend while IDLE.
 * On success the client is subscribed and receives lobby/bracket snapshots.
 */
export async function handleJoinTournament(
  data: JoinTournamentRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'You must be signed in to join tournaments',
    });
    return;
  }

  // Tournament id comes from UI; validate before hitting backend.
  const tournamentId = Number(data.tournamentId);
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'TOURNAMENT_INVALID',
      message: 'Tournament identifier is invalid',
    });
    return;
  }

  const token = extractSiteToken(client);
  if (!token) return;

  // Backend requests are authorized with the user's site token.
  const headers = { Authorization: `Bearer ${token}` };
  const alias = client.username.slice(0, 64);

  // Joining tournaments cancels any invite lobby this user might be in.
  cancelInviteIfNeeded(client, 'join_tournament');

  try {
    // 1) Create a participant record in backend.
    const response = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (response.data as { participant: { id: number; alias: string } })
      .participant;

    // 2) Update local state and subscribe to tournament broadcasts.
    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    subscribeClientToTournament(tournamentId, client);
    setClientState(client, ClientState.IN_TOURNAMENT, 'joined_tournament');
    trackClientTournamentMembership(client, tournamentId);

    // 3) Send initial lobby/bracket snapshot.
    await syncTournamentState(tournamentId, client, clients);

    // 4) If a match was already pending for them, re-send invitations/countdown.
    checkPendingMatchesForPlayer(client, tournamentId, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to register for tournament');
  }
}

/**
 * Leave the current tournament (delete participant record).
 *
 * Triggered by `LEAVE_TOURNAMENT` while IN_TOURNAMENT.
 * We also cancel any pending scheduled matches that involved this user.
 */
export async function handleLeaveTournament(client: ClientInfo, clients: Map<string, ClientInfo>) {
  if (!client.tournamentId || !client.tournamentParticipantId) {
    log('Leave tournament ignored: no active membership', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
      participantId: client.tournamentParticipantId,
    });
    return;
  }

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  // Backend request authorized with the user's token.
  const headers = { Authorization: `Bearer ${token}` };

  try {
    // 1) Remove participant from tournament in backend.
    log('Leave tournament requested', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
    await axios.delete(`${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`, {
      headers,
    });

    log('Leave tournament API succeeded', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });

    // 2) Cancel any pending countdowns involving this player; treat as forfeited for match context.
    for (const [matchId, pending] of pendingTournamentMatches.entries()) {
      if (pending.match.participants.some((p) => p.userUuid === client.uuid)) {
        if (pending.reminder) clearTimeout(pending.reminder);
        cancelTournamentCountdown(pending, clients, 'forfeited');
        pendingTournamentMatches.delete(matchId);
        log('Cancelled pending tournament match after player left tournament', {
          tournamentId,
          matchId,
          uuid: client.uuid,
        });
      }
    }

    // 3) Broadcast updated lobby/bracket.
    await syncTournamentState(tournamentId, client, clients);

    // 4) Clear local membership and subscription.
    unsubscribeClientFromTournament(tournamentId, client.id);
    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;
    setClientState(client, ClientState.IDLE, 'left_tournament');
    clearClientTournamentMembership(client);

    log('Tournament membership cleared', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to leave tournament');
  }
}

/**
 * Forfeit the current tournament (mark participant forfeited).
 *
 * Triggered by `FORFEIT_TOURNAMENT` while IN_TOURNAMENT.
 * Backend will advance bracket; we cancel pending matches involving this user.
 */
export async function handleForfeitTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.tournamentId || !client.tournamentParticipantId) {
    log('Forfeit tournament ignored: no active membership', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
      participantId: client.tournamentParticipantId,
    });
    return;
  }

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  // Backend request authorized with the user's token.
  const headers = { Authorization: `Bearer ${token}` };

  try {
    // 1) Mark participant as forfeited in backend.
    log('Forfeit tournament requested', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
    await axios.patch(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`,
      { status: 'forfeited' },
      { headers },
    );

    log('Forfeit tournament API succeeded', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });

    // 2) Cancel any pending countdowns involving this player.
    for (const [matchId, pending] of pendingTournamentMatches.entries()) {
      if (pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
        if (pending.reminder) clearTimeout(pending.reminder);
        cancelTournamentCountdown(pending, clients, 'forfeited');
        pendingTournamentMatches.delete(matchId);
        log('Cancelled pending tournament match after forfeit', {
          tournamentId,
          matchId,
          uuid: client.uuid,
        });
      }
    }

    // 3) Broadcast updated lobby/bracket.
    await syncTournamentState(tournamentId, client, clients);
    // 4) Clear local membership and subscription.
    unsubscribeClientFromTournament(tournamentId, client.id);
    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;
    setClientState(client, ClientState.IDLE, 'left_tournament');
    clearClientTournamentMembership(client);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to forfeit tournament');
  }
}

/**
 * Handle a tournament player's manual "accept scheduled match" action.
 *
 * The countdown is auto-started already; this primarily forces a re-check and
 * resends match-ready/countdown messages if needed.
 */
export function handleAcceptScheduled(
  data: AcceptScheduledRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  const pending = pendingTournamentMatches.get(data.tournamentMatchId);
  if (!pending) {
    log('Accept scheduled ignored: no pending match', {
      tournamentMatchId: data.tournamentMatchId,
      uuid: client.uuid,
    });
    return;
  }

  // Ensure the accepting client is actually one of the participants.
  if (!pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
    log('Accept scheduled ignored: client not part of match', {
      tournamentMatchId: data.tournamentMatchId,
      uuid: client.uuid,
    });
    return;
  }

  log('Tournament player requested manual confirmation; countdown flow already active', {
    tournamentMatchId: data.tournamentMatchId,
    uuid: client.uuid,
    countdownActive: Boolean(pending.countdown),
  });

  // Re-run per-match handler to resend invites/countdown based on current presence.
  handleSingleTournamentMatch(pending.match, pending.tournamentId, clients, pending.attempts);
}

/**
 * Cleanup when a tournament client disconnects.
 *
 * Called from `index.ts` on WS close. We:
 *   - remove the connection from tournament subscribers
 *   - cancel any countdowns involving this user
 *   - schedule reminders so the match can restart if they reconnect.
 */
export function handleClientDisconnectFromTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  log('Handling client disconnect from tournament context', {
    uuid: client.uuid,
    tournamentId: client.tournamentId,
    participantId: client.tournamentParticipantId,
  });

  if (client.tournamentId) {
    // Stop tournament broadcasts to this dead connection.
    unsubscribeClientFromTournament(client.tournamentId, client.id);
    log('Unsubscribed client from tournament after disconnect', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
    });
  }

  // For any pending match involving this UUID, cancel countdown and retry later.
  for (const pending of pendingTournamentMatches.values()) {
    if (pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (pending.reminder) {
        clearTimeout(pending.reminder);
        pending.reminder = undefined;
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      log('Scheduled reminder after disconnecting tournament player', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
        uuid: client.uuid,
      });
    }
  }
}

/**
 * Restore a client's active tournament membership on WS connect.
 *
 * Called from `apps/matchmaking/index.ts` after authentication. If backend reports
 * an active tournament for this user, we:
 *   - attach tournamentId/participantId to the client
 *   - subscribe them to broadcasts
 *   - sync lobby/bracket state
 *   - re-send any pending match invitations.
 */
export async function restoreTournamentMembership(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) return;
  const token = extractSiteToken(client);
  if (!token) return;

  try {
    // Query backend for any active tournament membership for this user.
    const response = await axios.get(`${API_URL}/api/tournaments/my/active`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = response.data as null | {
      tournament: {
        id: number;
        status: string;
        maxParticipants: number | null;
      };
      participant: {
        id: number;
        alias: string;
        status: string;
      };
    };

    if (!payload) {
      log('Restore tournament membership: no active tournament found', {
        uuid: client.uuid,
      });
      return;
    }

    const { tournament, participant } = payload;

    // Restoring membership also cancels any invite lobby they might be in.
    cancelInviteIfNeeded(client, 'restore_tournament_membership');

    // Attach tournament identifiers to the client for later routing/state checks.
    client.tournamentId = tournament.id;
    client.tournamentParticipantId = participant.id;

    // Mark in tournament state and subscribe to broadcasts.
    setClientState(client, ClientState.IN_TOURNAMENT, 'restored_tournament_membership');
    subscribeClientToTournament(tournament.id, client);
    trackClientTournamentMembership(client, tournament.id);

    log('Restored active tournament membership for client', {
      uuid: client.uuid,
      tournamentId: tournament.id,
      participantId: participant.id,
      status: participant.status,
    });

    // Send fresh lobby/bracket snapshot and re-check pending matches.
    await syncTournamentState(tournament.id, client, clients);
    checkPendingMatchesForPlayer(client, tournament.id, clients);
  } catch (error) {
    log(
      'Failed to restore tournament membership',
      { uuid: client.uuid, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
  }
}
