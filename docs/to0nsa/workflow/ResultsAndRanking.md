# Match Results, Rankings, and Persistence

This document explains **how online Pong match results are persisted and how rankings are updated** across:

- The **game server** (`apps/game-server`) – where matches run and results are computed.
- The **backend API** (`apps/backend`) – where results are stored and ELO is updated.

It focuses on:

1. How the game server decides a result (`ResultReporter`).
2. How it reports **tournament** vs **casual** matches.
3. How the backend persists matches and per‑player stats.
4. How rankings (ELO) are calculated.

You should already know how matches are played and ended from:

- `OnlinePongNetwork.md` – end‑to‑end match lifecycle.
- `GameNode.md` – how the game node decides winners and emits summaries.
- `BackendAndAPIs.md` – where match and stats routes live.
- `SecurityAndTokens.md` – how match service tokens (`MATCH_SECRET`) differ from user tokens.

For supporting infrastructure:

- `docs/to0nsa/node/BackendServer.md` – how match/stat routes are implemented in Fastify.
- `docs/to0nsa/node/RealtimeServers.md` – how the game server reports results back to the backend.

---

## 1. Where results are computed

**Authoritative result computation lives on the game server**:

- The simulation runs in `MatchRunner` (`apps/game-server/src/app/MatchRunner.ts`).
- When a match ends (natural, forfeit, timeout), `MatchRunner` calls `ResultReporter.report`.
- `ResultReporter`:
  - Builds an `OnlineMatchSummary` for clients.
  - Calls backend APIs to persist the match and update rankings.

Backend:

- Exposes `/api/matches` and `/api/matches/:id/stats` for **casual** matches.
- Exposes `/api/tournaments/:tournamentId/matches/:matchId/result` for **tournament** matches.
- Stores results in SQLite and updates user rankings and per‑match stats.

---

## 2. Game server: `ResultReporter`

File: `apps/game-server/src/app/ResultReporter.ts`.

### 2.1 High‑level responsibilities

`ResultReporter`:

- Ensures we only report a result **once** per match (`resultSubmitting` / `resultSubmitted` flags).
- Converts the internal match model state into:
  - **Scores and games history** (`gamesHistory`).
  - **Player identities** and MMR.
  - A final `OnlineMatchSummary` for the clients.
- Talks to the backend API using a JWT signed with `matchSecret`.

Constructor:

```ts
export class ResultReporter {
  private readonly apiUrl: string;
  private readonly matchSecret: string;
  private readonly logger: FastifyBaseLogger;

  constructor(args: { apiUrl: string; matchSecret: string; logger: FastifyBaseLogger }) {
    this.apiUrl = args.apiUrl;
    this.matchSecret = args.matchSecret;
    this.logger = args.logger;
  }
}
```

### 2.2 `report(session, matchOver)`

Entry point:

```ts
async report(
  session: MatchSession,
  matchOver: { winner?: string; reason?: 'natural' | 'forfeit' | 'timeout' },
): Promise<OnlineMatchSummary | null> {
  const model = session.model;
  if (model.resultSubmitting || model.resultSubmitted) return null;
  model.resultSubmitting = true;

  try {
    const { reservation } = session;

    const east = this.resolvePlayer(session, 'P1'); // "east" row == Player 1
    const west = this.resolvePlayer(session, 'P2'); // "west" row == Player 2
    if (!east || !west) { /* log & bail */ }

    const gamesHistory = model.lastSnapshot?.gamesHistory ?? [];
    let eastScore = gamesHistory.filter((g) => g.winner === 'east').length;
    let westScore = gamesHistory.filter((g) => g.winner === 'west').length;
    let technicalGamesHistory = gamesHistory;

    // Handle technical wins for forfeit / timeout...
    // (adjust scores and append "technical" games if needed)

    const token = this.signToken();

    let eastAfter = east.mmrBefore;
    let westAfter = west.mmrBefore;

    if (reservation.tournament) {
      await this.reportTournament(reservation.roomIdentifier, token, reservation, east, west, {
        eastScore,
        westScore,
        gamesHistory: technicalGamesHistory,
      });
    } else {
      const deltas = await this.reportCasual(token, east, west, {
        eastScore,
        westScore,
        gamesHistory: technicalGamesHistory,
      });
      eastAfter += deltas.eastDelta;
      westAfter += deltas.westDelta;
    }

    model.resultSubmitted = true;
    model.resultSubmitting = false;

    const winnerFromScores = eastScore >= westScore ? 'east' : 'west';
    const bestOf = /* derive from snapshot or gamesHistory length */;

    const summary: OnlineMatchSummary = {
      winner: winnerFromScores,
      bestOf,
      gamesHistory: technicalGamesHistory,
      names: { east: ..., west: ... },
      seats: { east: east.seat, west: west.seat },
      mmr: {
        east: { before: Math.round(east.mmrBefore), after: Math.round(eastAfter) },
        west: { before: Math.round(west.mmrBefore), after: Math.round(westAfter) },
      },
    };

    // propagate updated mmr back into expected players

    return summary;
  } catch (error) {
    this.logger.error({ error }, '[ResultReporter] Failed to report match result');
    session.model.resultSubmitting = false;
    return null;
  }
}
```

