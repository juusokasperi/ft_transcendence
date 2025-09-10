# Babylon Pong — Global DB Data Model (per user)

This table describes the **data persisted in the DB** for authenticated users, merging identity and user‑tunable settings that will be needed by the game itself.

| Key / Field          | Scope         | Category      | Default     | Type                 | Range / Choices                                                    | Notes                                                                 | Persist in DB? |
| -------------------- | ------------- | ------------- | ----------- | -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------- |
| **User.id**          | User profile  | Identity      | —           | `uuid` / `int`       | Unique key                                                         | Primary key for authenticated users                                   | **Yes**        |
| **User.name**        | User profile  | Identity      | —           | `string`             | 3–16 chars, unique                                                 | Display name; shown in lobbies, tournaments                           | **Yes**        |
| `paddleColor`        | User settings | Cosmetic      | **#ffffff** | `string` (CSS color) | Any valid CSS color (hex, rgb, hsl, etc.)                          | Applied only to the player’s paddle. No effect on opponents’ paddles. | **Yes**        |
| `colorBlindMode`     | User settings | Accessibility | **none**    | enum                 | `none`, `protanopia`, `deuteranopia`, `tritanopia`, `highContrast` | Selects a **ColorFilterPreset** (shader/palette adjustments).         | **Yes**        |
| `photoSensitiveMode` | User settings | Accessibility | **none**    | enum                 | `none`, `reducedFX`, `noFlash`                                     | Selects a **FXPreset** that reduces or removes flashing/strobing FX.  | **Yes**        |
