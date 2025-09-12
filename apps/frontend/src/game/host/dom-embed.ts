// src/app/host/dom-embed.ts
import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import { createPongApp } from '../index';

export async function bootstrapPong(canvas: HTMLCanvasElement) {
  const app = await createPongApp({ mode: 'local', canvas });
  app.start();
  return app;
}
