import type { Scene } from '@babylonjs/core/scene';

export type AudioAssetType = 'sfx' | 'music';

export type BaseAsset = {
  id: string;
  type: AudioAssetType;
  /** Resolved URL string suitable for Babylon Sound constructor */
  url: string;
  /** High-level purpose bucket; useful for filtering/muting policies */
  purpose?: 'gameplay' | 'ui' | 'ambience';
  /** Optional fallback asset id if this asset fails to load */
  fallbackId?: string;
};

export type SfxAsset = BaseAsset & {
  type: 'sfx';
  /** Recommended pool size for overlapping instances */
  pool: number;
  /** Preload at boot; default true */
  preload?: boolean;
  /** Default volume 0..1 for this asset; default 1 */
  volume?: number;
};

export type MusicAsset = BaseAsset & {
  type: 'music';
  /** Default loop behavior; default true for BGM */
  loop?: boolean;
  /** Default volume 0..1; default 0.6 */
  volume?: number;
};

export type AudioManifest = {
  sfx: readonly SfxAsset[];
  music: readonly MusicAsset[];
};

/**
 * Helper to resolve asset URLs relative to this file so Vite can bundle them.
 */
function asset(relPath: string): string {
  return new URL(relPath, import.meta.url).href;
}

/**
 * Default audio manifest for Pong.
 * SFX are .ogg and music is .mp3
 */
export const DefaultAudioManifest: AudioManifest = {
  sfx: [
    {
      id: 'ballHitPaddle',
      type: 'sfx',
      url: asset('../../audio/sfx/ballHitPaddle.ogg'),
      pool: 6,
      preload: true,
      volume: 0.9,
    },
    {
      id: 'ballHitTable',
      type: 'sfx',
      url: asset('../../audio/sfx/ballHitTable.ogg'),
      pool: 4,
      preload: true,
      volume: 0.8,
    },
    {
      id: 'ballHitWall',
      type: 'sfx',
      url: asset('../../audio/sfx/ballHitWall.ogg'),
      pool: 6,
      preload: true,
      volume: 0.75,
    },
    {
      id: 'scoreExplosion',
      type: 'sfx',
      url: asset('../../audio/sfx/scoreExplosion.ogg'),
      pool: 3,
      preload: true,
      volume: 0.9,
    },
  ],
  music: [
    {
      id: 'bgm_shadowRunner',
      type: 'music',
      url: asset('../../audio/music/shadow-runner-mountaineer-main-version-21965-02-22.mp3'),
      loop: true,
      volume: 0.5,
    },
    {
      id: 'bgm_quake',
      type: 'music',
      url: asset('../../audio/music/quake-aavirall-main-version-33794-02-15.mp3'),
      loop: true,
      volume: 0.5,
    },
    {
      id: 'bgm_eclipseMoire',
      type: 'music',
      url: asset('../../audio/music/eclipse-moire-main-version-01-58-12188.mp3'),
      loop: true,
      volume: 0.5,
    },
  ],
} as const;

export function resolveMusic(manifest: AudioManifest, id: string): MusicAsset | undefined {
  return manifest.music.find((m) => m.id === id);
}

export function resolveSfx(manifest: AudioManifest, id: string): SfxAsset | undefined {
  return manifest.sfx.find((s) => s.id === id);
}

export type SceneRef = Scene;
