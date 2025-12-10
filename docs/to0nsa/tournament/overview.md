# Tournaments – Overview & Reading Guide

This folder explains the **tournament system for Pong** end‑to‑end, from the player UI to matchmaking, backend APIs, and game servers.

If you read only one document first, start with:

- `TournamentNetworkFlow.md` – the tournament‑centric flow, analogous to `OnlinePongNetwork.md`.

Then use this overview as an index to the more detailed docs.

---

## 1. Core user & network flow

- `TournamentNetworkFlow.md`  
  Tournament‑centric user/network journey:
  - From visiting `/pong/tournaments` and `/pong/tournaments/:id` to joining or creating a tournament.
  - How the frontend uses the matchmaking WebSocket for tournament messages while also using HTTP for tournament data.
  - How scheduled matches, countdowns, handoffs, and reconnects work for tournament games.

---

## 2. Frontend tournament pages & hooks

- `TournamentFrontend.md`  
  How the React side is structured for tournaments:
  - Pages: `TournamentPage` and `TournamentDetail` under `apps/frontend/src/pages/pong/tournament/`.
  - Hooks: `useTournamentPageController`, `useTournamentConnection`, `useTournamentList`, `useActiveTournament`, `useMatchCountdown`, `useMatchLifecycle`.
  - How these hooks consume `TOURNAMENT_*` messages and `HANDOFF` for tournament matches and drive the UI (lobby, bracket view, countdown overlays, in‑match canvas).

---

## 3. Matchmaking & scheduled matches

- `TournamentMatchmaking.md`  
  Matchmaking‑side responsibilities for tournaments:
  - `CreateTournament`, `JoinTournament`, `LeaveTournament`, and `ForfeitTournament` flows over `/matchmaking` WebSocket.
  - How matchmaking tracks tournament membership (`ClientState.IN_TOURNAMENT`) and subscriptions.
  - How scheduled matches are handled via `scheduledMatches.ts`, including:
    - `TOURNAMENT_LOBBY_UPDATED`, `TOURNAMENT_BRACKET_SNAPSHOT`.
    - `TOURNAMENT_MATCHES_READY` notifications.
    - `TOURNAMENT_MATCH_COUNTDOWN` messages (running, cancelled, started).
    - Absence auto‑win timers and reminders.

---

## 4. Tournament matches & game server integration

- `TournamentMatchFlow.md`  
  How **individual matches inside a tournament** are played:
  - How a `TOURNAMENT_MATCHES_READY` event eventually leads to a `HANDOFF` and a game WebSocket on `/g/:roomId`.
  - How tournament context (`tournamentId`, `tournamentMatchId`, `stage`) is attached to join tokens and propagated through allocator → game node.
  - How the game server reports tournament results back to the backend and how bracket state is refreshed.
  - How reconnects, resume tokens, and reconnect grace behave in tournaments (vs casual matches).

---

## 5. Related docs

You’ll often want to cross‑reference these:

- `docs/to0nsa/workflow/MatchmakingService.md` – includes an overview of tournaments and invite lobbies from the matchmaking perspective.
- `docs/to0nsa/workflow/BackendAndAPIs.md` – covers tournament HTTP APIs (creation, participants, matches, results).
- `docs/to0nsa/redis/TournamentsAndBackend.md` – explains how Redis streams and bridges are used to coordinate tournament matches between backend and matchmaking.
- `docs/to0nsa/workflow/GameNode.md` – shows how tournament context is carried into the game server and `ResultReporter`.
- `docs/to0nsa/workflow/ResultsAndRanking.md` – explains the tournament result path and how match outcomes update the bracket.
- `docs/to0nsa/workflow/ProtocolReference.md` – reference for tournament messages (`TOURNAMENT_*`) and tournament‑related client commands.
- `docs/to0nsa/workflow/OnlinePongNetwork.md` and `OnlinePongDataPlane.md` – the casual online flow and data plane, which tournament matches reuse once the handoff happens.

For a compact view of tournament‑specific error behavior:

- `TournamentFailureMatrix.md` – small matrix of tournament failure modes, wire signals, and user‑facing behavior.
