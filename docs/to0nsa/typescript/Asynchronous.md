# Asynchronous Programming in TypeScript

This is a practical guide to asynchronous programming in TypeScript, with a focus on the patterns you actually see in this project (timers, event listeners, promises, `async` / `await`, and game/network loops).

The key idea: **TypeScript does not change how async works at runtime**. All the asynchronous behavior comes from JavaScript and the browser/Node environment. TypeScript adds _types_ on top of that behavior so you get better autocomplete and error checking.

---

## 1. Why asynchronous programming?

JavaScript runs (conceptually) on a **single thread**:

- At any moment it is doing exactly one thing.
- If that thing takes a long time (like a network call or a big CPU loop), everything else is blocked (UI freezes, input ignored, etc.).

To stay responsive, JavaScript uses **asynchronous operations**:

- Instead of blocking, you _start_ an operation (network request, timer, file read, etc.).
- You give JavaScript a **callback** or a **promise**, and your code resumes later when the operation finishes.
- In TypeScript, we describe these operations with types like `Promise<T>`, callback parameter types, etc.

Examples in this project:

- Timers for countdowns and timeouts in online matches (`setTimeout`, `setInterval`).
- Animation and render loops (`requestAnimationFrame`, Babylon’s `runRenderLoop`).
- Network-related flows (WebSocket-like messages, latency warnings).

---

## 2. The JavaScript event loop (high level)

You don’t need a perfect mental model to be productive, but a basic one helps:

- **Call stack**: where normal synchronous functions run, one after another.
- **Web/Node APIs**: things like `setTimeout`, `fetch`, DOM events are implemented by the browser/Node, not by the JS engine itself.
- **Queues**: when an async operation completes, its callback or promise reaction is placed in a queue. When the stack is empty, the event loop pulls the next task and runs it.

Important consequences:

- Asynchronous callbacks **never interrupt** currently running code; they only run between tasks.
- Even `setTimeout(fn, 0)` runs _later_, after the current synchronous work finishes.
- `async` / `await` is “syntax sugar” over promises, which are scheduled by this event loop.

You usually don’t touch the event loop directly; you use higher-level APIs (promises, timers, `async` / `await`) and let the runtime manage the queue.

---

## 3. Core async building blocks in TypeScript

From the JavaScript side, there are three main patterns:

1. **Callbacks** (classic style)
2. **Promises** (modern base abstraction)
3. **`async` / `await`** (syntax on top of promises)

TypeScript layers **types** on top of each.

### 3.1 Callbacks

Callbacks are just functions you pass around and call later.

Example from `apps/frontend/src/games/pong/modes/online/match-lifecycle.ts`:

```ts
const startCountdown = (untilEpochMs: number) => {
  stopCountdown();
  const tick = () => {
    const remain = Math.max(0, untilEpochMs - Date.now());
    if (remain <= 0) {
      stopCountdown();
      return;
    }
    const secs = remain / 1000;
    const text =
      secs >= 10 ? `Match starts in ${Math.ceil(secs)}s` : `Match starts in ${secs.toFixed(1)}s`;
    deps.hud.flashMessage(text, 500);
  };
  tick();
  startCountdownTimer = window.setInterval(tick, 120);
};
```

Here:

- `startCountdown` is an **arrow function** that takes a number and uses `setInterval`.
- `tick` is a **callback function** passed to `window.setInterval`.
- `setInterval` is asynchronous: it calls `tick` later, repeatedly, based on a timer.

TypeScript parts:

- Parameter types like `(untilEpochMs: number)` and `startCountdownTimer: number | null`.
- Function return types (inferred here; could be explicit like `(): void`).

### 3.2 Timers (`setTimeout`, `setInterval`) and typing them

Timers are classic callback-based async APIs:

```ts
let waitingTimeout: number | null = null;

const clearWaitingForOpponentTimeout = () => {
  if (waitingTimeout !== null) {
    window.clearTimeout(waitingTimeout);
    waitingTimeout = null;
  }
};

const ensureWaitingForOpponentTimeout = (state: RoomStateMessage) => {
  if (deps.isMatchEnded() || waitingTimeout !== null) return;

  const baseDelay =
    typeof state.startAtEpochMs === 'number' ? state.startAtEpochMs - Date.now() : 0;

  const delay = Math.max(
    WAITING_MIN_TIMEOUT_MS,
    Math.min(WAITING_MAX_TIMEOUT_MS, baseDelay + WAITING_EXTRA_GRACE_MS),
  );

  const initialSeat = deps.getInitialSeat();
  const winnerSide = deps.seatToSide(initialSeat);

  waitingTimeout = window.setTimeout(() => {
    waitingTimeout = null;
    finalizeMatch('opponent_timeout', winnerSide, null);
    try {
      deps.disconnectNet();
    } catch {
      /* ignore */
    }
  }, delay);
};
```

Key points:

- `window.setTimeout` returns a **timer ID**; in the browser, TypeScript usually treats it as `number`.
- You store that ID in `waitingTimeout` so you can cancel the timer later.
- The callback `() => { ... }` is **asynchronous**; it runs after the delay, not immediately.

