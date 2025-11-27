import type { AudioCommandBus } from '../audio/commands';
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

const fullscreenEventNames = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
] as const;

const getFullscreenElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const docAny = document as any;
  return (
    docAny.fullscreenElement ||
    docAny.webkitFullscreenElement ||
    docAny.mozFullScreenElement ||
    docAny.msFullscreenElement ||
    null
  );
};

export function createVolumeUI(bus: AudioCommandBus, initialVolume = 1): VolumeUI {
  // Attach a single mute/unmute button directly to body (no container box)
  const defaultParent = document.body;
  let currentParent: HTMLElement | null = defaultParent;

  // State
  let volume = Math.max(0, Math.min(1, initialVolume));
  let lastNonZero = volume > 0 ? volume : 0.8;
  let muted = volume === 0;

  // Button
  const btn = createEl('button', 'pong-audio-btn');
  btn.title = muted ? 'Unmute' : 'Mute';
  btn.style.position = 'absolute';
  btn.style.zIndex = '3000';
  defaultParent.appendChild(btn);
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
    const focusable = boundCanvas as HTMLElement | null;
    if (focusable && typeof focusable.focus === 'function') {
      focusable.focus();
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
    const rect = boundCanvas.getBoundingClientRect();
    const margin = 8;
    btn.style.left = rect.left + margin + 'px';
    btn.style.top = rect.top + margin + 'px';
  };

  const attachToElement = (el: HTMLElement) => {
    boundCanvas = el;
    schedule();
    if (ro) ro.disconnect();
    ro = new ResizeObserver(() => schedule());
    ro.observe(el);
  };
  const attachToCanvas = (canvas: HTMLCanvasElement) => attachToElement(canvas);

  const handleFullscreenChange = () => {
    if (!defaultParent || !btn) return;
    const fullscreenElement = getFullscreenElement();
    const targetParent =
      fullscreenElement instanceof HTMLElement &&
      boundCanvas &&
      fullscreenElement.contains(boundCanvas)
        ? fullscreenElement
        : defaultParent;
    if (targetParent !== currentParent) {
      targetParent.appendChild(btn);
      currentParent = targetParent;
      schedule();
    }
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  fullscreenEventNames.forEach((event) =>
    document.addEventListener(event, handleFullscreenChange),
  );
  handleFullscreenChange();

  const dispose = () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    fullscreenEventNames.forEach((event) =>
      document.removeEventListener(event, handleFullscreenChange),
    );
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
