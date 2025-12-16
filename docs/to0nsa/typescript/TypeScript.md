# Typescript

Typescript is a superset of JavasScript that adds static types. It is developed and maintained by Microsoft. Typescript code is transpiled into plain Javascript code that can run in any environment that supports Javascript, such as web browsers and Node.js.

## Transpilation

Definition of transpilation:

- Transpilation is the process of converting source code written in one programming language into another language that has a similar level of abstraction. In the case of Typescript, transpilation involves converting Typescript code into plain Javascript code.
- Transpilation is typically done using a transpiler, which is a tool that reads the source code and generates equivalent code in the target language.
- Transpilation is different from compilation, which involves converting source code into machine code that can be executed directly by a computer's CPU.
- Transpilation is often used to enable developers to use newer language features or syntax that may not be supported by all environments, while still ensuring compatibility with older systems.
- Transpilation can also be used to optimize code for performance or to add additional functionality, such as type checking or code analysis.
- Overall, transpilation is a useful technique for developers who want to take advantage of the latest language features while still ensuring that their code can run in a wide range of environments.

## Memory Management

Typescript, like Javascript, uses automatic memory management through a process called garbage collection. This means that developers do not need to manually allocate and deallocate memory for objects and variables, as the runtime environment takes care of this automatically.
The garbage collector periodically scans the memory for objects that are no longer being used or referenced by the program and frees up the memory occupied by those objects. This helps to prevent memory leaks and ensures that the program uses memory efficiently.
However, it is still important for developers to be mindful of memory usage and to avoid creating unnecessary objects or retaining references to objects that are no longer needed, as this can lead to increased memory consumption and decreased performance.
Overall, Typescript's automatic memory management through garbage collection makes it easier for developers to write code without having to worry about low-level memory management details.

## What is ES6?

ES6 (also called **ECMAScript 2015**) is a major version of the JavaScript language standard that introduced many of the “modern JS” features used in the pong codebase. TypeScript builds on top of ES6, so understanding ES6 helps a lot when reading TypeScript.

Key ES6 features:

- **`let` and `const`**: block‑scoped variable declarations that replace many uses of `var`.
  - Example: `const matchSeed = randomSeed32();` in `apps/frontend/src/games/pong/modes/local/local.ts`.
- **Arrow functions (`=>`)**: shorter function syntax that also changes how `this` works.
  - Example: `const setPoints = (east: number, west: number) => { ... };` in `packages/pong/render/src/client/ui/scoreboard.ts`.
- **Classes**: `class` syntax on top of prototypes.
  - Example: `export class XorShift32 implements RandomSource { ... }` in `packages/pong/shared/src/utils/random.ts`.
- **Modules (`import` / `export`)**: standard way to split code into files.
  - Example: `import { createPongApp } from '../index';` in `apps/frontend/src/games/pong/host/dom-embed.ts`.
- **Destructuring and spread**: convenient ways to unpack and copy objects/arrays.
  - Example: `const { engine, engineDisposable } = createEngine(canvas);` in `apps/frontend/src/games/pong/modes/local/local.ts`.
- **Template literals**: strings with backticks and `${}` interpolation.
  - Example: ``wrap.style.transform = `scale(${scale})`;`` in `packages/pong/render/src/client/ui/scoreboard.ts`.

All of these are pure JavaScript features defined in ES6; TypeScript supports them and lets you add types on top.

## Javascript basics and Typescript

Since Typescript is a superset of Javascript, all the basic concepts and features of Javascript apply to Typescript as well. At the same time, Typescript adds its own type system and tooling on top of Javascript.

To make this clearer, we can split things into two groups: what Typescript shares with Javascript, and what is specific to Typescript.

### What Typescript shares with Javascript

#### 1. **Variables and basic data types**

Numbers, strings, booleans, arrays, objects, and functions all work the same way in Javascript and Typescript (the runtime behavior is identical).

- Example: `const matchSeed = randomSeed32();` and `let state = match.getGame();` in `apps/frontend/src/games/pong/modes/local/local.ts` show `const` and `let` with numbers and objects, exactly as in plain Javascript.

#### 2. **Control flow**

`if` / `else`, `switch`, `for`, `while`, `do...while`, and `try` / `catch` / `finally` behave the same in both languages.

#### 3. **Functions**

