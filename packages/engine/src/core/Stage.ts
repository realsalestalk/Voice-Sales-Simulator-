import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { Tier, type Capabilities } from './Capability';

/**
 * Owns the canvas, renderer, camera and the single RAF loop.
 *
 * Only ever instantiated on Tier 2+. Tier 1 never imports this module, which is
 * what keeps Three.js out of the critical path on mobile.
 */

export interface StageOptions {
  canvas: HTMLCanvasElement;
  capabilities: Capabilities;
}

export type FrameCallback = (elapsed: number, delta: number) => void;

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly capabilities: Capabilities;

  private readonly clock = new Clock();
  private readonly callbacks = new Set<FrameCallback>();
  private rafId = 0;
  private running = false;
  private disposed = false;

  constructor({ canvas, capabilities }: StageOptions) {
    this.capabilities = capabilities;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: capabilities.tier === Tier.FULL,
      alpha: true,
      powerPreference: 'high-performance',
      // The aurora is additive over a dark ground; we never read the buffer back.
      preserveDrawingBuffer: false,
    });
    this.renderer.setClearAlpha(0);

    this.camera = new PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.applySize();
    window.addEventListener('resize', this.handleResize, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  /**
   * Device pixel ratio is capped rather than honored. A 3x phone or 2x retina
   * panel triples fragment cost for a background effect nobody inspects at
   * pixel level -- this is the single highest-leverage perf decision here.
   */
  private applySize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cap = this.capabilities.tier === Tier.FULL ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private handleResize = (): void => {
    this.applySize();
  };

  /** Stop burning GPU and battery the moment the tab is backgrounded. */
  private handleVisibility = (): void => {
    if (document.hidden) {
      this.stop();
    } else if (!this.disposed) {
      this.start();
    }
  };

  onFrame(cb: FrameCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    this.tick();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.clock.stop();
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const delta = Math.min(this.clock.getDelta(), 1 / 30); // clamp after tab stalls
    const elapsed = this.clock.getElapsedTime();

    for (const cb of this.callbacks) cb(elapsed, delta);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.callbacks.clear();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.dispose();
  }
}
