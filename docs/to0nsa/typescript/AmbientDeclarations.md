# Ambient Declarations and Module Augmentation in TypeScript

This mini‑course explains **ambient declarations** and **module augmentation** using the exact patterns from this project.

Goals:

- Understand what `.d.ts` files are and why they exist.
- See how to describe **external modules** (like SVGs, shaders) that have no TypeScript types.
- See how to **extend third‑party libraries** (like Babylon) with extra methods, without forking them.
- Learn how these features affect your own code (imports, autocomplete, type errors).

---

## 1. What are ambient declarations?

An **ambient declaration** is TypeScript’s way of saying:

> “This thing exists at runtime, but its implementation is somewhere else. Here is its _type_.”

You write ambient declarations in:

- `.d.ts` files (declaration files), usually alongside your code.
- `declare module 'some-name' { ... }` blocks for modules.

They contain **only type information**, no runtime code.

Typical uses:

- Describing non‑TS assets (SVG, GLSL shaders, etc.) so you can import them with types.
- Declaring global variables or functions that come from the environment.
- Augmenting (extending) existing modules or classes.

In this project ambient declarations live under:

- `packages/pong/render/src/types/svg-raw.d.ts`
- `packages/pong/render/src/types/babylon.shaders.d.ts`
- `packages/pong/render/src/types/babylon.dynamicTexture.d.ts`

---

## 2. Declaring custom module types (SVGs, shaders)

When you import something like:

```ts
import logoSvg from './logo.svg?raw';
```

TypeScript has no idea what `'.svg?raw'` means by default. Without help, you get an error like “Cannot find module './logo.svg?raw'”.

### 2.1 Declaring raw SVG modules

In `packages/pong/render/src/types/svg-raw.d.ts`:

```ts
declare module '*.svg?raw' {
  const content: string;
  export default content;
}

// Make this file a module (prevents global pollution)
export {};
```

What this says:

- For **any import whose path matches** `*.svg?raw`:
  - There is a default export called `content`.
  - Its type is `string`.
- There is no implementation here; the bundler/loader provides the actual string at runtime.

Result in your code:

```ts
import icon from './icon.svg?raw';

// icon: string
document.body.innerHTML = icon;
```

TypeScript now:

- Lets the import compile.
- Knows that `icon` is a `string`, so you get correct autocomplete and type checking.

### 2.2 Declaring shader modules

Similarly, in `packages/pong/render/src/types/babylon.shaders.d.ts`:

```ts
// packages/pong/render/src/types/babylon.shaders.d.ts
declare module '@babylonjs/core/Shaders/*' {
  const shader: string;
  export default shader;
}

declare module '@babylonjs/core/ShadersInclude/*' {
  const chunk: string;
  export default chunk;
}
```

Here:

- Any import from `@babylonjs/core/Shaders/...` is treated as a module whose default export is a `string`.
- Same for `@babylonjs/core/ShadersInclude/...`.

This matches how Babylon’s shader loader actually works at runtime, but gives you **type safety** in TS:

```ts
import pongFragmentShader from '@babylonjs/core/Shaders/pong.fragment';
// pongFragmentShader: string
```

---

## 3. Module augmentation: extending existing modules

Sometimes a third‑party library does more at runtime than its type definitions claim.

Instead of forking the library or sprinkling `any`, TypeScript lets you **augment** existing modules:

> “Take the module `X` and add more types to it, merging them with whatever’s already declared.”

### 3.1 Extending Babylon’s `DynamicTexture`

In `packages/pong/render/src/types/babylon.dynamicTexture.d.ts`:

```ts
declare module '@babylonjs/core/Materials/Textures/dynamicTexture' {
  // This merges into the instance type of the class exported by Babylon.
  interface DynamicTexture {
    // Babylon actually returns the DOM 2D context under the hood.
    getContext(): CanvasRenderingContext2D;
  }
}
```

What this does:

- Re‑opens the module `@babylonjs/core/Materials/Textures/dynamicTexture`.
- Inside that module, it **merges** this `interface DynamicTexture` with the original `DynamicTexture` type from Babylon.
- The merged `DynamicTexture` now has a `getContext(): CanvasRenderingContext2D` method in your project’s types.

