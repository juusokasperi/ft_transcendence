import type { Scene } from '@pong/render';
import {
  createAudioBus,
  createAudioManager,
  DefaultAudioManifest,
  createVolumeUI,
  resumeAudioContext,
  unlockOnInteraction,
} from '@pong/render';
import type { AudioCommandBus } from '@pong/render';

export type LocalAudioKit = {
  bus: AudioCommandBus;
  manager: ReturnType<typeof createAudioManager>;
  start(): Promise<void>;
  stop(): void; // stop playlist
  dispose(): void; // full teardown
};

const debugLog = (...args: unknown[]) => {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[Audio]', ...args);
  }
};

export function createLocalAudioKit(scene: Scene, canvas: HTMLCanvasElement): LocalAudioKit {
  const bus = createAudioBus();
  const manager = createAudioManager(scene, DefaultAudioManifest);

  // Simple on-screen audio control anchored to the canvas
  const volUI = createVolumeUI(bus, 1);
  volUI.attachToCanvas(canvas);

  // Unlock WebAudio on first interaction with the canvas
  const detachUnlock = unlockOnInteraction(canvas);
  scene.onDisposeObservable.add(detachUnlock);

  // Lightweight playlist controller (shuffle + loop)
  let offMusicEnded: (() => void) | null = null;
  let playlist: string[] = [];
  let playlistIndex = 0;

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  }

  function resetPlaylist() {
    playlist = DefaultAudioManifest.music.map((m) => m.id);
    shuffle(playlist);
    playlistIndex = 0;
  }

  function playNextTrack() {
    if (playlist.length === 0 || playlistIndex >= playlist.length) {
      resetPlaylist();
    }
    const id = playlist[playlistIndex++]!;
    bus.emit({ type: 'music.play', id, loop: false, fadeMs: 500 });
  }

  async function startPlaylist() {
    resetPlaylist();
    offMusicEnded?.();
    offMusicEnded = manager.onMusicEnded(() => {
      playNextTrack();
    });
    playNextTrack();
  }

  function stopPlaylist() {
    offMusicEnded?.();
    offMusicEnded = null;
    bus.emit({ type: 'music.stop', fadeMs: 600 });
  }

  return {
    bus,
    manager,
    async start() {
      try {
        await resumeAudioContext();
        await manager.boot({ concurrency: 2 });
        manager.observe(bus);
        await startPlaylist();
      } catch (e) {
        // eslint-disable-next-line no-console
        debugLog('[LocalAudioKit] start failed:', e);
      }
    },
    stop: () => stopPlaylist(),
    dispose() {
      try {
        stopPlaylist();
        manager.unobserve();
        manager.dispose();
      } catch {}
      try {
        volUI.dispose();
      } catch {}
    },
  };
}

/**
 * Local-only SFX detectors derived from render state (visual bounce + vx sign).
 * Emits sfx commands for paddle and table hits.
 */
export function createLocalSfxDetectors(bus: AudioCommandBus, tableSurfaceY: number) {
  let lastBallY = tableSurfaceY;
  const EPS = 1e-4;

  return {
    update(ballY: number) {
      if (lastBallY > tableSurfaceY + EPS && ballY <= tableSurfaceY + EPS) {
        bus.emit({ type: 'sfx.play', id: 'ballHitTable', volume: 0.8 });
      }
      lastBallY = ballY;
    },
  };
}
