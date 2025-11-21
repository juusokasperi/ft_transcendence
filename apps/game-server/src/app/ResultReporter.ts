import axios from 'axios';
import jwt from 'jsonwebtoken';
import type { OnlineMatchSummary } from '@pong/shared/protocol/net';
import type { MatchSession, PlayerConnectionState } from './RoomRegistry.ts';
import type { FastifyBaseLogger } from '@utils/logger';
import type { Seat, ExpectedPlayer } from '../domain/MatchTypes.ts';

type MatchOverEvent = { winner?: string; reason?: 'natural' | 'forfeit' | 'timeout' };

type ResolvedPlayer = {
  seat: Seat;
  identifier: string;
  participantId?: number;
  alias?: string;
  mmrBefore: number;
  record?: PlayerConnectionState;
  expected?: ExpectedPlayer;
};

export class ResultReporter {
  private readonly apiUrl: string;
  private readonly matchSecret: string;
  private readonly logger: FastifyBaseLogger;

  constructor(args: { apiUrl: string; matchSecret: string; logger: FastifyBaseLogger }) {
    this.apiUrl = args.apiUrl;
    this.matchSecret = args.matchSecret;
    this.logger = args.logger;
  }

  async report(
    session: MatchSession,
    matchOver: MatchOverEvent,
  ): Promise<OnlineMatchSummary | null> {
    const model = session.model;
    if (model.resultSubmitting || model.resultSubmitted) return null;
    model.resultSubmitting = true;

    try {
      const { reservation } = session;

      // --- KEY CHANGE: always resolve by fixed seats (player-space), not current table ends
      const east = this.resolvePlayer(session, 'P1'); // "east" row == Player 1
      const west = this.resolvePlayer(session, 'P2'); // "west" row == Player 2
      if (!east || !west) {
        this.logger.error(
          { room: reservation.roomIdentifier },
          '[ResultReporter] Missing player mapping',
        );
        model.resultSubmitting = false;
        return null;
      }

      const gamesHistory = model.lastSnapshot?.gamesHistory ?? [];

      // In player-space, history already uses east=P1, west=P2.
      let eastScore = gamesHistory.filter((g) => g.winner === 'east').length;
      let westScore = gamesHistory.filter((g) => g.winner === 'west').length;
      let technicalGamesHistory = gamesHistory;

      // Handle technical win (disconnect/forfeit/timeout) by overriding game history.
      // Only apply for non-natural completions to preserve legitimate match results.
      if (matchOver.winner && matchOver.reason !== 'natural') {
        // matchOver.winner is a TABLE SIDE ('east' | 'west')
        const sideWinner =
          matchOver.winner === 'east' || matchOver.winner === 'west'
            ? (matchOver.winner as 'east' | 'west')
            : 'east';

        // Map side winner -> seat winner using the final playerAtEnd,
        // then map seat winner -> player-space row ('east' for P1, 'west' for P2).
        const playerAtEnd = model.state.playerAtEnd;
        const seatWinner: Seat = sideWinner === 'east' ? playerAtEnd.east : playerAtEnd.west;
        const playerSpaceWinner: 'east' | 'west' = seatWinner === 'P1' ? 'east' : 'west';

        const technicalScore = reservation.tournament ? 3 : 2;
        eastScore = playerSpaceWinner === 'east' ? technicalScore : 0;
        westScore = playerSpaceWinner === 'west' ? technicalScore : 0;

        technicalGamesHistory = Array.from({ length: technicalScore }, (_, index) => ({
          gameIndex: index + 1,
          east: playerSpaceWinner === 'east' ? 11 : 0, // east row == P1
          west: playerSpaceWinner === 'west' ? 11 : 0, // west row == P2
          winner: playerSpaceWinner,
        }));
      }

      const token = this.signToken();

      let eastAfter = east.mmrBefore;
      let westAfter = west.mmrBefore;

      if (reservation.tournament) {
        await this.reportTournament(reservation.roomIdentifier, token, reservation, east, west, {
          eastScore,
          westScore,
          gamesHistory: technicalGamesHistory,
        });
      } else {
        const deltas = await this.reportCasual(token, east, west, {
          eastScore,
          westScore,
          gamesHistory: technicalGamesHistory,
        });
        eastAfter += deltas.eastDelta;
        westAfter += deltas.westDelta;
      }

      model.resultSubmitted = true;
      model.resultSubmitting = false;

      // Winner in summary: if event provided a side we still prefer scores in player-space
      const winnerFromScores = eastScore >= westScore ? 'east' : 'west';

      const bestOf =
        model.lastSnapshot?.bestOf ??
        (typeof (model.state as any)?.params?.bestOf === 'number'
          ? (model.state as any).params.bestOf
          : Math.max(technicalGamesHistory.length * 2 - 1, 1));

      const summary: OnlineMatchSummary = {
        // "winner" is in player-space (east=P1, west=P2) to match gamesHistory rows.
        winner: winnerFromScores,
        bestOf,
        gamesHistory: technicalGamesHistory,
        names: {
          // Names by fixed seats (player-space):
          east: east.alias ?? (east.seat === 'P1' ? 'Player 1' : 'Player 2'),
          west: west.alias ?? (west.seat === 'P1' ? 'Player 1' : 'Player 2'),
        },
        seats: {
          east: east.seat, // 'P1'
          west: west.seat, // 'P2'
        },
        mmr: {
          east: { before: Math.round(east.mmrBefore), after: Math.round(eastAfter) },
          west: { before: Math.round(west.mmrBefore), after: Math.round(westAfter) },
        },
      };

      if (east.expected) east.expected.mmr = summary.mmr.east.after;
      if (west.expected) west.expected.mmr = summary.mmr.west.after;

      return summary;
    } catch (error) {
      this.logger.error({ error }, '[ResultReporter] Failed to report match result');
      session.model.resultSubmitting = false;
      return null;
    }
  }

