export type SfxPlayCommand = {
  type: 'sfx.play';
  id: string;
  /** Optional override 0..1 */
  volume?: number;
  /** Optional WebAudio playbackRate multiplier (1 = normal) */
  rate?: number;
  /** Optional offset/length to play a region (seconds) */
  offset?: number;
  length?: number;
};

export type MusicPlayCommand = {
  type: 'music.play';
  id: string;
  /** Optional override */
  volume?: number;
  loop?: boolean;
  /** Optional fade in milliseconds */
  fadeMs?: number;
};

export type MusicStopCommand = {
  type: 'music.stop';
  /** Optional fade out milliseconds */
  fadeMs?: number;
};

export type MasterVolumeCommand = { type: 'master.setVolume'; volume: number };
export type MasterMuteCommand = { type: 'master.setMuted'; muted: boolean };

export type AudioCommand =
  | SfxPlayCommand
  | MusicPlayCommand
  | MusicStopCommand
  | MasterVolumeCommand
  | MasterMuteCommand;

export type AudioCommandListener = (cmd: AudioCommand) => void;

/** Minimal, framework-agnostic command bus */
export class AudioCommandBus {
  private listeners = new Set<AudioCommandListener>();

  subscribe(fn: AudioCommandListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(cmd: AudioCommand) {
    for (const fn of this.listeners) {
      try {
        fn(cmd);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AudioBus] listener threw', e);
      }
    }
  }
}

export function createAudioBus() {
  return new AudioCommandBus();
}