Key points:

- `gamesHistory` is a list of per‑game results (east/west points and winner).
- `east` and `west` are resolved **by fixed seats** (`'P1'` / `'P2'`), not by current table end, to avoid confusion when players switch ends.
- `matchOver.reason` controls whether to treat the result as:
  - **Natural** – scores come from real games.
  - **Technical** – forfeit/timeout; `ResultReporter` may **synthesize extra games** to reach best‑of scores.

The returned `OnlineMatchSummary` is what the frontend shows in post‑match views.

### 2.3 Tournament vs casual reporting

`ResultReporter` splits reporting into two paths:

- **Tournament**: `reportTournament(...)`
- **Casual**: `reportCasual(...)`

#### Tournament (`reportTournament`)

Post to backend:

```ts
await axios.post(
  `${this.apiUrl}/api/tournaments/${tournament.tournamentId}/matches/${tournament.tournamentMatchId}/result`,
  resultPayload,
  {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  },
);
```

`resultPayload` includes:

- Winner/loser participant IDs and user UUIDs.
- `eastParticipantId`, `westParticipantId`.
- `gamesHistory` array with game‑level scores and winners.

Backend uses this to:

- Update the tournament match record.
- Advance the bracket as needed.

#### Casual (`reportCasual`)

This is where **ranking/ELO** is updated.

First, it creates a match:

```ts
const matchPayload = {
  team1Players: [east.identifier],
  team2Players: [west.identifier],
  team1Score: args.eastScore,
  team2Score: args.westScore,
};

const matchRes = await axios.post(`${this.apiUrl}/api/matches`, matchPayload, {
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});
```

The backend responds with:

- `matchId`: database ID.
- `eloChanges`: arrays of `{ uuid, delta }` for team1 and team2.

`ResultReporter` then:

- Extracts `eastDelta` and `westDelta` (we assume 1v1).
- Adds these to `eastAfter` / `westAfter` for the summary.

Second, it posts **per‑player stats**:

```ts
const statsPayload = {
  players: [
    {
      uuid: east.identifier,
      pointsScored,
      pointsConceded,
      gamesWon,
      gamesLost,
      maxPointLead,
    },
    {
      uuid: west.identifier,
      // same fields...
    },
  ],
};

await axios.post(`${this.apiUrl}/api/matches/${data.matchId}/stats`, statsPayload, {
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});
```

If stats posting fails, it only logs a warning and does not fail the overall result reporting.

---

## 3. Backend: match persistence and ELO

File: `apps/backend/routes/matches.ts`.

### 3.1 `POST /api/matches` – create match + update rankings

Route handler:

```ts
app.post(
  '/',
  {
    schema: addMatchSchema,
    preHandler: [matchAuthPreHandler],
  },
  async (req, res) => {
    const transaction = db.transaction(() => {
      const { team1Players, team2Players, team1Score, team2Score } = req.body;
      const team1Stats = team1Players.map((id) => getUserStats(id));
      const team2Stats = team2Players.map((id) => getUserStats(id));
      // compute average ELOs, match result, deltas...
      const matchId = addMatch(team1Score, team2Score);
      const team1ActualDeltas = updateAndRecordTeamRanking(/* ... */);
      const team2ActualDeltas = updateAndRecordTeamRanking(/* ... */);
      return { matchId, eloChanges: { team1: team1ActualDeltas, team2: team2ActualDeltas } };
    });

    try {
      const result = transaction();
      return res.status(200).send({ message: 'Match successfully added to database', ...result });
    } catch (error) {
      // log & 500
    }
  },
);
```

Important functions:

- `getUserStats(uuid)`:
  - Reads a user’s current ranking and stats from DB.
- `addMatch(team1Score, team2Score)`:
  - Inserts a new row into `Matches` table.

ELO calculation:

```ts
function calculateEloChange(
  playerElo: number,
  opponentElo: number,
  matchResult: 'win' | 'loss' | 'draw',
): number {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  const actualScore = matchResult === 'win' ? 1 : matchResult === 'loss' ? 0 : 0.5;
  return Math.round(K * (actualScore - expectedScore));
}
```

