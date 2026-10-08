// Interactive team map: who communicates with whom. Pure SVG, two responsive layouts.
import { AGENTS, SQUADS, agentById } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export const SYSTEM_NODES = {
  feed: {
    id: 'feed', name: 'Shared market feed', kind: 'system', color: '#64748b',
    role: 'Simulated price, volume, funding and regime observations. Not an agent.',
    responsibilities: ['Publish the same timestamped observations to every squad', 'Record the original source of every data point'],
    tools: ['Seeded simulator (no live exchange connection)'],
    inputs: ['Simulation engine'], outputs: ['Observations → all five researchers', 'Timestamps → evidence registry'],
    restrictions: ['Carries observations only — never opinions', 'Everything is simulated; no live scans run'],
    handoff: 'Researchers read it; Ava checks timestamps against it.',
  },
  gate: {
    id: 'gate', name: 'Risk gate', kind: 'system', color: '#0f766e',
    role: 'Rules engine that applies individual and combined limits. Not an agent.',
    responsibilities: ['Per-account: size ≤ $25, loss at stop ≤ $1, ≤ 2 open positions, stop required', 'Combined: correlated cluster ≤ $125, total ≤ $300, one asset ≤ $100'],
    tools: ['Correlation matrix (computed from simulated returns)', 'Current paper portfolio'],
    inputs: ['Proposal that passed Ava\'s review'], outputs: ['Checked proposal (ok / trimmed / blocked) → Sam'],
    restrictions: ['Limits cannot be raised by any agent', 'Reduces correlated mistakes; cannot eliminate them'],
    handoff: 'Passes the checked proposal to Sam.',
  },
  ledger: {
    id: 'ledger', name: 'Paper ledger', kind: 'system', color: '#7c3aed',
    role: 'Records paper positions and decision records. No orders are ever sent anywhere.',
    responsibilities: ['Keep each $50 account separate', 'Store every decision record with its evidence and checks'],
    tools: ['Browser storage on this device'],
    inputs: ['Decision records from Sam'], outputs: ['Activity log', 'Squad account balances'],
    restrictions: ['Paper only — not connected to any exchange or wallet'],
    handoff: 'Feeds the Activity page and squad accounts.',
  },
};

export function nodeInfo(id) { return agentById[id] || SYSTEM_NODES[id]; }

function layout(narrow) {
  const pos = {};
  const boxes = [];
  if (!narrow) {
    const W = 1000;
    pos.feed = { x: 500, y: 58 };
    SQUADS.forEach((s, i) => {
      const cx = 100 + i * 200;
      pos[s.researcher] = { x: cx, y: 232 };
      pos[s.bots[0]] = { x: cx - 48, y: 376 };
      pos[s.bots[1]] = { x: cx + 48, y: 376 };
      boxes.push({ squad: s, x: cx - 92, y: 166, w: 184, h: 272 });
    });
    pos.ava = { x: 210, y: 590 };
    pos.gate = { x: 500, y: 590 };
    pos.sam = { x: 790, y: 590 };
    pos.ledger = { x: 790, y: 716 };
    return { W, H: 790, pos, boxes, narrow };
  }
  const W = 400;
  pos.feed = { x: 200, y: 52 };
  let y = 128;
  SQUADS.forEach((s) => {
    pos[s.researcher] = { x: 128, y: y + 84 };
    pos[s.bots[0]] = { x: 290, y: y + 40 };
    pos[s.bots[1]] = { x: 290, y: y + 132 };
    boxes.push({ squad: s, x: 62, y, w: 284, h: 196 });
    y += 222;
  });
  pos.ava = { x: 200, y: y + 46 };
  pos.gate = { x: 200, y: y + 166 };
  pos.sam = { x: 200, y: y + 286 };
  pos.ledger = { x: 200, y: y + 406 };
  return { W, H: y + 470, pos, boxes, narrow };
}

