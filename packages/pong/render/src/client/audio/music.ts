import { CreateStreamingSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StreamingSound } from '@babylonjs/core/AudioV2/abstractAudio/streamingSound';
import type { MusicAsset } from './manifest';

export class MusicPlayer {
  private current: StreamingSound | null = null;
  private currentId: string | null = null;
  private endListeners = new Set<() => void>();

  constructor() {}

  get nowPlaying(): string | null {
    return this.currentId;
  }

  async play(asset: MusicAsset, opts?: { volume?: number; loop?: boolean; fadeMs?: number }) {
    const vol = opts?.volume ?? asset.volume ?? 0.6;
    const loop = opts?.loop ?? asset.loop ?? true;
    await this.stop();

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

  async stop() {
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
