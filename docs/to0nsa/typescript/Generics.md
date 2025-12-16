# Generics in TypeScript

Generics are TypeScript’s way to write **reusable, type‑safe code** that still works with many different concrete types.  
They let you write “functions and types with **holes**” that get filled with specific types when you use them.

You already use generics any time you write:

- `Array<number>` – an array of `number`
- `Promise<User>` – a promise that will eventually yield a `User`
- `Map<string, Match>` – a map from `string` keys to `Match` values

In the ft_transcendence codebase you’ll find generics everywhere:

- `Pool<T>` in `packages/pong/render/src/client/fx/pool.ts`
- `UseMatchOverEventOptions<TDetail>` and `useMatchOverEvent<TDetail>` in `apps/frontend/src/pages/pong/shared/hooks/useMatchOverEvent.ts`
- Generic React components such as `SurfaceCard<T>`, `PageContainer<T>`, and `PageSection<T>` in `apps/frontend/src/pages/pong/shared/components`

This document is a **mini‑course on generics**:

1. Why generics exist (what problem they solve)
2. Basic syntax for generic functions and types
3. Type inference with generics
4. Constraining generics with `extends`
5. Built‑in generic types (`Array<T>`, `Promise<T>`, `Record<K, V>`, `Omit<T, K>`, …)
6. Generic React components and hooks (using examples from this project)
7. Practical tips and common pitfalls
8. Small exercises you can try in this repo

---

## 1. Why generics?

Imagine you write a simple function to return the first element of an array:

```ts
function firstNumber(arr: number[]): number | undefined {
  return arr[0];
}
```

This only works for `number[]`. If you also need `string[]`, you might write:

```ts
function firstString(arr: string[]): string | undefined {
  return arr[0];
}
```

Now you are **duplicating the same logic** for each type. That is:

- Bad for maintainability (two places to change)
- Easy to get out of sync
- No better type safety than a more general solution

You might be tempted to use `any`:

```ts
function firstAny(arr: any[]): any | undefined {
  return arr[0];
}
```

But this **throws away type information**. Callers lose the connection between:

- The type inside the array, and
- The type returned from the function

### 1.1 The idea of a type parameter

Generics let you **parameterize** code over a type:

```ts
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

Here:

- `T` is a **type parameter** – a placeholder for “some type”
- `T[]` is “an array of `T`”
- The function returns `T | undefined` – the same element type it receives

When you call it with `string[]`, TypeScript treats it as if you had written:

```ts
const name = first<string>(['alice', 'bob']); // name: string | undefined
```

If you call it with `number[]`, it behaves like:

```ts
const n = first<number>([1, 2, 3]); // n: number | undefined
```

Same function body, **strong types for each use**. That is the core value of generics.

---

## 2. Basic generic syntax

### 2.1 Generic functions

The simplest generic functions follow this pattern:

```ts
function identity<T>(value: T): T {
  return value;
}
```

- The `<T>` after the function name introduces a **type parameter list**
- You can use `T` anywhere a type is expected: parameter types, return type, local variables, etc.

Usage:

```ts
const s = identity('hello'); // T inferred as string → s: string
const n = identity(42); // T inferred as number → n: number
```

You can also specify `T` explicitly if needed:

```ts
const maybeNumber = identity<number | null>(null);
```

### 2.2 Multiple type parameters

You can introduce more than one parameter:

```ts
function pair<A, B>(a: A, b: B): [A, B] {
  return [a, b];
}

const coords = pair(10, 20); // A=number, B=number → [number, number]
const labeled = pair('x', 20); // A=string, B=number → [string, number]
const userAndToken = pair(user, jwt); // A=User, B=string
```

Names are up to you; short names (`T`, `U`, `V`) are common for “generic” values; more descriptive names (`TDetail`, `TElement`) help readability in real code.

### 2.3 Generic type aliases and interfaces

You can also make **types** generic, not only functions.

Example from `packages/pong/render/src/client/fx/pool.ts`:

```ts
export type Pool<T> = {
  acquire(): T | undefined;
  release(item: T): void;
  warm(size: number): void;
  clear(): void;
  size(): number;
  available(): number;
};
```

`Pool<T>` means “a pool of things of type `T`”.  
The pool itself doesn’t care what `T` is – it only needs to know “there is some type for items, and all operations are consistent with it.”

Later in the same file:

```ts
export function makePool<T>(
  create: () => T,
  reset: (t: T) => void,
  dispose: (t: T) => void,
): Pool<T> {
  // ...
}
```

The generic function `makePool<T>` **creates a `Pool<T>`**.  
When you call `makePool`, you decide what `T` is by the `create` function you pass.

---

## 3. Type inference with generics

In most cases, you **do not have to write `<T>` explicitly**. TypeScript can infer it from the arguments you pass.

```ts
function wrapInArray<T>(value: T): T[] {
  return [value];
}