export function renderMap(container, { onSelect, reducedMotion } = {}) {
  container.innerHTML = '';
  const narrow = container.clientWidth < 700;
  const L = layout(narrow);
  const svg = el('svg', { viewBox: `0 0 ${L.W} ${L.H}`, role: 'img', 'aria-label': 'Team communication map' }, container);
  const defs = el('defs', {}, svg);
  const mk = (id, color) => {
    const m = el('marker', { id, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 6.5, markerHeight: 6.5, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, m);
  };
  mk('ar-obs', '#64748b'); mk('ar-note', '#94a3b8'); mk('ar-prop', '#0a66e8'); mk('ar-dec', '#1f9d55'); mk('ar-coach', '#5b78d6'); mk('ar-ava', '#e2557a');
  const sh = el('filter', { id: 'nshadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
  el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 4, 'flood-opacity': 0.18 }, sh);

  const gBoxes = el('g', {}, svg);
  const gEdges = el('g', {}, svg);
  const gLabels = el('g', {}, svg);
  const gNodes = el('g', {}, svg);
  const P = L.pos;
  const edges = [];
  const flowCls = reducedMotion ? '' : 'flow';

  // squad boxes
  for (const b of L.boxes) {
    const g = el('g', { 'data-squad': b.squad.id }, gBoxes);
    el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 22, fill: b.squad.color, 'fill-opacity': 0.08, stroke: b.squad.color, 'stroke-opacity': 0.35, 'stroke-width': 1.5 }, g);
    const t0 = el('text', { x: b.x + 12, y: b.y + 18, 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': 1.2, fill: b.squad.color, 'fill-opacity': 0.8 }, g);
    t0.textContent = 'SQUAD';
    const t = el('text', { x: b.x + 12, y: b.y + 33, 'font-size': 13, 'font-weight': 750, fill: b.squad.color }, g);
    t.textContent = b.squad.name;
  }

  function edge({ from, to, d, color, marker, width = 3.2, dash, label, labelAt, kind, members }) {
    const g = el('g', { class: 'map-edge', 'data-kind': kind, 'data-members': (members || [from, to]).join(' ') }, gEdges);
    el('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-dasharray': dash || null, 'marker-end': marker ? `url(#${marker})` : null }, g);
    if (!dash && flowCls) el('path', { d, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 1.6, class: flowCls, 'stroke-linecap': 'round' }, g);
    edges.push(g);
    if (label) pill(label, labelAt, color, g);
    return g;
  }
  function pill(text, at, color, owner) {
    const g = el('g', { class: 'map-edge', 'data-members': owner?.getAttribute('data-members') || '' }, gLabels);
    const fs = L.narrow ? 11.5 : 12.5;
    const w = text.length * fs * 0.56 + 18;
    el('rect', { x: at.x - w / 2, y: at.y - 12, width: w, height: 24, rx: 12, fill: 'var(--card)', stroke: color, 'stroke-width': 1.6 }, g);
    const t = el('text', { x: at.x, y: at.y + 4.3, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 650, fill: color }, g);
    t.textContent = text;
    edges.push(g);
  }

  const researchers = SQUADS.map(s => s.researcher);
  const bots = SQUADS.flatMap(s => s.bots);
  const R = 26; // node radius

  if (!L.narrow) {
    // feed → researchers via bus
    const busY = 132;
    edge({ from: 'feed', to: 'bus', d: `M500,${P.feed.y + 26} L500,${busY}`, color: '#64748b', kind: 'obs', members: ['feed', ...researchers] });
    edge({ from: 'feed', to: 'bus', d: `M${P[researchers[0]].x},${busY} L${P[researchers.at(-1)].x},${busY}`, color: '#64748b', kind: 'obs', members: ['feed', ...researchers], label: 'market observations · shared with every squad', labelAt: { x: 500, y: busY } });
    for (const r of researchers) edge({ from: 'feed', to: r, d: `M${P[r].x},${busY} L${P[r].x},${P[r].y - R - 6}`, color: '#64748b', marker: 'ar-obs', kind: 'obs', members: ['feed', r] });
    // researcher → bots
    SQUADS.forEach((s, i) => {
      for (const b of s.bots) {
        const a = P[s.researcher], c = P[b];
        edge({ from: s.researcher, to: b, d: `M${a.x},${a.y + R + 2} C${a.x},${a.y + 70} ${c.x},${c.y - 80} ${c.x},${c.y - R - 6}`, color: s.color, marker: null, kind: 'note', members: [s.researcher, b] });
      }
      pill(i === 0 ? 'research notes · team only' : 'notes · team only', { x: P[s.researcher].x, y: 306 }, s.color, gEdges.lastChild);
      gEdges.querySelectorAll(`[data-members="${s.researcher} ${s.bots[0]}"] path, [data-members="${s.researcher} ${s.bots[1]}"] path`).forEach(p => { if (!p.classList.contains('flow')) p.setAttribute('marker-end', 'url(#ar-note)'); });
    });
    // bots → Ava via bus
    const pb = 486;
    for (const b of bots) edge({ from: b, to: 'ava', d: `M${P[b].x},${P[b].y + R + 4} L${P[b].x},${pb}`, color: '#0a66e8', kind: 'prop', members: [b, 'ava'] });
    edge({ from: 'bots', to: 'ava', d: `M${P[bots.at(-1)].x},${pb} L${P.ava.x + 0},${pb} L${P.ava.x},${P.ava.y - R - 8}`, color: '#0a66e8', marker: 'ar-prop', kind: 'prop', members: [...bots, 'ava'], label: 'proposals + evidence · one squad at a time', labelAt: { x: 560, y: pb } });
    edge({ from: 'bots', to: 'ava', d: `M${P[bots[0]].x},${pb} L${P.ava.x},${pb}`, color: '#0a66e8', kind: 'prop', members: [...bots, 'ava'] });
    edge({ from: 'ava', to: 'gate', d: `M${P.ava.x + R + 6},${P.ava.y} L${P.gate.x - R - 10},${P.gate.y}`, color: '#e2557a', marker: 'ar-ava', kind: 'verdict', label: 'evidence verdict', labelAt: { x: (P.ava.x + P.gate.x) / 2, y: P.ava.y - 22 } });
    edge({ from: 'gate', to: 'sam', d: `M${P.gate.x + R + 6},${P.gate.y} L${P.sam.x - R - 10},${P.sam.y}`, color: '#0f766e', marker: 'ar-dec', kind: 'checked', label: 'checked proposal', labelAt: { x: (P.gate.x + P.sam.x) / 2, y: P.gate.y - 22 } });
    edge({ from: 'sam', to: 'ledger', d: `M${P.sam.x},${P.sam.y + R + 6} L${P.ledger.x},${P.ledger.y - R - 10}`, color: '#1f9d55', marker: 'ar-dec', kind: 'record', label: 'decision record', labelAt: { x: P.sam.x + 82, y: (P.sam.y + P.ledger.y) / 2 } });
    edge({ from: 'sam', to: 'bots', d: `M${P.sam.x + R + 6},${P.sam.y - 8} C${960},${P.sam.y - 30} ${975},${500} ${975},${430} L${975},${P[bots.at(-1)].y + 4} L${P[bots.at(-1)].x + R + 10},${P[bots.at(-1)].y + 4}`, color: '#5b78d6', dash: '7 7', marker: 'ar-coach', kind: 'coach', width: 2.8, members: ['sam', ...bots], label: 'coaching', labelAt: { x: 935, y: 532 } });
    // blocked cross-team markers
    for (let i = 0; i < L.boxes.length - 1; i++) {
      const x = L.boxes[i].x + L.boxes[i].w + 8, y = 306;
      blocked(x, y, i === 0);
    }
  } else {
    const railL = 26, railR = 378;
    edge({ from: 'feed', to: 'rail', d: `M${P.feed.x - 70},${P.feed.y} L${railL},${P.feed.y} L${railL},${P[researchers.at(-1)].y}`, color: '#64748b', kind: 'obs', members: ['feed', ...researchers], label: 'observations · shared', labelAt: { x: 112, y: 96 } });
    for (const r of researchers) edge({ from: 'feed', to: r, d: `M${railL},${P[r].y} L${P[r].x - R - 8},${P[r].y}`, color: '#64748b', marker: 'ar-obs', kind: 'obs', members: ['feed', r] });
    SQUADS.forEach((s, i) => {
      for (const b of s.bots) {
        const a = P[s.researcher], c = P[b];
        edge({ from: s.researcher, to: b, d: `M${a.x + R + 2},${a.y} C${a.x + 70},${a.y} ${c.x - 80},${c.y} ${c.x - R - 8},${c.y}`, color: s.color, marker: 'ar-note', kind: 'note', members: [s.researcher, b] });
      }
      pill('team only', { x: 208, y: P[s.researcher].y }, s.color, gEdges.lastChild);
    });
    for (const b of bots) edge({ from: b, to: 'ava', d: `M${P[b].x + R + 4},${P[b].y} L${railR},${P[b].y}`, color: '#0a66e8', kind: 'prop', members: [b, 'ava'] });
    edge({ from: 'bots', to: 'ava', d: `M${railR},${P[bots[0]].y} L${railR},${P.ava.y} L${P.ava.x + R + 10},${P.ava.y}`, color: '#0a66e8', marker: 'ar-prop', kind: 'prop', members: [...bots, 'ava'], label: 'proposals + evidence', labelAt: { x: 300, y: P.ava.y - 30 } });
    edge({ from: 'ava', to: 'gate', d: `M${P.ava.x},${P.ava.y + R + 6} L${P.gate.x},${P.gate.y - R - 10}`, color: '#e2557a', marker: 'ar-ava', kind: 'verdict', label: 'evidence verdict', labelAt: { x: 290, y: (P.ava.y + P.gate.y) / 2 } });
    edge({ from: 'gate', to: 'sam', d: `M${P.gate.x},${P.gate.y + R + 6} L${P.sam.x},${P.sam.y - R - 10}`, color: '#0f766e', marker: 'ar-dec', kind: 'checked', label: 'checked proposal', labelAt: { x: 290, y: (P.gate.y + P.sam.y) / 2 } });
    edge({ from: 'sam', to: 'ledger', d: `M${P.sam.x},${P.sam.y + R + 6} L${P.ledger.x},${P.ledger.y - R - 10}`, color: '#1f9d55', marker: 'ar-dec', kind: 'record', label: 'decision record', labelAt: { x: 290, y: (P.sam.y + P.ledger.y) / 2 } });
    edge({ from: 'sam', to: 'bots', d: `M${P.sam.x - R - 6},${P.sam.y} L${railL + 18},${P.sam.y} L${railL + 18},${L.boxes.at(-1).y + L.boxes.at(-1).h + 10}`, color: '#5b78d6', dash: '7 7', marker: 'ar-coach', kind: 'coach', width: 2.8, members: ['sam', ...bots], label: 'coaching', labelAt: { x: 92, y: P.sam.y - 20 } });
    for (let i = 0; i < L.boxes.length - 1; i++) blocked(200, L.boxes[i].y + L.boxes[i].h + 13, i === 0);
  }

  function blocked(x, y, withLabel) {
    const g = el('g', { class: 'map-edge', 'data-kind': 'blocked', 'data-tour': withLabel ? 'map-blocked' : null }, gLabels);
    el('circle', { cx: x, cy: y, r: 11, fill: 'var(--card)', stroke: '#d63a4a', 'stroke-width': 2.5 }, g);
    el('line', { x1: x - 6, y1: y + 6, x2: x + 6, y2: y - 6, stroke: '#d63a4a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);
    const tt = el('title', {}, g); tt.textContent = 'Research opinions do not cross squads';
  }

  // nodes
  const all = ['feed', ...researchers, ...bots, 'ava', 'gate', 'sam', 'ledger'];
  const nodeEls = {};
  for (const id of all) {
    const info = nodeInfo(id); const p = P[id];
    const big = ['ava', 'sam', 'feed', 'gate', 'ledger'].includes(id);
    const r = big ? R + 4 : R;
    const g = el('g', { class: 'map-node', tabindex: 0, role: 'button', 'aria-label': `${info.name}: ${info.role || info.persona || ''}`, 'data-node': id, 'data-tour': `node-${id}`, transform: `translate(${p.x},${p.y})` }, gNodes);
    if (info.kind === 'system') {
      el('rect', { class: 'nbg', x: -r - 22, y: -r + 4, width: 2 * r + 44, height: 2 * r - 8, rx: 16, fill: info.color, filter: 'url(#nshadow)' }, g);
      el('rect', { class: 'ring', x: -r - 22, y: -r + 4, width: 2 * r + 44, height: 2 * r - 8, rx: 16, fill: 'none', stroke: 'transparent', 'stroke-width': 0 }, g);
      const t = el('text', { y: 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, g);
      t.textContent = info.name.replace('Shared market feed', 'Market feed');
    } else {
      el('circle', { class: 'nbg', r, fill: info.color, filter: 'url(#nshadow)' }, g);
      el('circle', { r: r - 3, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, g);
      el('circle', { class: 'ring', r: r + 4, fill: 'none', stroke: 'transparent', 'stroke-width': 0 }, g);
      const t = el('text', { y: 6, 'text-anchor': 'middle', 'font-size': big ? 17 : 15, 'font-weight': 800, fill: '#fff' }, g);
      t.textContent = info.name.slice(0, 2);
      const lb = el('text', { y: r + 17, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--ink)' }, g);
      lb.textContent = info.name;
      const sub = info.kind === 'researcher' ? 'researcher' : info.kind === 'bot' ? shortStrat(info.strategy) : info.kind === 'reviewer' ? 'evidence reviewer' : 'head coach';
      const sb = el('text', { y: r + 31, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-3)' }, g);
      sb.textContent = sub;
    }
    const tt = el('title', {}, g); tt.textContent = `${info.name} — tap for role, inputs, outputs and restrictions`;
    g.addEventListener('click', () => select(id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } });
    nodeEls[id] = g;
  }

  let current = null;
  function select(id, { silent } = {}) {
    current = id;
    svg.classList.toggle('map-dim', !!id);
    for (const [nid, g] of Object.entries(nodeEls)) g.classList.toggle('hot', nid === id);
    for (const e of edges) {
      const m = (e.getAttribute('data-members') || '').split(' ');
      const hot = id && m.includes(id);
      e.classList.toggle('hot', !!hot);
      if (hot) for (const x of m) nodeEls[x]?.classList.add('hot');
    }
    if (!silent && onSelect) onSelect(id);
  }
  return { select, svg, get current() { return current; }, narrow: L.narrow };
}

function shortStrat(s) {
  return ({ trend: 'trend', breakout: 'breakout', reversion: 'reversion', bands: 'band fade', rotation: 'rotation', pullback: 'pullback', funding: 'contrarian', squeeze: 'squeeze', dca: 'scheduled buys', catalyst: 'catalysts' })[s] || s;
}
