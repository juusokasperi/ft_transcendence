// src/main.ts
import { bootstrapPong } from "@app/host/dom-embed";

// —— Error overlay (singleton, safe, accessible) ——
let errorOverlay: HTMLDivElement | null = null;
let errorCard: HTMLDivElement | null = null;
let errorMsgEl: HTMLDivElement | null = null;
let dismissBtn: HTMLButtonElement | null = null;
let prevActive: Element | null = null;

function removeErrorOverlay(): void {
  if (!errorOverlay) return;

  // Restore focus
  if (prevActive instanceof HTMLElement) {
    try {
      prevActive.focus();
    } catch {
      /* no-op */
    }
  }
  prevActive = null;

  // Detach listeners
  errorOverlay.onkeydown = null;
  dismissBtn?.removeEventListener("click", onDismissClick);

  // Remove from DOM
  errorOverlay.remove();

  // Null all refs
  errorOverlay = null;
  errorCard = null;
  errorMsgEl = null;
  dismissBtn = null;
}

function onDismissClick() {
  removeErrorOverlay();
}

function trapTab(e: KeyboardEvent) {
  if (!errorOverlay || !dismissBtn) return;
  if (e.key !== "Tab") return;

  // Only one interactive control; loop focus to the button.
  e.preventDefault();
  dismissBtn.focus();
}

function openErrorOverlay(text: string): void {
  // If the overlay exists, just replace content and refocus.
  if (errorOverlay && errorMsgEl && dismissBtn) {
    errorMsgEl.textContent = text;
    dismissBtn.focus();
    return;
  }

  prevActive = document.activeElement;

  // Backdrop
  const box = document.createElement("div");
  box.id = "pong-error-overlay";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "pong-error-title");
  box.setAttribute("aria-describedby", "pong-error-desc");
  box.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;z-index:99999;" +
    "background:rgba(0,0,0,0.35);backdrop-filter:saturate(1.2) blur(1px);" +
    "pointer-events:auto";

  // Card
  const card = document.createElement("div");
  card.style.cssText =
    "max-width:520px;padding:16px 18px;border-radius:14px;" +
    "background:#111;color:#eee;font:14px system-ui,Segoe UI,Roboto,Ubuntu;" +
    "box-shadow:0 8px 30px rgba(0,0,0,0.35)";

  // Title
  const title = document.createElement("strong");
  title.id = "pong-error-title";
  title.style.display = "block";
  title.style.marginBottom = "8px";
  title.textContent = "Pong failed to start";

  // Message (sanitized)
  const msg = document.createElement("div");
  msg.id = "pong-error-desc";
  msg.style.opacity = ".9";
  msg.style.whiteSpace = "pre-wrap";
  msg.textContent = text;

  // Actions
  const actions = document.createElement("div");
  actions.style.cssText =
    "margin-top:12px;display:flex;gap:8px;justify-content:flex-end";

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.style.cssText =
    "padding:6px 10px;border:0;border-radius:10px;background:#2a2a2a;color:#eee;cursor:pointer";
  dismiss.textContent = "Dismiss";

  actions.appendChild(dismiss);
  card.append(title, msg, actions);
  box.appendChild(card);
  document.body.appendChild(box);

  // Keep refs
  errorOverlay = box;
  errorCard = card;
  errorMsgEl = msg;
  dismissBtn = dismiss;

  // Keyboard + a11y
  dismiss.addEventListener("click", onDismissClick);
  box.onkeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      removeErrorOverlay();
    } else {
      trapTab(e);
    }
  };

  // Initial focus
  dismiss.focus();
}

// —— Global safety nets (collapse via singleton overlay) ——
window.addEventListener("error", (e) => {
  console.error(
    "[Pong] Uncaught error:",
    (e as ErrorEvent).error || e.message,
    e,
  );
  openErrorOverlay(
    String((e as ErrorEvent).error?.message || e.message || "Unexpected error"),
  );
});

window.addEventListener("unhandledrejection", (e) => {
  console.error(
    "[Pong] Unhandled rejection:",
    (e as PromiseRejectionEvent).reason,
    e,
  );
  openErrorOverlay(
    String(
      (e as PromiseRejectionEvent).reason?.message ||
        (e as PromiseRejectionEvent).reason ||
        "Unexpected async error",
    ),
  );
});

// —— Defensive initialization ——
(async () => {
  try {
    const el = document.getElementById("pong");
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error("Missing <canvas id='pong'> or wrong element type.");
    }

    // Boot via host bootstrap (replaces createPong(...).start()).
    const app = await bootstrapPong(el);
    window.addEventListener("beforeunload", () => app.destroy());
  } catch (err) {
    console.error("[Pong] Startup failed:", err);
    openErrorOverlay(String(err instanceof Error ? err.message : err));
  }
})();