Function declarations, function expressions, arrow functions, callbacks, and higher‑order functions all come from Javascript and are used the same way in Typescript.

- Example from `packages/pong/render/src/client/ui/scoreboard.ts`:

```ts
export function createScoreboard(): DomScoreboardAPI {
  // ...

  // Arrow function stored in a variable
  const setPoints = (east: number, west: number) => {
    lastPoints = { east: east | 0, west: west | 0 };
    if (currentBoxEl.east) {
      const el = currentBoxEl.east;
      if (el.textContent !== String(lastPoints.east)) {
        el.textContent = String(lastPoints.east);
      }
    }
    if (currentBoxEl.west) {
      const el = currentBoxEl.west;
      if (el.textContent !== String(lastPoints.west)) {
        el.textContent = String(lastPoints.west);
      }
    }
  };

  // Arrow function used as a callback
  let rafId: number | null = null;
  const scheduleSync = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      syncOverlay();
    });
  };

  // Passing a function as an event callback
  window.addEventListener('resize', scheduleSync);

  // ...
}
```

Here:

- `export function createScoreboard` is a normal **function declaration**.
- `const setPoints = (east, west) => { ... }` is an **arrow function** assigned to a variable.
- `scheduleSync` and the inline `() => { ... }` passed to `requestAnimationFrame` are **callbacks**.
- `window.addEventListener('resize', scheduleSync)` passes a function value as an argument, which is standard Javascript behavior; Typescript just adds the parameter and return types.

#### 4. **Objects and classes**

Object literals, prototypes, ES6 classes, inheritance, and methods all behave as in Javascript (Typescript just lets you add types on top).

- Example (object literal): `const names = { east: makeNameRow(), west: makeNameRow() };` in `packages/pong/render/src/client/ui/scoreboard.ts` builds a plain Javascript object with two properties.
- Example (class): `export class XorShift32 implements RandomSource { ... }` in `packages/pong/shared/src/utils/random.ts` defines a class with a constructor and methods; at runtime it behaves like any ES6 class.

#### 5. **Modules**

`import` and `export` syntax and the idea of splitting code into modules are Javascript features that Typescript reuses.

- Example: `import { createPongApp, type Preferences } from '../index';` and `export async function createPongApp(...) { ... }` in `apps/frontend/src/games/pong/index.ts` use the standard ES module system; Typescript just adds type information.

#### 6. **Asynchronous programming**

Callbacks, promises, `async` / `await`, and the event loop work the same in Typescript because they are Javascript runtime features.

- Example: `export async function bootstrapPong(...) { const app = await createPongApp(...); ... }` in `apps/frontend/src/games/pong/host/dom-embed.ts` uses `async` / `await` to wait for a promise—identical control flow to Javascript.
- Example: the render loop in `packages/pong/render/src/client/engine/render-loop.ts` uses `engine.runRenderLoop(loop);` with a callback function `loop`, a typical JS async pattern.

#### 7. **Error handling**

Throwing errors and handling them with `try` / `catch` is identical in Javascript and Typescript.

- Example: `if (mode === 'tournament') throw new Error('tournament mode not implemented yet');` in `apps/frontend/src/games/pong/index.ts` throws a standard JS `Error`.
- Example: several cleanup functions (like `createWorld` in `packages/pong/render/src/client/scene/scene.ts`) use `try { ... } catch {}` around Babylon cleanup calls to ignore errors, exactly as you would in Javascript.

#### 8. **DOM manipulation**

Working with the DOM (`document.querySelector`, event listeners, etc.) is the same; Typescript just adds type definitions for browser APIs.

- Example: `const el = document.createElement(tag);` and `root.appendChild(overlay);` in `packages/pong/render/src/client/ui/scoreboard.ts` create and attach DOM elements in the usual Javascript way; the only difference in TS is that `el` has a typed interface.

#### 9. **Event handling**

Attaching and removing event listeners (clicks, keyboard events, mouse events, etc.) works the same way as in plain Javascript.

- Example: `window.addEventListener('resize', scheduleSync);` and `window.removeEventListener('resize', scheduleSync);` in `packages/pong/render/src/client/ui/scoreboard.ts` show standard DOM event registration and cleanup.

#### 10. **Standard libraries and APIs**

Built‑in objects like `Math`, `Date`, `JSON`, and browser APIs (Fetch, LocalStorage, etc.) are all Javascript; Typescript simply adds typings for them.