So in your code you can safely write:

```ts
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';

function drawStuff(tex: DynamicTexture) {
  const ctx = tex.getContext(); // ctx: CanvasRenderingContext2D
  ctx.fillRect(0, 0, 10, 10);
}
```

Without the augmentation, TypeScript would complain: “Property `getContext` does not exist on type `DynamicTexture`”, even though Babylon supports it at runtime.

### 3.2 How augmentation works internally

Conceptually:

- TypeScript finds all `declare module 'X'` blocks for the same module name.
- It **merges** their contents:
  - Interfaces with the same name are merged.
  - New exports are added to the module.
- The final, merged description is what your code sees when you `import` from that module.

Key point: module augmentation only affects **types**, not the runtime behavior. The runtime must already support the method you are “adding”; you are just telling TypeScript about it.

---

## 4. Design patterns from this repo

You can reuse these patterns in your own code.

### 4.1 Pattern: “describe asset imports”

Use `declare module 'pattern' { ... }` in a `.d.ts` file to type asset imports that your bundler/loader supports.

Examples:

- `*.svg?raw` → `string`
- `@babylonjs/core/Shaders/*` → `string`
- `@babylonjs/core/ShadersInclude/*` → `string`

You could do the same for:

- `*.png` → `string | SomeImageType`
- `*.glsl` → `string`
- `*.json` → `any` (or a specific schema, if you know it)

This keeps your application code clean:

```ts
import fragmentSrc from './shader.glsl';
// fragmentSrc: string
```

### 4.2 Pattern: “augment a 3rd‑party type with extra methods”

Use `declare module 'lib-name' { interface SomeType { extra(): ... } }` when:

- The library **does** provide a method at runtime.
- The published type definitions **don’t** include it (or are too weak).

Example we use:

- Add `getContext()` to Babylon’s `DynamicTexture`.

You could also:

- Add missing event types to a complex EventEmitter.
- Add helper methods installed by a plugin to a library class.

This lets you keep strong types _and_ keep using upstream library types without forking.

---

## 5. Practical tips

### 5.1 File placement and naming

- Keep `.d.ts` files in a dedicated folder (like `src/types`) and make sure they are included by your `tsconfig.json`.
- Use clear names:
  - `svg-raw.d.ts` for SVG loaders.
  - `babylon.shaders.d.ts` for shader modules.
  - `babylon.dynamicTexture.d.ts` for module augmentation.

### 5.2 Avoid polluting the global scope

If a `.d.ts` file only contains `declare module '...' { ... }` blocks, it’s already a module.  
If you add other top‑level declarations, consider ending with `export {};` (as in `svg-raw.d.ts`) to keep things module‑scoped and avoid accidental globals.

### 5.3 Don’t lie to the type system

Remember: ambient declarations **do not create code**. They just describe what already exists.

- If you declare a method in an augmentation but it doesn’t exist at runtime, your code will compile but fail at runtime.
- Always base your declarations on real runtime behavior (docs, console logs, or checking the actual object).

### 5.4 Start small

When in doubt:

- Begin with minimal declarations (e.g. `any` or simple shapes) just to unblock compilation.
- Gradually refine to more precise types as you better understand the API.

---

## 6. Summary

- **Ambient declarations** (`declare module ...` in `.d.ts` files) let you describe types for things that live outside your TypeScript code: assets, globals, third‑party modules.
- In this project, they are used to:
  - Type raw SVG imports (`*.svg?raw`).
  - Type Babylon shader imports (`@babylonjs/core/Shaders/*`, `@babylonjs/core/ShadersInclude/*`).
  - Augment Babylon’s `DynamicTexture` with a strongly typed `getContext()` method.
- These features keep your **app code clean and type‑safe** without forking dependencies or sprinkling `any` everywhere.

Once you’re comfortable with ambient declarations and module augmentation, you can confidently integrate more build‑time tricks (custom loaders, plugins, runtime extensions) into a strongly typed TypeScript codebase like this one.
