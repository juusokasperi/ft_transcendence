import type {
  TournamentMatchState,
  TournamentParticipantState,
  TournamentMatchesReadyMessage,
  TournamentMatchCountdownMessage,
  HandoffMessage,
  HandoffTimeoutMessage,
  MatchmakingMessage,
} from '../../net/messageTypes';
import type {
  ActiveHandoff,
  CountdownSnapshot,
  ReadyMatch,
  TournamentSummary,
} from '../../state/types';
import type { MatchPhase } from '../countdown';

export type SnackbarVariant = 'error' | 'warning' | 'info' | 'success';

export type MessageCtx = {
  // Identity
  userUuid: string | null;
  getActiveTournamentId(): number | null;

  // Nav + UI
  navigate(path: string): void;
  getPathname(): string;
  enqueueSnackbar(opts: { message: string; variant: SnackbarVariant }): void;

  // Lists / tournaments
  getAvailableTournaments(): TournamentSummary[];
  setAvailableTournaments(next: TournamentSummary[]): void;
  filterTournamentsForDisplay(list: TournamentSummary[]): TournamentSummary[];
  loadTournaments(): void | Promise<void>;
  refreshTournamentState(tournamentId?: number): void | Promise<void>;

  // Active tournament metadata
  setTournamentStatus(status: string): void;
  setMaxParticipants(value: number | null): void;
  setActiveTournamentId(id: number | null): void;
  resetActiveTournamentState(): void;

  // Participants / bracket
  setParticipants(list: TournamentParticipantState[]): void;
  setBracket(list: TournamentMatchState[]): void;

  // Matches ready / countdown / phases
  setLatestReadyMatches(list: ReadyMatch[]): void;
  setMatchCountdowns(
    updater: (prev: Map<number, CountdownSnapshot>) => Map<number, CountdownSnapshot>,
  ): void;
  setMatchPhase(phase: MatchPhase): void;
  getMatchPhase(): MatchPhase;
  pendingMatchGet(): ReadyMatch | null;
  pendingMatchSet(match: ReadyMatch | null): void;
  clearCountdown(matchId: number): void;
  setHandoff(h: ActiveHandoff | null): void;

  // Connection
  setConnectionReady(ready: boolean): void;

  // Persistent annotations (optional for tests / older contexts)
  markForfeited?(ids: number[]): void;
};
