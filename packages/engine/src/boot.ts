import { resolveTier, Tier, type Capabilities } from './core/Capability';

/**
 * The tier boundary. This module must never statically import Three.js -- the
 * heavy renderer is behind dynamic import() so Tier 1 devices never download
 * it, and Tier 2/3 devices only fetch it after the hero has already painted.
 *
 * Keep `Capability.ts` dependency-free for the same reason: it is the only
 * engine code allowed in the critical path.
 */

export interface BootResult {
  capabilities: Capabilities;
  /** Null on Tier 1. */
  teardown: (() => void) | null;
}

export interface BootOptions {
  canvas: HTMLCanvasElement;
  /** Element carrying the static poster, cross-faded out once WebGL is live. */
  poster?: HTMLElement | null;
  colors?: {
    low?: string;
    mid?: string;
    high?: string;
  };
}

export async function boot(options: BootOptions): Promise<BootResult> {
  const capabilities = resolveTier();

  // Expose the tier to CSS so the static path can style itself.
  document.documentElement.dataset.tier = String(capabilities.tier);
  document.documentElement.dataset.tierReason = capabilities.reason;

  if (capabilities.tier === Tier.STATIC) {
    // Tier 1 is complete as-is: the poster and DOM content are the experience.
    return { capabilities, teardown: null };
  }

  const [{ Stage }, { SceneGraph }, { ScrollDirector }, { AuroraScene }] =
    await Promise.all([
      import('./core/Stage'),
      import('./core/SceneGraph'),
      import('./core/ScrollDirector'),
      import('./scenes/Aurora'),
    ]);

  const stage = new Stage({ canvas: options.canvas, capabilities });
  const scroll = new ScrollDirector();
  const graph = new SceneGraph(stage);

  graph.register(
    new AuroraScene({
      colorLow: options.colors?.low,
      colorMid: options.colors?.mid,
      colorHigh: options.colors?.high,
    }),
  );

  let progress = 0;
  const offProgress = scroll.onProgress((p) => {
    progress = p;
  });

  const offFrame = stage.onFrame((elapsed, delta) => {
    graph.update(progress, elapsed, delta);
  });

  stage.start();

  // Cross-fade: the poster stays until we have actually rendered a frame, so a
  // slow GPU init never shows an empty canvas.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      options.canvas.classList.add('is-live');
      options.poster?.classList.add('is-hidden');
    });
  });

  return {
    capabilities,
    teardown: () => {
      offProgress();
      offFrame();
      graph.dispose();
      scroll.dispose();
      stage.dispose();
    },
  };
}
