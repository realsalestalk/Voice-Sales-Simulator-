import { boot, Tier } from '@northline/engine';
import { initLeadForm } from './lead-form';

/**
 * Site entry. Everything here is cheap and synchronous except boot(), which
 * defers the renderer behind a dynamic import.
 */

const TIER_LABELS: Record<number, string> = {
  [Tier.STATIC]: 'Tier 1 — static',
  [Tier.STANDARD]: 'Tier 2 — standard',
  [Tier.FULL]: 'Tier 3 — full',
};

function initTierReadout(tier: number, reason: string): void {
  const el = document.getElementById('tier-readout');
  if (!el) return;
  el.textContent = TIER_LABELS[tier] ?? `Tier ${tier}`;
  el.setAttribute('title', `Selected because: ${reason}`);
}

function initSmoothAnchors(): void {
  // Progressive enhancement only -- href navigation still works without JS.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Keep focus with the target so keyboard users are not stranded.
      (target as HTMLElement).setAttribute('tabindex', '-1');
      (target as HTMLElement).focus({ preventScroll: true });
    });
  }
}

async function main(): Promise<void> {
  initLeadForm();
  initSmoothAnchors();

  const canvas = document.getElementById('stage-canvas') as HTMLCanvasElement | null;
  const poster = document.getElementById('stage-poster');
  if (!canvas) return;

  const { capabilities } = await boot({ canvas, poster });
  initTierReadout(capabilities.tier, capabilities.reason);
}

/*
  Wait for load before touching the renderer at all. This is the mechanism
  behind the LCP rule: the hero has already painted by the time any of the
  Three.js chunk is requested.
*/
if (document.readyState === 'complete') {
  void main();
} else {
  window.addEventListener('load', () => void main(), { once: true });
}
