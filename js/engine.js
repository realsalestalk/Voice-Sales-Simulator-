// Survival League decision engine — pure functions, no DOM.
// Simulated market, evidence review (Ava), risk gate, coach decision (Sam),
// decision records, paper backtests and growth-lab comparisons.
import { ASSETS, LIMITS, STRATEGIES, SOURCES, SQUADS, AGENTS, ACCOUNT_SIZE, START_CAPITAL, EVIDENCE_TYPES, agentById } from './data.js';

// ---------- deterministic randomness ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const BARS = 180;
export const SIM_NOW = Date.UTC(2026, 9, 8, 14, 0, 0); // label only; bars are daily, simulated
const DAY = 86400000;
const HOUR = 3600000;

// ---------- simulated market ----------
export function simulateMarket(seed = 99, bars = BARS) {
  const r = rng(seed);
  // market factor with regime changes: up-trend, chop, stress, recovery
  const regimes = [];
  for (let t = 0; t < bars; t++) {
    const phase = t < 55 ? 'trending' : t < 95 ? 'ranging' : t < 115 ? 'stressed' : 'trending';
    regimes.push(phase);
  }
  const mkt = regimes.map(p => {
    const mu = p === 'trending' ? 0.0028 : p === 'ranging' ? 0.0 : -0.006;
    const sd = p === 'stressed' ? 0.034 : p === 'ranging' ? 0.02 : 0.022;
    return mu + sd * gauss(r);
  });
  const series = {};
  for (const a of ASSETS) {
    const close = [], high = [], low = [], open = [], volume = [], funding = [];
    let p = a.start, fund = 0.01;
    const vbase = 1000 + r() * 500;
    for (let t = 0; t < bars; t++) {
      const ret = a.drift + a.beta * mkt[t] + a.idio * gauss(r);
      const o = p;
      p = p * Math.exp(ret);
      const range = Math.abs(ret) + 0.006 + 0.01 * r();
      open.push(o);
      close.push(p);
      high.push(Math.max(o, p) * (1 + range * 0.5 * r()));
      low.push(Math.min(o, p) * (1 - range * 0.5 * r()));
      const vshock = Math.abs(ret) > 0.04 ? 2.2 : 1;
      volume.push(vbase * vshock * (0.7 + 0.6 * r()) * (regimes[t] === 'stressed' ? 1.5 : 1));
      fund = 0.75 * fund + 0.25 * (ret * 3 + 0.012 * gauss(r));
      funding.push(+(fund * 1).toFixed(4)); // in percent units
    }
    series[a.sym] = { close, high, low, open, volume, funding };
  }
  return { bars, regimes, series, seed };
}

// ---------- indicators ----------
export const sma = (arr, n, t) => { if (t < n - 1) return NaN; let s = 0; for (let i = t - n + 1; i <= t; i++) s += arr[i]; return s / n; };
export function stdev(arr, n, t) { const m = sma(arr, n, t); if (isNaN(m)) return NaN; let s = 0; for (let i = t - n + 1; i <= t; i++) s += (arr[i] - m) ** 2; return Math.sqrt(s / n); }
export function rsi(arr, n, t) {
  if (t < n) return NaN; let g = 0, l = 0;
  for (let i = t - n + 1; i <= t; i++) { const d = arr[i] - arr[i - 1]; if (d > 0) g += d; else l -= d; }
  if (l === 0) return 100; const rs = g / l; return 100 - 100 / (1 + rs);
}
export function atr(s, n, t) {
  if (t < n) return NaN; let sum = 0;
  for (let i = t - n + 1; i <= t; i++) sum += Math.max(s.high[i] - s.low[i], Math.abs(s.high[i] - s.close[i - 1]), Math.abs(s.low[i] - s.close[i - 1]));
  return sum / n;
}
const maxOf = (arr, a, b) => { let m = -Infinity; for (let i = a; i <= b; i++) m = Math.max(m, arr[i]); return m; };
const minOf = (arr, a, b) => { let m = Infinity; for (let i = a; i <= b; i++) m = Math.min(m, arr[i]); return m; };
const ret = (arr, n, t) => t >= n ? arr[t] / arr[t - n] - 1 : NaN;

