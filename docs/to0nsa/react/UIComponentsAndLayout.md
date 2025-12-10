# UI Components & Layout in ft_transcendence

This document explains how the **frontend UI is structured**, with a focus on:

- The Pong layout shell and how pages are framed.
- Shared layout components (`PageContainer`, `PageSection`, `SurfaceCard`).
- How the canvas/game view is embedded (`PlayingView`).
- The navigation bar and sidebar pattern.

Use this as a guide when adding new pages or tweaking existing ones so the look & feel stays consistent.

---

## 1. Pong layout shell (`PongLayout`)

**File:** `apps/frontend/src/pages/pong/PongLayout.tsx`

This is the **outer shell** for all Pong‑related routes.

Structure (simplified):

- A fixed full‑screen wrapper:

  ```tsx
  <div id="pong-shell" className="fixed inset-0 text-white">
    <header>
      <Navbar />
    </header>
    <main className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto">
      <BackgroundVideo ... />
      <section id="page-content" className="relative z-10 min-h-full">
        <Suspense fallback={...}>
          <Outlet />
        </Suspense>
      </section>
    </main>
  </div>
  ```

- Key ideas:
  - `Navbar` is always visible at the top.
  - The `main` area fills the rest of the screen and is scrollable.
  - `BackgroundVideo` renders a fullscreen video behind all Pong pages.
  - `Outlet` renders the actual page (local game, online, tournament, etc.) inside a `Suspense` boundary with a centered spinner fallback using `PageContainer` + `PageSection`.

**When you add a new Pong page** (`/pong/...`):

- You build only the **inner content** (inside `Outlet`), and you typically start with `PageContainer` + `PageSection` + `SurfaceCard` so it fits visually into this shell.

---

## 2. PageContainer – horizontal layout and max width

**File:** `apps/frontend/src/pages/pong/shared/components/PageContainer.tsx`

**Purpose:** Provide a centered, responsive max‑width container with horizontal padding.

API (simplified):

- Props:
  - `max`: `'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl'` (default `'5xl'`).
  - `pad`: `'none' | 'sm' | 'md' | 'lg'` (default `'lg'`).
  - `as`: override element (`div` by default).

**Implementation details:**

- Always applies:
  - `mx-auto w-full` to center and make it responsive.
  - A `max-w-*` class based on `max`.
  - A `px-*` class based on `pad`.

**Usage pattern:**

- Wrap page content once near the top of the route component:

  ```tsx
  <PageContainer max="5xl" pad="lg">
    {/* Sections go here */}
  </PageContainer>
  ```

Use this whenever you want “standard page width” instead of full‑bleed content.

---

## 3. PageSection – vertical spacing between sections

**File:** `apps/frontend/src/pages/pong/shared/components/PageSection.tsx`

**Purpose:** Apply consistent vertical padding for logical sections of a page.

API (simplified):

- Props:
  - `space`: `'sm' | 'md' | 'lg'` (default `'lg'`).
  - `as`: override element (`section` by default).

**Implementation details:**

- Maps `space` to:
  - `py-1`, `py-2`, or `py-3`.

**Usage pattern:**

- Inside a `PageContainer`, wrap major blocks:

  ```tsx
  <PageContainer>
    <PageSection>
      {/* main content */}
    </PageSection>
  </PageContainer>
  ```

- Adjust `space` when you want denser or looser vertical spacing.

---

## 4. SurfaceCard – glassy card background

**File:** `apps/frontend/src/pages/pong/shared/components/SurfaceCard.tsx`

**Purpose:** Provide a reusable “glass” card surface for panels, dialogs, and content boxes.

Base classes:

- `rounded-2xl border border-white/10 bg-white/5 backdrop-blur`

API:

- Props:
  - `as`: element type (default `div`).
  - `className`: extra classes (e.g. sizing, padding, layout).

**Usage pattern:**

- Wrap content you want to float over the background video:

  ```tsx
  <SurfaceCard className="w-full max-w-xl space-y-4 p-6 shadow-2xl">
    {/* form, status, or match UI */}
  </SurfaceCard>
  ```

This keeps Pong panels visually consistent (matchmaking panel, post‑match screen, etc.).

---

## 5. PlayingView – full‑screen game canvas embedding

**File:** `apps/frontend/src/pages/pong/shared/components/PlayingView.tsx`

**Purpose:** Handle **full‑screen game view** behavior for Pong:

- Sizes the canvas to fit the viewport while preserving aspect ratio (based on table dimensions from `@pong/render`).
- Listens to `resize` and `orientationchange` events to recompute size and orientation.
- Focuses the canvas on mount so keyboard input works.
- Handles double‑tap fullscreen enter on mobile and tries to lock orientation to landscape.
- Renders overlays:
  - “Rotate your device” when in portrait on mobile.
  - A quit button that calls `onQuit`.

**Usage pattern:**

- In `OnlineGame.tsx` and local game page:

  ```tsx
  if (state.status === 'starting' || state.status === 'playing') {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }
  ```

You generally don’t need to tweak `PlayingView` unless you’re changing how the game should look/behave full screen; use it as the standard wrapper for game play.

---

## 6. Navbar & sidebar – top navigation

**File:** `apps/frontend/src/components/Navbar.tsx`  
**Context:** `SidebarContext`

**Navbar responsibilities:**

- Show brand/logo and primary navigation links (Home, Pong, etc.).
- Show auth controls:
  - If `user` exists: greeting, Dashboard link, Logout.
  - If not: Login and Create account buttons.
- On mobile:
  - Shows a **menu button** that toggles the sidebar via `SidebarContext`.
  - Renders a slide‑in navigation drawer covering the area below the navbar.

**How it ties into Pong layout:**

- `PongLayout` puts `Navbar` at the top of the fixed shell, so all Pong pages share the same navigation chrome.
- The `top-[var(--navbar-h,80px)]` in `PongLayout`’s `<main>` ensures content starts below the navbar, and mobile sidebar uses that same CSS variable to align correctly.

**When you add new top‑level pages:**

- Add a link to the `baseLinks` array in `Navbar.tsx`.
- Ensure new routes render inside the same layout patterns (`PageContainer`, `PageSection`, cards) so they feel consistent with Pong pages.

---

## 7. General layout guidelines for this app

When creating or modifying React pages in this repo:

- **Use `PongLayout` for `/pong/...` routes**  
  - Don’t re‑implement a background or navbar for Pong pages; rely on the shell.

- **Wrap main page content in `PageContainer` and `PageSection`**  
  - Keeps pages centered with consistent spacing.
  - Makes it easier to adjust global layout later (only these components need changes).

- **Use `SurfaceCard` for primary content blocks**  
  - Panel‑like views (matchmaking, stats, settings) should almost always sit in a card, not directly on the background.

- **Use `PlayingView` for match screens**  
  - Avoid custom canvas layout logic in individual pages; reuse this component so orientation, fullscreen, and overlays behave the same everywhere.

- **Prefer Tailwind utility classes for per‑component layout**  
  - When you need custom spacing or flexbox behavior inside a card/section, use Tailwind classes in the JSX rather than ad‑hoc CSS files, to stay consistent with the rest of the app.

Following these patterns will make new pages and UI changes feel “native” to ft_transcendence without having to re‑invent layout choices each time.

