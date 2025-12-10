# AGENTS – to0nsa Docs (Courses)

Scope: applies to everything under `docs/to0nsa/`.

These docs are meant to be **courses for future you**: they explain how subsystems work in this specific codebase, with concrete file references and cross‑links.

---

## 1. Audience and tone

- Write for:
  - Yourself coming back after weeks/months.
  - A junior or mid‑level engineer joining the project.
- Emphasize:
  - **What** the subsystem does in this repo.
  - **How** it is wired (key files and flows).
  - **Why** design decisions were made, where relevant.
- Keep tone:
  - Direct and practical.
  - Focused on understanding and navigation, not theory.

---

## 2. Structure and style

- Prefer **short, focused Markdown files** over long monoliths.
- Use:
  - Clear headings (`## 1.`, `## 2.` style).
  - Bullet lists for responsibilities and flows.
  - Occasional small code snippets (a few lines) to illustrate key points.
- Avoid:
  - Large code dumps.
  - Duplicating code that already exists in source files.
  - Out‑of‑date pseudo‑code; always point to real files instead.

When you need to explain a flow:

- Start with a **big‑picture summary**.
- Then walk through:
  - Main entrypoints (routes, hooks, commands).
  - Key components/services.
  - Important cross‑service interactions.

---

## 3. Cross‑linking and avoiding duplication

- Always cross‑link related docs:
  - From `workflow` docs to `react`, `node`, `redis`, `nginx`, `docker`, `observability`, `database`, or `tournament` where relevant.
  - From language/framework docs (`react`, `typescript`) back to concrete usage in `apps/`.
- When adding a new doc:
  - Add it to the relevant `overview.md` in its folder (e.g., `workflow/overview.md`, `tournament/overview.md`).
  - Refer to existing docs instead of repeating content.
- If two docs must cover the same concept:
  - Have one be the **“map”** (overview), and the other the **“deep dive”** (implementation details).

---

## 4. Folder‑specific expectations

- `workflow/` – Online Pong and infra workflows:
  - Treat these as canonical for control‑plane and data‑plane behavior.
  - When you change network flows, tokens, or game behavior, prefer updating or adding a doc here.
  - See `workflow/AGENTS.md` for more specific rules.

- `react/` – front‑end patterns:
  - Document how React is used *in this app* (contexts, hooks, layout, data fetching).
  - Keep examples short and refer directly to `apps/frontend` code.

- `redis/`, `node/`, `nginx/`, `docker/`, `observability/`, `database/`, `tournament/`:
  - Each folder should explain:
    - What the technology is in general terms (briefly).
    - How and why it’s used in this project.
    - Where to find the implementation.

---

## 5. Keeping docs in sync with code

- When you:
  - Add new message types or tokens → update protocol docs (`ProtocolReference.md`) and any affected flows.
  - Change reconnect or failure behavior → update `OnlinePongReconnect.md` and `FailureModesAndUX.md`.
  - Extend tournament logic → update `docs/to0nsa/tournament/*`.
- Prefer writing **small updates as you change code**, not large rewrites later.
- If a doc becomes outdated:
  - Fix it or add a note at the top describing what changed and where to look instead.