export function returns(arr) { const out = []; for (let i = 1; i < arr.length; i++) out.push(Math.log(arr[i] / arr[i - 1])); return out; }
export function correlation(a, b) {
  const n = Math.min(a.length, b.length); let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
}
export function correlationMatrix(market, lookback = 90) {
  const syms = ASSETS.map(a => a.sym);
  const rets = Object.fromEntries(syms.map(s => [s, returns(market.series[s].close).slice(-lookback)]));
  const m = {};
  for (const a of syms) { m[a] = {}; for (const b of syms) m[a][b] = a === b ? 1 : correlation(rets[a], rets[b]); }
  return { syms, m };
}
// Single-link clusters at the threshold. Assets correlated above it share a cluster.
export function clusters(corr, threshold = LIMITS.combined.correlationThreshold) {
  const parent = Object.fromEntries(corr.syms.map(s => [s, s]));
  const find = s => parent[s] === s ? s : (parent[s] = find(parent[s]));
  for (const a of corr.syms) for (const b of corr.syms) if (a < b && corr.m[a][b] >= threshold) parent[find(a)] = find(b);
  const groups = {};
  for (const s of corr.syms) (groups[find(s)] ||= []).push(s);
  const list = Object.values(groups).sort((x, y) => y.length - x.length);
  const of = {};
  list.forEach((g, i) => g.forEach(s => (of[s] = i)));
  return { list, of };
}

// ---------- strategy signals ----------
// Each returns { signal: bool, why: string, stop: number|null } for asset at bar t.
export function strategySignal(key, market, sym, t, params = {}) {
  const s = market.series[sym], c = s.close, p = c[t];
  const A = atr(s, 14, t);
  switch (key) {
    case 'trend': {
      const f = params.fast || 20, sl = params.slow || 50;
      const a = sma(c, f, t), b = sma(c, sl, t);
      return { signal: a > b && p > a, stop: p - 2 * A, why: `${f}-bar avg ${fmtP(a)} vs ${sl}-bar avg ${fmtP(b)}; close ${fmtP(p)}` };
    }
    case 'breakout': {
      const hi = maxOf(c, Math.max(0, t - 20), t - 1);
      const vm = params.volMult ?? 1.5;
      const vavg = sma(s.volume, 20, t - 1);
      const volOk = s.volume[t] >= vm * vavg;
      return { signal: p > hi && (vm === 0 || volOk), priceOnly: p > hi, volOk, stop: hi - A, why: `close ${fmtP(p)} vs 20-bar high ${fmtP(hi)}; volume ${(s.volume[t] / vavg).toFixed(2)}× avg` };
    }
    case 'reversion': {
      const th = params.rsi || 35; const r = rsi(c, 14, t), long = sma(c, 100, t);
      return { signal: r < th && p > long, stop: p - 1.5 * A, why: `RSI ${r.toFixed(1)} (threshold ${th}); 100-bar avg ${fmtP(long)}` };
    }
    case 'bands': {
      const m = sma(c, 20, t), sd = stdev(c, 20, t), m1 = sma(c, 20, t - 1), sd1 = stdev(c, 20, t - 1);
      const lower = m - 2 * sd, lower1 = m1 - 2 * sd1;
      return { signal: c[t - 1] < lower1 && p > lower, stop: minOf(s.low, t - 4, t), why: `lower band ${fmtP(lower)}; prev close ${fmtP(c[t - 1])}` };
    }
    case 'rotation': {
      const rb = ret(c, 30, t) - ret(market.series.BTC.close, 30, t);
      return { signal: ret(c, 30, t) > 0 && rb > 0, rel: rb, stop: p * 0.9, why: `30-bar return ${(ret(c, 30, t) * 100).toFixed(1)}%, vs BTC ${(rb * 100).toFixed(1)}%` };
    }
    case 'pullback': {
      const a20 = sma(c, 20, t), rising = sma(c, 50, t) > sma(c, 50, t - 5);
      const three = c[t] < c[t - 1] && c[t - 1] < c[t - 2];
      return { signal: rising && three && Math.abs(p / a20 - 1) < 0.02 + (params.band || 0), stop: a20 - A, why: `50-bar avg ${rising ? 'rising' : 'flat/falling'}; 2 down bars: ${three ? 'yes' : 'no'}; distance to 20-avg ${((p / a20 - 1) * 100).toFixed(1)}%` };
    }
    case 'funding': {
      const f = s.funding; const th = params.funding ?? -0.02;
      const crowded = f[t] < th && f[t - 1] < th;
      const hl = minOf(s.low, t - 1, t) > minOf(s.low, t - 6, t - 2);
      return { signal: crowded && hl, stop: minOf(s.low, t - 8, t), why: `funding ${f[t].toFixed(3)}% (2-bar < ${th}%: ${crowded ? 'yes' : 'no'}); higher low: ${hl ? 'yes' : 'no'}` };
    }
    case 'squeeze': {
      const bw = i => (4 * stdev(c, 20, i)) / sma(c, 20, i);
      let minbw = Infinity; for (let i = t - 60; i < t; i++) if (i > 20) minbw = Math.min(minbw, bw(i));
      const upper = sma(c, 20, t) + 2 * stdev(c, 20, t);
      const vOk = s.volume[t] >= 1.2 * sma(s.volume, 20, t - 1);
      let recent = false; for (let i = t - 5; i < t; i++) if (bw(i) <= minbw * 1.15) recent = true;
      return { signal: recent && p > upper && vOk, stop: sma(c, 20, t), why: `band width ${(bw(t) * 100).toFixed(1)}% (60-bar low ${(minbw * 100).toFixed(1)}%)` };
    }
    case 'dca': return { signal: t % 7 === 0, stop: null, why: `scheduled buy every 7 bars` };
    case 'catalyst': return { signal: false, stop: p * 0.95, why: 'needs an independently confirmed catalyst' };
  }
  return { signal: false, stop: null, why: '' };
}
export const fmtP = v => !isFinite(v) ? '—' : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v.toFixed(4);