`updateAndRecordTeamRanking`:

- For each player:
  - Reads current ranking.
  - Applies calculated delta.
  - Enforces an ELO floor (`ELO_FLOOR = 600`).
  - Writes new ranking with `updateUserRanking`.
  - Inserts a `MatchPlayers` row with `addMatchPlayer`.

The transaction returns:

- `matchId` and `eloChanges` for each team.

The game server uses these deltas in its `OnlineMatchSummary`.

### 3.2 `POST /api/matches/:matchId/stats` – per‑player stats

Route:

```ts
app.post(
  '/:matchId/stats',
  {
    schema: addMatchStatsSchema,
    preHandler: [matchAuthPreHandler],
  },
  async (req, res) => {
    const { matchId } = req.params as { matchId: number };
    const { players } = req.body as { players: Array<{ uuid: string; pointsScored; ... }> };
    // Ensure match exists
    // Map user uuid → MatchPlayers.id
    const txn = db.transaction(() => {
      let updated = 0;
      for (const p of players) {
        const mpId = idByUuid.get(p.uuid);
        if (!mpId) throw new Error(`Player ${p.uuid} not part of match ${matchId}`);
        const ok = upsertMatchPlayerStats(mpId, { /* stats */ });
        if (!ok) throw new Error(`Failed to upsert stats for ${p.uuid}`);
        updated++;
      }
      return updated;
    });

    const updated = txn();
    return res.status(200).send({ message: 'Stats saved', updated });
  },
);
```

DB side:

- `upsertMatchPlayerStats` writes into `MatchPlayerStats` table.
- Stats include:
  - `pointsScored`
  - `pointsConceded`
  - `gamesWon`
  - `gamesLost`
  - `maxPointLead`

These stats can be used to build richer user profiles and leaderboards.

### 3.3 Reading from the backend

Additional routes:

- `GET /api/matches/:matchId`:
  - Returns a match with all players and their ranking deltas.
- `GET /api/matches` (with auth):
  - Returns paginated matches for the current user.

These are used by the frontend to:

- Show match history.
- Show ranking changes over time.

---

## 4. Putting it together: result persistence flow

End‑to‑end for a **casual** match:

1. **Match ends** on the game server:
   - `MatchRunner` detects `matchOver` event.
   - Calls `ResultReporter.report(session, matchOverEvent)`.

2. **ResultReporter builds scores and history**:
   - Computes `eastScore`, `westScore` from `gamesHistory`.
   - Adjusts for technical wins (forfeit/timeout) if needed.
   - Resolves players (`P1`/`P2`) and their MMRs.

3. **ResultReporter calls backend**:
   - `POST /api/matches` with players and scores.
   - Backend:
     - Inserts a `Matches` row.
     - Updates user rankings and creates `MatchPlayers` rows.
     - Returns `matchId` + ELO deltas.
   - ResultReporter posts `POST /api/matches/:matchId/stats` with per‑player stats.

4. **Game server finalizes summary**:
   - Updates in‑memory MMR based on deltas.
   - Constructs `OnlineMatchSummary` with:
     - Winner, best‑of, gamesHistory.
     - Names and seat assignments.
     - Before/after MMR for both players.
   - Returns this summary to `MatchRunner`, which:
     - Broadcasts `MATCH_END` to clients.
     - Calls `GameServer.onMatchComplete` (cleanup).

5. **Frontend displays result**:
   - Receives `MATCH_END` with summary.
   - Shows `PostMatchOnlineView` using `OnlineMatchSummary`.
   - User’s ranking on future pages reflects updated DB values.

For **tournament** matches:

- Steps are similar, but `ResultReporter.reportTournament` calls the tournament result endpoint instead of `/api/matches`, and bracket progression logic lives entirely in the backend’s tournament routes.

---

## 5. What this gives you as a developer

With this pipeline:

- The **game server** decides outcomes (no client‑side cheating on score).
- The **backend** is the source of truth for:
  - Match history.
  - Player rankings (ELO).
  - Per‑match player stats.
  - Tournament progression.
- The **frontend**:
  - Shows accurate, authoritative results.
  - Can fetch match history and stats whenever needed.

When debugging or extending:

- Look at `ResultReporter` if summaries or deltas look wrong.
- Check `/api/matches` and `/api/matches/:id/stats` if DB persistence or ELO changes look incorrect.
- Update shared types in `protocol/net.ts` and backend schemas together when changing payloads.

This completes the story of how an online Pong match goes from a running simulation to **persistent stats and rankings** in your ft_transcendence stack.
