// packages/pong/render/src/client/babylon-register.ts

// (keep your existing imports…)
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/outlineRenderer';

// Add the shader side-effect imports (only what we use)
// Babylon.js 8 removed the `standard.*` shader pair in favor of `default.*`
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';

// Shadow mapping shaders were renamed from `shadows.*` to `shadowMap.*` in Babylon.js 8
import '@babylonjs/core/Shaders/shadowMap.vertex';
import '@babylonjs/core/Shaders/shadowMap.fragment';

import '@babylonjs/core/Shaders/postprocess.vertex';
import '@babylonjs/core/Shaders/pass.fragment';
import '@babylonjs/core/Shaders/kernelBlur.vertex';
import '@babylonjs/core/Shaders/kernelBlur.fragment';

import '@babylonjs/core/Shaders/glowMapGeneration.vertex';
import '@babylonjs/core/Shaders/glowMapGeneration.fragment';