const numbers = wrapInArray(42); // T inferred as number → number[]
const strings = wrapInArray('pong'); // T inferred as string → string[]
const users = wrapInArray({ id: 1 }); // T inferred as { id: number } → { id: number }[]
```

Inference works for:

- Function arguments
- Contextual typing (what you assign the result to)
- Some generic callbacks and higher‑order functions

However, inference has limits. Sometimes TypeScript will infer a type that is too broad or too narrow. In those cases, you can:

- Specify the type parameters explicitly: `wrapInArray<User>(user)`
- Add annotations on variables or helper functions, guiding inference

Example from `apps/frontend/src/pages/pong/shared/hooks/useMatchOverEvent.ts`:

```ts
type UseMatchOverEventOptions<TDetail> = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  active: boolean;
  onMatchOver: (detail: TDetail | null) => void;
  onAutoExit?: () => void;
  autoExitDelayMs?: number;
  extractDetail?: (event: Event) => TDetail | null;
};

export function useMatchOverEvent<TDetail = unknown>({
  canvasRef,
  active,
  onMatchOver,
  onAutoExit,
  autoExitDelayMs = 3000,
  extractDetail,
}: UseMatchOverEventOptions<TDetail>) {
  // ...
}
```

Here:

- `TDetail` is a generic parameter representing the **shape of event details**.
- Callers can let `TDetail` default to `unknown`, or specify it:

```ts
useMatchOverEvent<{ winner: 'east' | 'west' }>({
  canvasRef,
  active: true,
  onMatchOver(detail) {
    // detail: { winner: 'east' | 'west' } | null
  },
  extractDetail(event) {
    // event: Event → return { winner: ... } or null
  },
});
```

Generics let the hook keep strong types **without knowing** the specific event detail structure ahead of time.

---

## 4. Constraining generics with `extends`

Sometimes “any type” is too broad. You want to restrict `T` to types that have certain properties or capabilities.

Use `extends` to add a **constraint**:

```ts
function getId<T extends { id: string | number }>(entity: T) {
  return entity.id;
}

