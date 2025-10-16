import { useCallback, useEffect, useRef } from 'react';
import type { MatchEndPayload, MatchHandoff } from '../state/types';

type BootstrapConfig = Omit<MatchHandoff, 'side'> & {
  seat: 'P1' | 'P2';
};

type UseGameBootstrapOptions = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  active: boolean;
  config: BootstrapConfig | null;
  onStarted: () => void;
  onEnded: (payload: MatchEndPayload) => void;
};

type GameInstance = {
  destroy(): void;
};

export function useGameBootstrap({
  canvasRef,
  active,
  config,
  onStarted,
  onEnded,
}: UseGameBootstrapOptions) {
  const appRef = useRef<GameInstance | null>(null);
  const bootingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
      bootingRef.current = false;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !config) return;
    if (appRef.current || bootingRef.current) return;

    let cancelled = false;
    bootingRef.current = true;

    (async () => {
      try {
        const { bootstrapOnlinePong } = await import(
          '../../../../games/pong/host/online-embed'
        );
        if (cancelled) return;

        const instance = await bootstrapOnlinePong(canvas, {
          serverUrl: config.serverUrl,
          matchId: config.matchId,
          roomIdentifier: config.roomIdentifier,
          seat: config.seat,
          joinToken: config.joinToken,
          randomSeed: config.randomSeed,
          onMatchEnd: (reason: string, winner?: 'east' | 'west') => {
            onEnded({ reason, winner });
          },
        });

        if (cancelled) {
          instance.destroy();
          return;
        }

        appRef.current = instance;
        onStarted();
      } catch (error) {
        console.error('[useGameBootstrap] Failed to bootstrap online pong', error);
        onEnded({ reason: 'bootstrap_failed' });
      } finally {
        if (!cancelled) bootingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, canvasRef, config, onEnded, onStarted]);

  useEffect(() => {
    return () => {
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, []);

  const destroy = useCallback(() => {
    if (appRef.current) {
      appRef.current.destroy();
      appRef.current = null;
    }
  }, []);

  return { destroy };
}
