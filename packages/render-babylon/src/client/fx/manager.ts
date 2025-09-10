// src/client/fx/manager.ts
import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { WallSide, TableEnd } from "@shared/domain/ids";

import { createFXContext, type FXContext } from "./context";
import { createForceFieldFX } from "./force-field";
import { createGlowBurstFX } from "./burst";
import { createServeSelectionFX } from "./serve-select";
import { createCameraShakeFX } from "./camera-shake";
import type { FXConfig } from "./config";
import { DEFAULT_FX_CONFIG } from "./config";

export type FXManagerOptions = {
  wallZNorth: number;
  wallZSouth: number;
  ballMesh: AbstractMesh;
  ballRadius: number;
  tableTop: AbstractMesh;
  camera: ArcRotateCamera;
};

export class FXManager {
  private readonly ctx: FXContext;
  private readonly config: FXConfig;

  private forceField: ReturnType<typeof createForceFieldFX>;
  private burst: ReturnType<typeof createGlowBurstFX>;
  private serveSelect: ReturnType<typeof createServeSelectionFX>;
  private camShake: ReturnType<typeof createCameraShakeFX>;

  // --- central tick infra ---
  private readonly _tickers = new Set<(dt: number) => boolean | void>();
  private _tickSub?: Observer<Scene>;
  private _lastTime = 0;
  private readonly _kill: Array<(dt: number) => boolean | void> = [];

  constructor(
    scene: Scene,
    opts: FXManagerOptions,
    config?: Partial<FXConfig>,
  ) {
    this.ctx = createFXContext(scene);
    this.config = { ...DEFAULT_FX_CONFIG, ...(config as FXConfig) };

    // Force-field (pooled hex planes; intensity by speed)
    this.forceField = createForceFieldFX(
      this.ctx,
      opts.wallZNorth,
      opts.wallZSouth,
      opts.ballRadius,
      (fn) => this.addTicker(fn),
      this.config,
    );

    // Burst (pooled; ball-tinted)
    this.burst = createGlowBurstFX(
      this.ctx,
      opts.ballMesh,
      opts.ballRadius,
      (fn) => this.addTicker(fn),
      this.config,
    );

    // Camera shake
    this.camShake = createCameraShakeFX(
      this.ctx,
      opts.camera,
      (fn) => this.addTicker(fn),
      this.config,
    );

    // Serve selection
    this.serveSelect = createServeSelectionFX(
      this.ctx,
      opts.tableTop,
      (fn) => this.addTicker(fn),
      this.config,
    );
  }

  addTicker(fn: (dt: number) => boolean | void): () => void {
    this._tickers.add(fn);
    if (!this._tickSub) {
      const { scene } = this.ctx;
      this._lastTime = performance.now();
      this._tickSub = scene.onBeforeRenderObservable.add(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - this._lastTime) / 1000);
        this._lastTime = now;
        for (const t of this._tickers) if (t(dt) === false) this._kill.push(t);
        if (this._kill.length) {
          for (let i = 0; i < this._kill.length; i++)
            this._tickers.delete(this._kill[i]);
          this._kill.length = 0;
          if (this._tickers.size === 0 && this._tickSub) {
            this.ctx.scene.onBeforeRenderObservable.remove(this._tickSub);
            this._tickSub = undefined;
          }
        }
      });
    }
    return () => {
      this._tickers.delete(fn);
      if (this._tickers.size === 0 && this._tickSub) {
        this.ctx.scene.onBeforeRenderObservable.remove(this._tickSub);
        this._tickSub = undefined;
      }
    };
  }

  // -------- public API --------
  wallPulse(side: WallSide, x: number, y: number, vzAbs?: number): void {
    this.forceField.trigger(side, x, y, vzAbs ?? 0);
  }

  burstAt(x: number, y: number, z: number): void {
    this.burst.trigger(x, y, z);
    // Gentle kick — tuned to scene scale; intensities already gated in the FX.
    this.camShake.trigger(1.0, 320);
  }

  burstAtV3(p: Vector3): void {
    this.burst.trigger(p.x, p.y, p.z);
    this.camShake.trigger(1.0, 320);
  }

  async serveSelection(end: TableEnd): Promise<void> {
    await this.serveSelect.trigger(end);
  }

  dispose(): void {
    if (this._tickSub)
      this.ctx.scene.onBeforeRenderObservable.remove(this._tickSub);
    this._tickSub = undefined;
    this._tickers.clear();
    this.forceField?.dispose?.();
    this.burst?.dispose?.();
    this.serveSelect?.dispose?.();
    this.camShake?.dispose?.();
  }
}
