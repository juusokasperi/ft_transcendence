import type { AudioCommandBus } from '../audio/commands';
import { isMobile } from '../utils/platform';
import speakerOnRaw from './icons/speaker-on.svg?raw';
import speakerOffRaw from './icons/speaker-off.svg?raw';

export type VolumeUI = {
  attachToCanvas: (canvas: HTMLCanvasElement) => void;
  attachToElement: (el: HTMLElement) => void;
  dispose: () => void;
};

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

export function createVolumeUI(bus: AudioCommandBus, initialVolume = 1): VolumeUI {
  // Attach a single mute/unmute button directly to body (no container box)
  const parent = document.body;

  // State
  let volume = Math.max(0, Math.min(1, initialVolume));
  let lastNonZero = volume > 0 ? volume : 0.8;
  let muted = volume === 0;

  // Button
  const btn = createEl('button', 'pong-audio-btn');
  btn.title = muted ? 'Unmute' : 'Mute';
  btn.style.position = 'absolute';
  btn.style.zIndex = '3000';
  parent.appendChild(btn);
  // Pre-parse icons and clone on use for performance
  const iconOn = svgFromRaw(speakerOnRaw);
  const iconOff = svgFromRaw(speakerOffRaw);
  btn.appendChild((muted ? iconOff : iconOn).cloneNode(true));

  const applyMuteVisual = () => {
    btn.replaceChildren((muted ? iconOff : iconOn).cloneNode(true));
    btn.title = muted ? 'Unmute' : 'Mute';
  };

  const applyVolume = (v: number) => {
    volume = Math.max(0, Math.min(1, v));
    if (volume === 0) {
      muted = true;
      bus.emit({ type: 'master.setMuted', muted: true });
    } else {
      muted = false;
      bus.emit({ type: 'master.setVolume', volume });
    }
    applyMuteVisual();
  };

  btn.addEventListener('click', () => {
    if (!muted) {
      lastNonZero = volume > 0 ? volume : lastNonZero;
      applyVolume(0);
    } else {
      applyVolume(lastNonZero || 0.8);
    }
  });

  // Positioning relative to canvas
  let boundCanvas: HTMLElement | null = null;
  let ro: ResizeObserver | null = null;
  let raf: number | null = null;
  const schedule = () => {
    if (raf !== null) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      sync();
    });
  };
  const sync = () => {
    if (!boundCanvas) return;
    const mobile = isMobile();
    const rect = boundCanvas.getBoundingClientRect();
    const margin = 8;
    const h = btn.offsetHeight || 0;
    btn.style.left = rect.left + margin + 'px';
    if (mobile) {
      btn.style.top = rect.top + margin + 'px';
    } else {
      btn.style.top = rect.bottom - h - margin + 'px';
    }
  };

  const attachToElement = (el: HTMLElement) => {
    boundCanvas = el;
    schedule();
    if (ro) ro.disconnect();
    ro = new ResizeObserver(() => schedule());
    ro.observe(el);
  };
  const attachToCanvas = (canvas: HTMLCanvasElement) => attachToElement(canvas);

  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });

  const dispose = () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    if (raf !== null) cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    if (btn.parentElement) btn.parentElement.removeChild(btn);
    boundCanvas = null;
  };

  // Init
  applyMuteVisual();
  applyVolume(volume);

  return { attachToCanvas, attachToElement, dispose };
}

function svgFromRaw(raw: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const svg = doc.querySelector<SVGSVGElement>('svg');
  if (!svg) {
    throw new Error('Invalid SVG markup for volume icon.');
  }
  return svg;
}
