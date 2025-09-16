import type { TableEnd } from '@pong/shared';
import type { GameHistoryEntry } from '@pong/shared';

export type DomScoreboardAPI = {
  setPoints: (east: number, west: number) => void;
  setServer: (end: TableEnd) => void; // blue orb left of the name
  setDeuce: (flag: boolean) => void;
  setPlayerNames: (eastName: string, westName: string) => void;
  setGames: (history: GameHistoryEntry[], bestOf: number, currentGameIndex?: number) => void;
  attachToCanvas: (canvas: HTMLCanvasElement) => void;
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

/**
 * Names panel (glass only, no gradient) wraps: [serve orb | Name]
 * Right column shows contiguous game boxes aligned with each row.
 * The names panel width adapts to the longest current name (clamped 8..16ch).
 *
 * Row mapping is explicit and fixed:
 *  - east → top row
 *  - west → bottom row
 */
export function createScoreboard(): DomScoreboardAPI {
  const existingRoot = document.getElementById('pong-hud-root') as HTMLDivElement | null;
  const root = existingRoot ?? createEl('div', 'pong-hud-root');
  if (!existingRoot) root.id = 'pong-hud-root';
  if (!existingRoot) document.body.appendChild(root);

  // Overlay that tracks the canvas rect
  const overlay = createEl('div', 'pong-hud-overlay');
  root.appendChild(overlay);

  // ===== OUTER WRAP: 2-column grid
  // Left column width must hug content → max-content (this removes the “full-width bar” effect)
  const wrap = createEl('div', 'pong-hud-wrap');
  // Explicitly define columns: [max-content | auto]
  wrap.style.gridTemplateColumns = 'max-content auto';
  overlay.appendChild(wrap);

  // ===== LEFT NAMES PANEL (GLASS ONLY — NO GRADIENT)
  const panel = createEl('div', 'pong-hud-panel');
  wrap.appendChild(panel);

  // One name row inside panel
  function makeNameRow() {
    const row = createEl('div', 'pong-hud-name-row');
    row.style.gridTemplateColumns = '18px max-content';

    const orb = createEl('div', 'pong-hud-orb');

    const name = createEl('div', 'pong-hud-name', '-');

    row.append(orb, name);
    return { row, name, orb };
  }

  type NamesRow = { row: HTMLDivElement; name: HTMLDivElement; orb: HTMLDivElement };
  const names: Record<TableEnd, NamesRow> = {
    east: makeNameRow(),
    west: makeNameRow(),
  };
  panel.appendChild(names.east.row);

  // cyan divider
  const divider = createEl('div', 'pong-hud-divider');
  panel.appendChild(divider);
  panel.appendChild(names.west.row);

  function applyNameColumns() {
    names.east.row.style.gridTemplateColumns = '18px max-content';
    names.west.row.style.gridTemplateColumns = '18px max-content';
  }
  applyNameColumns();

  // ===== RIGHT COLUMN: score boxes aligned with each row
  const rightTop = createEl('div', 'pong-hud-right-row');
  const rightBottom = createEl('div', 'pong-hud-right-row');
  wrap.appendChild(rightTop);
  wrap.appendChild(rightBottom);

  // Deuce pill (centered under the scoreboard)
  const deuce = createEl('div', 'pong-hud-deuce', 'Deuce');
  deuce.style.opacity = '0';
  wrap.appendChild(deuce);

  // ----- live points
  let lastPoints = { east: 0, west: 0 };
  const currentBoxEl: { east: HTMLElement | null; west: HTMLElement | null } = {
    east: null,
    west: null,
  };

  // boxes
  function makeBox() {
    return createEl('div', 'pong-hud-box');
  }
  function decorateWinner(el: HTMLElement) {
    el.classList.add('pong-hud-box-winner');
  }
  function decorateCurrent(el: HTMLElement) {
    el.classList.add('pong-hud-box-current');
  }

  function renderBoxesRow(
    container: HTMLElement,
    who: 'east' | 'west',
    history: GameHistoryEntry[],
    bestOf: number,
    currentGameIndex?: number,
  ) {
    container.textContent = '';
    currentBoxEl[who] = null;

    const map = new Map<number, GameHistoryEntry>();
    for (const h of history) map.set(h.gameIndex, h);

    const lastShown =
      Math.max(
        [...map.keys()].reduce((a, b) => Math.max(a, b), 0),
        currentGameIndex ?? 1,
      ) || 1;

    for (let i = 1; i <= lastShown; i++) {
      const slot = makeBox();
      const entry = map.get(i);
      if (entry) {
        slot.textContent = String(who === 'east' ? entry.east : entry.west);
        if (entry.winner === who) decorateWinner(slot);
        else slot.classList.add('opacity-80');
      } else if (i === currentGameIndex) {
        slot.textContent = String(who === 'east' ? lastPoints.east : lastPoints.west);
        decorateCurrent(slot);
        currentBoxEl[who] = slot;
      }
      container.appendChild(slot);
    }
  }

  // API setters
  const setPoints = (east: number, west: number) => {
    lastPoints = { east: east | 0, west: west | 0 };
    if (currentBoxEl.east) {
      const el = currentBoxEl.east;
      if (el.textContent !== String(lastPoints.east)) {
        el.textContent = String(lastPoints.east);
      }
    }
    if (currentBoxEl.west) {
      const el = currentBoxEl.west;
      if (el.textContent !== String(lastPoints.west)) {
        el.textContent = String(lastPoints.west);
      }
    }
  };

  // Blue serve orb (no box glow around row)
  const setServer = (end: TableEnd) => {
    const active = end; // "east" | "west"
    const passive = end === 'east' ? 'west' : 'east';

    const on = names[active].orb;
    const off = names[passive].orb;

    on.classList.add('pong-hud-orb-active');
    off.classList.remove('pong-hud-orb-active');
  };

  const setDeuce = (flag: boolean) => {
    deuce.style.opacity = flag ? '1' : '0';
  };

  const setPlayerNames = (eastName: string, westName: string) => {
    names.east.name.textContent = eastName;
    names.west.name.textContent = westName;
    names.east.name.setAttribute('title', eastName);
    names.west.name.setAttribute('title', westName);

    applyNameColumns(); // sizes to the longest name automatically

    const rect = panel.getBoundingClientRect();
    deuce.style.left = rect.right - 8 + 'px';
    deuce.style.top = rect.top + 6 + 'px';
  };

  const setGames = (history: GameHistoryEntry[], bestOf: number, cgIndex?: number) => {
    renderBoxesRow(rightTop, 'east', history, bestOf, cgIndex);
    renderBoxesRow(rightBottom, 'west', history, bestOf, cgIndex);
    setPoints(lastPoints.east, lastPoints.west);
  };

  // Canvas anchoring (with ResizeObserver)
  let boundCanvas: HTMLCanvasElement | null = null;
  let ro: ResizeObserver | null = null;

  // rAF micro-throttle: coalesce resize/scroll/RO callbacks to <= 1 per frame
  let rafId: number | null = null;
  const scheduleSync = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncOverlay();
    });
  };

  const syncOverlay = () => {
    if (!boundCanvas) return;
    const rect = boundCanvas.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const p = panel.getBoundingClientRect();
    deuce.style.left = p.right - 8 + 'px';
    deuce.style.top = p.top + 6 + 'px';
  };

  const attachToCanvas = (canvas: HTMLCanvasElement) => {
    boundCanvas = canvas;
    scheduleSync();
    if (ro) ro.disconnect();
    ro = new ResizeObserver(() => scheduleSync());
    ro.observe(canvas);
  };

  // Coalesced listeners
  window.addEventListener('resize', scheduleSync);
  window.addEventListener('scroll', scheduleSync, { passive: true });

  const dispose = () => {
    window.removeEventListener('resize', scheduleSync);
    window.removeEventListener('scroll', scheduleSync);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    root.contains(overlay) && root.removeChild(overlay);
    if (!existingRoot && root.parentElement) root.parentElement.removeChild(root);
    boundCanvas = null;
  };

  return {
    setPoints,
    setServer,
    setDeuce,
    setPlayerNames,
    setGames,
    attachToCanvas,
    dispose,
  };
}
