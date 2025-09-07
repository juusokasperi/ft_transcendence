// src/client/visuals/animate-paddle.ts
import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/** One-off tween of mesh.position.z over `ms` milliseconds. */
function animateZTo(
  scene: Scene,
  mesh: AbstractMesh,
  targetZ: number,
  ms = 220,
  name = "centerZ",
): void {
  const frameRate = 60;
  const totalFrames = Math.max(1, Math.round((ms / 1000) * frameRate));

  const anim = new Animation(
    name,
    "position.z",
    frameRate,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
  );

  anim.setKeys([
    { frame: 0, value: mesh.position.z },
    { frame: totalFrames, value: targetZ },
  ]);

  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  anim.setEasingFunction(ease);

  // Replace any previous animation with the same name
  const list = (mesh.animations ||= []);
  mesh.animations = list.filter((a) => a.name !== name);
  mesh.animations.push(anim);

  scene.beginAnimation(mesh, 0, totalFrames, false);
}

/** Convenience: animate to z = 0. */
function animateZToZero(scene: Scene, mesh: AbstractMesh, ms = 220): void {
  animateZTo(scene, mesh, 0, ms, "paddleCenterZ");
}

/** Owns the “center paddles” tween and a simple time window. */
export function createPaddleAnimator(
  scene: Scene,
  left: AbstractMesh,
  right: AbstractMesh,
) {
  let until = 0;

  function cue(ms = 220) {
    animateZToZero(scene, left, ms);
    animateZToZero(scene, right, ms);
    // Give the animation a small grace to fully finish
    until = performance.now() + ms + 20;
    return ms + 20;
  }

  const isAnimating = () => performance.now() < until;

  return { cue, isAnimating };
}
