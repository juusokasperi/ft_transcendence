import { API_SERVICE_URL } from "./config";
import type { Client } from '../types.ts';

export async function fetchBlockedUuids(token: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_SERVICE_URL}/api/blocked-users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as string[];
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export function findClientByUsername(clients: Map<string, Client>, username: string): Client | undefined {
  return Array.from(clients.values()).find((client) => client.username === username);
}

export function findClientByUuid(clients: Map<string, Client>, userId: string): Client | undefined {
  return Array.from(clients.values()).find((client) => client.uuid === userId);
}