- Example: `const lastShown = Math.max([...map.keys()].reduce((a, b) => Math.max(a, b), 0), currentGameIndex ?? 1) || 1;` in `packages/pong/render/src/client/ui/scoreboard.ts` uses `Math.max` the same way you would in JS.
- Example: `const nowMs = Date.now() | 0;` in `packages/pong/shared/src/utils/random.ts` uses `Date.now()` and bitwise operators to compute a seed; these are pure Javascript features.

#### 11. **Modern Javascript syntax**

Template literals, destructuring, and the spread/rest operators are ES6+ Javascript features that Typescript supports unchanged.

- Example (destructuring): `const { engine, engineDisposable } = createEngine(canvas);` in `apps/frontend/src/games/pong/modes/local/local.ts` pulls properties out of an object into local variables.
- Example (spread): `const merged: Ruleset = { game: { ...base.game, ...(overrides?.game ?? {}) }, ... };` in `packages/pong/game-logic/src/rules/presets.ts` merges objects with `...` spread syntax.
- Example (template literal): ``wrap.style.transform = `scale(${scale})`;`` in `packages/pong/render/src/client/ui/scoreboard.ts` is a string with embedded expressions using backticks, just like in modern Javascript.

### What is specific to Typescript

#### 1. **Static type system and type annotations**

You can explicitly annotate types for variables, parameters, and return values (for example, `let x: number = 1;`), and the compiler checks them at build time.

- Example: `export function createLocalApp(canvas: HTMLCanvasElement, preferences?: Preferences): PongInstance` in `apps/frontend/src/games/pong/modes/local/local.ts` shows parameter and return types on a function.
- Example: `export function randomSeed32(): number { ... }` in `packages/pong/shared/src/utils/random.ts` explicitly declares that it returns a `number`.

#### 2. **Additional type constructs**

Typescript adds types that do not exist in plain Javascript, such as enums, tuples, and interfaces for describing object shapes.

- Example (interface): `export interface RandomSource { next(): number; getSeed(): number; setSeed(seed: number): void; }` in `packages/pong/shared/src/utils/random.ts` describes the shape of an object with methods.
- Example (object-shaped type alias): `export type DomScoreboardAPI = { setPoints: (east: number, west: number) => void; ... };` in `packages/pong/render/src/client/ui/scoreboard.ts`.

#### 3. **Type inference**

Typescript can often figure out types automatically from how values are used, even when you do not write the type explicitly.

- Example: `const matchSeed = randomSeed32();` in `apps/frontend/src/games/pong/modes/local/local.ts` has no explicit type, but TypeScript infers `matchSeed` as `number` from the function’s return type.
- Example: `const Colors = { ... } as const;` in `packages/pong/render/src/client/scene/color.ts` lets TypeScript infer a deeply readonly palette type from the object literal.

#### 4. **Union and intersection types**

You can express that a value can be one of several types (`A | B`) or must satisfy multiple types at once (`A & B`).

- Example (union of string literals): `export type AppMode = 'local' | 'online' | 'tournament';` in `apps/frontend/src/games/pong/index.ts` restricts `mode` to three allowed strings.
- Example (intersection): `export type JoinTokenClaims = { ... } & Partial<TournamentContext>;` in `packages/pong/shared/src/protocol/net.ts` combines required JWT fields with optional tournament fields.

#### 5. **Generics**

Reusable functions, classes, and interfaces that work with multiple types while preserving type safety (for example, `Array<T>`).

- Example: `function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, ...): HTMLElementTagNameMap[K]` in `packages/pong/render/src/client/ui/scoreboard.ts` is generic over the tag name, so passing `'div'` returns an `HTMLDivElement`, `'canvas'` returns an `HTMLCanvasElement`, etc.
- Example: `export type AudioManifest = { sfx: readonly SfxAsset[]; music: readonly MusicAsset[]; };` in `packages/pong/render/src/client/audio/manifest.ts` uses generic array types with custom element types.

#### 6. **Type aliases**

The ability to give a name to a complex type (for example, `type Point = { x: number; y: number }`) to make code easier to read and reuse.

- Example: `export type MatchSeed = number;` and `export type Rng = () => number;` in `packages/pong/shared/src/utils/random.ts` give readable names to a primitive and a function type.
- Example: `export type TournamentSize = 4 | 8 | 16;` in `packages/pong/shared/src/protocol/net.ts` names a union of allowed tournament sizes.

