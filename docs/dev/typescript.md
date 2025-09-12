# TypeScript configuration in this monorepo

This document explains how TypeScript is configured and orchestrated across the repository, how the different tsconfig files relate to each other, and what the setup expects from applications and libraries.

- Node version: >= 20.19.0
- TypeScript: ^5.9
- Package manager: pnpm
- ESM everywhere (all packages/apps use "type": "module")

## High-level goals

- Share strict, modern TS defaults across all apps and packages
- Use project references for fast, incremental library builds
- Support both browser (Vite) and Node (Fastify) runtimes
- Resolve internal workspace imports via stable path aliases

## Repository layout relevant to TS

- tsconfig.base.json — shared compiler options and path aliases
- tsconfig.build.json — solution config listing the library packages to build with tsc -b
- apps/
  - backend/ — Node app (Fastify)
    - tsconfig.json — development/runtime typechecking
    - tsconfig.build.json — backend build (emits types; see notes)
  - frontend/ — Vite + React app
    - tsconfig.json — app runtime typechecking
    - .tsconfigs/tsconfig.app.json — focused app config (Vite context)
    - .tsconfigs/tsconfig.node.json — node/tooling config (vite.config.ts)
- packages/pong/
  - shared/ — shared domain types and utilities (foundation lib)
  - game-logic/ — game logic lib
  - render/ — renderer lib
  Each has its own tsconfig.json, and libraries use project references between them.

## Base config: tsconfig.base.json

All projects extend the base config. Key options:

- target: ES2022 and module: ESNext to align with modern ESM
- moduleResolution: bundler, moduleDetection: force, verbatimModuleSyntax: true
  - Optimized for bundlers and ESM: TS won’t rewrite imports/exports, and extension handling follows bundler conventions
- allowImportingTsExtensions: true globally
  - You may import .ts files directly if the environment supports it; see per-package overrides below
- Strictness and safety: strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess, noImplicitOverride, noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedSideEffectImports, forceConsistentCasingInFileNames, skipLibCheck
- Paths (monorepo aliases):
  - @pong/shared points at packages/pong/shared/src
  - @pong/game-logic points at packages/pong/game-logic/src
  - @pong/render points at packages/pong/render/src

What this means:

