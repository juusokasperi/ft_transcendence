// packages/pong/render/src/client/babylon-register.ts

// (keep your existing imports…)
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/outlineRenderer';

// Add the shader side-effect imports (only what we use)
import '@babylonjs/core/Shaders/standard.vertex';
import '@babylonjs/core/Shaders/standard.fragment';

import '@babylonjs/core/Shaders/shadows.vertex';
import '@babylonjs/core/Shaders/shadows.fragment';

import '@babylonjs/core/Shaders/postprocess.fragment';
import '@babylonjs/core/Shaders/kernelBlur.vertex';
import '@babylonjs/core/Shaders/kernelBlur.fragment';

import '@babylonjs/core/Shaders/glowMapGeneration.vertex';
import '@babylonjs/core/Shaders/glowMapGeneration.fragment';
