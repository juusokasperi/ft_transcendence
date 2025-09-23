// src/app/host/dom-embed.ts
// Install the WebGL shim before Babylon registers/creates contexts.
import './gl-shim';
import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import { createPongApp, type Preferences } from '../index';

export async function bootstrapPong(canvas: HTMLCanvasElement, preferences?: Preferences) {
  const app = await createPongApp({ mode: 'local', canvas, preferences });
  app.start();
  return app;
}
