# Babylon Pong

> **Status:** Work in active progress (WIP).
>
> **Context:** Built as part of the **ft_transcendence** project at Hive/42. This is a **full‑stack team project**; this repository focuses on the **game creation (Babylon.js + TypeScript + headless game logic)**, designed to plug into a separate API and matchmaking layer.

---

## Overview

Babylon Pong is a modern, modular re‑imagining of Pong built with **[Babylon.js](https://www.babylonjs.com/)** and **TypeScript**. The codebase is structured so that **rendering** (Babylon scene, camera, FX) and **game/domain logic** (deterministic rules, state, input) are cleanly separated. The same pure game logic is intended to run in local mode and later in an online mode (with a transport/runtime layer).

### **Goals**

- Latest Babylon.js stable; idiomatic usage and no deprecated APIs.
- Strict TypeScript with small, composable modules.
- Deterministic gameplay with predictable fixed‑step updates.
- Render code isolated from game logic to enable headless tests and reuse (local/online).
- Sensible defaults, minimal configuration, zero duplication.

### **Current highlights**

- Headless game state & systems (ball, paddles, walls) with pure stepping functions.
- Babylon scene with camera, lights, soft shadows, and a shader‑based starfield background.
- A lightweight HUD scoreboard (Tailwind‑styled overlay), animated score flip & serve indicator.
- FX pipeline (glow burst, force‑field wall pulse) designed for future pooling and reuse.
- Logger utility with level control, plus small shared utilities (Ticker, RNG, Disposable).

---

## Team & scope

- **Project type:** ft_transcendence (school project, team‑based, full‑stack).
- **This repo’s focus:** the **game creation** - Babylon scene, FX, input handling, and deterministic game logic that can be reused in both local and online modes.
- **Future integration:** a separate API (matchmaking, profiles, rooms, auth) behind a reverse proxy (NGINX). Online transport hooks are scaffolded but not enabled yet.

---

## Quick start

> Uses a standard Vite setup with TypeScript. Any Node package manager works; examples use **pnpm**.

```bash
# Install deps
pnpm install

# Start dev server
pnpm dev

```

Open the dev server URL and you should see the Babylon canvas and HUD overlay. Keyboard defaults (local play):

- **Left player:** `Z` / `S`
- **Right player:** `↑` / `↓`

> Mobile/touch is planned; local keyboard works today.

---

## How it’s organized

```bash
src/
  client/           # Rendering & input (Babylon.js, HUD, FX)
    engine/        # Engine bootstrap, visibility-aware lifecycle, render loop
    scene/         # Scene, camera, table, paddles, ball, background
    FX/            # Visual effects (glow burst, force-field pulse) with manager
    input/         # Local keyboard mapping → input intents
    ui/            # DOM/Tailwind scoreboard overlay
  game/             # Headless, deterministic game logic (pure functions)
    systems/       # ball.ts, paddle.ts (no Babylon imports here)
    state.ts       # Game state shape and initial state
    input.ts       # Input intent types and helpers
  shared/utils/     # Logger, RNG, Ticker, Disposable, etc.
  types.d/          # Babylon/Vite ambient typings
```

Design notes:

- **Render ↔ Logic boundary:** logic emits events (e.g., wall hits, goals); render layer subscribes to drive FX and HUD.
- **Determinism:** fixed‑step logic ticker decoupled from the render loop; visibility changes retune cadence to save battery.
- **Pooling:** FX and transient meshes are designed to be pooled to avoid GC spikes (ongoing work as effects expand).

---

## Tech stack

- **Engine & 3D:** [Babylon.js](https://doc.babylonjs.com/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Build tooling:** [Vite](https://vitejs.dev/)
- **Styling (HUD):** [Tailwind CSS](https://tailwindcss.com/)
- **Runtime patterns:** fixed‑step logic ticker, visibility‑aware scheduling, small modules.

> See `TechStack.md` for a concise rationale and versions.

---
