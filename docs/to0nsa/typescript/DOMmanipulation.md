# DOM Manipulation in JavaScript and TypeScript

This document is a practical guide to **DOM manipulation**: how to create, find, update, and remove HTML elements with JavaScript/TypeScript. Examples are aligned with how the Pong HUD and overlays work in this project.

TypeScript does not change how the DOM works; it just adds **types** on top of the browser APIs so your editor can help you.

---

## 1. What is the DOM?

The **DOM (Document Object Model)** is a tree representation of an HTML document:

- Each HTML tag is a **node** (`<div>`, `<span>`, `<canvas>`, etc.).
- Nodes are connected in a parent/child hierarchy.
- JavaScript (and TypeScript) can **read and change** this tree at runtime via the `document` and `window` objects.

When you “manipulate the DOM”, you are:

- Creating new elements.
- Inserting/removing them in the tree.
- Changing attributes, classes, styles, and text content.
- Listening for user events (click, keydown, pointer, etc.).

---

## 2. Getting references to DOM elements

To manipulate the DOM, you first need **references** to the elements you care about.

### `document.getElementById`

The simplest way, used in the Pong HUD:

```ts
const existingRoot = document.getElementById('pong-hud-root') as HTMLDivElement | null;
```

From `packages/pong/render/src/client/ui/scoreboard.ts`.

Key points:

- `document.getElementById('pong-hud-root')` returns the element with that `id`, or `null` if it doesn’t exist.
- TypeScript knows the return type is `HTMLElement | null`, so here it’s cast to `HTMLDivElement | null` to get a more specific type.

### `document.querySelector` / `querySelectorAll`

General selectors (CSS-style):

```ts
const root = document.querySelector('.pong-game-root');
const buttons = document.querySelectorAll<HTMLButtonElement>('button.pong-menu');
```

Notes:

- `querySelector` returns the **first** matching element or `null`.
- `querySelectorAll` returns a static `NodeListOf<T>`; you can iterate over it.

TypeScript usage:

- You can pass a generic like `<HTMLButtonElement>` to tell TS what you expect.

---

## 3. Creating and inserting elements

The core primitive is `document.createElement`.

### Example from the Pong scoreboard

```ts
function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}
```

From `packages/pong/render/src/client/ui/scoreboard.ts`.

What this does:

- `document.createElement(tag)` creates a new DOM element (e.g. `'div'`, `'span'`).
- Optional `cls` sets its `className`.
- Optional `html` sets its `innerHTML`.
- The return type `HTMLElementTagNameMap[K]` is TypeScript magic: it means “if you pass `'div'`, you get an `HTMLDivElement`; if you pass `'canvas'`, you get an `HTMLCanvasElement`”, etc.

### Appending elements

Once you create elements, you need to **attach** them to the DOM tree:

```ts
const root = existingRoot ?? createEl('div', 'pong-hud-root');
if (!existingRoot) root.id = 'pong-hud-root';
if (!existingRoot) document.body.appendChild(root);

const overlay = createEl('div', 'pong-hud-overlay');
root.appendChild(overlay);
```

Key methods:

- `parent.appendChild(child)` – add `child` as the last child.
- `parent.insertBefore(newNode, referenceNode)` – insert before a specific child.

If you never append a created element, it is not visible in the page.

---

## 4. Reading and updating content

### Text content

Use `textContent` for plain text:

```ts
names.east.name.textContent = eastName;
names.west.name.textContent = westName;
```

From the scoreboard, setting player names.

Notes:

- `textContent` escapes HTML; it is safe for user-provided text.
- Setting to `''` clears the text.

### HTML content

Use `innerHTML` when you need to insert HTML:

```ts
if (html != null) el.innerHTML = html;
```

From `createEl`. This allows markup inside the element.

Be careful:

- `innerHTML` can execute scripts if you inject untrusted strings.
- Use it mostly for controlled/static HTML, not direct user input.

---

## 5. Classes, attributes, and styles

### CSS classes

Use `className` or `classList` to control classes.

```ts
const slot = makeBox();
if (entry) {
  slot.textContent = String(who === 'east' ? entry.east : entry.west);
  if (entry.winner === who) decorateWinner(slot);
  else slot.classList.add('opacity-80');
}
```

From the scoreboard rendering code.

Common patterns:

- `el.classList.add('some-class')`
- `el.classList.remove('some-class')`
- `el.classList.toggle('some-class')`
- `el.className = 'foo bar'` (replaces all classes)

### Attributes

Use `setAttribute` / `getAttribute` for arbitrary attributes:

```ts
names.east.name.setAttribute('title', eastName);
names.west.name.setAttribute('title', westName);
```

Used to show tooltips with the full name.

### Inline styles

Every element has a `style` object:

```ts
deuce.style.opacity = '0';
wrap.style.transformOrigin = 'top center';
wrap.style.transform = `scale(${scale})`;
overlay.style.left = rect.left + 'px';
overlay.style.top = rect.top + 'px';
overlay.style.width = rect.width + 'px';
overlay.style.height = rect.height + 'px';
```

These examples are from `scoreboard.ts` in the layout/resize logic.

Notes:

- Style properties in JS use **camelCase**: `backgroundColor`, `borderRadius`, `zIndex`, etc.
- Values are strings, usually with units: `'10px'`, `'1.5rem'`, `'0.5'`.
- For most layout, prefer CSS classes; inline styles are useful for dynamic values (like pixel positions).

