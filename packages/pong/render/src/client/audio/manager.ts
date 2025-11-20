import type { Scene } from '@babylonjs/core/scene';
import { LastCreatedAudioEngine } from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';
import type { AudioManifest } from './manifest';
import { resolveMusic, resolveSfx } from './manifest';
import type {
  AudioCommand,
  AudioCommandBus,
  MusicPlayCommand,
  MusicStopCommand,
  SfxPlayCommand,
} from './commands';
import { MusicPlayer } from './music';
import { preloadSfx, resumeAudioContext } from './loader';
import type { SfxPool } from './sfx-pool';

export type AudioBootOptions = {
  concurrency?: number;
  onProgress?: (done: number, total: number, id?: string) => void;
};

export class AudioManager {
  private scene: Scene;
  private manifest: AudioManifest;
  private music: MusicPlayer;
  private pools: Record<string, SfxPool> = {};
  private failedSfx = new Set<string>();
  private unsub: (() => void) | null = null;

  constructor(scene: Scene, manifest: AudioManifest) {
    this.scene = scene;
    this.manifest = manifest;
    this.music = new MusicPlayer();
  }

  /** Resume AudioContext and preload SFX with concurrency limit. */
  async boot(opts: AudioBootOptions = {}) {
    // Ensure AudioEngineV2 exists; create if missing
    if (!LastCreatedAudioEngine()) {
      try {
        await CreateAudioEngineAsync({ disableDefaultUI: true, resumeOnInteraction: false });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Audio] Failed to create AudioEngineV2', e);
      }
    }
    // Resume/unlock V2 engine (or legacy fallback)
    await resumeAudioContext();
    const { pools, failed } = await preloadSfx(
      this.scene,
      this.manifest,
      opts.concurrency ?? 2,
      opts.onProgress,
    );
    this.pools = pools;
    for (const id of failed) this.failedSfx.add(id);
  }

  observe(bus: AudioCommandBus) {
    this.unobserve();
    this.unsub = bus.subscribe((cmd) => this.handle(cmd));
  }

  unobserve() {
    if (this.unsub) {
      try {
        this.unsub();
      } catch {}
      this.unsub = null;
    }
  }

  dispose() {
    this.unobserve();
    this.runAsync(this.music.stop(), 'music.stop(dispose)');
    for (const p of Object.values(this.pools)) {
      try {
        p.dispose();
      } catch {}
    }
    this.pools = {};
  }

  onMusicEnded(fn: () => void): () => void {
    return this.music.addOnEnded(fn);
  }

  private handle(cmd: AudioCommand) {
    switch (cmd.type) {
      case 'sfx.play':
        this.onSfx(cmd);
        break;
      case 'music.play':
        try {
          this.runAsync(this.onMusicPlay(cmd), `music.play(${cmd.id})`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[Audio] music.play(${cmd.id}) failed`, err);
        }
        break;
      case 'music.stop':
        try {
          this.runAsync(this.onMusicStop(cmd), 'music.stop');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[Audio] music.stop failed', err);
        }
        break;
      case 'master.setVolume': {
        const v = Math.max(0, Math.min(1, cmd.volume));
        const v2 = LastCreatedAudioEngine();
        if (v2) {
          try {
            v2.setVolume(v);
          } catch {}
        }
        break;
      }
      case 'master.setMuted': {
        const v2 = LastCreatedAudioEngine();
        if (v2) {
          try {
            v2.setVolume(cmd.muted ? 0 : 1);
          } catch {}
        }
        break;
      }
    }
  }

  /** Swallow promise rejections so bus subscribers never throw asynchronously. */
  private runAsync(p: Promise<void> | void = undefined, label = 'audio command') {
    if (!p) return;
    void p.catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[Audio] ${label} failed`, err);
    });
  }

  private onSfx(cmd: SfxPlayCommand) {
    // Try direct id
    let pool = this.pools[cmd.id];
    if (!pool) {
      // Try manifest fallback if any
      const src = resolveSfx(this.manifest, cmd.id);
      if (src?.fallbackId) pool = this.pools[src.fallbackId];
    }
    if (!pool) return; // drop silently
    void pool.play({ volume: cmd.volume, rate: cmd.rate, offset: cmd.offset, length: cmd.length });
  }

  private onMusicPlay(cmd: MusicPlayCommand): Promise<void> | void {
    const m = resolveMusic(this.manifest, cmd.id);
    if (!m) return;
    return this.music.play(m, { volume: cmd.volume, loop: cmd.loop, fadeMs: cmd.fadeMs });
  }

  private onMusicStop(cmd: MusicStopCommand): Promise<void> | void {
    void cmd;
    return this.music.stop();
  }
}

export function createAudioManager(scene: Scene, manifest: AudioManifest) {
  return new AudioManager(scene, manifest);
}
