import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Object3D,
} from 'three';
import { Tier } from '../core/Capability';
import type { Stage } from '../core/Stage';
import type { SceneModule } from '../core/SceneGraph';

/**
 * Aurora borealis hero.
 *
 * Rendered as a single full-screen quad -- the vertex stage bypasses the camera
 * projection entirely, so the effect is resolution-independent and costs one
 * draw call. All motion lives in the fragment shader.
 *
 * The curtains are built from layered fBm: a wavy baseline defines where each
 * curtain hangs from, vertical striations give it the ribbed structure real
 * aurora has, and intensity decays with height so the tops dissolve rather
 * than ending on a hard edge.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // Full-screen quad: ignore model/view/projection entirely.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uProgress;
  uniform float uIntensity;
  uniform vec2  uResolution;
  uniform vec2  uPointer;
  uniform vec3  uColorLow;
  uniform vec3  uColorMid;
  uniform vec3  uColorHigh;
  uniform int   uOctaves;

  // --- noise ---------------------------------------------------------------
  // Hash-based value noise. Cheap, tileable enough for drifting curtains, and
  // written here rather than pulled in so the shader has no license baggage.

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic interpolation -- smoother derivatives than smoothstep, which
    // matters because low-frequency banding is very visible on flat gradients.
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    // Octave count is tier-driven: Tier 3 gets 5, Tier 2 gets 3.
    for (int i = 0; i < 6; i++) {
      if (i >= uOctaves) break;
      sum += amp * valueNoise(p * freq);
      freq *= 2.02;
      amp *= 0.5;
    }
    return sum;
  }

  // --- curtain -------------------------------------------------------------

  float curtain(
    vec2 p, float seed, float speed, float scale,
    float thickness, float cx, float width
  ) {
    float t = uTime * speed;

    // Baseline the curtain hangs from, drifting slowly sideways. Kept low in
    // frame so the curtains rise through the upper two thirds, which is where
    // aurora actually sits relative to a horizon.
    float base = 0.16
      + 0.13 * fbm(vec2(p.x * 0.8 + seed, t * 0.16))
      + 0.04 * sin(p.x * 1.8 + seed * 4.0 + t * 0.35);

    float h = p.y - base;
    if (h < 0.0) return 0.0;

    // Vertical ribs. Scrolling the sample point upward makes light appear to
    // travel along the curtain rather than the curtain itself moving.
    float ribs = fbm(vec2(p.x * scale + seed * 7.0, p.y * 1.2 - t * 0.6));
    // Sharpen into discrete streaks. Raw fbm reads as fog; the banded
    // structure is the whole visual signature of aurora.
    ribs = smoothstep(0.22, 0.72, ribs);

    // Decay with height, plus a soft fade right at the base so curtains do not
    // sit on a visible hard line.
    float falloff = exp(-h * thickness);
    float footFade = smoothstep(0.0, 0.05, h);

    // Horizontal envelope. Without this each curtain spans the full width and
    // the layers stack into an opaque wall -- the gaps between ribbons are
    // what make it read as aurora rather than a gradient.
    float drift = cx + 0.18 * sin(t * 0.22 + seed * 2.0);
    float env = exp(-pow((p.x - drift) / width, 2.0));

    return ribs * falloff * footFade * env;
  }

  void main() {
    // Aspect-correct the sampling space so curtains do not stretch on wide
    // monitors, but keep vUv for the vertical gradient.
    vec2 p = vUv;
    p.x *= uResolution.x / max(uResolution.y, 1.0);

    // Pointer parallax: a slow lean toward the cursor. Subtle on purpose --
    // strong pointer coupling reads as a gimmick within about four seconds.
    p.x += uPointer.x * 0.06;
    p.y += uPointer.y * 0.03;

    // Scroll lifts the curtains out of frame as the hero hands off.
    p.y -= uProgress * 0.45;

    // Aspect-corrected x spans ~0..1.78 on a 16:9 viewport. Centers are biased
    // right so the curtains live opposite the left-aligned headline.
    float a = curtain(p, 0.0, 1.00, 5.5, 1.6, 1.30, 0.34);
    float b = curtain(p, 3.7, 0.72, 9.0, 2.1, 0.85, 0.26);
    float c = curtain(p, 8.2, 1.35, 3.5, 1.3, 1.62, 0.30);

    float density = (a * 0.85 + b * 0.55 + c * 0.60) * 1.35;
    density = min(density, 1.1);
    density *= uIntensity;

    // Height-driven color ramp: green low, cyan through the body, magenta at
    // the dissolving tops -- the ordering real aurora shows.
    float h = clamp((vUv.y - 0.25) / 0.6, 0.0, 1.0);
    vec3 color = mix(uColorLow, uColorMid, smoothstep(0.0, 0.55, h));
    color = mix(color, uColorHigh, smoothstep(0.5, 1.0, h));

    // Faint star field behind the curtains, culled to the upper region.
    float stars = step(0.9985, hash(floor(vUv * uResolution * 0.5)));
    stars *= smoothstep(0.2, 0.7, vUv.y) * (0.6 + 0.4 * sin(uTime * 2.0 + vUv.x * 60.0));

    vec3 finalColor = color * density + vec3(stars) * 0.55;

    // Additive over the page background; alpha carries the curtain density so
    // the dark ground shows through untouched where there is no aurora.
    float alpha = clamp(density * 1.15 + stars * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha * uIntensity);
  }
`;

export interface AuroraOptions {
  range?: [number, number];
  colorLow?: string;
  colorMid?: string;
  colorHigh?: string;
}

export class AuroraScene implements SceneModule {
  readonly id = 'aurora';
  readonly range: [number, number];

  private material: ShaderMaterial | null = null;
  private geometry: PlaneGeometry | null = null;
  private group: Group | null = null;
  private readonly pointer = new Vector2(0, 0);
  private readonly pointerTarget = new Vector2(0, 0);
  private readonly options: Required<AuroraOptions>;

  constructor(options: AuroraOptions = {}) {
    this.options = {
      range: options.range ?? [0, 0.34],
      colorLow: options.colorLow ?? '#1fd98b',
      colorMid: options.colorMid ?? '#37e6ff',
      colorHigh: options.colorHigh ?? '#b06cff',
    };
    this.range = this.options.range;
  }

  mount(stage: Stage): Object3D {
    const { tier } = stage.capabilities;

    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uIntensity: { value: 0 },
        uResolution: {
          value: new Vector2(window.innerWidth, window.innerHeight),
        },
        uPointer: { value: this.pointer },
        uColorLow: { value: new Color(this.options.colorLow) },
        uColorMid: { value: new Color(this.options.colorMid) },
        uColorHigh: { value: new Color(this.options.colorHigh) },
        uOctaves: { value: tier === Tier.FULL ? 5 : 3 },
      },
    });

    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1; // always behind any later scene module

    this.group = new Group();
    this.group.add(mesh);

    window.addEventListener('pointermove', this.handlePointer, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    return this.group;
  }

  private handlePointer = (e: PointerEvent): void => {
    this.pointerTarget.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1),
    );
  };

  private handleResize = (): void => {
    if (!this.material) return;
    (this.material.uniforms.uResolution.value as Vector2).set(
      window.innerWidth,
      window.innerHeight,
    );
  };

  update(local: number, _global: number, elapsed: number, delta: number): void {
    if (!this.material) return;
    const u = this.material.uniforms;

    u.uTime.value = elapsed;
    u.uProgress.value = local;

    // Fade out over the back half of the range so the hero hands off to the
    // next section instead of cutting.
    u.uIntensity.value = 1.0 - smoothstep(0.55, 1.0, local);

    // Critically-damped-ish pointer follow, frame-rate independent.
    const lerp = 1 - Math.exp(-6 * delta);
    this.pointer.lerp(this.pointerTarget, lerp);
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.handlePointer);
    window.removeEventListener('resize', this.handleResize);
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.group = null;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
