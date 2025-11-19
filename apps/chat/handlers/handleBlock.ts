import type { FastifyBaseLogger } from "fastify";
import type { Client } from "../types";
import { findClientByUsername } from "../utils/helpers";
import { fetchBlockedUuids } from "../utils/helpers";

export function handleBlockUser(
  clients: Map<string, Client>,
  client: Client,
  targetUser: string,
): void {
  const targetClient = findClientByUsername(clients, targetUser);
  if (!targetClient) return;
  client.blocked.add(targetClient.uuid);
  client.socket.send(
    JSON.stringify({ type: 'userBlocked', username: targetUser, uuid: targetClient.uuid }),
  );
  return;
}

export function handleUnblockUser(
  clients: Map<string, Client>,
  client: Client,
  targetUser: string,
): void {
  const targetClient = findClientByUsername(clients, targetUser);
  if (!targetClient) return;
  client.blocked.delete(targetClient.uuid);
  client.socket.send(
    JSON.stringify({
      type: 'userUnblocked',
      username: targetUser,
      uuid: targetClient.uuid,
    }),
  );
  return;
}

export async function getBlocked(
  client: Client,
  token: string,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const blockedUuids = await fetchBlockedUuids(token);
    client.blocked = new Set(blockedUuids);
    log.debug(
      { clientId: client.id, blockedCount: blockedUuids.length },
      '[CHAT] Hydrated blocked users from API',
    );
    client.socket.send(
      JSON.stringify({
        type: 'blockedList',
        uuids: blockedUuids,
      }),
    );
  } catch (err) {
    log.error({ err, clientId: client.id }, '[CHAT] Failed to hydrate blocked users');
  }
}