### 3.3 Promises

Promises represent a **value that will be available later** (or an error).

TypeScript uses `Promise<T>` to express “promise of a `T`”.

Example (generic pattern, not from the repo) wrapping a timer into a promise:

```ts
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}
```

Here:

- `new Promise((resolve) => { ... })` constructs a promise.
- The promise is **fulfilled** (resolved) when `resolve()` is called.
- The type `Promise<void>` means “this completes in the future, with no result”.

You consume promises with `.then(...)` / `.catch(...)` or `await` (next section).

### 3.4 `async` / `await`

`async` / `await` is **syntax sugar** over promises, making asynchronous code look more like synchronous code.

Example from `apps/frontend/src/games/pong/host/dom-embed.ts`:

```ts
import { createPongApp, type Preferences } from '../index';

export async function bootstrapPong(canvas: HTMLCanvasElement, preferences?: Preferences) {
  const app = await createPongApp({ mode: 'local', canvas, preferences });
  app.start();
  return app;
}
```

What’s happening:

- `bootstrapPong` is marked `async`, so its return type is `Promise<...>`.
- `createPongApp(...)` returns a promise; `await` pauses inside `bootstrapPong` until that promise resolves.
- After it resolves, `app` is the resolved value.
- Returning `app` actually returns a `Promise<AppInstance>` (TypeScript infers the type).

Under the hood, this is equivalent to:

```ts
export function bootstrapPong(canvas: HTMLCanvasElement, preferences?: Preferences) {
  return createPongApp({ mode: 'local', canvas, preferences }).then((app) => {
    app.start();
    return app;
  });
}
```

TypeScript makes this easier by:

- Inferring return types (e.g. `Promise<PongInstance>`).
- Checking that you `await` things of type `Promise<...>`.
- Ensuring you pass correctly typed arguments into async calls.

---

## 4. Typing functions and callbacks in TypeScript

In TypeScript, _functions themselves_ have types. This is crucial for async code because you pass functions around constantly.

### 4.1 Function types

You can describe a function’s type explicitly:

```ts
type TickFn = () => void;

let rafId: number | null = null;
const scheduleSync: TickFn = () => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    syncOverlay();
  });
};
```

Or inline:

```ts
function createRenderLoop(engine: Engine, scene: Scene, preRender?: () => void, targetFps = 60) {
  let loop: (() => void) | null = null;
  // ...
}
```

Here, `preRender?: () => void` is:

- An **optional parameter** (`?`) that may be `undefined`.
- A **callback function type** that takes no parameters and returns `void`.

### 4.2 Higher‑order functions

Functions that accept other functions or return functions are called **higher‑order functions**. Most async helpers fall into this category.

Example pseudo‑pattern:

```ts
function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  // ...
}
```

Here:

- `withRetry` accepts a function that _returns a promise_, and itself returns a `Promise<T>`.
- TypeScript tracks `T` through the whole chain, so the compiler knows what `await withRetry(...)` returns.

---

## 5. Promises in depth (with TypeScript)

### 5.1 Creating promises

Basic pattern:

```ts
function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  });
}
```

Points:

- The **executor function** `(resolve, reject) => { ... }` is where you start async work.
- You call `resolve(value)` on success and `reject(error)` on failure.
- In real code you usually prefer `async` / `await` (next section), but it’s important to recognize this pattern.

### 5.2 Typing promise results

`Promise<T>` means “promise that will eventually give a `T`”.

Examples:

- `Promise<void>` – only signals completion, no value.
- `Promise<number>` – resolves to a number.
- `Promise<OnlineMatchSummary | null>` – used in network code to represent an optional summary.

When you `await`:

- `const x = await promise;` – `x` has type `T` when `promise` is `Promise<T>`.

### 5.3 Combining promises: `Promise.all`

Example pattern:

```ts
async function loadTwoResources() {
  const [a, b] = await Promise.all([
    fetchJson<ResourceA>('/api/a'),
    fetchJson<ResourceB>('/api/b'),
  ]);
  return { a, b };
}
```

Here:

- `Promise.all` lets you start both async operations in parallel.
- TypeScript infers the result as `[ResourceA, ResourceB]`.

---

## 6. `async` / `await` patterns and error handling

### 6.1 Basic pattern

```ts
async function loadMatch(id: string): Promise<MatchSnapshot> {
  const res = await fetch(`/api/match/${id}`);
  if (!res.ok) throw new Error('Failed to load match');
  const data = (await res.json()) as MatchSnapshot;
  return data;
}
```

Things to notice:

- Marking a function `async` automatically wraps its return value into a promise.
- You can `throw` inside an `async` function; the thrown error becomes a **rejected promise**.

### 6.2 Try/catch around `await`

```ts
async function safeLoadMatch(id: string): Promise<MatchSnapshot | null> {
  try {
    return await loadMatch(id);
  } catch (err) {
    console.error('Failed to load match', err);
    return null;
  }
}
```

This is the async equivalent of synchronous `try` / `catch`. TypeScript will:

