import type Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import type { TournamentMatchesReadyMessage } from '@pong/shared/protocol/net';
import { log } from '@utils/logger';
import {
  STREAM_TOURNAMENT_MATCHES_READY,
  STREAM_TOURNAMENT_STATE_UPDATED,
} from '@pong/shared/redis/constants';

const TOURNAMENT_STREAM_KEYS = [STREAM_TOURNAMENT_MATCHES_READY, STREAM_TOURNAMENT_STATE_UPDATED];
const STREAM_GROUP = 'matchmaking-service';
const STREAM_BATCH_SIZE = 32;
const STREAM_BLOCK_MS = 5000;

type InitHandlers = {
  onRoomReady: (roomIdentifier: string) => void;
  onMatchesReady: (payload: TournamentMatchesReadyMessage) => Promise<void>;
  onStateUpdated: (payload: { tournamentId: number }) => Promise<void>;
};

/**
 * MatchmakingRedisBridge
 *
 * Bridges Redis pub/sub + streams into in-process callbacks for matchmaking:
 *   - Subscribes to `room_ready` channel:
 *       * used by game-server to signal that both players have joined a room.
 *   - Consumes tournament-related Redis streams:
 *       * `STREAM_TOURNAMENT_MATCHES_READY`
 *       * `STREAM_TOURNAMENT_STATE_UPDATED`
 *     and forwards payloads to handlers that update local matchmaking state.
 */
export class MatchmakingRedisBridge {
  private readonly handlers: InitHandlers;
  private readonly consumerId = `matchmaking-${uuid()}`;
  private subscriber?: Redis;
  private stream?: Redis;
  private consuming = false;
  private consumerPromise?: Promise<void>;

  constructor(handlers: InitHandlers, subscriber: Redis, stream: Redis) {
    this.handlers = handlers;
    this.subscriber = subscriber;
    this.stream = stream;
  }

  async init(): Promise<void> {
    // Mark the bridge as active and validate Redis connections.
    this.consuming = true;
    if (!this.subscriber || !this.stream) throw new Error('Redis pub/sub or stream undefined');
    // Attach error logging so connection issues are visible.
    this.subscriber.on('error', (err) =>
      log('Redis pub/sub error', { error: err?.message ?? String(err) }, 'error'),
    );
    this.stream.on('error', (err) =>
      log('Redis stream error', { error: err?.message ?? String(err) }, 'error'),
    );

    // Subscribe to room_ready pub/sub and forward events to matchmaking.
    await this.subscriber.subscribe('room_ready');
    this.subscriber.on('message', (channel, message) => {
      if (channel !== 'room_ready') return;
      try {
        const { roomIdentifier } = JSON.parse(message);
        this.handlers.onRoomReady(roomIdentifier);
      } catch (err) {
        log(
          'Failed to parse room_ready payload',
          { error: err instanceof Error ? err.message : String(err) },
          'error',
        );
      }
    });

    // Start background Redis Streams consumer for tournament events.
    this.consumerPromise = this.startStreamConsumer().catch((err) => {
      if (this.consuming) {
        log(
          'Tournament stream consumer exited',
          { error: err instanceof Error ? err.message : String(err) },
          'error',
        );
      }
    });
  }

  async close(): Promise<void> {
    // Stop the consumer loop and unsubscribe from pub/sub.
    this.consuming = false;
    if (this.subscriber) {
      await this.subscriber.unsubscribe('room_ready');
    }
    // Wait for the stream consumer to exit cleanly.
    if (this.consumerPromise) await this.consumerPromise.catch(() => {});
  }

  private async startStreamConsumer(): Promise<void> {
    if (!this.stream) throw new Error('Stream connection missing');

    // Ensure consumer groups exist for all tournament streams.
    await this.ensureGroups();
    // Drain any pending entries left by previous consumers/crashes.
    await this.drainPending();

    // Main loop: block-read new entries until close() flips consuming=false.
    while (this.consuming) {
      try {
        await this.readEvents('>', STREAM_BLOCK_MS);
      } catch (err) {
        if (!this.consuming) break;
        log(
          'Tournament stream read failed',
          { error: err instanceof Error ? err.message : String(err) },
          'error',
        );
        await wait(1000);
      }
    }
  }

  private async ensureGroups(): Promise<void> {
    if (!this.stream) return;

    // Create XGROUP for each stream if it doesn't exist yet.
    for (const streamKey of TOURNAMENT_STREAM_KEYS) {
      try {
        await this.stream.xgroup('CREATE', streamKey, STREAM_GROUP, '0', 'MKSTREAM');
      } catch (err) {
        if (err instanceof Error && err.message.includes('BUSYGROUP')) continue;
        throw err;
      }
    }
  }

  private async drainPending(): Promise<void> {
    // Read and process pending entries (id="0") until none remain.
    while (this.consuming && (await this.readEvents('0'))) {
      // Loop until no pending events
    }
  }

  private async readEvents(id: '>' | '0', blockMs?: number): Promise<boolean> {
    if (!this.stream || !this.consuming) return false;

    // Build XREADGROUP arguments for our consumer group.
    const args = ['GROUP', STREAM_GROUP, this.consumerId, 'COUNT', STREAM_BATCH_SIZE.toString()];

    // Optional BLOCK lets us wait for new entries when id === '>'.
    if (typeof blockMs === 'number') args.push('BLOCK', blockMs.toString());

    // Read from all tournament streams at the given id ('>' new, '0' pending).
    const idArgs = TOURNAMENT_STREAM_KEYS.map(() => id);
    args.push('STREAMS', ...TOURNAMENT_STREAM_KEYS, ...idArgs);

    const responseRaw = await this.stream.call('XREADGROUP', ...args);
    const response = responseRaw as Array<[string, Array<[string, string[]]>]> | null;
    if (!response || response.every(([_, entries]) => entries.length === 0)) return false;
    // For each entry, extract payload and dispatch to the right handler.
    for (const [streamKey, entries] of response) {
      for (const [entryId, fields] of entries) {
        const payload = extractPayload(fields);
        log(
          'Redis stream received:',
          { streamKey, entryId, payloadSize: payload ? payload.length : 0 },
          'debug',
        );
        await this.processEvent(streamKey, entryId, payload);
      }
    }

    return true;
  }

  private async processEvent(streamKey: string, entryId: string, payload?: string): Promise<void> {
    if (!this.stream) return;

    // Guard missing payloads and ack so we don't reprocess forever.
    if (!payload) {
      log('Tournament stream entry missing payload', { streamKey, entryId }, 'warn');
      await this.stream.xack(streamKey, STREAM_GROUP, entryId);
      return;
    }

    // Dispatch by stream key into the provided init handlers.
    try {
      if (streamKey === STREAM_TOURNAMENT_MATCHES_READY) {
        await this.handlers.onMatchesReady(JSON.parse(payload));
      } else if (streamKey === STREAM_TOURNAMENT_STATE_UPDATED) {
        await this.handlers.onStateUpdated(JSON.parse(payload));
      }
    } catch (err) {
      log(
        'Tournament stream entry processing failed',
        { streamKey, entryId, error: err instanceof Error ? err.message : String(err) },
        'error',
      );
    } finally {
      // Always ack to advance the consumer group.
      await this.stream.xack(streamKey, STREAM_GROUP, entryId);
    }
  }
}

function extractPayload(rawFields: string[]): string | undefined {
  for (let i = 0; i < rawFields.length; i += 2) {
    if (rawFields[i] === 'payload') return rawFields[i + 1];
  }
  return undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
