import { useEffect, useRef, useState } from 'react';
import type { Observation } from '../../../../games/pong/ai/bot-controller';
import type { Preferences } from '../../../../games/pong/modes/shared/preferences';
import type { UserSettings } from '../utils/storage';

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[OnlineGame]', ...args);
  }
};

export type PongRuntimeHandle = {
  destroy(): void;
  observe?: () => Observation;
  updatePreferences?: (preferences: Preferences) => void;
};

type UsePongRuntimeOptions = {
  playing: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  settings: UserSettings;
  onBootstrapFailed?: (error: unknown) => void;
};

type BootstrapResult = PongRuntimeHandle;

export function usePongRuntime({
  playing,
  canvasRef,
  settings,
  onBootstrapFailed,
}: UsePongRuntimeOptions) {
  const runtimeRef = useRef<PongRuntimeHandle | null>(null);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!playing) {
      if (runtimeRef.current) {
        runtimeRef.current.destroy();
        runtimeRef.current = null;
      }
      setReady(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { bootstrapPong } = await import('../../../../games/pong/host/dom-embed');
        if (cancelled) {
          return;
        }
        const app: BootstrapResult = await bootstrapPong(canvas, {
          player1: settingsRef.current.player1,
          player2: settingsRef.current.player2,
          rules: settingsRef.current.rules,
        });
        if (cancelled) {
          app.destroy();
          return;
        }
        runtimeRef.current = app;
        setReady(true);
      } catch (error) {
        debugLog('[usePongRuntime] Failed to start Pong', error);
        runtimeRef.current = null;
        setReady(false);
        onBootstrapFailed?.(error);
      }
    })();

    return () => {
      cancelled = true;
      if (runtimeRef.current) {
        runtimeRef.current.destroy();
        runtimeRef.current = null;
      }
      setReady(false);
    };
  }, [playing, canvasRef, onBootstrapFailed]);

  useEffect(() => {
    if (!playing) return;
    const app = runtimeRef.current;
    if (!app?.updatePreferences) return;

    app.updatePreferences({
      player1: settings.player1,
      player2: settings.player2,
      rules: settings.rules,
    });
  }, [playing, settings.player1, settings.player2, settings.rules]);

  return {
    runtimeRef,
    ready,
  };
}

// Preload the local (DOM) pong bootstrap bundle ahead of time to reduce latency
export function preloadLocalPong() {
  return import('../../../../games/pong/host/dom-embed').then(() => void 0).catch(() => void 0);
}
