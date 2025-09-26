import type { Scene } from '@babylonjs/core/scene';
import { CreateSoundAsync } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { StaticSound } from '@babylonjs/core/AudioV2/abstractAudio/staticSound';
import type { SfxAsset } from './manifest';

export type SfxPlayOptions = {
  volume?: number;
  rate?: number;
  offset?: number;
  length?: number;
};

export class SfxPool {
  readonly id: string;
  private sound: StaticSound | null;
  private defaultVolume: number;

  private constructor(id: string, sound: StaticSound, defaultVolume = 1) {
    this.id = id;
    this.sound = sound;
    this.defaultVolume = defaultVolume;
  }

  // Scene is unused with V2; kept for signature compatibility
  static async create(_scene: Scene, asset: SfxAsset): Promise<SfxPool> {
    const sound = await CreateSoundAsync(asset.id, asset.url, {
      autoplay: false,
      loop: false,
      maxInstances: Math.max(1, asset.pool),
      volume: asset.volume ?? 1,
    });
    return new SfxPool(asset.id, sound, asset.volume ?? 1);
  }

  dispose() {
    if (!this.sound) return;
    try {
      this.sound.dispose();
    } catch {}
    this.sound = null;
  }

  isReady(): boolean {
    // V2 CreateSoundAsync resolves when decoded; consider ready
    return this.sound !== null;
  }

  play(opts: SfxPlayOptions = {}): boolean {
    const sound = this.sound;
    if (!sound) return false;
    try {
      // Note: playbackRate per-call is not supported via play options in V2; ignored here.
      sound.play({
        loop: false,
        volume: opts.volume ?? this.defaultVolume,
        startOffset: opts.offset ?? 0,
        // duration <= 0 means full length
        // only set if provided to avoid clamping to 0
        ...(opts.length != null ? { duration: opts.length } : {}),
      });
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[SfxPool:${this.id}] play failed`, e);
      return false;
    }
  }
}
