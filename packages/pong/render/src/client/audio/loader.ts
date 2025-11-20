import type { Scene } from '@babylonjs/core/scene';
import { LastCreatedAudioEngine } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import type { AudioManifest } from './manifest';
import { SfxPool } from './sfx-pool';

export type PreloadResult = {
  pools: Record<string, SfxPool>;
  failed: string[];
};

export async function resumeAudioContext(): Promise<boolean> {
  try {
    // Prefer AudioEngineV2 when available
    const v2 = LastCreatedAudioEngine();
    if (v2) {
      await v2.unlockAsync();
      await v2.resumeAsync();
      return v2.state === 'running';
    }
    return false;
  } catch {
    return false;
  }
}

/** Attach a one-time interaction unlock to a DOM element. */
export function unlockOnInteraction(el: HTMLElement): () => void {
  const handler = async () => {
    await resumeAudioContext();
    el.removeEventListener('pointerdown', handler);
    el.removeEventListener('keydown', handler);
    el.removeEventListener('click', handler);
  };
  el.addEventListener('pointerdown', handler, { once: true });
  el.addEventListener('keydown', handler, { once: true });
  el.addEventListener('click', handler, { once: true });
  return () => {
    el.removeEventListener('pointerdown', handler);
    el.removeEventListener('keydown', handler);
    el.removeEventListener('click', handler);
  };
}

/**
 * Preload & decode SFX with capped concurrency; clones are created to support overlapping playback.
 */
export async function preloadSfx(
  scene: Scene,
  manifest: AudioManifest,
  concurrency = 2,
  onProgress?: (done: number, total: number, id?: string) => void,
): Promise<PreloadResult> {
  const toLoad = manifest.sfx.filter((s) => s.preload !== false);
  const failed: string[] = [];
  const pools: Record<string, SfxPool> = {};

  let inFlight = 0;
  let i = 0;
  let done = 0;
  const total = toLoad.length;

  return await new Promise<PreloadResult>((resolve) => {
    const pump = () => {
      if (done === total) {
        resolve({ pools, failed });
        return;
      }
      while (inFlight < Math.max(1, concurrency) && i < total) {
        const asset = toLoad[i++];
        if (!asset) {
          continue;
        }
        inFlight++;
        void SfxPool.create(scene, asset)
          .then((pool) => {
            pools[asset.id] = pool;
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.warn('[Audio] Failed to preload SFX', asset.id, e);
            failed.push(asset.id);
          })
          .finally(() => {
            inFlight--;
            done++;
            onProgress?.(done, total, asset.id);
            pump();
          });
      }
    };
    pump();
  });
}
