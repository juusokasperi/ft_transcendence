import type { AudioCommandBus } from '../audio/commands';

export type VolumeUI = {
  attachToCanvas: (canvas: HTMLCanvasElement) => void;
  attachToElement: (el: HTMLElement) => void;
  dispose: () => void;
};

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
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
  const btn = createEl('button', 'pong-audio-btn', svgSpeaker(muted));
  btn.title = muted ? 'Unmute' : 'Mute';
  btn.style.position = 'absolute';
  btn.style.zIndex = '1010';
  parent.appendChild(btn);

  const applyMuteVisual = () => {
    btn.innerHTML = svgSpeaker(muted);
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
    const rect = boundCanvas.getBoundingClientRect();
    const margin = 8;
    const h = btn.offsetHeight || 0;
    btn.style.left = rect.left + margin + 'px';
    btn.style.top = rect.bottom - h - margin + 'px';
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

function svgSpeaker(muted: boolean): string {
  if (!muted) {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
</svg>`;
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <line x1="23" y1="9" x2="17" y2="15"></line>
  <line x1="17" y1="9" x2="23" y2="15"></line>
</svg>`;
}
