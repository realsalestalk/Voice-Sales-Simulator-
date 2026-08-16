import type { Object3D } from 'three';
import type { Stage } from './Stage';

/**
 * A scene module owns one visual section of the page. It is mounted lazily when
 * scroll approaches its range and unmounted when scroll leaves, so only the
 * visible section holds GPU memory.
 */
export interface SceneModule {
  readonly id: string;
  /** Scroll range this module is active over, in normalized page progress. */
  readonly range: [number, number];
  /** Build geometry/materials. Called once, on first approach. */
  mount(stage: Stage): Object3D;
  /**
   * @param local  progress within this module's own range, 0..1
   * @param global progress across the whole page, 0..1
   */
  update(local: number, global: number, elapsed: number, delta: number): void;
  dispose(): void;
}

interface Entry {
  module: SceneModule;
  root: Object3D | null;
}

export class SceneGraph {
  private readonly entries: Entry[] = [];
  /** How far outside its range a module is mounted, to hide construction cost. */
  private readonly preloadMargin = 0.12;

  constructor(private readonly stage: Stage) {}

  register(module: SceneModule): this {
    this.entries.push({ module, root: null });
    return this;
  }

  update(global: number, elapsed: number, delta: number): void {
    for (const entry of this.entries) {
      const [start, end] = entry.module.range;
      const span = end - start || 1;
      const active =
        global >= start - this.preloadMargin && global <= end + this.preloadMargin;

      if (active && !entry.root) {
        entry.root = entry.module.mount(this.stage);
        this.stage.scene.add(entry.root);
      } else if (!active && entry.root) {
        this.stage.scene.remove(entry.root);
        entry.module.dispose();
        entry.root = null;
      }

      if (entry.root) {
        const local = Math.min(Math.max((global - start) / span, 0), 1);
        // Hide the module entirely outside its true range; the margin exists
        // to pay construction cost early, not to render two sections at once.
        entry.root.visible = global >= start && global <= end;
        entry.module.update(local, global, elapsed, delta);
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries) {
      if (entry.root) {
        this.stage.scene.remove(entry.root);
        entry.module.dispose();
        entry.root = null;
      }
    }
    this.entries.length = 0;
  }
}
