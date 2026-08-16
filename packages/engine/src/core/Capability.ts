/**
 * Capability detection and render-tier locking.
 *
 * This runs before any WebGL code loads and decides how much work the device
 * is allowed to do. The tier is locked once per session -- we never upgrade
 * mid-scroll, because a renderer swap costs more than the fidelity gains.
 *
 * Tier 1 is not a degraded mode. A large share of real lead traffic renders it
 * (mobile, rural bandwidth, reduced-motion users), so it ships as a designed
 * static experience with no WebGL loaded at all.
 */

export const Tier = {
  /** Static poster + CSS. No WebGL bundle is fetched. */
  STATIC: 1,
  /** WebGL2. Reduced particle counts, no post-processing. */
  STANDARD: 2,
  /** WebGPU-class hardware. Full scene, particles, post FX. */
  FULL: 3,
} as const;

export type TierValue = (typeof Tier)[keyof typeof Tier];

export interface Capabilities {
  tier: TierValue;
  /** True when the user asked the OS to reduce motion. Always forces Tier 1. */
  reducedMotion: boolean;
  /** True when the browser reports a metered/limited connection. */
  saveData: boolean;
  hasWebGL2: boolean;
  hasWebGPU: boolean;
  deviceMemory: number;
  cores: number;
  /** Human-readable reason the tier was chosen. Surfaced in ?debug builds. */
  reason: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function hasSaveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  // 2g/3g in rural Alaska is common enough to treat as a hard Tier 1 signal.
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g';
}

function detectWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function detectWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Coarse pointer + narrow viewport is our mobile proxy. We deliberately do not
 * sniff user agents -- the signal we actually care about is "small screen doing
 * battery-powered work", which these two report honestly.
 */
function isMobileClass(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && window.innerWidth < 1024;
}

export function detectCapabilities(): Capabilities {
  const reducedMotion = prefersReducedMotion();
  const saveData = hasSaveData();
  const hasWebGL2 = detectWebGL2();
  const hasWebGPU = detectWebGPU();
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;

  const base = {
    reducedMotion,
    saveData,
    hasWebGL2,
    hasWebGPU,
    deviceMemory,
    cores,
  };

  // Order matters: each check below is a hard veto, not a score.
  if (reducedMotion) {
    return { ...base, tier: Tier.STATIC, reason: 'prefers-reduced-motion' };
  }
  if (saveData) {
    return { ...base, tier: Tier.STATIC, reason: 'save-data or slow connection' };
  }
  if (!hasWebGL2) {
    return { ...base, tier: Tier.STATIC, reason: 'no WebGL2 support' };
  }
  if (isMobileClass()) {
    return { ...base, tier: Tier.STATIC, reason: 'mobile-class device' };
  }
  if (deviceMemory < 4 || cores < 4) {
    return { ...base, tier: Tier.STATIC, reason: `low resources (${deviceMemory}GB / ${cores} cores)` };
  }
  if (hasWebGPU && deviceMemory >= 8 && cores >= 8) {
    return { ...base, tier: Tier.FULL, reason: 'WebGPU-class hardware' };
  }
  return { ...base, tier: Tier.STANDARD, reason: 'WebGL2 baseline' };
}

/**
 * Allows ?tier=1|2|3 to force a tier for QA and screenshot testing.
 * Never trust this in production logic beyond the override itself.
 */
export function resolveTier(): Capabilities {
  const caps = detectCapabilities();
  if (typeof location === 'undefined') return caps;

  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === '1' || forced === '2' || forced === '3') {
    return {
      ...caps,
      tier: Number(forced) as TierValue,
      reason: `forced via ?tier=${forced}`,
    };
  }
  return caps;
}
