// src/app/index.ts
export type AppMode = "local" | "online" | "tournament";

export type CreateAppOptions = {
  mode: AppMode;
  canvas: HTMLCanvasElement;
};

// Narrow public surface; only orchestrates the right mode.
export async function createPongApp({ mode, canvas }: CreateAppOptions) {
  if (mode === "local") {
    const { createLocalApp } = await import("./modes/local");
    return createLocalApp(canvas);
  }
  // Stubs for future steps:
  if (mode === "online") throw new Error("online mode not implemented yet");
  if (mode === "tournament")
    throw new Error("tournament mode not implemented yet");
  throw new Error(`Unknown mode: ${mode}`);
}