- Enforce that `safeLoadMatch` returns a `MatchSnapshot | null`.
- Give you type `unknown` for `err` unless you narrow it.

---

## 7. Timers, animation loops, and game code

Game and UI code often use a mix of:

- **Timers** for delays / countdowns.
- **Render loops** for frames.
- **Event callbacks** for user input.

### 7.1 Render loop example

From `packages/pong/render/src/client/engine/render-loop.ts`:

```ts
export function createRenderLoop(
  engine: Engine,
  scene: Scene,
  preRender?: () => void,
  targetFps = 60,
) {
  let loop: (() => void) | null = null;
  const frameInterval = targetFps > 0 ? 1000 / targetFps : 0;
  let lastRenderAt = performance.now();

  const frame = () => {
    const now = performance.now();
    if (frameInterval && now - lastRenderAt < frameInterval) return;

    lastRenderAt = frameInterval ? now - ((now - lastRenderAt) % frameInterval) : now;

    const e = engine as Engine & { isDisposed?: boolean };
    if (e.isDisposed === true || scene.isDisposed) return;
    preRender?.();
    scene.render();
  };

  return {
    start() {
      if (loop) return;
      loop = frame;
      engine.runRenderLoop(loop);
    },
    stop() {
      if (!loop) return;
      engine.stopRenderLoop(loop);
      loop = null;
    },
    setPreRender(fn?: () => void) {
      preRender = fn;
    },
    isRunning(): boolean {
      return loop !== null;
    },
  };
}
```

What’s asynchronous here:

- `engine.runRenderLoop(loop)` schedules `loop` to run on each animation frame. The engine (Babylon) calls `loop` later, similar to `requestAnimationFrame`.
- `frame` is a callback; it runs repeatedly over time.

TypeScript’s role:

- Types for `preRender` (`() => void`).
- Types for `Engine`, `Scene`, and the returned object.

### 7.2 Countdown timers and HUD updates

From `apps/frontend/src/games/pong/modes/online/match-lifecycle.ts`:

```ts
const startCountdown = (untilEpochMs: number) => {
  stopCountdown();
  const tick = () => {
    const remain = Math.max(0, untilEpochMs - Date.now());
    if (remain <= 0) {
      stopCountdown();
      return;
    }
    const secs = remain / 1000;
    const text =
      secs >= 10 ? `Match starts in ${Math.ceil(secs)}s` : `Match starts in ${secs.toFixed(1)}s`;
    deps.hud.flashMessage(text, 500);
  };
  tick();
  startCountdownTimer = window.setInterval(tick, 120);
};
```

Here async behavior is driven by:

- `window.setInterval(tick, 120)` – calls `tick` every 120 ms.
- `Date.now()` – time-based computations.

The logic itself is synchronous, but **when** it runs is controlled by the async timer.

---

## 8. Common pitfalls and best practices

### 8.1 Forgetting to clear timers

Problem:

- You start a timer (`setTimeout` / `setInterval`) but never clear it.
- The callback keeps running after the component/game/page is “gone”.

Mitigation:

- Always store timer IDs and clear them in cleanup:

```ts
let timer: number | null = null;

function start() {
  timer = window.setInterval(() => {
    /* ... */
  }, 1000);
}

function stop() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}
```

### 8.2 Mixing async and mutable shared state

Because callbacks run later, they capture variables by **closure**. If those variables change in between, behavior can be surprising.

Guidelines:

- Prefer local variables inside async functions when possible.
- Avoid mutating the same object from multiple async callbacks at the same time without thinking through the ordering.

### 8.3 `forEach` with async functions

`Array.prototype.forEach` doesn’t await async callbacks:

```ts
// This does NOT wait for inner async work
items.forEach(async (item) => {
  await doSomething(item);
});
```

Prefer:

```ts
for (const item of items) {
  await doSomething(item);
}
```

Or explicit concurrency:

```ts
await Promise.all(items.map((item) => doSomething(item)));
```

---

## 9. Summary / cheat sheet

- **Async is a runtime concept** from JavaScript and the environment (browser/Node), not from TypeScript itself.
- **Callbacks**: functions passed into APIs like `setTimeout`, `setInterval`, event listeners, or engine render loops.
- **Promises**: `Promise<T>` represents a future value; use `.then` / `.catch` or `await`.
- **`async` / `await`**: makes promise-based code look synchronous; always returns a `Promise<...>`.
- **Timers and loops**: `setTimeout`, `setInterval`, and engine loops call your code later; always track and clear timers.
- **TypeScript’s role** is to:
  - Give precise types to callbacks and promises (`Promise<T>`, `() => void`, `(x: number) => void`, etc.).
  - Catch mismatches at compile time (wrong argument types, missing properties).
  - Make async code easier to navigate with good editor support (go-to-definition, autocomplete).

As you read and write async TypeScript code in this project, try to ask:

- _What is the asynchronous boundary here?_ (timer, fetch, event, engine loop)
- _What is the function type crossing that boundary?_ (callback or `Promise<T>`)
- _How is TypeScript helping me express and check that boundary?_