// Home assets for single-asset strategies.
export const HOME_ASSET = { trend: 'BTC', breakout: 'SOL', reversion: 'ETH', bands: 'ETH', pullback: 'ETH', funding: 'SOL', squeeze: 'AVAX', dca: 'BTC', catalyst: 'LINK' };

// ---------- evidence ----------
export function rootOf(sourceId) {
  const seen = new Set(); let id = sourceId;
  while (SOURCES[id] && !SOURCES[id].root && SOURCES[id].cites && !seen.has(id)) { seen.add(id); id = SOURCES[id].cites; }
  return id;
}
export function chainOf(sourceId) {
  const chain = [sourceId]; let id = sourceId; const seen = new Set([id]);
  while (SOURCES[id] && !SOURCES[id].root && SOURCES[id].cites && !seen.has(SOURCES[id].cites)) { id = SOURCES[id].cites; chain.push(id); seen.add(id); }
  return chain;
}
const MAX_AGE = { PRICE_SIGNAL: 6 * HOUR, VOLUME_CONFIRM: 6 * HOUR, REGIME: 24 * HOUR, VOLATILITY: 24 * HOUR, LIQUIDITY: 6 * HOUR, FUNDING: 12 * HOUR, CATALYST: 24 * HOUR, STOP_PLAN: Infinity, BUDGET_CAP: Infinity };
export { MAX_AGE };

// Group claims about the same proposition and count independent original sources.
export function independence(claims) {
  const roots = new Map();
  for (const c of claims) { const r = rootOf(c.source); if (!roots.has(r)) roots.set(r, []); roots.get(r).push(c); }
  return { copies: claims.length, independent: roots.size, roots: [...roots.keys()] };
}

