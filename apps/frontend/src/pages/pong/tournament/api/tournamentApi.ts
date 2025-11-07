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

type MatchResult = {
  team1Score: number;
  team2Score: number;
};

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

async function getMatchResult(axios: AxiosInstance, matchId: number): Promise<MatchResult | null> {
  try {
    const { data } = await axios.get(`/api/matches/${matchId}`);
    // The matches endpoint returns many fields; we only need the scores.
    const team1Score = (data as any)?.team1Score;
    const team2Score = (data as any)?.team2Score;
    if (typeof team1Score === 'number' && typeof team2Score === 'number') {
      return { team1Score, team2Score };
    }
    return null;
  } catch {
    // If the result cannot be fetched, degrade gracefully without scores.
    return null;
  }
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
  const resultsByMatchId = new Map<number, MatchResult | null>();
  await Promise.all(
    matches.map(async (match) => {
      const [players, result] = await Promise.all([
        getPlayers(axios, tournamentId, match.id),
        // Only fetch result when we have a linked result match
        match.matchId ? getMatchResult(axios, match.matchId) : Promise.resolve(null),
      ]);
      playersByMatchId.set(match.id, players);
      resultsByMatchId.set(match.id, result);
    }),
  );

  const inflated = inflateMatches(matches, participants, playersByMatchId).map((m) => {
    const res = resultsByMatchId.get(m.tournamentMatchId);
    if (!res) return m;
    return {
      ...m,
      players: m.players.map((p) => ({
        ...p,
        score: p.teamNumber === 1 ? res.team1Score : res.team2Score,
      })),
    } as TournamentMatchState;
  });
  return { meta, participants, matches: inflated };
}
