// src/types/babylon.dynamicTexture.d.ts

// Make this file a module (prevents global pollution)
export {};

declare module "@babylonjs/core/Materials/Textures/dynamicTexture" {
  // This merges into the instance type of the class exported by Babylon.
  interface DynamicTexture {
    // Babylon actually returns the DOM 2D context under the hood.
    getContext(): CanvasRenderingContext2D;
  }
}