getId({ id: 123, name: 'Alice' }); // ok
getId({ id: 'abc' }); // ok
// getId({ name: 'Bob' });         // error: property 'id' is missing
```

Key points:

- `T extends { id: string | number }` means “T must at least have an `id` property with that type”
- Callers can pass **any type that satisfies this requirement**

### 4.1 Using constraints with React types

In ft_transcendence we use constraints heavily for polymorphic React components.

Example from `apps/frontend/src/pages/pong/shared/components/SurfaceCard.tsx`:

```ts
type SurfaceCardProps<T extends React.ElementType = 'div'> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const SurfaceCard = <T extends React.ElementType = 'div'>(props: SurfaceCardProps<T>) => {
  const { as, className, children, ...rest } = props;
  const Component = (as ?? 'div') as React.ElementType;
  const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;
  return React.createElement(Component, { className: composedClassName, ...rest }, children);
};
```

What this means:

- `T` is constrained: `T extends React.ElementType`
  - So `T` can be `'div'`, `'button'`, `'a'`, or any React component
- `SurfaceCardProps<T>` merges:
  - `as?: T` and some basic props
  - `React.ComponentPropsWithoutRef<T>` for all props of the underlying element/component
  - And then removes `as`, `className`, and `children` from that set with `Omit<...>`

So you get:

- Auto‑complete for all props of the chosen element
- Strong type checking for those props
- A reusable “surface card” wrapper that can render as many different elements

This pattern appears again in `PageContainer<T>` and `PageSection<T>` with slightly different props and class logic.

### 4.2 `extends` with unions and `keyof`

Another common pattern is “this type parameter must be one of the keys of some object”.

```ts
function pluck<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { id: 1, name: 'Alice' };
const id = pluck(user, 'id'); // T={id:number; name:string}, K='id' → id: number
// pluck(user, 'age');          // error: 'age' is not a key of user
```

- `keyof T` produces a union of the keys of `T`.
- `K extends keyof T` guarantees that `key` is a valid key.
- `T[K]` is the type of the corresponding property.

This pattern is heavily used in generic utilities and libraries.

---

## 5. Built‑in generic types

TypeScript’s standard library exposes many generic types. Knowing them saves time and keeps your code consistent with the ecosystem.

### 5.1 Collections and containers

- `Array<T>` – list of `T`
- `ReadonlyArray<T>` – non‑mutable array
- `Map<K, V>` – mapping between keys and values
- `Set<T>` – collection of unique `T`s

Syntax:

```ts
const players: Array<string> = ['alice', 'bob']; // same as string[]
const playersSet: Set<string> = new Set(players);
```

### 5.2 Promise

`Promise<T>` represents “a value of type `T` that will be available later”.

You see this in many async functions across the repo (see the `Asynchronous.md` doc for a deeper dive):

```ts
async function fetchUser(): Promise<User> {
  const res = await fetch('/api/user');
  return res.json();
}
```

`Promise<void>` is common for async functions that don’t return a value:

```ts
export async function clear(id: string): Promise<void> {
  // ...
}
```

### 5.3 Utility types

Some of the most useful built‑in generic utilities:

- `Partial<T>` – all properties of `T` become optional
- `Required<T>` – all properties required
- `Readonly<T>` – all properties read‑only
- `Pick<T, K>` – pick a subset of properties
- `Omit<T, K>` – omit a subset of properties
- `Record<K, V>` – an object with keys of type `K` and values of type `V`

Example: `Omit` in `SurfaceCardProps` (shown above).

Example: using `Record`:

```ts
const scoresByPlayer: Record<string, number> = {
  alice: 3,
  bob: 1,
};
```

These utilities are themselves **generic type aliases** implemented using more advanced features (mapped and conditional types), but you can treat them as tools in your toolbox.

---

## 6. Generic classes

Classes can also be generic:

```ts
class Box<T> {
  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
  }
}

const stringBox = new Box('hello'); // Box<string>
const numBox = new Box(123); // Box<number>
```

The same pattern applies:

- Introduce `<T>` after the class name
- Use `T` for fields, constructor parameters, and methods

Generic classes are useful for data structures, caches, and wrappers around APIs.

---

## 7. Default type parameters

You can give type parameters **default types**, making them optional for users.

```ts
type ResponseData<T = unknown> = {
  ok: boolean;
  data: T;
};

