import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

import { clamp01 } from '@pong/shared';

export interface SpaceBackgroundOptions {
  /** Approx. fraction of pixels that become stars (0.0–1.0). Sensible range: 0.0005–0.01 */
  starDensity?: number;
  /** Multiplier for star brightness */
  starIntensity?: number;
  /** Primary RGB for stars */
  starColor?: Color3;
  /** Secondary RGB for star tint variation */
  starColorSecondary?: Color3;
  /** RGB for “space” */
  backgroundColor?: Color3;
  /** Intensity multiplier for the nebula layer */
  nebulaIntensity?: number;
  /** Controls the scale of the nebula noise */
  nebulaScale?: number;
  /** Primary nebula color */
  nebulaColorA?: Color3;
  /** Secondary nebula color */
  nebulaColorB?: Color3;
  /** Controls the strength of the galactic plane glow */
  galaxyStrength?: number;
  /** Sharpness of the galactic plane falloff */
  galaxySharpness?: number;
  /** Twinkle animation speed multiplier */
  twinkleSpeed?: number;
  /** Diameter of the sky sphere */
  diameter?: number;
}

export function addSpaceBackground(scene: Scene, opts: SpaceBackgroundOptions = {}) {
  const {
    starDensity = 0.0015, // fraction of pixels that become stars
    starIntensity = 1.6, // overall brightness multiplier
    starColor = new Color3(1, 0.96, 0.92), // warm white
    starColorSecondary = new Color3(0.6, 0.78, 1), // slight blue tint
    backgroundColor = new Color3(0.003, 0.003, 0.015), // very dark blue
    nebulaIntensity = 0.45, // controls overall brightness of nebula
    nebulaScale = 2.4, // controls the "size" of nebula features
    nebulaColorA = new Color3(0.22, 0.08, 0.36), // purple
    nebulaColorB = new Color3(0.02, 0.18, 0.38), // dark blue
    galaxyStrength = 0.2, // controls the strength of the galactic plane glow
    galaxySharpness = 4.5, // controls the sharpness of the galactic plane falloff
    twinkleSpeed = 1.2, // twinkle animation speed multiplier
    diameter = 50, // sky sphere diameter
  } = opts;

  // Register shaders (scoped names per Babylon convention)
  if (!Effect.ShadersStore['spaceBgVertexShader']) {
    Effect.ShadersStore['spaceBgVertexShader'] = `
      precision highp float;
      attribute vec3 position;
      uniform mat4 worldViewProjection;
      varying vec3 vDir;

      void main(void) {
        vec3 pos = position;
        vDir = normalize(pos);
        gl_Position = worldViewProjection * vec4(pos, 1.0);
      }
    `;
  }

  if (!Effect.ShadersStore['spaceBgFragmentShader']) {
    Effect.ShadersStore['spaceBgFragmentShader'] = `
      precision highp float;
      varying vec3 vDir;

      uniform vec3 uStarColorA;
      uniform vec3 uStarColorB;
      uniform vec3 uNebulaColorA;
      uniform vec3 uNebulaColorB;
      uniform vec3 uBgColor;
      uniform float uDensity;
      uniform float uIntensity;
      uniform float uNebulaScale;
      uniform float uNebulaIntensity;
      uniform float uGalaxyStrength;
      uniform float uGalaxySharpness;
      uniform float uTime;
      uniform float uTwinkleSpeed;

      float hash31(vec3 p) {
        float h = dot(p, vec3(12.9898, 78.233, 45.164));
        return fract(sin(h) * 43758.5453);
      }

      float valueNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx11 = mix(n011, n111, f.x);

        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);

        return mix(nxy0, nxy1, f.z);
      }

      float fbm(vec3 p) {
        float sum = 0.0;
        float amp = 0.55;
        vec3 shift = vec3(13.1, 7.7, 19.3);
        for (int i = 0; i < 5; ++i) {
          sum += valueNoise(p) * amp;
          p = p * 2.02 + shift;
          amp *= 0.5;
        }
        return sum;
      }

      void main(void) {
        vec3 dir = normalize(vDir);
        vec3 col = uBgColor;

        // Star distribution driven by hash noise on direction
        float baseSeed = hash31(dir * 133.3 + 5.3);
        float starMask = step(1.0 - clamp(uDensity, 0.0, 1.0), baseSeed);
        float starHue = hash31(dir.zxy * 311.7);
        vec3 starColor = mix(uStarColorA, uStarColorB, starHue);

        float intensityVariation = 0.5 + 0.5 * hash31(dir.xyz * 17.0);
        float pulseSeed = hash31(dir * 21.0) * 6.28318;
        float twinkle = 0.5 + 0.5 * sin(uTime * uTwinkleSpeed + pulseSeed);
        float starBrightness = starMask * intensityVariation * twinkle * uIntensity;
        col = mix(col, starColor, starBrightness);

        // Procedural nebula using fractal noise
        float nebulaNoise = fbm(dir * uNebulaScale + vec3(0.0, uTime * 0.05, 0.0));
        nebulaNoise = pow(clamp(nebulaNoise, 0.0, 1.0), 1.6);
        vec3 nebulaColor = mix(uNebulaColorA, uNebulaColorB, nebulaNoise);
        col = mix(col, nebulaColor, nebulaNoise * uNebulaIntensity);

        // Galactic plane glow emphasised near horizon (low |y|)
        float plane = pow(1.0 - abs(dir.y), uGalaxySharpness);
        float planeNoise = 0.7 + 0.3 * hash31(dir.yzx * 51.0);
        col += uGalaxyStrength * plane * planeNoise;

        col = clamp(col, 0.0, 1.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `;
  }

  const material = new ShaderMaterial(
    'spaceBgMat',
    scene,
    { vertex: 'spaceBg', fragment: 'spaceBg' },
    {
      attributes: ['position'],
      uniforms: [
        'worldViewProjection',
        'uStarColorA',
        'uStarColorB',
        'uNebulaColorA',
        'uNebulaColorB',
        'uBgColor',
        'uDensity',
        'uIntensity',
        'uNebulaScale',
        'uNebulaIntensity',
        'uGalaxyStrength',
        'uGalaxySharpness',
        'uTwinkleSpeed',
        'uTime',
      ],
      needAlphaBlending: false,
      needAlphaTesting: false,
    },
  );

  material.backFaceCulling = false;
  material.disableDepthWrite = true;

  material.setColor3('uStarColorA', starColor);
  material.setColor3('uStarColorB', starColorSecondary);
  material.setColor3('uNebulaColorA', nebulaColorA);
  material.setColor3('uNebulaColorB', nebulaColorB);
  material.setColor3('uBgColor', backgroundColor);
  material.setFloat('uDensity', clamp01(starDensity));
  material.setFloat('uIntensity', Math.max(0.0, starIntensity));
  material.setFloat('uNebulaScale', Math.max(0.01, nebulaScale));
  material.setFloat('uNebulaIntensity', Math.max(0.0, nebulaIntensity));
  material.setFloat('uGalaxyStrength', Math.max(0.0, galaxyStrength));
  material.setFloat('uGalaxySharpness', Math.max(0.5, galaxySharpness));
  material.setFloat('uTwinkleSpeed', Math.max(0.0, twinkleSpeed));
  material.setFloat('uTime', 0);

  const sky = MeshBuilder.CreateSphere(
    'spaceSkySphere',
    { diameter, segments: 48, sideOrientation: 1 /* BACKSIDE */ },
    scene,
  );
  sky.material = material;
  sky.isPickable = false;
  sky.infiniteDistance = true; // keep centered on camera
  sky.doNotSyncBoundingInfo = true;

  let elapsed = 0;
  const beforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() * 0.001;
    material.setFloat('uTime', elapsed);
  });

  const dispose = () => {
    if (beforeRenderObserver) {
      scene.onBeforeRenderObservable.remove(beforeRenderObserver);
    }
    sky.dispose(false, true);
    material.dispose(true, true);
  };

  return { sky, material, dispose };
}
