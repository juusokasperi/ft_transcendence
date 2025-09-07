// src/client/ui/scoreboard.ts
import type { TableEnd } from "@shared/domain/ids";
import type { GameHistoryEntry } from "@shared/protocol/state";

export type DomScoreboardAPI = {
  setPoints: (east: number, west: number) => void;
  setServer: (end: TableEnd) => void; // blue orb left of the name
  setDeuce: (flag: boolean) => void;
  setPlayerNames: (eastName: string, westName: string) => void;
  setGames: (
    history: GameHistoryEntry[],
    bestOf: number,
    currentGameIndex?: number,
  ) => void;
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
  const existingRoot = document.getElementById(
    "pong-hud-root",
  ) as HTMLDivElement | null;
  const root =
    existingRoot ?? createEl("div", "pointer-events-none fixed inset-0 z-50");
  if (!existingRoot) document.body.appendChild(root);

  // Overlay that tracks the canvas rect
  const overlay = createEl("div", "pointer-events-none absolute inset-0");
  root.appendChild(overlay);

  // ===== OUTER WRAP: 2-column grid
  // Left column width must hug content → max-content (this removes the “full-width bar” effect)
  const wrap = createEl(
    "div",
    "relative mx-auto mt-3 grid items-center gap-x-3 w-fit",
  );
  // Explicitly define columns: [max-content | auto]
  wrap.style.gridTemplateColumns = "max-content auto";
  overlay.appendChild(wrap);

  // ===== LEFT NAMES PANEL (GLASS ONLY — NO GRADIENT)
  const panel = createEl(
    "div",
    [
      "row-span-2",
      "rounded-xl",
      "border border-white/12",
      "bg-slate-900/60 backdrop-blur-md",
      "px-2 py-1", // PANEL_PAD_X = 8px
      "shadow-[0_8px_24px_rgba(0,0,0,0.38)]",
    ].join(" "),
  );
  wrap.appendChild(panel);

  // One name row inside panel
  function makeNameRow() {
    const row = createEl("div", "grid items-center gap-x-2 h-10");
    row.style.gridTemplateColumns = "18px max-content";

    const orb = createEl(
      "div",
      [
        "w-[14px] h-[14px] rounded-full",
        "border border-white/20",
        "bg-white/12",
        "shadow-[0_0_0_1px_rgba(255,255,255,.06)]",
      ].join(" "),
    );

    const name = createEl(
      "div",
      [
        "whitespace-nowrap", // keep one line
        "px-[6px]",
        "text-[24px]",
        "md:text-[26px]",
        "leading-[1.05]",
        "font-semibold text-slate-100 select-none",
        // intentionally no overflow clamp: panel expands to longest name
      ].join(" "),
      "-",
    );

    row.append(orb, name);
    return { row, name, orb };
  }

  const names = {
    east: makeNameRow(),
    west: makeNameRow(),
  };
  panel.appendChild(names.east.row);

  // cyan divider
  const divider = createEl(
    "div",
    "my-1 h-[3px] rounded-full bg-gradient-to-r from-cyan-300/80 via-sky-400/80 to-cyan-300/80 shadow-[0_0_12px_rgba(56,189,248,.35)]",
  );
  panel.appendChild(divider);
  panel.appendChild(names.west.row);

  function applyNameColumns() {
    names.east.row.style.gridTemplateColumns = "18px max-content";
    names.west.row.style.gridTemplateColumns = "18px max-content";
  }
  applyNameColumns();

  // ===== RIGHT COLUMN: score boxes aligned with each row
  const rightTop = createEl(
    "div",
    "h-10 flex items-center gap-1 justify-start",
  );
  const rightBottom = createEl(
    "div",
    "h-10 flex items-center gap-1 justify-start",
  );
  wrap.appendChild(rightTop);
  wrap.appendChild(rightBottom);

  // Deuce pill (centered under the scoreboard)
  const deuce = createEl(
    "div",
    [
      "col-span-2",
      "justify-self-center",
      "mt-1",
      "px-2 py-[2px] rounded-md",
      "bg-white/10 text-white/90",
      "text-[11px] tracking-wider font-semibold uppercase",
      "border border-white/15 shadow-[0_6px_16px_rgba(0,0,0,.25)]",
      "transition-opacity",
    ].join(" "),
    "Deuce",
  );
  deuce.style.opacity = "0";
  wrap.appendChild(deuce);

  // ----- live points
  let lastPoints = { east: 0, west: 0 };
  const currentBoxEl: { east: HTMLElement | null; west: HTMLElement | null } = {
    east: null,
    west: null,
  };

  // boxes
  function makeBox() {
    return createEl(
      "div",
      [
        "w-9 h-9",
        "rounded-md border border-white/10",
        "grid place-items-center",
        "bg-white/5 text-white/90",
        "text-[13px] font-extrabold tabular-nums select-none",
      ].join(" "),
    );
  }
  function decorateWinner(el: HTMLElement) {
    el.classList.add(
      "ring-1",
      "ring-cyan-300/70",
      "text-[16px]",
      "shadow-[0_0_0_1px_rgba(56,189,248,.35),0_0_18px_rgba(56,189,248,.25)]",
      "bg-white/10",
    );
  }
  function decorateCurrent(el: HTMLElement) {
    el.classList.add(
      "ring-1",
      "ring-white/30",
      "shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]",
      "text-[24px]",
      "md:text-[26px]",
      "leading-[0.95]",
    );
  }

  function renderBoxesRow(
    container: HTMLElement,
    who: "east" | "west",
    history: GameHistoryEntry[],
    bestOf: number,
    currentGameIndex?: number,
  ) {
    container.textContent = "";
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
        slot.textContent = String(who === "east" ? entry.east : entry.west);
        if (entry.winner === who) decorateWinner(slot);
        else slot.classList.add("opacity-80");
      } else if (i === currentGameIndex) {
        slot.textContent = String(
          who === "east" ? lastPoints.east : lastPoints.west,
        );
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
        el.classList.remove("score-flip");
        void el.offsetWidth;
        el.textContent = String(lastPoints.east);
        el.classList.add("score-flip");
      }
    }
    if (currentBoxEl.west) {
      const el = currentBoxEl.west;
      if (el.textContent !== String(lastPoints.west)) {
        el.classList.remove("score-flip");
        void el.offsetWidth;
        el.textContent = String(lastPoints.west);
        el.classList.add("score-flip");
      }
    }
  };

  // Blue serve orb (no box glow around row)
  const setServer = (end: TableEnd) => {
    const active = end; // "east" | "west"
    const passive = end === "east" ? "west" : "east";

    const on = names[active].orb;
    const off = names[passive].orb;

    on.classList.add(
      "bg-cyan-300",
      "shadow-[0_0_10px_rgba(56,189,248,.85),0_0_2px_rgba(56,189,248,.9)]",
      "border-cyan-300/70",
    );
    on.classList.remove("bg-white/12", "border-white/20");

    off.classList.remove(
      "bg-cyan-300",
      "shadow-[0_0_10px_rgba(56,189,248,.85),0_0_2px_rgba(56,189,248,.9)]",
      "border-cyan-300/70",
    );
    off.classList.add("bg-white/12", "border-white/20");
  };

  const setDeuce = (flag: boolean) => {
    deuce.style.opacity = flag ? "1" : "0";
  };

  const setPlayerNames = (eastName: string, westName: string) => {
    names.east.name.textContent = eastName;
    names.west.name.textContent = westName;
    names.east.name.setAttribute("title", eastName);
    names.west.name.setAttribute("title", westName);

    applyNameColumns(); // sizes to the longest name automatically

    const rect = panel.getBoundingClientRect();
    deuce.style.left = rect.right - 8 + "px";
    deuce.style.top = rect.top + 6 + "px";
  };

  const setGames = (
    history: GameHistoryEntry[],
    bestOf: number,
    cgIndex?: number,
  ) => {
    renderBoxesRow(rightTop, "east", history, bestOf, cgIndex);
    renderBoxesRow(rightBottom, "west", history, bestOf, cgIndex);
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
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";

    const p = panel.getBoundingClientRect();
    deuce.style.left = p.right - 8 + "px";
    deuce.style.top = p.top + 6 + "px";
  };

  const attachToCanvas = (canvas: HTMLCanvasElement) => {
    boundCanvas = canvas;
    scheduleSync();
    if (ro) ro.disconnect();
    ro = new ResizeObserver(() => scheduleSync());
    ro.observe(canvas);
  };

  // Coalesced listeners
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("scroll", scheduleSync, { passive: true });

  const dispose = () => {
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("scroll", scheduleSync);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    root.contains(overlay) && root.removeChild(overlay);
    if (!existingRoot && root.parentElement)
      root.parentElement.removeChild(root);
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