---

## 6. Layout and resizing with the DOM

The Pong HUD needs to **track the canvas size and position** so the overlay sits correctly on top.

### Reading bounding rectangles

```ts
const rect = boundCanvas.getBoundingClientRect();
overlay.style.left = rect.left + 'px';
overlay.style.top = rect.top + 'px';
overlay.style.width = rect.width + 'px';
overlay.style.height = rect.height + 'px';
```

From `scoreboard.ts`.

`getBoundingClientRect()` returns:

- `left`, `top`, `right`, `bottom` – position relative to the viewport.
- `width`, `height` – size in CSS pixels.

This is how the HUD overlay knows where to position itself.

### Adapting layout to viewport size

```ts
const baselineHeight = 420;
const scale = rect.height < baselineHeight ? rect.height / baselineHeight : 1;
wrap.style.transformOrigin = 'top center';
wrap.style.transform = `scale(${scale})`;
```

This dynamically scales the HUD so it doesn’t cover the table on very short viewports.

---

## 7. Event handling and the DOM

DOM manipulation is often combined with event listeners.

### Global events

From `scoreboard.ts`:

```ts
window.addEventListener('resize', scheduleSync);
window.addEventListener('scroll', scheduleSync, { passive: true });
```

Here:

- `scheduleSync` is a function that recalculates overlay position.
- You attach it to `resize` and `scroll`, so the HUD moves when the page changes.

Later, in `dispose()`:

```ts
window.removeEventListener('resize', scheduleSync);
window.removeEventListener('scroll', scheduleSync);
```

Always remove listeners when a UI component is torn down to avoid leaks.

### Element‑level events

Typical patterns (examples, not direct from the repo):

```ts
button.addEventListener('click', (event) => {
  console.log('Clicked', event.currentTarget);
});

input.addEventListener('input', () => {
  // read input.value and update DOM
});
```

TypeScript advantages:

- `event` and `event.currentTarget` have precise types (`MouseEvent`, `HTMLButtonElement`, etc.).
- Your editor can autocomplete DOM APIs correctly.

---

## 8. Positioning DOM overlays on top of a canvas

The Pong HUD is a good real‑world example of “DOM overlay over a WebGL canvas”.

Key steps:

1. **Find or create a root HUD element**

   ```ts
   const existingRoot = document.getElementById('pong-hud-root') as HTMLDivElement | null;
   const root = existingRoot ?? createEl('div', 'pong-hud-root');
   if (!existingRoot) root.id = 'pong-hud-root';
   if (!existingRoot) document.body.appendChild(root);
   ```

2. **Create an overlay that will track the canvas**

   ```ts
   const overlay = createEl('div', 'pong-hud-overlay');
   root.appendChild(overlay);
   ```

3. **Attach overlay to the correct host (near the canvas)**

   ```ts
   const attachToElement = (el: HTMLElement) => {
     boundCanvas = el;

     const host = el.closest('.pong-game-root') ?? document.body;
     if (root.parentElement !== host) {
       if (root.parentElement) {
         root.parentElement.removeChild(root);
       }
       host.appendChild(root);
     }

     // ...
   };
   ```

4. **Use `ResizeObserver` + `requestAnimationFrame` to keep it in sync**

   ```ts
   let ro: ResizeObserver | null = null;
   let rafId: number | null = null;

   const scheduleSync = () => {
     if (rafId !== null) return;
     rafId = requestAnimationFrame(() => {
       rafId = null;
       syncOverlay();
     });
   };

   ro = new ResizeObserver(() => scheduleSync());
   ro.observe(el);
   ```

5. **In `syncOverlay`, read canvas rect and update overlay styles** (see section 6).

This pattern is very common for HUDs over WebGL/Canvas games.

---

## 9. Cleaning up DOM elements

When a UI component is no longer needed, you should:

- Remove event listeners.
- Stop timers / animation frames.
- Detach DOM elements.

From the scoreboard’s `dispose()`:

```ts
const dispose = () => {
  window.removeEventListener('resize', scheduleSync);
  window.removeEventListener('scroll', scheduleSync);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (msgTimer !== null) {
    clearTimeout(msgTimer);
    msgTimer = null;
  }
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  root.contains(overlay) && root.removeChild(overlay);
  if (!existingRoot && root.parentElement) root.parentElement.removeChild(root);
  boundCanvas = null;
};
```

This ensures:

- No more callbacks are scheduled after teardown.
- HUD elements are removed so they don’t leak or interfere with other games.

---

## 10. DOM + TypeScript: what does TS add?

DOM APIs are defined by the browser, but TypeScript ships with **type definitions** for them:

- `HTMLElement`, `HTMLDivElement`, `HTMLCanvasElement`, etc.
- `Window`, `Document`, `MouseEvent`, `KeyboardEvent`, `PointerEvent`.
- Utility types for generics like `HTMLElementTagNameMap`.

Benefits:

- Autocomplete for properties (`.style`, `.classList`, `.textContent`, etc.).
- Compile‑time errors if you use a property that doesn’t exist on that element type.
- Safer refactoring: renaming methods, changing parameters, etc.

### Example: typed `createEl` helper

```ts
function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}
```

Here, TypeScript ensures:

- If you call `createEl('canvas')`, the result is treated as `HTMLCanvasElement`, so you can access `getContext`.
- If you call `createEl('div')`, the result is an `HTMLDivElement`, with appropriate properties.
