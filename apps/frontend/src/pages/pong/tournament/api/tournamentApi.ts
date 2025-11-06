import type { AxiosInstance } from 'axios';
import type { TournamentMatchState } from '@pong/shared/protocol/net';
import type { TournamentSummary } from '../state/types';
import { inflateMatches } from '../domain/bracket';

type TournamentMeta = {
  status: string;
  maxParticipants: number | null;
  name?: string | null;
};

type ParticipantRow = {
  id: number;
  alias: string;
  seed: number | null;
  status: string;
  userUuid: string | null;
};

type MatchRow = {
  id: number;
  roundNumber: number;
  roundPosition: number;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  matchId: number | null;
};

type MatchPlayerRow = { participantId: number; teamNumber: number };

export async function getTournaments(axios: AxiosInstance): Promise<TournamentSummary[]> {
  const { data } = await axios.get('/api/tournaments');
  return Array.isArray(data) ? (data as TournamentSummary[]) : [];
}

export async function getTournament(
  axios: AxiosInstance,
  id: number,
): Promise<TournamentMeta> {
  const { data } = await axios.get(`/api/tournaments/${id}`);
  return data as TournamentMeta;
}

export async function getParticipants(
  axios: AxiosInstance,
  id: number,
): Promise<ParticipantRow[]> {
  const { data } = await axios.get(`/api/tournaments/${id}/participants`);
  return data as ParticipantRow[];
}

export async function getMatches(axios: AxiosInstance, id: number): Promise<MatchRow[]> {
  const { data } = await axios.get(`/api/tournaments/${id}/matches`);
  return data as MatchRow[];
}

export async function getPlayers(
  axios: AxiosInstance,
  tournamentId: number,
  matchId: number,
): Promise<MatchPlayerRow[]> {
  const { data } = await axios.get(
    `/api/tournaments/${tournamentId}/matches/${matchId}/players`,
  );
  return data as MatchPlayerRow[];
}

export async function getTournamentSnapshot(
  axios: AxiosInstance,
  tournamentId: number,
): Promise<{
  meta: TournamentMeta;
  participants: ParticipantRow[];
  matches: TournamentMatchState[];
}> {
  const [meta, participants, matches] = await Promise.all([
    getTournament(axios, tournamentId),
    getParticipants(axios, tournamentId),
    getMatches(axios, tournamentId),
  ]);

  const playersByMatchId = new Map<number, MatchPlayerRow[]>();
  await Promise.all(
    matches.map(async (match) => {
      const players = await getPlayers(axios, tournamentId, match.id);
      playersByMatchId.set(match.id, players);
    }),
  );

  const inflated = inflateMatches(matches, participants, playersByMatchId);
  return { meta, participants, matches: inflated };
}

