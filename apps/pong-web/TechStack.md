# Babylon Pong

## Pong Game Tech Stack

This document outlines the core technologies for building the **local (client-only) Pong game** with a focus on their technical roles and integration.

---

### **1. Node.js**

JavaScript runtime built on Chrome's V8 engine. Provides an environment to execute JavaScript outside the browser and grants access to system resources.

**Usage in project:** Required to run build tools (Vite), compile TypeScript, and manage dependencies.

**Learn more:** [https://nodejs.org](https://nodejs.org)

---

### **2. pnpm**

High-performance package manager. Implements content-addressable storage to eliminate redundant package copies across projects and enforces strict dependency resolution.

**Usage in project:** Install, update, and manage dependencies like Babylon.js, TypeScript, and Tailwind CSS with minimal disk usage.

**Learn more:** [https://pnpm.io](https://pnpm.io)

---

### **3. TypeScript**

Typed superset of JavaScript that compiles to plain JavaScript.

**Usage in project:** Static type checking, better IDE support, safer refactoring, and improved maintainability of complex game logic.

**Learn more:** [https://www.typescriptlang.org](https://www.typescriptlang.org)

---

### **4. Babylon.js**

Advanced WebGL-based rendering engine supporting 2D and 3D scenes.

**Usage in project:** Responsible for all rendering, mesh management, materials, and scene graph control for the Pong game.

**Learn more:** [https://www.babylonjs.com](https://www.babylonjs.com)

---

### **5. Tailwind CSS**

Utility-first CSS framework generating styles at build time.

**Usage in project:** Efficiently style UI overlays (scoreboards, menus) with composable utility classes, minimizing custom CSS footprint.

**Learn more:** [https://tailwindcss.com](https://tailwindcss.com)

---

### **6. Vite**

Next-generation frontend tooling with native ES module support and lightning-fast HMR.

**Usage in project:** Provides local development server with hot module replacement, TypeScript transpilation, and optimized production builds.

**Learn more:** [https://vitejs.dev](https://vitejs.dev)

---

### **Integration Flow**

1. **pnpm** fetches all dependencies from the npm registry.
2. **Node.js** runs **Vite** as the development server.
3. **Vite** transpiles **TypeScript** into browser-compatible JavaScript.
4. **Babylon.js** handles real-time rendering in the browser.
5. **Tailwind CSS** styles UI components via utility classes.
