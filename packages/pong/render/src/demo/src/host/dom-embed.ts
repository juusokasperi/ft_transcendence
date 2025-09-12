// Demo-local DOM bootstrap: load CSS from render, Babylon side-effects,
// then call the app’s factory (local mode only).

import '../../client/ui/tailwind.css';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/boundingBoxRenderer';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Animations/animatable';

export async function bootstrapPong(canvas: HTMLCanvasElement) {
  const { createPongApp } = await import('../../../../../../../apps/frontend/src/game/index.ts');
  const app = await createPongApp({ mode: 'local', canvas });
  app.start();
  return app;
}
