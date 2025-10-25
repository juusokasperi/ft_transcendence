import { useEffect, useRef } from 'react';
import type { BotDifficulty } from '../../../../games/pong/ai/bot-controller';
import type { PongRuntimeHandle } from './usePongRuntime';

type UseAIBotOptions = {
  enabled: boolean;
  playing: boolean;
  difficulty: BotDifficulty;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  runtimeRef: React.MutableRefObject<PongRuntimeHandle | null>;
  runtimeReady: boolean;
  botSeat: 'P1' | 'P2';
};

type BotHandle = {
  stop(): void;
  setDifficulty: (difficulty: BotDifficulty) => void;
};

export function useAIBot({
  enabled,
  playing,
  difficulty,
  canvasRef,
  runtimeRef,
  runtimeReady,
  botSeat,
}: UseAIBotOptions) {
  const botRef = useRef<BotHandle | null>(null);
  const previousSeatRef = useRef(botSeat);

  useEffect(() => {
    return () => {
      if (botRef.current) {
        botRef.current.stop();
        botRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (botRef.current && previousSeatRef.current !== botSeat) {
      botRef.current.stop();
      botRef.current = null;
    }
    previousSeatRef.current = botSeat;

    if (!playing || !enabled) {
      if (botRef.current) {
        botRef.current.stop();
        botRef.current = null;
      }
      return;
    }

    if (!runtimeReady) {
      return;
    }

    if (botRef.current) {
      botRef.current.setDifficulty(difficulty);
      return;
    }

    const canvas = canvasRef.current;
    const observer = runtimeRef.current?.observe;
    if (!canvas || typeof observer !== 'function') {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { BotController } = await import('../../../../games/pong/ai/bot-controller');
        if (cancelled || botRef.current) return;
        const bot = new BotController(canvas, botSeat, observer, difficulty);
        bot.start();
        botRef.current = bot;
      } catch (error) {
        console.error('[useAIBot] Failed to start AI bot', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, playing, difficulty, canvasRef, runtimeRef, runtimeReady, botSeat]);
}
