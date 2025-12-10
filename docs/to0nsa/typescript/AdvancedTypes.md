# Advanced Type Features and Utility Types in TypeScript

This is a mini-course on **advanced types** and **utility types** as they actually appear in this codebase.  
The goal is to help you _read and write_ the kind of TypeScript you see in the Pong game, UI, and backend.

We’ll focus on:

1. Indexed access types and `keyof`
2. Built‑in utility types (`Partial`, `Required`, `Readonly`, `Record`, `Pick`, `Omit`)
3. Function‑related helpers (`ReturnType`, `Parameters`)
4. Literal‑type helpers (`as const`, `ReadonlyArray`, `satisfies`)
5. How these pieces combine in real project code

---

## 1. Indexed access types and `keyof`

These features let you say “**give me the type of this property from that type**” instead of copy‑pasting.

### 1.1 Indexed access: `T[K]`

Indexed access types look like how you read a property from an object, but at the **type level**.

Example from `packages/pong/game-logic/src/systems/utils.ts`:

```ts
import type { GameState } from '../model/state';

export function isPauseBtwPoints(p: GameState['phase']): p is 'pauseBtwPoints' {
  return p === 'pauseBtwPoints';
}
```

Here:

- `GameState['phase']` is an **indexed access type** – “the type of the `phase` property on `GameState`”.
- If `GameState['phase']` is a union like `'serveEast' | 'serveWest' | 'rally' | 'pauseBtwPoints'`, then the parameter `p` has exactly that union type.
- The return type `p is 'pauseBtwPoints'` is a **type predicate** that narrows `p` inside `if (isPauseBtwPoints(p)) { ... }`.

You’ll also see indexed access when working with more complex shapes:

```ts
type Bounds = GameState['bounds'];
```

or in `apps/frontend/src/games/pong/modes/online/world.ts`:

```ts
export type OnlineWorld = {
  bounds: GameState['bounds'];
  // ...
};
```

This keeps `OnlineWorld` in sync with `GameState` – if `bounds` changes, the type here updates automatically.

### 1.2 `keyof` – the union of keys

`keyof T` produces a union of all property names of `T`.

Example from `apps/backend/metrics/sqlite-patch.ts`:

```ts
function wrapStatement(stmt: Statement, operation: string): Statement {
  const methods: Array<keyof Statement> = ['run', 'get', 'all'];
  // ...
}
```

Here:

- `keyof Statement` is something like `'run' | 'get' | 'all' | ...`.
- `Array<keyof Statement>` means the `methods` array can only contain **valid method names** of `Statement` – if you typo `'rn'`, TypeScript will complain.

Combining `keyof` and indexed access:

```ts
type GameKeys = keyof Ruleset['game']; // union of game config keys
type GameValue<K extends GameKeys> = Ruleset['game'][K]; // value type for a specific key
```

You see this pattern in `apps/frontend/src/pages/pong/local/components/MatchRules.tsx`:

```ts
const GAME_MAX: Partial<Record<keyof Ruleset['game'], number>> = { ... };

const updateGame = useCallback(
  <K extends keyof Ruleset['game']>(key: K, value: Ruleset['game'][K]) => {
    onUpdate((prev) => ({ ...prev, game: { ...prev.game, [key]: value } }));
  },
  [onUpdate],
);
```

This gives:

- `key` is guaranteed to be one of the keys of `Ruleset['game']`.
- `value` must be the correct type for that specific key.
- You cannot accidentally pass `key='targetScore'` with a `boolean` value; TypeScript will catch it.

---

## 2. Built‑in utility types

Utility types are **generic helpers** provided by TypeScript itself. Internally, most of them are implemented using **mapped types** (like `Partial` = “for each key in `keyof T`, make it optional”), but you can treat them as building blocks.

### 2.1 `Partial<T>` – make everything optional

`Partial<T>` takes an object type and makes all of its properties optional.

Example from `packages/pong/game-logic/src/rules/presets.ts`:

```ts
import type { Ruleset } from '@pong/shared';

export function tableTennisRules(overrides?: Partial<Ruleset>): Ruleset {
  const base = {
    game: {
      /* defaults */
    },
    match: {
      /* defaults */
    },
  } satisfies Ruleset;

  const merged: Ruleset = {
    game: { ...base.game, ...(overrides?.game ?? {}) },
    match: { ...base.match, ...(overrides?.match ?? {}) },
  };
  // ...
}
```

Here:

- `overrides?: Partial<Ruleset>` means callers can pass **only the pieces** of `Ruleset` they want to override.
- You don’t have to repeat the whole `Ruleset` shape; missing properties simply fall back to `base`.

You also see `Partial` used with other types, for example:

```ts
settings: Partial<Omit<UserSettingsDb, 'user_uuid'>>,
```

in `apps/backend/db/queries/users.ts`, where only some user settings are updated.

### 2.2 `Required<T>` – make everything required

`Required<T>` is the opposite: it removes `?` from all properties of `T`.

Example from `packages/utils/metrics/src/index.ts`:

