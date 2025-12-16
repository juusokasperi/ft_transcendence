# AGENTS – Workflow Docs (`docs/to0nsa/workflow`)

Scope: applies to everything under `docs/to0nsa/workflow/`.

These docs are the **authoritative narrative** for how online Pong works end‑to‑end: control plane, data plane, auth/tokens, infra, and observability.

---

## 1. Purpose and audience

- Explain **how things work in this codebase**, not generic networking theory.
- Make it easy to:
  - Jump from a symbol in code (e.g. `HANDOFF`, `ReconnectManager`, `/g/:roomId`) to the right doc.
  - Follow flows from the browser through backend/services and back.
- Assume the reader can open files in `apps/` and `packages/`, but might not remember where everything lives.

---

## 2. Structure and conventions

- Each doc should have:
  - A short **intro** that states its scope (e.g. “Matchmaking control plane”, “Game Node simulation”, “Online data plane”).
  - A **big‑picture section** early on (architecture, responsibilities).
  - Clear subsections for flows, with numbered headings (`## 1.`, `## 2.`).
- Avoid:
  - Copying large chunks of code. Prefer:
    - Short snippets that show the essence.
    - File path references like `apps/game-server/src/app/MatchRunner.ts`.
  - Overlapping content across many docs; link instead.

When adding a new doc:

- Link it from `docs/to0nsa/workflow/overview.md` with a 1–2 line summary.
- Link **to** it from other relevant docs (e.g. `OnlinePongNetwork.md`, `GameNode.md`, `SecurityAndTokens.md`).

---

## 3. Flows vs references

- Use different kinds of docs for different jobs:
  - Flow docs (e.g. `OnlinePongNetwork.md`, `TournamentNetworkFlow.md`, `InviteMatchFlow.md`):
    - Tell the **story** from user action → network messages → server behavior → UX.
  - Reference docs (e.g. `ProtocolReference.md`, `FailureModesAndUX.md`):
    - Enumerate messages, codes, or failure modes with clear “who/when/how”.
  - Deep‑dive docs (e.g. `OnlinePongDataPlane.md`, `OnlinePongReconnect.md`):
    - Explain detailed behavior for one subsystem.

When you extend behavior:

- Decide where it belongs:
  - New WS messages → `ProtocolReference.md`.
  - New steps in online flow → `OnlinePongNetwork.md`.
  - New reconnect behavior → `OnlinePongReconnect.md`.
  - New error paths → `FailureModesAndUX.md`.

---

## 4. Keeping online docs authoritative

- Treat these docs as the **source of truth** for network flows:
  - If code behavior diverges from the docs, update the docs as part of the change.
  - When refactoring flows, adjust diagrams and bullet lists (don’t leave stale notes).
- Always:
  - Reference the concrete types in `packages/pong/shared/src/protocol/net.ts` for WS messages and tokens.
  - Reference the relevant app files:
    - `apps/frontend/src/pages/pong/*`
    - `apps/matchmaking/*`
    - `apps/game-server/*`
    - `apps/game-gateway/*`

---

## 5. Relationship with other docs

- When you see a concept that is shared:
  - Tokens/auth → also link to `SecurityAndTokens.md` and backend docs.
  - Redis usage → link to `docs/to0nsa/redis/*`.
  - Infra concerns (Nginx, Docker, monitoring) → link to `docs/to0nsa/nginx`, `docs/to0nsa/docker`, `docs/to0nsa/observability`.
  - Tournament behavior → link to `docs/to0nsa/tournament/*`.

Avoid duplicating entire explanations that already live in those folders; give a short summary and a pointer.
