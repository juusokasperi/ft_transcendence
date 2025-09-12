# Babylon Pong — User-Tunable Settings (DB + localStorage)

_Scope: **per user**. These settings are **cosmetic** or **accessibility related**. They do not affect game balance and can be changed at any time. Persisted in the DB for authenticated users, and in `localStorage` for guest/local players._

---

## User Settings

| Key                  | Category      | Default     | Type                 | Range / Choices                                                    | Notes                                                                 | Persist in DB? |
| -------------------- | ------------- | ----------- | -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------- |
| `paddleColor`        | Cosmetic      | **#ffffff** | `string` (CSS color) | Any valid CSS color (hex, rgb, hsl, etc.)                          | Applied only to the player’s paddle. No effect on opponents’ paddles. | **Yes**        |
| `colorBlindMode`     | Accessibility | **none**    | enum                 | `none`, `protanopia`, `deuteranopia`, `tritanopia`, `highContrast` | Applies a **ColorFilterPreset** for color vision deficiencies.        | **Yes**        |
| `photoSensitiveMode` | Accessibility | **none**    | enum                 | `none`, `reducedFX`, `noFlash`                                     | Applies a **FXPreset** that reduces or removes flashing/strobing FX.  | **Yes**        |

---

## How settings are applied

- **Paddle Color:** Directly applied at render time to the paddle material.
- **Colorblind Mode:** Selects a predefined **ColorFilterPreset** (shader or palette adjustments, redundant cues).
- **Photosensitivity Mode:** Selects a predefined **FXPreset** (dimmer particles, no strobing, safe transitions).

---

## Storage rules

- **Authenticated users (DB):** Settings stored in `UserProfileSettings` table and loaded on login. Persist across devices.
- **Guests / Local:** Settings stored in `localStorage.UserSettings`. Cleared on browser reset.

---

## Local Default behavior (client-side)

- **Save as Local Default:** Saves current user settings (color + accessibility) in `localStorage` with version tag `user_settings_v`.
- **Reset to Default:** Clears local overrides and reverts to platform defaults (`paddleColor = #ffffff`, `colorBlindMode = none`, `photoSensitiveMode = none`).

---

## Validation checklist

- `paddleColor` must be a valid CSS color string. On failure → fallback `#ffffff`.
- `colorBlindMode` must be in `{none, protanopia, deuteranopia, tritanopia, highContrast}`. Unknown → fallback `none`.
- `photoSensitiveMode` must be in `{none, reducedFX, noFlash}`. Unknown → fallback `none`.
- DB schema: nullable fields allowed; defaults applied if missing.