#### 7. **Object‑oriented extensions**

Access modifiers (`public`, `private`, `protected`), `readonly` properties, and `abstract` classes exist only at the type‑system level in Typescript.

- Example: `export class XorShift32 implements RandomSource { private state: number; ... }` in `packages/pong/shared/src/utils/random.ts` uses `private` to hide implementation details and `implements` to enforce the `RandomSource` interface.
- Example: `export class FXManager { private readonly ctx: FXContext; private readonly config: FXConfig; ... }` in `packages/pong/render/src/client/fx/manager.ts` uses `private readonly` fields that can be read but not reassigned.

#### 8. **Function overloading and optional parameters syntax**

You can declare multiple type signatures for a function and use `?` to mark parameters as optional in a type‑safe way.

- Example (optional parameter): `flashMessage: (text: string, ms?: number) => void;` in `DomScoreboardAPI` (`packages/pong/render/src/client/ui/scoreboard.ts`) marks `ms` as optional; callers can omit it.
- Example (optional field in an object type): many message types in `packages/pong/shared/src/protocol/net.ts` use optional properties like `reason?: 'offline' | 'forfeited' | 'stopped';`.

#### 9. **Type guards**

Patterns (like `typeof`, `instanceof`, or custom functions) that narrow the type of a value within a certain code branch.

- Example: `export function isPauseBtwPoints(p: GameState['phase']): p is 'pauseBtwPoints' { return p === 'pauseBtwPoints'; }` in `packages/pong/game-logic/src/systems/utils.ts` tells TypeScript that inside an `if (isPauseBtwPoints(p))` block, `p` has the literal type `'pauseBtwPoints'`.
- Example: `export function isRallyPhase(p: GameState['phase']): p is 'rally' { return p === 'rally'; }` is another type guard that narrows the phase.

#### 10. **Namespaces**

A Typescript‑specific way to group related types and values under a single name (mainly used in older code; modules are preferred today).

- This project does not use `namespace`, because it relies on ES modules instead. A typical example would be:

```ts
namespace Utils {
  export function clamp(x: number, min: number, max: number): number { ... }
}
```

#### 11. **Decorators (experimental)**

Special annotations for classes, methods, or properties that attach metadata or modify behavior, supported by Typescript before they were standardized in Javascript.

- This codebase does not currently use decorators. A typical example in a class would be:

```ts
class MyService {
  @LogCall()
  doWork() {
    /* ... */
  }
}
```

#### 12. **JSX support with types**

Built‑in support for JSX syntax (used by React) together with type checking for components and props.

- Not used in the Pong game modules, but in a React/Next.js part of the app you would see files with `.tsx` extensions where components are written as:

```tsx
type ButtonProps = { label: string };
function Button({ label }: ButtonProps) {
  return <button>{label}</button>;
}
```

#### 13. **Strict null checks and other strictness flags**

Compiler options like `strictNullChecks` make `null` and `undefined` handling safer by treating them as distinct types.

- Example: `let waitingTimeout: number | null = null;` in `apps/frontend/src/games/pong/modes/online/match-lifecycle.ts` forces you to check for `null` before using the timer ID.
- Example: many APIs use union types like `HTMLDivElement | null` after `document.getElementById`, so you must handle the `null` case.

#### 14. **Advanced type features and utility types**

Mapped types, conditional types, template literal types, and built‑in helpers like `Partial<T>`, `ReturnType<T>`, `Parameters<T>`, `keyof` and indexed access types (for example, `GameState['phase']`) for defining complex and dynamic types.

- Example: `export function tableTennisRules(overrides?: Partial<Ruleset>): Ruleset` in `packages/pong/game-logic/src/rules/presets.ts` uses `Partial<Ruleset>` to allow callers to pass only the fields they want to override.
- Example: `shadows: ReturnType<typeof createSunShadows>;` in `packages/pong/render/src/client/scene/scene.ts` uses `ReturnType` to mirror the return type of `createSunShadows`.
- Example: `opts?: Parameters<typeof makePhysicalGlass>[2]` in `packages/pong/render/src/client/scene/materials/glass.ts` (not shown above) uses `Parameters` to grab the third parameter type of another function.

#### 15. **Assertions**

