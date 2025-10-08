import type { ClientInfo } from '../types/types';
import type {
  CreateTournamentRequest,
  ForfeitTournamentRequest,
  JoinTournamentRequest,
  LeaveTournamentRequest,
} from '@pong/shared/protocol/net';

export async function handleCreateTournament(data: CreateTournamentRequest, client: ClientInfo) {
  // Call tournament orchestration service to create a tournament
  // data has SIZE (4, 8, 16.. OR something else??) and optional NAME
  // Set clients tournamentId to tournament service room
}

export async function handleJoinTournament(data: JoinTournamentRequest, client: ClientInfo) {
  // Call tournament service with clientinfo and data.tournamentId
  // Remove user from queue if they were in one
}

export async function handleLeaveTournament(client: ClientInfo) {
  // If user leaves tournament before it has even started
  // Call tournament service with clientInfo and client.tournamentId
  // Broadcast to all clients on tournament lobby that user left
}

export async function handleForfeitTournament(client: ClientInfo) {
  // If user leaves tournament when it is already in progress
  // Call tournament service with client.tournamentId
}

export async function handleAcceptScheduled(client: ClientInfo) {
  // Tournament service writes to Redis Stream scheduled_matches
  // MM waits for messages to that stream
  // MM service has a map with a timer for each entry
  // If doesn't accept a scheduled match within the time, it is marked as forfeit
}
