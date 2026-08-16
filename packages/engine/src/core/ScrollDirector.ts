import Lenis from 'lenis';

/**
 * Turns page scroll into a single normalized 0..1 progress value that scene
 * modules read from.
 *
 * Deliberately does NOT hijack scrolling. Lenis smooths the wheel, but native
 * keyboard paging, anchor jumps, find-in-page and screen-reader navigation all
 * still work -- that is a hard requirement, since these sites have to be
 * crawlable and accessible to earn the local rankings they are sold on.
 */

export type ProgressCallback = (progress: number) => void;

export class ScrollDirector {
  private readonly lenis: Lenis;
  private readonly callbacks = new Set<ProgressCallback>();
  private progress = 0;
  private rafId = 0;
  private disposed = false;

  constructor() {
    this.lenis = new Lenis({
      duration: 1.1,
      // Slightly eased, never rubbery. Long durations read as broken scrolling.
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      // Touch smoothing is left off: it fights the OS scroller and is the most
      // common source of "the site feels laggy on my phone" complaints.
      syncTouch: false,
    });

    this.lenis.on('scroll', this.handleScroll);
    this.raf();
  }

  private handleScroll = (e: { scroll: number; limit: number }): void => {
    const limit = e.limit || 1;
    this.progress = Math.min(Math.max(e.scroll / limit, 0), 1);
    for (const cb of this.callbacks) cb(this.progress);
  };

  private raf = (time = 0): void => {
    if (this.disposed) return;
    this.lenis.raf(time);
    this.rafId = requestAnimationFrame(this.raf);
  };

  onProgress(cb: ProgressCallback): () => void {
    this.callbacks.add(cb);
    cb(this.progress);
    return () => this.callbacks.delete(cb);
  }

  getProgress(): number {
    return this.progress;
  }

  scrollTo(target: string | number | HTMLElement): void {
    this.lenis.scrollTo(target, { offset: 0 });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.callbacks.clear();
    this.lenis.destroy();
  }
}