Type assertions (`value as SomeType`) and non‑null assertions (`value!`) let you tell the compiler “trust me, this is of this type” when you know more than the static analysis.

- Example (type assertion): `const existingRoot = document.getElementById('pong-hud-root') as HTMLDivElement | null;` in `packages/pong/render/src/client/ui/scoreboard.ts` tells TypeScript to treat the element as an `HTMLDivElement`.
- Example (non‑null assertion): `return buf[0]! >>> 0;` in `packages/pong/shared/src/utils/random.ts` asserts that `buf[0]` is not `undefined`.

#### 16. **Const assertions**

`as const` freezes object/array shapes and narrows literal types (for example making `type: 'sfx'` stay the literal `'sfx'` instead of widening to `string`).

- Example: the `Colors` palette in `packages/pong/render/src/client/scene/color.ts` ends with `} as const;`, so each nested property keeps its literal type and becomes readonly.
- Example: `const HIDE_KEY = '_fxHideCount' as const;` in `packages/pong/render/src/client/fx/utils.ts` ensures `HIDE_KEY` has the literal type `'_fxHideCount'`.

#### 17. **`satisfies` operator**

Lets a value be checked against a type (for example `const x = {...} satisfies Ruleset`) without changing the inferred type of `x`, so you keep both safety and good inference.

- Example: in `packages/pong/game-logic/src/rules/presets.ts`, the `base` object is written as:

```ts
const base = {
  game: { ... },
  match: { ... },
} satisfies Ruleset;
```

This ensures `base` conforms to `Ruleset` while keeping nice inference for its properties.

#### 18. **Ambient declarations and module augmentation**

`.d.ts` files and `declare module ...` let you describe the shape of external modules (like shader or SVG imports) or extend existing modules (for example, adding methods to Babylon types) without changing their source code.

- Example: `declare module '*.svg?raw' { const content: string; export default content; }` in `packages/pong/render/src/types/svg-raw.d.ts` lets you import raw SVG strings.
- Example: the `declare module '@babylonjs/core/Materials/Textures/dynamicTexture' { interface DynamicTexture { getContext(): CanvasRenderingContext2D; } }` block in `packages/pong/render/src/types/babylon.dynamicTexture.d.ts` augments a Babylon class with a strongly typed `getContext` method.

#### 19. **Type‑only imports and exports**

`import type { Foo } from '...'` and `export { type Bar } from '...'` are a Typescript‑specific way to ensure imports are erased at runtime and only used for types.

- Example: `import type { TableEnd } from '@pong/shared';` at the top of `packages/pong/render/src/client/ui/scoreboard.ts` pulls in only the type `TableEnd` with no runtime code.
- Example: `export { type Disposable } from './utils/disposable';` in `packages/pong/shared/src/index.ts` re‑exports a type without adding a runtime export.

#### 20. **Tooling and ecosystem**

The Typescript compiler and language service power features like autocompletion, refactoring, jump‑to‑definition, and real‑time type errors in modern IDEs, and there is a large ecosystem of type‑aware libraries and tools.

There is no direct syntax for this in the code; you experience it when your editor:

- Autocompletes DOM methods on `HTMLDivElement`.
- Jumps from a type like `OnlineMatchSummary` to its definition in `packages/pong/shared/src/protocol/net.ts`.
- Highlights type mismatches before you even run the app.

---

## Additional notes

This section fills in a few extra TypeScript concepts that are very useful at junior level and that appear throughout this codebase.

### 1. Special types: `any`, `unknown`, `never`, `void`

- **`any`**: “opt out” of type checking. Avoid it where possible, because it disables most safety checks and autocomplete. If a type is `any`, you can assign it anywhere and call anything on it without errors.
- **`unknown`**: “some value, but we don’t know its type yet”. Safer than `any` because you must **narrow** it (with `typeof`, `instanceof`, or custom checks) before using it. Example: error types in `catch (err: unknown)` or `useMatchOverEvent<TDetail = unknown>(...)` in `docs/to0nsa/typescript/Generics.md`.
- **`never`**: “this code path never happens” or “this function never returns”. It appears in exhaustiveness checks (for example, a `switch` over all message types) or functions that always throw.
- **`void`**: “no meaningful return value”. Many callbacks or React event handlers return `void`.

As a rule in this project:

