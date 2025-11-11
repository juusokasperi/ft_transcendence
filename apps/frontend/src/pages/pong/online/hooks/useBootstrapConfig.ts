import { useMemo } from 'react';
import type { OnlineState } from '../state/types';

export function useBootstrapConfig(state: OnlineState) {
  return useMemo(() => {
    if (
      !state.serverUrl ||
      !state.matchId ||
      !state.roomIdentifier ||
      // Allow empty string for resume flow (join token not needed when resuming)
      state.joinToken === null ||
      state.randomSeed === null
    ) {
      return null;
    }
    return {
      serverUrl: state.serverUrl,
      matchId: state.matchId,
      roomIdentifier: state.roomIdentifier,
      joinToken: state.joinToken,
      randomSeed: state.randomSeed,
      seat: state.seat,
    };
  }, [
    state.serverUrl,
    state.matchId,
    state.roomIdentifier,
    state.joinToken,
    state.randomSeed,
    state.seat,
  ]);
}
