import '@pong/render/ui/tailwind.css';
import '@pong/render/register';

import { createPongApp } from '../index';

export async function bootstrapOnlinePong(canvas: HTMLCanvasElement) {
  const app = await createPongApp({ mode: 'online', canvas });
  app.start();
  return app;
}