- Import from @pong/* always resolves to the package’s src/, not its published build
- Consumers (apps, other packages) compile against source, gaining fast feedback and type fidelity

Expectation:

- Each internal package exposes src/index.ts as its primary entry. If you add a new internal lib, add its alias here.
  
## Solution build: tsconfig.build.json

This file orchestrates library builds via project references. It lists the libraries in build order:

- packages/pong/shared
- packages/pong/game-logic
- packages/pong/render

How it works:

- Run pnpm run build:libs (which executes tsc -b -v tsconfig.build.json)
- tsc builds in topological order and caches outputs/increments

Expectation:

- Referenced projects must be composite: true and include correct outDir/rootDir
- If a lib depends on another, add a references entry so TS builds in the right order

## Library packages

Common patterns across packages/pong/*:

- composite: true and incremental: true to participate in tsc -b builds
- Declaration output enabled (declaration, declarationMap) for consumer types
- sourceMap and stripInternal for clean public API maps
- rootDir: src and outDir: dist

Package-specific notes:

- shared
  - The foundational lib; does not enable allowImportingTsExtensions (explicitly sets it to false) to keep import specifiers clean and compatible across environments
  - Emits JS and types to dist by default
- game-logic
  - References shared
  - Configured with emitDeclarationOnly: true (types-only emission)
- render
  - References shared and game-logic
  - Configured with emitDeclarationOnly: true (types-only emission)
  - Also has a Vite build step for browser-facing assets/demos

Important nuance about JS output:

- shared emits JS and types
- game-logic and render are set to emit only .d.ts from tsc
- For app consumption, this is fine because the frontend bundler and dev tooling compile from source under the aliases
- If you need Node-consumable JS in dist for these libs, remove emitDeclarationOnly: true so tsc emits JS, or add a bundling/emit step


## Applications

### Frontend (apps/frontend)

- tsconfig.json extends base and configures browser libs (DOM, DOM.Iterable), JSX (react-jsx), and types (vite/client, vitest, node). It sets noEmit: true; Vite handles emission.
- .tsconfigs/tsconfig.app.json is a focused config for the app runtime (browser) with stricter lint-like checks and isolatedModules; used for typechecking/build contexts that want app-only settings
- .tsconfigs/tsconfig.node.json is a focused config for Node-based tooling like vite.config.ts; it targets ES2023 and limits included files to the config

Expectations:
- Vite handles module bundling; ensure any path alias resolution integrates with Vite (e.g., via vite-tsconfig-paths)
- Typecheck via pnpm -F @app/web typecheck (tsc -b)

### Backend (apps/backend)

- tsconfig.json extends base, but switches to module: NodeNext and moduleResolution: NodeNext for Node runtime
- Designed for dev with tsx (scripts use tsx --tsconfig ./tsconfig.json --watch index.ts); noEmit: true in this config
- tsconfig.build.json switches to noEmit: false and configures outDir: dist, rootDir: . and emit modes appropriate for build; currently set to emit declaration files (emitDeclarationOnly: true)

Expectations:
- For development, tsx compiles and runs directly from TS
- For production JS output, ensure tsc emits JS (remove emitDeclarationOnly: true) or introduce a build step that produces JS in dist. The current build script emits declarations only.


## How the pieces fit together

- Shared defaults live in tsconfig.base.json
- Libraries are built and orchestrated via project references (tsc -b tsconfig.build.json)
  - shared -> game-logic -> render
- Apps import from @pong/* which resolves to the packages’ src using base paths
  - Frontend uses Vite to compile and bundle the TS sources
  - Backend uses tsx in dev and can use tsc for builds


## Commands cheat-sheet

From repository root (package.json):
- Build libraries: pnpm run build:libs
- Build frontend app: pnpm run build:frontend
- Build backend app: pnpm run build:backend
- Build everything for production: pnpm run build:full
- Typecheck all packages/apps: pnpm run typecheck

From individual packages:
- packages/pong/shared: pnpm -F @pong/shared build (tsc -b)
- packages/pong/game-logic: pnpm -F @pong/game-logic build (tsc -b)
- packages/pong/render: pnpm -F @pong/render build (tsc -b && vite build)
- apps/frontend: pnpm -F @app/web typecheck (tsc -b), pnpm -F @app/web build (vite)
- apps/backend: pnpm -F @app/api dev (tsx), pnpm -F @app/api build (tsc -p)


## Adding a new internal library

1) Create the package directory under packages/<scope>/<name>/ with src/index.ts
2) Add tsconfig.json in the new package with at least:
   - extends: ../../../tsconfig.base.json
   - compilerOptions: { composite: true, incremental: true, rootDir: "src", outDir: "dist", declaration: true, declarationMap: true, sourceMap: true, noEmitOnError: true }
3) If it depends on another internal lib, add a references entry: [{ "path": "../that-lib" }]
4) Add its alias in tsconfig.base.json paths so apps can import from @your/new-lib
5) Add the project to tsconfig.build.json references (if you want it built by pnpm run build:libs)
6) Set package.json fields (main, types, exports) to point to dist outputs
7) Run pnpm run build:libs to verify topological build succeeds


## Using the path aliases

- Import shared code with: import { Something } from '@pong/shared'
- For node-specific files/configuration, avoid importing browser-only modules and vice versa
- The shared package forbids .ts extension imports (allowImportingTsExtensions: false) to keep published specifiers clean


## Strictness and ergonomics

- The base config opts into a number of strictness checks. Expect more type errors upfront but better safety overall.
- Apps/libraries can raise strictness further (e.g., noUnusedLocals, noUnusedParameters in the frontend app configs) or relax locally via // @ts-expect-error in exceptional cases.


## Common pitfalls and tips

- Node vs bundler resolution
  - The base config uses moduleResolution: bundler; only override to NodeNext where you target Node (e.g., backend)
- Verbatim module syntax
  - With verbatimModuleSyntax, TS won’t transform imports/exports. Ensure your runtime/bundler can handle the specifiers you write.
- Declaration-only libs
  - If a library needs to run in Node without a bundler, do not set emitDeclarationOnly: true; emit JS as well
- Keep entrypoints stable
  - Each internal lib should have src/index.ts so the path alias mapping remains correct
- Incremental builds
  - tsc -b caches build info; if you see stale outputs, clean with rimraf dist (and optionally remove .tsbuildinfo files) before rebuilding


## What this setup expects

- Node 20+ and TypeScript 5.9+
- Apps rely on a bundler (Vite) for JS emission and path alias resolution
- Internal packages are consumed via source imports under the @pong/* aliases
- Library packages participate in project-references builds (composite + references)


## Reference of tsconfig files

- tsconfig.base.json — shared defaults and path aliases
- tsconfig.build.json — solution references for library builds
- apps/backend/tsconfig.json — dev/runtime typechecking for Node
- apps/backend/tsconfig.build.json — backend build (currently emits declarations)
- apps/frontend/tsconfig.json — app typechecking; Vite handles emit
- apps/frontend/.tsconfigs/tsconfig.app.json — strict app/browser typecheck config
- apps/frontend/.tsconfigs/tsconfig.node.json — node/tooling typecheck config
- packages/pong/shared/tsconfig.json — foundational lib, emits JS + d.ts
- packages/pong/game-logic/tsconfig.json — lib, emits d.ts only (by default)
- packages/pong/render/tsconfig.json — lib, emits d.ts only (by default), plus Vite build for browser assets
