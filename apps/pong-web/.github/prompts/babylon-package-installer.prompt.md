---
mode: "agent"
description: "Install Babylon Toolkit Project Files"
---

Your goal is setup and install babylon.js workspace projects

## 📦 External Dependencies

Use Babylon Toolkit and Babylon.js as follows:

### Babylon.js (WEB/CDN)

Include:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/gui/babylon.gui.min.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
<script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>
```

### Babylon Toolkit Runtime (WEB/CDN)

```html
<script src="https://cdn.jsdelivr.net/gh/BabylonJS/BabylonToolkit@master/Runtime/babylon.toolkit.js"></script>
```

### Babylon Toolkit Declarations (WEB/CDN)

- `https://cdn.babylonjs.com/babylon.d.ts`
- `https://cdn.babylonjs.com/gui/babylon.gui.d.ts`
- `https://cdn.babylonjs.com/loaders/babylonjs.loaders.d.ts`
- `https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.d.ts`
- `https://cdn.jsdelivr.net/gh/BabylonJS/BabylonToolkit@master/Runtime/babylon.toolkit.d.ts`

### Node.js Package Guidance

#### UMD

- Default Installation (UMD)

```bash
npm install babylonjs babylonjs-gui babylonjs-loaders babylonjs-materials babylonjs-toolkit
```

- Global Import Side Effects (main.tsx)

```javascript
import "babylonjs";
import "babylonjs-gui";
import "babylonjs-loaders";
import "babylonjs-materials";
import "babylonjs-inspector";
import "babylonjs-toolkit";
```

- TypeScript Configuration Settings (tsconfig.json)

```json
"types": [
    "babylonjs",
    "babylonjs-gui",
    "babylonjs-loaders",
    "babylonjs-gltf2interface",
    "babylonjs-materials",
    "babylonjs-inspector",
    "babylonjs-toolkit"
]
```

Note: This bootstraps the **BABYLON** and **TOOLKIT** libraries and makes the namespaces globally accessible.

#### ES6

- Default Installation (ES6)

```bash
npm install @babylonjs/core @babylonjs/gui @babylonjs/loaders @babylonjs/materials @babylonjs/havok @babylonjs-toolkit/next
```

- Default Module Import Libraries

```javascript
import { Engine, Scene } from "@babylonjs/core";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import { SceneManager, ScriptComponent } from "@babylonjs-toolkit/next";
```

- Granular File Level Import Libraries

```javascript
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import { SceneManager } from "@babylonjs-toolkit/next/scenemanager";
import { ScriptComponent } from "@babylonjs-toolkit/next/scenemanager";
import { LocalMessageBus } from "@babylonjs-toolkit/next/localmessagebus";
import { CharacterController } from "@babylonjs-toolkit/next/charactercontroller";
```

- Legacy Global Namespace Import Libraries

```javascript
import * as BABYLON from "@babylonjs/core/Legacy/legacy";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import * as TOOLKIT from "@babylonjs-toolkit/next";
TOOLKIT.SceneManager.AutoStripNamespacePrefix = false;
```

### Vite Configuration (ES6)

The Vite bundle services behave differently in devmode than production. To preserve some required classes during devmode, these `exclude` and `include` settings are strongly recommended in your vite.config.js settings file.

```json
  optimizeDeps: {
    exclude: mode === 'development' ? [
      "@babylonjs/havok",
      "@babylonjs/core",
      "@babylonjs/loaders",
      "@babylonjs/loaders/glTF",
    ] : ["@babylonjs/havok"],
    include: mode === 'development' ? [
      "@babylonjs/gui",
      "@babylonjs/materials",
      "@babylonjs/inspector",
      "@babylonjs-toolkit/dlc",
      "@babylonjs-toolkit/next"
    ] : [],
  },
```

#### DLC

- Starter Content Package (ES6)

```bash
npm install @babylonjs-toolkit/dlc
```

- Starter Content Import Libraries

```javascript
import { DefaultCameraSystem } from "@babylonjs-toolkit/dlc/starter/DefaultCameraSystem";
import { DebugInformation } from "@babylonjs-toolkit/dlc/starter/DebugInformation";
import { StandardCarController } from "@babylonjs-toolkit/dlc/racing/StandardCarController";
```

### Babylon Toolkit Starter Repositories

- **CDN Starter Assets**: `https://github.com/MackeyK24/CDN-StarterAssets.git`
- **UMD Starter Assets**: `https://github.com/MackeyK24/UMD-StarterAssets.git`
- **ES6 Starter Assets**: `https://github.com/MackeyK24/ES6-StarterAssets.git`

### Babylon Toolkit Project Installation

- Always include the `babylon toolkit` dependency for Babylon.js projects
- Always install the @latest version of Babylon.js and Babylon Toolkit for node.js projects
- Create **standard babylon.js demo scene** that has a light, a free camera, a sphere and a ground (no physics) with default import libraries as `demo` code when creating non cloned projects
- Use **CDN Starter Assets** as the default `starter repo` unless specified otherwise
- Use **ES6** module format for node.js projects unless specified otherwise
- Do **not** write WEB/CDN html script tags for node.js projects
- Do **not** create `babylon toolkit` script components as `starter` code
- Always **detach** and remove `.git` folder after cloning one of the default `starter repos`
- Never **overwrite** the `.github/copilot-instructions.md`

---