const r1: ResponseData = { ok: true, data: 42 }; // T=unknown
const r2: ResponseData<string> = { ok: true, data: '' }; // T=string
```

We saw this earlier in:

```ts
export function useMatchOverEvent<TDetail = unknown>(/* ... */) {
  /* ... */
}
```

and in the React components:

```ts
type SurfaceCardProps<T extends React.ElementType = 'div'> = {
  /* ... */
};
const SurfaceCard = <T extends React.ElementType = 'div'>(props: SurfaceCardProps<T>) => {
  /* ... */
};
```

Defaults are especially handy when:

- There is a natural or common type to fall back to
- You want advanced users to customize the type, but not force it on everyone

---

## 8. Generics in React components and hooks

React and generics go very well together. They let you write reusable components and hooks with **good type safety**.

We already saw two big patterns in this project:

- **Polymorphic components** – components that can render as different HTML tags or components
- **Typed hooks** – hooks that are parameterized by the data they operate on

### 8.1 Polymorphic components with `as` prop

Example: `PageContainer` in `apps/frontend/src/pages/pong/shared/components/PageContainer.tsx`:

```ts
export type PageContainerProps<T extends React.ElementType = 'div'> = {
  as?: T;
  max?: MaxWidth;
  pad?: Pad;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const PageContainer = <T extends React.ElementType = 'div'>(props: PageContainerProps<T>) => {
  // ...
};
```

Usage:

```tsx
// default: renders as <div>
<PageContainer max="xl">
  {/* content */}
</PageContainer>

// render as <main> with corresponding attributes available
<PageContainer as="main" aria-label="Pong page">
  {/* content */}
</PageContainer>
```

Key ideas:

- `T` represents the underlying element or component type.
- `PageContainerProps<T>` combines its own props with `ComponentPropsWithoutRef<T>`.
- When you choose `as="main"`, TypeScript knows you can pass `main` attributes.

### 8.2 Generic hooks

`useMatchOverEvent<TDetail>` is a generic hook for handling a custom canvas event:

```ts
export function useMatchOverEvent<
  TDetail = unknown,
>({} /* ... */ : UseMatchOverEventOptions<TDetail>) {
  // ...
}
```

This lets different callers plug in different detail shapes:

- One caller might have `TDetail = { winner: 'east' | 'west' }`
- Another might use `TDetail = { reason: 'timeout' | 'disconnect' }`

Yet both share the same implementation and behavior.

---

## 9. Practical tips and pitfalls

### 9.1 When to introduce a generic

Use a generic when:

- You have **the same logic** that should work for **multiple types**
- There is a **clear relationship** between input and output types (e.g., “whatever you pass in, you get out”)
- You want to preserve type safety instead of falling back to `any`

Avoid generics when:

- There is no real type relationship (you’re just guessing)
- A simple union type or overload would be clearer

### 9.2 Naming type parameters

- Single letters (`T`, `U`, `V`) are fine for small, local helpers.
- Longer names (`TDetail`, `TElement`, `TRow`) help readability in exported APIs.
- Be consistent within a module (don’t mix `T` and `Item` for the same concept).

### 9.3 Don’t over‑genericize

It’s possible to overdo it:

- Too many type parameters make declarations hard to read.
- Complex constraints can make error messages confusing.

Prefer:

- A simple, well‑named generic with 1–3 parameters
- Or just a non‑generic type when you only ever use one shape

### 9.4 Beware of `any` inside generics

If you put `any` into a generic, it propagates:

```ts
const badPool: Pool<any> = makePool(
  () => ({ whatever: true }),
  () => {},
  () => {},
);
```

Now methods like `acquire()` return `any`, and you lose type safety.

Use `unknown` if you truly don’t know the type and want to force callers to narrow it, or provide a specific type parameter wherever possible.

---

## 10. Small practice ideas in this repo

Here are some concrete exercises you can try inside this project to get more comfortable with generics:

1. **Add a typed wrapper around `fetch`**
   - Create a helper like `getJson<T>(url: string): Promise<T>`.
   - Use it in one of the frontend code paths to fetch typed data.

2. **Make a typed “result” type**
   - Define `type Result<TData, TError = string> = { ok: true; data: TData } | { ok: false; error: TError };`
   - Use it in a small function that can succeed or fail (for example, parsing a server message).

3. **Write a generic helper for DOM events**
   - Create something like `addTypedListener<T extends Event>(target: EventTarget, type: string, handler: (event: T) => void)`.
   - Experiment with `MouseEvent`, `KeyboardEvent`, etc.

4. **Experiment with `Pool<T>`**
   - Create a pool of simple objects (e.g., `{ id: number }`) using `makePool`.
   - Observe how TypeScript knows that `acquire()` returns `{ id: number } | undefined`.

---

## 11. Summary

- Generics are **type parameters** that let you write reusable, type‑safe code over many concrete types.
- You can use them on **functions**, **type aliases**, **interfaces**, and **classes**.
- `extends` constraints keep generics flexible but safe (“any type that has these properties”).
- The TypeScript standard library is full of generic types: `Array<T>`, `Promise<T>`, `Record<K, V>`, `Omit<T, K>`, etc.
- In ft_transcendence, generics power reusable components (`SurfaceCard<T>`, `PageContainer<T>`), hooks (`useMatchOverEvent<TDetail>`), and utilities (`Pool<T>`).

Once you are comfortable reading and writing generics, a large portion of real‑world TypeScript code becomes much easier to understand and maintain.