// Ava reviews ONE squad's proposal using only shared observations and that squad's notes.
export function avaReview(proposal, claims, now = SIM_NOW) {
  const strat = STRATEGIES[proposal.strategy];
  const checks = [];
  const usable = [];
  const ignored = [];
  for (const id of proposal.evidence) {
    const c = claims.find(x => x.id === id);
    if (!c) continue;
    if (c.scope !== 'shared' && c.scope !== proposal.squad) { ignored.push({ claim: c, reason: 'Belongs to another squad — research opinions do not cross teams.' }); continue; }
    usable.push(c);
  }
  const missing = [];
  const insufficient = [];
  for (const type of strat.evidence) {
    const of = usable.filter(c => c.type === type);
    const fresh = of.filter(c => now - c.observedAt <= MAX_AGE[type]);
    const label = EVIDENCE_TYPES[type].label;
    if (!of.length) { missing.push(type); checks.push({ type, label, status: 'missing', detail: 'Required item not provided.' }); continue; }
    if (!fresh.length) { insufficient.push(type); checks.push({ type, label, status: 'stale', detail: `Latest item is ${ageText(now - Math.max(...of.map(c => c.observedAt)))} old (limit ${ageText(MAX_AGE[type])}).` }); continue; }
    if (type === 'CATALYST') {
      const ind = independence(fresh);
      if (ind.independent < 2) {
        insufficient.push(type);
        checks.push({ type, label, status: 'echo', detail: `${ind.copies} report${ind.copies > 1 ? 's' : ''} but only ${ind.independent} independent original source (${ind.roots.map(r => SOURCES[r]?.name || r).join(', ')}). Copies are not confirmation.` , independence: ind });
        continue;
      }
      checks.push({ type, label, status: 'ok', detail: `${ind.independent} independent original sources.`, independence: ind });
      continue;
    }
    checks.push({ type, label, status: 'ok', detail: fresh[0].text });
  }
  // shared dependencies among used claims
  const deps = {};
  for (const c of usable) { const d = SOURCES[c.source]?.dependsOn; if (d) (deps[d] ||= []).push(c); }
  const notes = [];
  for (const [d, cs] of Object.entries(deps)) if (cs.length > 1) notes.push(`${cs.map(c => EVIDENCE_TYPES[c.type].label).join(' and ')} share one dependency (${d}). Treated as one input, not two confirmations.`);
  if (proposal.peerAgreement) notes.push(`Other squads reportedly agree. Agreement is not evidence and is not counted.`);
  if (proposal.peerDisagreement) notes.push(`Another squad disagrees. Disagreement alone does not invalidate a proposal whose evidence is complete.`);
  for (const ig of ignored) notes.push(`Ignored “${ig.claim.text}”: ${ig.reason}`);
  const verdict = missing.length ? 'blocked' : insufficient.length ? 'insufficient' : 'sufficient';
  return { verdict, checks, missing, insufficient, notes, reviewer: 'ava', squad: proposal.squad };
}
export function ageText(ms) {
  if (!isFinite(ms)) return 'no limit';
  const h = ms / HOUR; return h < 1 ? `${Math.round(ms / 60000)} min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

// ---------- risk gate ----------
// portfolio: [{ bot, asset, usd }] open paper positions.
export function riskCheck(proposal, portfolio, clusterInfo) {
  const L = LIMITS, acct = ACCOUNT_SIZE, total = START_CAPITAL;
  const checks = [];
  let size = proposal.sizeUsd;
  const cid = clusterInfo.of[proposal.asset];
  const members = clusterInfo.list[cid] || [proposal.asset];
  // individual
  const maxPos = L.individual.maxPositionPct * acct;
  if (size > maxPos) { checks.push({ scope: 'individual', label: 'Position size', limit: `≤ $${maxPos}`, detail: `$${size} requested → trimmed to $${maxPos}`, status: 'trimmed' }); size = maxPos; }
  else checks.push({ scope: 'individual', label: 'Position size', limit: `≤ $${maxPos}`, detail: `$${size} requested`, status: 'ok' });
  if (proposal.strategy !== 'dca') {
    if (!proposal.stop) { checks.push({ scope: 'individual', label: 'Stop required', limit: 'stop price', detail: 'No stop provided', status: 'blocked' }); return finish(); }
    const dist = Math.abs(proposal.entry - proposal.stop) / proposal.entry;
    const maxRisk = L.individual.maxRiskPct * acct;
    const riskUsd = size * dist;
    if (riskUsd > maxRisk + 1e-9) {
      const ns = Math.floor((maxRisk / dist) * 100 + 1e-6) / 100;
      checks.push({ scope: 'individual', label: 'Loss at stop', limit: `≤ $${maxRisk.toFixed(2)}`, detail: `$${riskUsd.toFixed(2)} at a ${(dist * 100).toFixed(1)}% stop → size trimmed to $${ns.toFixed(2)}`, status: 'trimmed' });
      size = ns;
    } else checks.push({ scope: 'individual', label: 'Loss at stop', limit: `≤ $${maxRisk.toFixed(2)}`, detail: `$${riskUsd.toFixed(2)} at a ${(dist * 100).toFixed(1)}% stop`, status: 'ok' });
  } else {
    const allocated = portfolio.filter(p => p.bot === proposal.bot).reduce((s, p) => s + p.usd, 0);
    const ok = allocated + size <= 30;
    checks.push({ scope: 'individual', label: 'Budget cap', limit: '≤ $30 allocated', detail: `$${allocated} allocated + $${size}`, status: ok ? 'ok' : 'blocked' });
    if (!ok) return finish();
  }
  const open = portfolio.filter(p => p.bot === proposal.bot).length;
  if (open >= L.individual.maxOpenPositions && proposal.strategy !== 'dca') { checks.push({ scope: 'individual', label: 'Open positions', limit: `≤ ${L.individual.maxOpenPositions}`, detail: `${open} already open`, status: 'blocked' }); return finish(); }
  checks.push({ scope: 'individual', label: 'Open positions', limit: `≤ ${L.individual.maxOpenPositions}`, detail: `${open} open`, status: 'ok' });

  // combined
  const clusterExp = portfolio.filter(p => members.includes(p.asset)).reduce((s, p) => s + p.usd, 0);
  const gross = portfolio.reduce((s, p) => s + p.usd, 0);
  const same = portfolio.filter(p => p.asset === proposal.asset).reduce((s, p) => s + p.usd, 0);
  const caps = [
    { label: `Correlated cluster (${members.join(' · ')})`, cap: L.combined.clusterCapPct * total, used: clusterExp },
    { label: 'Total open exposure', cap: L.combined.grossCapPct * total, used: gross },
    { label: `Same asset (${proposal.asset})`, cap: L.combined.sameAssetCapPct * total, used: same },
  ];
  for (const c of caps) {
    const room = Math.max(0, c.cap - c.used);
    if (size <= room + 1e-9) { checks.push({ scope: 'combined', label: c.label, limit: `≤ $${c.cap}`, used: c.used, cap: c.cap, add: size, detail: `$${c.used} open + $${size.toFixed(2)} = $${(c.used + size).toFixed(2)}`, status: 'ok' }); continue; }
    if (room >= L.combined.minTradeUsd) {
      checks.push({ scope: 'combined', label: c.label, limit: `≤ $${c.cap}`, used: c.used, cap: c.cap, add: room, detail: `$${c.used} already open; only $${room.toFixed(2)} of room → trimmed`, status: 'trimmed' });
      size = room;
    } else {
      checks.push({ scope: 'combined', label: c.label, limit: `≤ $${c.cap}`, used: c.used, cap: c.cap, add: 0, detail: `$${c.used} already open; $${room.toFixed(2)} room is below the $${L.combined.minTradeUsd} minimum`, status: 'blocked' });
      return finish();
    }
  }
  return finish();
  function finish() {
    const blocked = checks.some(c => c.status === 'blocked');
    const trimmed = checks.some(c => c.status === 'trimmed');
    return { checks, finalSize: blocked ? 0 : Math.round(size * 100) / 100, status: blocked ? 'blocked' : trimmed ? 'trimmed' : 'ok', cluster: members };
  }
}

// ---------- coach decision ----------
export function coachDecision(proposal, ava, risk) {
  if (ava.verdict === 'blocked') return { decision: 'blocked', rationale: `Blocked: missing required evidence (${ava.missing.map(m => EVIDENCE_TYPES[m].label).join(', ')}). No one — including Sam — can override a missing item. ${agentById[proposal.bot].name} can resubmit with it.` };
  if (ava.verdict === 'insufficient') return { decision: 'declined', rationale: `Declined: evidence present but not sufficient (${ava.insufficient.map(m => EVIDENCE_TYPES[m].label).join(', ')}). Repeated copies of one claim do not count as independent confirmation.` };
  if (risk.status === 'blocked') return { decision: 'declined', rationale: `Declined by limits: ${risk.checks.filter(c => c.status === 'blocked').map(c => c.label).join(', ')}. The idea may be fine; the combined book cannot take more of this risk.` };
  if (risk.status === 'trimmed') return { decision: 'trimmed', rationale: `Approved on paper at a reduced $${risk.finalSize.toFixed(2)} because ${risk.checks.filter(c => c.status === 'trimmed').map(c => c.label.toLowerCase()).join(' and ')} would otherwise be exceeded.` };
  return { decision: 'approved', rationale: `Approved on paper at $${risk.finalSize.toFixed(2)}. Every required item is present, fresh and traceable; all individual and combined limits hold.` };
}

let recSeq = 1000;
export function decisionRecord(proposal, ava, risk, coach, at = SIM_NOW) {
  return {
    id: `DR-${++recSeq}`,
    at,
    squad: proposal.squad,
    bot: proposal.bot,
    asset: proposal.asset,
    side: 'long',
    requested: proposal.sizeUsd,
    final: coach.decision === 'approved' || coach.decision === 'trimmed' ? risk.finalSize : 0,
    entry: proposal.entry,
    stop: proposal.stop,
    ava: { verdict: ava.verdict, checks: ava.checks, notes: ava.notes },
    risk: { status: risk.status, checks: risk.checks },
    decision: coach.decision,
    rationale: coach.rationale,
    scenario: proposal.scenario || null,
    paper: true,
  };
}

// ---------- registry & scenarios ----------
export function buildRegistry(market) {
  const t = market.bars - 1;
  const s = market.series;
  const regime = market.regimes[t];
  const ago = h => SIM_NOW - h * HOUR;
  const claims = [
    { id: 'c-regime', type: 'REGIME', scope: 'shared', source: 'regime', observedAt: ago(2), text: `Broad market regime: ${regime} (shared regime monitor).` },
    { id: 'c-btc-trend', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'BTC', text: `BTC ${strategySignal('trend', market, 'BTC', t).why}.` },
    { id: 'c-sol-break', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'SOL', text: `SOL closed above its 20-bar high.` },
    { id: 'c-eth-px', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'ETH', text: `ETH pulled back three bars to its 20-bar average.` },
    { id: 'c-sol-rs', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'SOL', text: `SOL leads BTC on 30-bar relative return.` },
    { id: 'c-eth-band', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'ETH', text: `ETH closed back inside its lower band.` },
    { id: 'c-eth-vol', type: 'VOLATILITY', scope: 'shared', source: 'feed', observedAt: ago(3), asset: 'ETH', text: `ETH band width 9.4%, ATR(14) ${fmtP(atr(s.ETH, 14, t))}.` },
    { id: 'c-sol-liq', type: 'LIQUIDITY', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'SOL', text: `SOL simulated spread 0.04%, depth ample for $25.` },
    { id: 'c-sol-volume', type: 'VOLUME_CONFIRM', scope: 'shared', source: 'feedVol', observedAt: ago(30), asset: 'SOL', text: `SOL volume 1.1× its 20-bar average (yesterday's bar).` },
    { id: 'c-sol-fund', type: 'FUNDING', scope: 'shared', source: 'feedFund', observedAt: ago(2), asset: 'SOL', text: `SOL funding −0.041% for 3 bars.` },
    { id: 'c-link-px', type: 'PRICE_SIGNAL', scope: 'shared', source: 'feed', observedAt: ago(1), asset: 'LINK', text: `LINK closed above the prior day high.` },
    // Echo chain: four reports, one original source
    { id: 'c-link-x', type: 'CATALYST', scope: 'shared', source: 'postX', observedAt: ago(9), asset: 'LINK', text: `Post: “Big exchange partnership coming for LINK.”` },
    { id: 'c-link-a', type: 'CATALYST', scope: 'shared', source: 'blogA', observedAt: ago(8), asset: 'LINK', text: `CryptoDaily Wire repeats the partnership rumor (cites the post).` },
    { id: 'c-link-b', type: 'CATALYST', scope: 'shared', source: 'blogB', observedAt: ago(7), asset: 'LINK', text: `Token Times repeats the rumor (cites the post).` },
    { id: 'c-link-c', type: 'CATALYST', scope: 'shared', source: 'blogC', observedAt: ago(5), asset: 'LINK', text: `Newsletter repeats CryptoDaily Wire.` },
    // Independent pair (for contrast)
    { id: 'c-avax-gov', type: 'CATALYST', scope: 'shared', source: 'filing', observedAt: ago(10), asset: 'AVAX', text: `Governance forum: upgrade vote passed.` },
    { id: 'c-avax-ex', type: 'CATALYST', scope: 'shared', source: 'exchNote', observedAt: ago(6), asset: 'AVAX', text: `Exchange notice: upgrade support scheduled.` },
    // Stale example
    { id: 'c-btc-old', type: 'REGIME', scope: 'shared', source: 'regime', observedAt: ago(70), text: `Regime snapshot from three days ago.` },
    // Team-only research notes
    { id: 'n-atlas-1', type: 'NOTE', scope: 'atlas', source: 'notebook', observedAt: ago(2), text: 'Alex: BTC trend intact; Maya should wait for volume on SOL.' },
    { id: 'n-tide-1', type: 'NOTE', scope: 'tide', source: 'notebook', observedAt: ago(4), text: 'Emma: ETH stretched to the lower band; long trend still up.' },
    { id: 'n-compass-1', type: 'NOTE', scope: 'compass', source: 'notebook', observedAt: ago(3), text: 'Jack: SOL leads on relative strength; ETH pullback looks orderly.' },
    { id: 'n-lantern-1', type: 'NOTE', scope: 'lantern', source: 'notebook', observedAt: ago(5), text: 'Olivia: SOL funding deeply negative — crowd is short.' },
    { id: 'n-harbor-1', type: 'NOTE', scope: 'harbor', source: 'notebook', observedAt: ago(6), text: 'Lily: LINK rumor traced to one post. Do not count the reposts.' },
    { id: 'stop-generic', type: 'STOP_PLAN', scope: 'shared', source: 'notebook', observedAt: ago(0.5), text: 'Stop price written into the proposal.' },
  ];
  return claims;
}