```ts
export interface MetricsConfig {
  endpoint?: string;
  defaultMetrics?: { enabled: boolean };
  labels?: MetricsLabels;
  registry?: Registry;
}

const defaultConfig: Required<Omit<MetricsConfig, 'labels' | 'registry'>> = {
  endpoint: '/metrics',
  defaultMetrics: { enabled: true },
};
```

Explanation:

- `Omit<MetricsConfig, 'labels' | 'registry'>` removes two fields.
- `Required<...>` makes `endpoint` and `defaultMetrics` required.
- `defaultConfig` must now provide definite values for those properties, guaranteeing they exist in the merged configuration.

Another nice example is in `apps/frontend/src/context/SnackbarContext.tsx`:

```ts
export interface SnackbarOptions {
  id?: string;
  message: string;
  description?: string;
  variant?: SnackbarVariant;
  duration?: number;
}

interface Snackbar extends Required<Omit<SnackbarOptions, 'duration' | 'variant'>> {
  variant: SnackbarVariant;
  duration: number;
}
```

Here:

- Internally, a `Snackbar` **always** has `id`, `message`, and `description` (all required).
- Public `SnackbarOptions` lets callers provide only what they care about; the provider fills in defaults.

### 2.3 `Readonly<T>` and `ReadonlyArray<T>`

`Readonly<T>` makes all properties read‑only.  
`ReadonlyArray<T>` is an array that you cannot modify (no `push`, etc.).

Example from `docs/dev/matchmaking/blueprint.md`:

```ts
type ReadonlyInput = Readonly<{ tick: number; up: boolean; down: boolean }>;
type ReadonlySnapshot = Readonly<{
  /* ... */
}>;
```

In practice, we often use shorthand like:

```ts
readonly SfxAsset[];
readonly MusicAsset[];
```

in `packages/pong/render/src/client/audio/manifest.ts`, which is equivalent to `ReadonlyArray<SfxAsset>`.  
This helps prevent accidental mutation of configuration arrays.

### 2.4 `Record<K, V>` – map from keys to values

`Record<K, V>` is an object type whose keys are `K` and values are `V`.

Example in `apps/frontend/src/pages/pong/local/components/MatchRules.tsx`:

```ts
const GAME_MAX: Partial<Record<keyof Ruleset['game'], number>> = {
  targetScore: 21,
  winBy: 6,
  servesPerTurn: 6,
  deuceServesPerTurn: 6,
};
```

Here:

- `Record<keyof Ruleset['game'], number>` means “for every key in `Ruleset['game']`, the value is a `number`”.
- `Partial<...>` allows some keys to be omitted (no max rule for that field).

Another example in `packages/pong/render/src/client/input/bindings.ts`:

```ts
export type KeyBindings = Partial<Record<Action, KeyCode[]>>;
```

This means:

- You have a mapping from each `Action` to an array of key codes.
- Not every `Action` must be present (hence `Partial`).

### 2.5 `Pick<T, K>` and `Omit<T, K>`

`Pick` selects a subset of properties; `Omit` removes a subset.

Example from `apps/backend/utils/jwt.ts`:

```ts
export type AccessTokenInputPayload = Omit<JWTPayload, 'purpose'>;
export type TwoFactorTokenInputPayload = Omit<JWTPayload, 'purpose'>;
export type RefreshTokenInputPayload = Omit<JWTPayload, 'purpose' | 'tokenId'> & {
  tokenId: string;
};
```

Here, the input payloads:

- Reuse all shared fields from `JWTPayload`.
- Strip fields that the signer will add (`purpose`, `tokenId`).
- Stay automatically in sync if `JWTPayload` changes.

On the frontend, see `apps/frontend/src/pages/Friends.tsx`:

```ts
type FriendApi = Omit<Friend, 'online'>;
```

The API type doesn’t include the `online` flag because that is computed client‑side.

### 2.6 How these utilities are implemented (conceptual)

You don’t need to memorize the internals, but it helps to know they are just mapped types:

- `Partial<T>` is basically `{ [K in keyof T]?: T[K] }`.
- `Required<T>` is `{ [K in keyof T]-?: T[K] }`.
- `Readonly<T>` is `{ readonly [K in keyof T]: T[K] }`.
- `Pick<T, K>` is `{ [P in K]: T[P] }`.
- `Record<K, V>` is `{ [P in K]: V }`.

So thinking in “maps over keys” will help you understand and eventually write your own utilities.

---

## 3. Function helpers: `ReturnType` and `Parameters`

These utilities let you **reuse function signatures** instead of repeating them.

### 3.1 `ReturnType<F>`

`ReturnType<typeof someFunction>` gives you the type that the function returns.

Example from `apps/frontend/src/games/pong/modes/online/world.ts`:

```ts
import {
  createEngine,
  createWorld,
  FXManager,
  createScoreboard,
  computeBounds,
  createBounces,
  createPaddleAnimator,
} from '@pong/render';

export type OnlineWorld = {
  engine: ReturnType<typeof createEngine>['engine'];
  engineDisposable: ReturnType<typeof createEngine>['engineDisposable'];
  world: ReturnType<typeof createWorld>;
  bounds: GameState['bounds'];
  hud: ReturnType<typeof createScoreboard>;
  fx: FXManager;
  // ...
};
```

