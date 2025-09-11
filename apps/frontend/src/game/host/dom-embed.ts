// src/app/host/dom-embed.ts
import '@client/ui/tailwind.css';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/boundingBoxRenderer';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Animations/animatable';

import { createPongApp } from '../index';

export async function bootstrapPong(canvas: HTMLCanvasElement) {
  const app = await createPongApp({ mode: 'local', canvas });
  app.start();
  return app;
}