- Prefer concrete types or generics over `any`.
- Use `unknown` when you truly don’t know the shape yet (for example generic event detail or error values).
- Treat `never` as a signal to check whether you’ve covered all cases in unions (messages, phases, etc.).

### 2. `interface` vs `type` in this repo

Both `interface` and `type` can describe object shapes:

- `interface RandomSource { next(): number; getSeed(): number; setSeed(seed: number): void; }` in `packages/pong/shared/src/utils/random.ts`.
- `export type DomScoreboardAPI = { setPoints: (east: number, west: number) => void; ... };` in `packages/pong/render/src/client/ui/scoreboard.ts`.

In this codebase, a simple guideline is:

- Use **`interface`** for “named shapes” that might be implemented or extended (for example, `RandomSource`).
- Use **`type`** for:
  - Unions (`AppMode = 'local' | 'online' | 'tournament'`).
  - Composed types (`&`, `|`, utility types like `Partial<Ruleset>`).
  - Object shapes that heavily use generics or utility types.

TypeScript is **structural**, not nominal: if an object has the right shape, it is assignable to an interface or type, even if it wasn’t declared with `implements`.

### 3. Discriminated unions for messages

Many protocol types use a **discriminated union** pattern: a shared `type` field distinguishes different shapes.

Example from `packages/pong/shared/src/protocol/net.ts`:

- Each message has a literal `type`: `'HANDOFF'`, `'MATCH_FOUND'`, `'ERROR'`, etc.
- `export type MatchmakingMessage = ConnectedMessage | QueueJoinedMessage | ... | ErrorMessage;`.

In code, you usually write:

```ts
function handleMessage(msg: MatchmakingMessage) {
  switch (msg.type) {
    case 'HANDOFF':
      // msg is HandoffMessage here
      break;
    case 'ERROR':
      // msg is ErrorMessage here
      break;
    // ...
  }
}
```

TypeScript narrows `msg` based on `msg.type`, so you get autocomplete for only the fields that exist on that variant. This is a key pattern for strongly typed network/message code.

### 4. Enums vs literal unions

TypeScript has `enum`, but this project prefers **literal unions** like:

- `export type AppMode = 'local' | 'online' | 'tournament';`
- `export type MatchEndReason = 'opponent_timeout' | 'completed' | 'error' | 'forfeit';`

Literal unions:

- Are simpler at runtime (just strings).
- Work well with discriminated unions and `switch` statements.
- Play nicely with tools and JSON payloads.

A typical `enum` would look like:

```ts
enum MatchEndReasonEnum {
  OpponentTimeout = 'opponent_timeout',
  Completed = 'completed',
  Error = 'error',
  Forfeit = 'forfeit',
}
```

You don’t need to use `enum` to read or extend this code; understanding literal unions is enough.

### 5. Project `tsconfig` and path aliases

The shared TypeScript configuration lives in `.config/tsconfig.base.json`:

- `"strict": true` and flags like `"noUncheckedIndexedAccess": true` make the type system stricter and catch more bugs.
- `"paths"` defines project‑wide import aliases, for example:
  - `@pong/shared` → `packages/pong/shared/src/index.ts`
  - `@pong/game-logic` → `packages/pong/game-logic/src/index.ts`
  - `@pong/render` → `packages/pong/render/src/index.ts`

That’s why you see imports like:

```ts
import type { GameState } from '@pong/game-logic';
import { createWorld } from '@pong/render';
```

Even though there is no `node_modules/@pong/...` folder, TypeScript (and the bundler) resolve these paths using the config.

### 6. Dealing with TypeScript errors in this project

When you bump into a TypeScript error:

- **Read the full message**: it often explains which union member or property is incompatible.
- **Check the types**: hover values and parameters in your editor (`MatchmakingMessage`, `GameState['phase']`, etc.) to see what TypeScript thinks the types are.
- **Narrow instead of asserting**: prefer patterns like `if (msg.type === 'ERROR') { ... }` over `msg as ErrorMessage` whenever possible.
- **Reuse existing types**: if you need to construct a message or payload, import the existing type (for example, `OnlineMatchSummary`, `JoinQueueRequest`) instead of inventing a new shape.
- If a third‑party API is too loosely typed, prefer `unknown` + narrowing or a small wrapper type over `any`.

Over time, reading TypeScript error messages becomes much easier—especially if you think in terms of unions, discriminants (`type` fields), and the generic helpers described in `AdvancedTypes.md`.