export function currentPrices(market) { const t = market.bars - 1; return Object.fromEntries(ASSETS.map(a => [a.sym, market.series[a.sym].close[t]])); }

export function scenarios(market) {
  const px = currentPrices(market);
  const mk = (o) => ({ ...o, squad: agentById[o.bot].squad, strategy: agentById[o.bot].strategy, entry: px[o.asset] });
  return [
    {
      id: 'valid', title: 'A valid proposal', blurb: 'Ben (Atlas) proposes a BTC trend trade with every required item.',
      portfolio: [],
      proposal: mk({ bot: 'ben', asset: 'BTC', sizeUsd: 20, stop: px.BTC * 0.96, evidence: ['c-btc-trend', 'c-regime', 'stop-generic'], scenario: 'valid' }),
      observation: 'Shared feed: BTC 20-bar average above 50-bar average; regime monitor reports the market regime.',
      note: { scope: 'atlas', text: 'Alex → Ben: “BTC trend intact. Size modestly; stop below 2×ATR.”' },
    },
    {
      id: 'missing', title: 'Missing evidence', blurb: 'Maya (Atlas) proposes a SOL breakout but has no fresh volume confirmation.',
      portfolio: [],
      proposal: mk({ bot: 'maya', asset: 'SOL', sizeUsd: 25, stop: px.SOL * 0.95, evidence: ['c-sol-break', 'stop-generic'], scenario: 'missing' }),
      observation: 'Shared feed: SOL closed above its 20-bar high. Volume today is not yet confirmed.',
      note: { scope: 'atlas', text: 'Alex → Maya: “Breakout printed. Volume is the deciding item — check it.”' },
    },
    {
      id: 'echo', title: 'Echoed claim', blurb: 'Ryan (Harbor) cites four reports of one rumor. They trace to a single post.',
      portfolio: [],
      proposal: mk({ bot: 'ryan', asset: 'LINK', sizeUsd: 20, stop: px.LINK * 0.95, evidence: ['c-link-x', 'c-link-a', 'c-link-b', 'c-link-c', 'c-link-px', 'stop-generic'], peerAgreement: true, scenario: 'echo' }),
      observation: 'Example news items: four reports mention a LINK partnership.',
      note: { scope: 'harbor', text: 'Lily → Ryan: “All four trace to one social post.”' },
    },
    {
      id: 'correlated', title: 'Correlated bets', blurb: 'Noah (Compass) proposes SOL while BTC, ETH, AVAX and SOL are already held by other squads.',
      portfolio: [
        { bot: 'ben', asset: 'BTC', usd: 25 }, { bot: 'grace', asset: 'ETH', usd: 20 },
        { bot: 'luke', asset: 'AVAX', usd: 20 }, { bot: 'mason', asset: 'SOL', usd: 25 },
        { bot: 'zoe', asset: 'BTC', usd: 10 }, { bot: 'chloe', asset: 'ETH', usd: 15 },
      ],
      proposal: mk({ bot: 'noah', asset: 'SOL', sizeUsd: 20, stop: px.SOL * 0.95, evidence: ['c-sol-rs', 'c-sol-liq', 'stop-generic'], peerDisagreement: true, scenario: 'correlated' }),
      observation: 'Shared feed: SOL leads BTC on 30-bar relative return; spread and depth adequate.',
      note: { scope: 'compass', text: 'Jack → Noah: “SOL is the relay leader.”' },
    },
    {
      id: 'risk', title: 'Individual risk limit', blurb: 'Ethan (Tide) asks for $30 with a wide stop on ETH.',
      portfolio: [],
      proposal: mk({ bot: 'ethan', asset: 'ETH', sizeUsd: 30, stop: px.ETH * 0.92, evidence: ['c-eth-band', 'c-eth-vol', 'stop-generic'], scenario: 'risk' }),
      observation: 'Shared feed: ETH closed back inside its lower band; volatility reading attached.',
      note: { scope: 'tide', text: 'Emma → Ethan: “Band fade setup. Stop is wide — mind the size.”' },
    },
  ];
}

