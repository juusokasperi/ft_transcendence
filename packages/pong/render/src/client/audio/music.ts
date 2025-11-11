import type { Scene } from '@babylonjs/core/scene';
import { CreateStreamingSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StreamingSound } from '@babylonjs/core/AudioV2/abstractAudio/streamingSound';
import type { MusicAsset } from './manifest';

export class MusicPlayer {
  private scene: Scene;
  private current: StreamingSound | null = null;
  private currentId: string | null = null;
  private endListeners = new Set<() => void>();

  constructor(scene: Scene) {
    this.scene = scene;
    // Mark `scene` as used to satisfy `noUnusedLocals`/`noUnusedParameters` checks.
    void this.scene;
  }

  get nowPlaying(): string | null {
    return this.currentId;
  }

  async play(asset: MusicAsset, opts?: { volume?: number; loop?: boolean; fadeMs?: number }) {
    const vol = opts?.volume ?? asset.volume ?? 0.6;
    const loop = opts?.loop ?? asset.loop ?? true;
    // Fade not currently supported per-sound in V2 without exposing subnodes; play at target volume
    const _fadeMs = Math.max(0, opts?.fadeMs ?? 0);

    await this.stop(_fadeMs);

    const s = await CreateStreamingSoundAsync(asset.id, asset.url, {
      autoplay: false,
      loop,
      preloadCount: 1,
    });

    this.current = s;
    this.currentId = asset.id;

    if (!this.current || this.current !== s) return; // stopped meanwhile

    try {
      // Relay end event to listeners if still current
      s.onEndedObservable.add(() => {
        if (this.current === s) {
          for (const fn of this.endListeners) {
            try {
              fn();
            } catch {}
          }
        }
      });
      s.play({ volume: vol });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Music] play failed', asset.id, e);
    }
  }

  addOnEnded(fn: () => void): () => void {
    this.endListeners.add(fn);
    return () => this.endListeners.delete(fn);
  }

  async stop(fadeMs = 200) {
    // Mark `fadeMs` as intentionally unused (fade not implemented) so the
    // compiler doesn't error, without changing runtime behaviour.
    void fadeMs;

    if (!this.current) return;
    const s = this.current;
    this.current = null;
    this.currentId = null;
    try {
      s.stop();
      s.dispose();
    } catch {}
  }
}