  private resolvePlayer(session: MatchSession, seat: Seat): ResolvedPlayer | null {
    const expected = Array.from(session.reservation.expectedPlayers.values()).find(
      (p) => p.seat === seat,
    );
    if (!expected) return null;

    const player = session.players.get(seat);
    const identifier = player?.playerIdentifier ?? expected.playerIdentifier;

    return {
      seat,
      identifier,
      participantId: player?.participantId ?? expected.participantId,
      alias: player?.alias ?? expected.alias,
      mmrBefore: player?.mmr ?? expected.mmr ?? 1000,
      record: player,
      expected,
    };
  }

  private signToken(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({ service: 'game-node', iat: now, exp: now + 3600 }, this.matchSecret);
  }

  private async reportTournament(
    roomIdentifier: string,
    token: string,
    reservation: MatchSession['reservation'],
    east: ResolvedPlayer,
    west: ResolvedPlayer,
    args: {
      eastScore: number;
      westScore: number;
      gamesHistory: Array<{ gameIndex: number; east: number; west: number; winner: string }>;
    },
  ): Promise<void> {
    const tournament = reservation.tournament;
    if (!tournament) return;

    const actualWinner = args.eastScore > args.westScore ? 'east' : 'west';
    const winnerInfo = actualWinner === 'east' ? east : west;
    const loserInfo = actualWinner === 'east' ? west : east;

    if (!winnerInfo.participantId || !loserInfo.participantId) {
      throw new Error('Missing participant IDs for tournament result');
    }

    const resultPayload = {
      winnerParticipantId: winnerInfo.participantId,
      loserParticipantId: loserInfo.participantId,
      winnerUserUuid: winnerInfo.identifier,
      loserUserUuid: loserInfo.identifier,
      eastParticipantId: east.participantId,
      westParticipantId: west.participantId,
      gamesHistory: args.gamesHistory.map((game) => ({
        gameIndex: game.gameIndex,
        east: game.east,
        west: game.west,
        winner: game.winner,
      })),
    };

    await axios.post(
      `${this.apiUrl}/api/tournaments/${tournament.tournamentId}/matches/${tournament.tournamentMatchId}/result`,
      resultPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    this.logger.info({ room: roomIdentifier }, '[ResultReporter] Tournament result reported');
  }

  private async reportCasual(
    token: string,
    east: ResolvedPlayer,
    west: ResolvedPlayer,
    args: {
      eastScore: number;
      westScore: number;
      gamesHistory: Array<{ gameIndex: number; east: number; west: number; winner: string }>;
    },
  ): Promise<{ eastDelta: number; westDelta: number }> {
    // 1) Create Match (ranking update)
    const matchPayload = {
      team1Players: [east.identifier],
      team2Players: [west.identifier],
      team1Score: args.eastScore,
      team2Score: args.westScore,
    };

    const matchRes = await axios.post(`${this.apiUrl}/api/matches`, matchPayload, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    const data = matchRes.data as {
      matchId: number;
      eloChanges?: {
        team1: Array<{ uuid: string; delta: number }>;
        team2: Array<{ uuid: string; delta: number }>;
      };
    };

    // Backend technically supports 2v2, but we assume 1v1 for game server
    const eastDelta = data.eloChanges?.team1[0]?.delta ?? 0;
    const westDelta = data.eloChanges?.team2[0]?.delta ?? 0;

    // 2) Post per-player stats for this match (best-effort)
    // TODO: consider moving this logic server-side to reduce client trust
    // Multiple separate reduce operations iterate over the same gamesHistory array.
    // Consider combining these calculations into a single reduce pass to improve performance.
    try {
      const totalEastPoints = args.gamesHistory.reduce((acc, g) => acc + (g.east ?? 0), 0);
      const totalWestPoints = args.gamesHistory.reduce((acc, g) => acc + (g.west ?? 0), 0);
      const eastWins = args.gamesHistory.filter((g) => g.winner === 'east').length;
      const westWins = args.gamesHistory.filter((g) => g.winner === 'west').length;
      const eastMaxLead = args.gamesHistory.reduce(
        (acc, g) => Math.max(acc, (g.east ?? 0) - (g.west ?? 0)),
        0,
      );
      const westMaxLead = args.gamesHistory.reduce(
        (acc, g) => Math.max(acc, (g.west ?? 0) - (g.east ?? 0)),
        0,
      );

      const statsPayload = {
        players: [
          {
            uuid: east.identifier,
            pointsScored: totalEastPoints,
            pointsConceded: totalWestPoints,
            gamesWon: eastWins,
            gamesLost: westWins,
            maxPointLead: eastMaxLead,
          },
          {
            uuid: west.identifier,
            pointsScored: totalWestPoints,
            pointsConceded: totalEastPoints,
            gamesWon: westWins,
            gamesLost: eastWins,
            maxPointLead: westMaxLead,
          },
        ],
      };

      if (typeof data.matchId === 'number' && data.matchId > 0) {
        await axios.post(`${this.apiUrl}/api/matches/${data.matchId}/stats`, statsPayload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      // Do not fail the reporting if stats posting fails; just log.
      this.logger.warn({ err }, '[ResultReporter] Failed to post per-player stats');
    }

    return { eastDelta, westDelta };
  }
}