export function runScenario(sc, claims, clusterInfo) {
  const ava = avaReview(sc.proposal, claims);
  const risk = ava.verdict === 'sufficient' ? riskCheck(sc.proposal, sc.portfolio, clusterInfo) : { checks: [], status: 'skipped', finalSize: 0, cluster: [] };
  const coach = coachDecision(sc.proposal, ava, risk);
  const record = decisionRecord(sc.proposal, ava, risk, coach);
  return { ava, risk, coach, record };
}

// ---------- paper backtest ----------
// Applies individual limits per account and combined limits across all ten accounts,
// processing bots in a fixed order each bar. Returns equity curves.
export function backtest(market, opts = {}) {
  const from = opts.from ?? 60, to = opts.to ?? market.bars - 1;
  const only = opts.only || null;
  const params = opts.params || {};
  const corr = correlationMatrix(market);
  const cl = clusters(corr);
  const bots = AGENTS.filter(a => a.kind === 'bot' && (!only || a.id === only));
  const acct = Object.fromEntries(bots.map(b => [b.id, { cash: ACCOUNT_SIZE, pos: [], equity: [], trades: 0, wins: 0, buys: 0, signals: 0, blockedByCombined: 0 }]));
  const rr = rng(market.seed + 99);
  void rr;
  for (let t = from; t <= to; t++) {
    // mark & exits
    for (const b of bots) {
      const A = acct[b.id];
      A.pos = A.pos.filter(p => {
        const s = market.series[p.asset];
        const hitStop = p.stop && s.low[t] <= p.stop;
        const px = hitStop ? Math.min(p.stop, s.open[t]) : s.close[t];
        const exit = hitStop || exitRule(b.strategy, market, p, t, params[b.id]);
        if (exit) { const proceeds = p.units * px; A.cash += proceeds; A.trades++; if (proceeds > p.cost) A.wins++; return false; }
        return true;
      });
    }
    // entries
    const portfolio = [];
    for (const b of bots) for (const p of acct[b.id].pos) portfolio.push({ bot: b.id, asset: p.asset, usd: p.units * market.series[p.asset].close[t] });
    for (const b of bots) {
      const A = acct[b.id];
      let sym = HOME_ASSET[b.strategy];
      if (b.strategy === 'rotation') {
        let best = null, br = -Infinity;
        for (const a of ASSETS) { const sg = strategySignal('rotation', market, a.sym, t); if (sg.signal && sg.rel > br) { br = sg.rel; best = a.sym; } }
        if (!best) continue; sym = best;
      }
      if (b.strategy === 'catalyst') { if (rr() > 0.04) continue; if (rr() < 0.6) continue; /* rare events, most are echoes */ }
      if (A.pos.length && b.strategy !== 'dca') continue;
      const sg = b.strategy === 'catalyst' ? { signal: true, stop: market.series[sym].low[t - 1] } : strategySignal(b.strategy, market, sym, t, params[b.id]);
      if (!sg.signal) continue;
      const entry = market.series[sym].close[t];
      const proposal = { bot: b.id, strategy: b.strategy, squad: b.squad, asset: sym, entry, stop: sg.stop, sizeUsd: b.strategy === 'dca' ? 2 : Math.min(25, A.cash) };
      if (b.strategy !== 'dca' && (!sg.stop || sg.stop >= entry)) continue;
      const rc = riskCheck(proposal, portfolio.filter(p => only ? p.bot === b.id : true).map(p => ({ ...p, usd: Math.round(p.usd) })), cl);
      A.signals++;
      if (rc.status === 'blocked') { if (rc.checks.some(c => c.scope === 'combined' && c.status === 'blocked')) A.blockedByCombined++; continue; }
      const usd = Math.min(rc.finalSize, A.cash);
      if (usd < 1) continue;
      A.cash -= usd; A.buys++;
      A.pos.push({ asset: sym, units: usd / entry, stop: sg.stop, cost: usd, at: t });
      portfolio.push({ bot: b.id, asset: sym, usd });
    }
    for (const b of bots) { const A = acct[b.id]; A.equity.push(A.cash + A.pos.reduce((s, p) => s + p.units * market.series[p.asset].close[t], 0)); }
  }
  return { accounts: acct, clusters: cl, from, to };
}
function exitRule(key, market, p, t, params = {}) {
  const c = market.series[p.asset].close;
  switch (key) {
    case 'trend': return c[t] < sma(c, (params && params.slow) || 50, t);
    case 'breakout': return c[t] < minOf(c, t - 10, t - 1);
    case 'reversion': return c[t] >= sma(c, 20, t) || t - p.at >= 10;
    case 'bands': return c[t] >= sma(c, 20, t);
    case 'rotation': return strategySignal('rotation', market, p.asset, t).signal === false;
    case 'pullback': return c[t] >= maxOf(c, p.at - 15, p.at) || t - p.at > 15;
    case 'funding': return market.series[p.asset].funding[t] > 0;
    case 'squeeze': return c[t] < sma(c, 20, t);
    case 'catalyst': return t - p.at >= 5;
    case 'dca': return false;
  }
  return false;
}

