import type { MatchEndPayload, MatchHandoff, OnlineState, OpponentInfo, Status } from './types';

const EMPTY_OPPONENT: OpponentInfo = { username: null, mmr: 0 };

export const initialState: OnlineState = {
  status: 'connecting',
  clientId: '',
  opponent: EMPTY_OPPONENT,
  serverUrl: '',
  matchId: '',
  roomIdentifier: '',
  seat: 'P1',
  joinToken: null,
  randomSeed: null,
  postMatchSummary: null,
};

type Action =
  | { type: 'connected'; clientId: string }
  | { type: 'queueJoined' }
  | { type: 'queueLeft' }
  | { type: 'matchFound'; matchId: string; opponent: OpponentInfo }
  | { type: 'matchAccepted' }
  | { type: 'matchDeclined' }
  | { type: 'handoff'; payload: MatchHandoff }
  | { type: 'matchTimeout' }
  | { type: 'allocatorError' }
  | { type: 'authError' }
  | { type: 'ratelimitError' }
  | { type: 'inTournamentLobbyError' }
  | { type: 'inInviteLobbyError' }
  | { type: 'startPlaying' }
  | { type: 'endMatch'; payload?: MatchEndPayload }
  | { type: 'showPostMatch'; summary: import('./types').OnlineMatchSummary }
  | { type: 'reset' };

const resetState = (state: OnlineState, status: Status): OnlineState => ({
  ...initialState,
  status,
  clientId: state.clientId,
});

export function reducer(state: OnlineState, action: Action): OnlineState {
  switch (action.type) {
    case 'connected': {
      return {
        ...initialState,
        status: 'idle',
        clientId: action.clientId,
      };
    }

    case 'queueJoined':
      return {
        ...state,
        status: 'in_queue',
      };

    case 'queueLeft':
      return {
        ...state,
        status: 'idle',
      };

    case 'matchFound':
      return {
        ...state,
        status: 'match_found',
        matchId: action.matchId,
        opponent: action.opponent,
      };

    case 'matchAccepted':
      return state.status === 'match_found'
        ? {
            ...state,
            status: 'match_accepted',
          }
        : state;

    case 'matchDeclined':
      return resetState(state, 'idle');

    case 'handoff': {
      const { payload } = action;
      const seat = payload.side === 'east' ? 'P1' : 'P2';
      return {
        ...state,
        status: 'starting',
        serverUrl: payload.serverUrl,
        matchId: payload.matchId,
        roomIdentifier: payload.roomIdentifier,
        seat,
        joinToken: payload.joinToken,
        randomSeed: payload.randomSeed,
        postMatchSummary: null,
      };
    }

    case 'matchTimeout':
      return resetState(state, 'idle');

    case 'allocatorError':
      return resetState(state, 'idle');

    case 'authError':
      return resetState(state, 'connecting');

    case 'ratelimitError':
      return state;

    case 'inTournamentLobbyError':
      return state;

    case 'inInviteLobbyError':
      return state;

    case 'startPlaying':
      return state.status === 'starting'
        ? {
            ...state,
            status: 'playing',
            postMatchSummary: null,
          }
        : state;

    case 'showPostMatch':
      return {
        ...state,
        status: 'postmatch',
        postMatchSummary: action.summary,
        serverUrl: '',
        matchId: '',
        roomIdentifier: '',
        joinToken: null,
        randomSeed: null,
      };

    case 'endMatch':
      return resetState(state, 'idle');

    case 'reset':
      return resetState(state, 'connecting');

    default:
      return state;
  }
}

export type { Action as OnlineAction };