Here:

- `ReturnType<typeof createEngine>` is the type that `createEngine` returns.
- `['engine']` and `['engineDisposable']` then index into that return type.
- If `createEngine`’s return type changes, `OnlineWorld` updates automatically.

You’ll see the same pattern elsewhere:

- `shadows: ReturnType<typeof createSunShadows>;` in `packages/pong/render/src/client/scene/scene.ts`.
- `const clientRef = useRef<ReturnType<typeof createMatchmakingClient> | null>(null);` in `apps/frontend/src/pages/pong/online/hooks/useMatchmakingClient.ts`.

This is perfect for “holder” types or refs that always track the shape of a helper function’s return.

### 3.2 `Parameters<F>`

`Parameters<typeof someFunction>` gives you a tuple type of that function’s parameters.

Example from `packages/pong/render/src/client/scene/materials/glass.ts`:

```ts
import { makePhysicalGlass } from './materials';

export function createGlassForTable(
  scene: Scene,
  table: Mesh,
  opts?: Parameters<typeof makePhysicalGlass>[2],
) {
  // ...
}
```

Here:

- `Parameters<typeof makePhysicalGlass>` is a tuple `[Scene, Mesh, GlassOptions?]` (conceptually).
- `[2]` picks the type of the third parameter.
- If `makePhysicalGlass`’s third argument type changes, `createGlassForTable` stays in sync.

You can also use the whole tuple:

```ts
type MakeClientArgs = Parameters<typeof createMatchmakingClient>;
```

This is useful in tests or wrappers where you want to forward arguments without re‑declaring the signature.

---

## 4. Literal helpers: `as const`, `ReadonlyArray`, `satisfies`

These features help you work with **literal values** (strings, numbers, objects) while retaining strong types.

### 4.1 `as const` – freeze shape and literals

`as const` tells TypeScript:

- Make this object/array **deeply readonly**.
- Keep literal values (like `'foo'`, `42`) as **literal types**, not widened types (`string`, `number`).

Example from `packages/pong/render/src/client/scene/color.ts`:

```ts
export const Colors = {
  ball: new Color3(1.0, 0.4, 0.0),
  // ...
  material: {
    specularNone: Color3.Black(),
  },
} as const;
```

This means:

- `Colors` and all nested objects are effectively readonly.
- The keys (`'ball'`, `'material'`, etc.) form a precise union type if you need them.

Another nice pattern in `apps/frontend/src/pages/pong/local/components/MatchRules.tsx`:

```ts
const GAME_NUMBER_FIELDS = [
  { key: 'targetScore', label: 'Target Score', tip: '...', min: 1 },
  // ...
] as const satisfies ReadonlyArray<{
  key: GameNumberKey;
  label: string;
  tip: string;
  min?: number;
}>;
```

Here:

- `as const` keeps `key` narrowed to its literal union from the array entries.
- `satisfies ReadonlyArray<...>` ensures each element matches the desired shape.

### 4.2 `ReadonlyArray<T>`

`ReadonlyArray<T>` is the explicit type form of `readonly T[]` / arrays created with `as const`.

You’ll often see it in signatures:

```ts
readonly SfxAsset[];
readonly MusicAsset[];
```

This guarantees configuration arrays aren’t mutated by accident (for example, by calling `push`).

### 4.3 `satisfies` – check without changing inference

The `satisfies` operator is great for config objects:

```ts
const base = {
  game: {
    /* ... */
  },
  match: {
    /* ... */
  },
} satisfies Ruleset;
```

from `packages/pong/game-logic/src/rules/presets.ts`.

Key points:

- TypeScript checks that `base` is a valid `Ruleset` (no missing/extra fields, correct types).
- But the inferred type of `base` stays as a **precise object shape**, not just `Ruleset`.
- That precise type is often more ergonomic when you spread or destructure.

Combined with `as const`, you get the pattern used in `MatchRules.tsx` for `GAME_NUMBER_FIELDS` (shown above).

---

## 5. Putting it together: patterns you’ll see

Most “advanced” typings in this repo are composed from a small set of ideas:

- **Indexed access** (`T[K]`) and **`keyof`** to express “this property’s type” and “valid keys”.
- **Utility types** like `Partial`, `Required`, `Readonly`, `Record`, `Pick`, `Omit` to reshape object types.
- **Function helpers** (`ReturnType`, `Parameters`) to keep wrapper types in sync with implementation functions.
- **Literal helpers** (`as const`, `satisfies`, `ReadonlyArray`) to describe config objects and arrays safely.

When you encounter a new type, try reading it in terms of these ideas:

1. What is the **base type**? (`Ruleset`, `GameState`, `SnackbarOptions`, etc.)
2. Are we taking its **keys** (`keyof`), or indexing into it (`T['field']`)?
3. Are we reshaping it with a utility (`Partial`, `Omit`, `Record`, etc.)?
4. Are we mirroring a function’s signature (`ReturnType`, `Parameters`)?
5. Are we working with **literal objects/arrays** (`as const`, `satisfies`)?

If you can answer those questions, most advanced types in this codebase should become readable and less intimidating.