// ---------- growth lab ----------
export const IMPROVEMENTS = [
  { id: 'ben-fast', bot: 'ben', title: 'Ben: faster averages (10 / 30 instead of 20 / 50)', params: { fast: 10, slow: 30 } },
  { id: 'maya-novol', bot: 'maya', title: 'Maya: drop the volume requirement', params: { volMult: 0 } },
  { id: 'grace-rsi40', bot: 'grace', title: 'Grace: loosen RSI threshold from 35 to 40', params: { rsi: 40 } },
  { id: 'mason-fund', bot: 'mason', title: 'Mason: trigger at −0.01% funding instead of −0.02%', params: { funding: -0.01 } },
];
export function compareImprovement(market, imp) {
  const split = 125;
  const run = (from, to, p) => {
    const r = backtest(market, { from, to, only: imp.bot, params: p ? { [imp.bot]: p } : {} });
    const a = r.accounts[imp.bot];
    const end = a.equity.at(-1) ?? ACCOUNT_SIZE;
    let peak = -Infinity, dd = 0; for (const e of a.equity) { peak = Math.max(peak, e); dd = Math.max(dd, (peak - e) / peak); }
    return { ret: end / ACCOUNT_SIZE - 1, trades: a.trades, maxDD: dd, equity: a.equity };
  };
  const res = {
    inBase: run(60, split, null), inNew: run(60, split, imp.params),
    outBase: run(split + 1, market.bars - 1, null), outNew: run(split + 1, market.bars - 1, imp.params),
  };
  const inGain = res.inNew.ret - res.inBase.ret, outGain = res.outNew.ret - res.outBase.ret;
  let verdict;
  if (inGain > 0 && outGain < 0) verdict = { tone: 'warn', text: 'Better in the sample it was tuned on, worse on unseen bars — a classic sign of curve-fitting. Sam would not adopt this without more evidence.' };
  else if (inGain > 0 && outGain > 0) verdict = { tone: 'ok', text: 'Better on both the tuning sample and unseen bars. Still one simulated path — worth a longer paper trial, not a conclusion.' };
  else if (inGain <= 0 && outGain > 0) verdict = { tone: 'neutral', text: 'Mixed: worse where it was tuned, better on unseen bars. Probably noise; collect more paper evidence.' };
  else verdict = { tone: 'warn', text: 'Not an improvement on either period of this simulation.' };
  if (imp.id === 'maya-novol') verdict.extra = 'Note: this change removes a required evidence item. Ava would need the strategy definition updated first — evidence rules change only through a reviewed proposal.';
  return { ...res, inGain, outGain, verdict, split };
}
