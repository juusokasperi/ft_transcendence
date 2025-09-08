# P0 — Must fix (determinism, build, correctness)

* [x] **Unify paddle clamping (single source of truth).**
  Delete the local `clampZ` in `game/systems/control/paddle.ts` and import the helper from `game/systems/utils.ts`. Keep the per-state `maxZ` calculation, but call the shared helper. &#x20;

* [x] **Prettier Tailwind path mismatch.**
  In `.prettier.json`, change `"tailwindStylesheet": "./src/client/ui/theme.css"` → `"./src/client/ui/tailwind.css"`. Also update the header comment at the top of `client/ui/tailwind.css` to reference `tailwind.css`, not `theme.css`. This ensures deterministic class sorting. &#x20;

* [x] **Build intent: library vs app entry.**
  `vite.config.ts` builds a library from `src/client/entry/embed.ts`, but the app boots via `app/host/dom-embed.ts`/`main.ts`. Decide:
  • If you ship an embeddable widget **and** an app, keep the `lib` build **and** add a separate app build/HTML entry.
  • If app-only, remove the `lib` section and use a standard app build. &#x20;

# P1 — Quality & perf (paper cuts that add up)

* [ ] **Fix stale file header.**
  Update the top comment in `client/babylon-register.ts` from `// src/babylon.sidefx.ts` to the real path to avoid onboarding mistakes.&#x20;

* [ ] **Consolidate dispose logic.**
  Factor a `disposeWorld()` (engine/scene/fx/hud/net) and call it from both app destroy sites, instead of multiple try/catch blocks, to avoid drift.&#x20;

* [ ] **Document RNG boundaries.**
  Add a one-liner near visual RNG (camera shake / bounces) clarifying it’s **visual-only** and never feeds core state. (E.g., camera shake seeds from `performance.now()`—kept out of game logic.)&#x20;

# P2 — UX/robustness & readability

* [ ] **Error overlay: keep singleton behavior.**
  Code already collapses multiple errors into one overlay—keep this pattern and add a brief comment noting the design (singleton + content replace).&#x20;

* [ ] **HUD overlay comment.**
  Add a short code comment near the rAF micro-throttle explaining the coalescing (helps future maintainers resist adding per-event layout).&#x20;

* [ ] **Keep `@shared` surface lean.**
  The shared barrel is already tidy (RafTicker/etc.). Before release, quick grep for any accidental “per-frame” logs and non-deterministic helpers, and keep them internal.&#x20;

# P3 — Future-proofing for online/tournament

* [ ] **Seed plumbing contract.**
  You already have `nextLocalMatchSeed(...)` for local. For online/tournament, introduce a typed `matchSeed` parameter to the mode entry (reject missing seed) so rooms/matchmaking always supply it. Stub points exist in `app/index.ts`. &#x20;

---

## Quick acceptance checks (suggested)

* [ ] Unit test `clampZ` boundaries (min/max, symmetry).
* [ ] Prettier sort: run once and verify Tailwind class order becomes stable.&#x20;
* [ ] Build matrix: verify **app** boot (HTML + `main.ts`) and **embed** (if kept) both produce working artifacts. &#x20;

If you want, I can turn each item into precise diffs/patches next.
