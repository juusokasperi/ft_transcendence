import type { TournamentMatchState, TournamentParticipantState } from '../net/messageTypes';
import type { CountdownSnapshot, ReadyMatch, TournamentSummary } from './types';
import type { MatchPhase } from '../domain/countdown';

export type TournamentState = {
  connectionReady: boolean;
  availableTournaments: TournamentSummary[];
  activeTournamentId: number | null;
  activeTournamentName: string | null;
  tournamentStatus: string;
  maxParticipants: number | null;
  participants: TournamentParticipantState[];
  bracket: TournamentMatchState[];
  latestReadyMatches: ReadyMatch[];
  matchCountdowns: Map<number, CountdownSnapshot>;
  pendingMatch: ReadyMatch | null;
  matchPhase: MatchPhase;
  forfeitedParticipantIds: Set<number>;
};

export const initialTournamentState: TournamentState = {
  connectionReady: false,
  availableTournaments: [],
  activeTournamentId: null,
  activeTournamentName: null,
  tournamentStatus: 'draft',
  maxParticipants: null,
  participants: [],
  bracket: [],
  latestReadyMatches: [],
  matchCountdowns: new Map(),
  pendingMatch: null,
  matchPhase: 'idle',
  forfeitedParticipantIds: new Set(),
};

export type TournamentAction =
  | { type: 'setConnectionReady'; payload: boolean }
  | { type: 'setAvailableTournaments'; payload: TournamentSummary[] }
  | { type: 'setActiveTournamentId'; payload: number | null }
  | {
      type: 'setActiveTournament';
      payload: {
        id: number | null;
        name: string | null;
        status: string;
        maxParticipants: number | null;
      };
    }
  | { type: 'setParticipants'; payload: TournamentParticipantState[] }
  | { type: 'setBracket'; payload: TournamentMatchState[] }
  | { type: 'setLatestReadyMatches'; payload: ReadyMatch[] }
  | { type: 'setMatchCountdowns'; payload: Map<number, CountdownSnapshot> }
  | { type: 'setPendingMatch'; payload: ReadyMatch | null }
  | { type: 'setMatchPhase'; payload: MatchPhase }
  | { type: 'markParticipantsForfeited'; payload: number[] }
  | { type: 'resetActiveTournamentState' };

export function tournamentReducer(
  state: TournamentState,
  action: TournamentAction,
): TournamentState {
  switch (action.type) {
    case 'setConnectionReady':
      return { ...state, connectionReady: action.payload };
    case 'setAvailableTournaments':
      return { ...state, availableTournaments: action.payload };
    case 'setActiveTournamentId':
      return { ...state, activeTournamentId: action.payload };
    case 'setActiveTournament':
      return {
        ...state,
        activeTournamentId: action.payload.id,
        activeTournamentName: action.payload.name ?? state.activeTournamentName,
        tournamentStatus: action.payload.status,
        maxParticipants: action.payload.maxParticipants,
      };
    case 'setParticipants':
      return { ...state, participants: action.payload };
    case 'setBracket':
      return { ...state, bracket: action.payload };
    case 'setLatestReadyMatches':
      return { ...state, latestReadyMatches: action.payload };
    case 'setMatchCountdowns':
      return { ...state, matchCountdowns: action.payload };
    case 'setPendingMatch':
      return { ...state, pendingMatch: action.payload };
    case 'setMatchPhase':
      return { ...state, matchPhase: action.payload };
    case 'resetActiveTournamentState':
      return {
        ...state,
        participants: [],
        bracket: [],
        pendingMatch: null,
        matchCountdowns: new Map(),
        latestReadyMatches: [],
        tournamentStatus: state.tournamentStatus ?? 'draft',
        maxParticipants: state.maxParticipants ?? null,
        activeTournamentName: state.activeTournamentName,
        forfeitedParticipantIds: new Set(state.forfeitedParticipantIds),
      };
    case 'markParticipantsForfeited': {
      if (!action.payload || action.payload.length === 0) return state;
      const next = new Set(state.forfeitedParticipantIds);
      for (const id of action.payload) {
        if (typeof id === 'number' && Number.isFinite(id)) next.add(id);
      }
      return { ...state, forfeitedParticipantIds: next };
    }
    default:
      return state;
  }
}
