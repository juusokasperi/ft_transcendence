# Babylon Pong — Player Stats to Persist (Online Only)

**Scope:** Record stats **only** for online ranked games & tournaments. Local/hotseat sessions are ignored.

---

## Player-Linked Metrics

| Key               | Level             | Description                  | How to compute (engine hooks/state)                                       | DB Type |     |
| ----------------- | ----------------- | ---------------------------- | ------------------------------------------------------------------------- | ------- | --- |
| `points_scored`   | game/match        | Points the user scored       | Increment when a point is awarded to the user’s table end during scoring. | INT     |     |
| `points_conceded` | game/match        | Points allowed to opponent   | Increment when opponent’s table end is awarded a point.                   | INT     |     |
| `games_won`       | match             | Games the user won           | On each game end: if `gameWinner === userEnd`, increment.                 | INT     |     |
| `games_lost`      | match             | Games the user lost          | On each game end: if `gameWinner !== userEnd`, increment.                 | INT     |     |
| `matches_won`     | tournament/season | Matches the user won         | At match end: if `matchWinner === userEnd`, increment.                    | INT     |     |
| `matches_lost`    | tournament/season | Matches the user lost        | At match end: if `matchWinner !== userEnd`, increment.                    | INT     |     |
| `max_point_lead`  | game              | Largest point lead user held | Track peak `abs(pointsEast - pointsWest)` while updating score.           | INT     |     |
