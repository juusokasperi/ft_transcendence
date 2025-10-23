import axios from 'axios';
import jwt from 'jsonwebtoken';
import type { OnlineMatchSummary } from '@pong/shared/protocol/net';
import type { MatchSession, PlayerConnectionState } from './RoomRegistry.ts';
import type { Logger } from './Logger.ts';
import type { Seat, ExpectedPlayer } from '../domain/MatchTypes.ts';

type MatchOverEvent = { winner?: string };

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
  private readonly logger: Logger;

  constructor(args: { apiUrl: string; matchSecret: string; logger: Logger }) {
    this.apiUrl = args.apiUrl;
    this.matchSecret = args.matchSecret;
    this.logger = args.logger;
  }

  async report(session: MatchSession, matchOver: MatchOverEvent): Promise<OnlineMatchSummary | null> {
    const model = session.model;
    if (model.resultSubmitting || model.resultSubmitted) return null;
    model.resultSubmitting = true;

    try {
      const { reservation } = session;
      const playerAtEnd = model.state.playerAtEnd;
      const eastSeat = playerAtEnd.east;
      const westSeat = playerAtEnd.west;

      const east = this.resolvePlayer(session, eastSeat);
      const west = this.resolvePlayer(session, westSeat);
      if (!east || !west) {
        this.logger.error({ room: reservation.roomIdentifier }, '[ResultReporter] Missing player mapping');
        model.resultSubmitting = false;
        return null;
      }

      const gamesHistory = model.lastSnapshot?.gamesHistory ?? [];
      let eastScore = gamesHistory.filter((g) => g.winner === 'east').length;
      let westScore = gamesHistory.filter((g) => g.winner === 'west').length;
      let technicalGamesHistory = gamesHistory;

      if (eastScore === 0 && westScore === 0 && matchOver.winner) {
        const winner =
          matchOver.winner === 'east' || matchOver.winner === 'west'
            ? (matchOver.winner as 'east' | 'west')
            : 'east';
        const technicalScore = reservation.tournament ? 3 : 2;
        eastScore = winner === 'east' ? technicalScore : 0;
        westScore = winner === 'west' ? technicalScore : 0;
        technicalGamesHistory = Array.from({ length: technicalScore }, (_, index) => ({
          gameIndex: index + 1,
          east: winner === 'east' ? 11 : 0,
          west: winner === 'west' ? 11 : 0,
          winner,
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
        });
        eastAfter += deltas.eastDelta;
        westAfter += deltas.westDelta;
      }

      model.resultSubmitted = true;
      model.resultSubmitting = false;

      const winnerFromEvent =
        matchOver.winner === 'east' || matchOver.winner === 'west'
          ? matchOver.winner
          : eastScore >= westScore
            ? 'east'
            : 'west';

      const bestOf =
        model.lastSnapshot?.bestOf ??
        (typeof (model.state as any)?.params?.bestOf === 'number'
          ? (model.state as any).params.bestOf
          : Math.max(technicalGamesHistory.length * 2 - 1, 1));

      const summary: OnlineMatchSummary = {
        winner: winnerFromEvent,
        bestOf,
        gamesHistory: technicalGamesHistory,
        names: {
          east: east.alias ?? (east.seat === 'P1' ? 'Player 1' : 'Player 2'),
          west: west.alias ?? (west.seat === 'P1' ? 'Player 1' : 'Player 2'),
        },
        seats: {
          east: east.seat,
          west: west.seat,
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
    return jwt.sign(
      {
        service: 'game-node',
        iat: now,
        exp: now + 3600,
      },
      this.matchSecret,
    );
  }

  private async reportTournament(
    roomIdentifier: string,
    token: string,
    reservation: MatchSession['reservation'],
    east: ResolvedPlayer,
    west: ResolvedPlayer,
    args: { eastScore: number; westScore: number; gamesHistory: Array<{ gameIndex: number; east: number; west: number; winner: string }> },
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
    args: { eastScore: number; westScore: number },
  ): Promise<{ eastDelta: number; westDelta: number }> {
    const resultPayload = {
      team1Players: [east.identifier],
      team2Players: [west.identifier],
      team1Score: args.eastScore,
      team2Score: args.westScore,
    };

    const response = await axios.post(`${this.apiUrl}/api/matches`, resultPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const rawTeam1Delta = Number(response.data?.eloChanges?.team1 ?? 0);
    const rawTeam2Delta = Number(response.data?.eloChanges?.team2 ?? 0);
    const eastDelta = Number.isFinite(rawTeam1Delta) ? rawTeam1Delta : 0;
    const westDelta = Number.isFinite(rawTeam2Delta) ? rawTeam2Delta : 0;

    this.logger.info({}, '[ResultReporter] Casual match result reported');

    return { eastDelta, westDelta };
  }
}
