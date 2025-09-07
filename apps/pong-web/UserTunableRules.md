# Babylon Pong — User‑Tunable Rules (DB mapping tables)

_Scope: **not per-user**. Rules are configurable **per local match** and **per tournament**. Online ranked matches are treated as a tournament that uses the platform’s **Default Online Ruleset**. Pure cosmetics (e.g., paddle color) and rendering-only settings are excluded here._

- **Local:** local games rules are not persisted in the DB, but in the localStorage

- **Tournament:** persisted as a **RulesetProfile attached to the tournament**; all its matches read from it. **Immutable once active** and **configurable only by the tournament creator** while status is `draft`/`scheduled`.
- **Online default:** persisted as the platform’s **Default Online Ruleset** (a special tournament/profile) used by matchmaking for ranked.

## Unified rules

| Key           | Category | Default    | Type                          | Range / Choices                 | Constraints / Notes                                                                                                                     | Persist in DB?   |
| ------------- | -------- | ---------- | ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `targetScore` | Game     | **11**     | `number`                      | UI: 5–21 (step 1) • Engine: ≥ 1 | Points to win a game.                                                                                                                   | **Yes**          |
| `winBy`       | Game     | **2**      | `number`                      | UI: 1 or 2 • Engine: ≥ 1        | Lead required to close a game.                                                                                                          | **Yes**          |
| `bestOf`      | Match    | **5**      | enum {3, 5, 7}                | UI choices: 3, 5, 7             | Must be odd; first to `ceil(bestOf/2)` games wins.                                                                                      | **Yes**          |
| `difficulty`  | Physics  | **normal** | enum {"easy","normal","hard"} | Easy • Normal • Hard            | Selects predefined **PhysicsPreset** (paddle speed, ball speed, spin, restitution) versioned by `physics_v`. Only the choice is stored. | **Yes** (choice) |

> Tip: Difficulty maps to preset values in the engine; only the **choice** is persisted.

## How rules are set

- **Local matches:** Open the **Settings** (gear) icon on the pre-game screen/lobby to edit rules before launching the game (fields from the unified table). Use **Save as Local Default** or **Reset to Default** as needed. Changes apply to the upcoming match only unless saved as Local Default.
- **Tournaments:** Rules are configured **during tournament creation** by the **tournament creator** (while status is `draft`/`scheduled`). Once any match starts, the ruleset becomes **locked** for the entire tournament. To change rules, create a **new ruleset version** and a **new tournament**.
- **Online ranked:** Always uses the platform’s **Default Online Ruleset**; players cannot modify rules.

---

## Local Default behavior (client‑side)

- **Save as Local Default:** Saves the current local rules (**all fields in the unified table**, including selected **difficulty**) to the client as `LocalRulesDefault` with a `rules_v` version tag.
- **Reset to Default:** Clears the local override and reverts new local matches to the platform **Default Local Ruleset** (typically same as the Default Online Ruleset).
- **Scope:** Affects **only new local matches** on this device/browser. Does **not** affect tournaments or ranked matches.

---

## Validation checklist (apply when ingesting from DB)

- `bestOf` is **odd** and one of {3, 5, 7} (or extend set deliberately).
- `targetScore`, `winBy` are **integers ≥ 1**.
- `difficulty` must be one of `{easy, normal, hard}`. On unknown value, fallback to `normal` .
- **Tournament immutability:** Ruleset cannot be edited once the tournament is active; only the **tournament creator** may configure it while status is `draft`/`scheduled`. Changes require a new ruleset version and a new tournament.

---
