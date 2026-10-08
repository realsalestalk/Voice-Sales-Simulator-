// Survival League — application shell, router and views.
import { AGENTS, SQUADS, STRATEGIES, EVIDENCE_TYPES, LIMITS, ASSETS, SOURCES, START_CAPITAL, ACCOUNT_SIZE, agentById, DEMO_NOTE } from './data.js';
import * as E from './engine.js';
import { renderMap, nodeInfo } from './map.js';

// ---------- utilities ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, d = 2) => `$${Number(v).toFixed(d)}`;
const pct = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem('sl:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sl:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const fmtTime = ms => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const avatar = (a, size = '') => `<span class="avatar ${size}" style="--c:${a.color}" aria-hidden="true">${esc(a.name.slice(0, 2))}${a.kind === 'researcher' ? '<span class="kind">R</span>' : a.kind === 'bot' ? '<span class="kind">B</span>' : ''}</span>`;
function spark(values, { color = 'var(--accent)', base = null, h = 44 } = {}) {
  if (!values.length) return '';
  const w = 160, mn = Math.min(...values, base ?? Infinity), mx = Math.max(...values, base ?? -Infinity);
  const y = v => h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${y(v).toFixed(1)}`).join(' ');
  const bl = base != null ? `<line x1="0" x2="${w}" y1="${y(base)}" y2="${y(base)}" stroke="var(--line-2)" stroke-dasharray="3 4"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bl}<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
export function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

// ---------- state ----------
const market = E.simulateMarket();
const corr = E.correlationMatrix(market);
const cl = E.clusters(corr);
const claims = E.buildRegistry(market);
const SCEN = E.scenarios(market);
const BT = E.backtest(market);
const prices = E.currentPrices(market);
const T = market.bars - 1;

const state = {
  records: store.get('records', null) || seedRecords(),
  lab: { id: 'valid', stage: 0, result: null, saved: false },
  notebookAs: 'atlas',
  growth: { id: E.IMPROVEMENTS[0].id, submitted: store.get('improvements', []) },
  wlOpen: null,
  activityFilter: 'all',
};
function seedRecords() {
  const out = [];
  [['valid', 52], ['echo', 30], ['risk', 18], ['missing', 7]].forEach(([id, h]) => {
    const sc = SCEN.find(s => s.id === id);
    const r = E.runScenario(sc, claims, cl).record;
    r.at = E.SIM_NOW - h * 3600000; r.example = true; r.id = `DR-${900 + out.length}`;
    out.push(r);
  });
  return out.sort((a, b) => b.at - a.at);
}
function saveRecords() { store.set('records', state.records.slice(0, 60)); }

// ---------- routes ----------
export const ROUTES = [
  { id: 'overview', label: 'Overview', color: '#1d1d1f', icon: '◎' },
  { id: 'team', label: 'My team', color: '#0a66e8', icon: '⌘' },
  { id: 'watchlist', label: 'Watchlist', color: '#ff7a45', icon: '◉' },
  { id: 'squads', label: 'Squads', color: '#2fb5a8', icon: '▦' },
  { id: 'strategies', label: 'Strategies', color: '#7c6cf2', icon: '◇' },
  { id: 'safety', label: 'Safety rules', color: '#d63a4a', icon: '⛉' },
  { id: 'research', label: 'Research', color: '#e2557a', icon: '✎' },
  { id: 'activity', label: 'Activity', color: '#1f9d55', icon: '≡' },
  { id: 'training', label: 'Training room', color: '#5b78d6', icon: '★' },
  { id: 'growth', label: 'Growth lab', color: '#f2b72f', icon: '↗' },
];
let currentRoute = null;
let mapApi = null;
const decoSams = [];

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = ROUTES.map(r => `<a href="#/${r.id}" data-route="${r.id}" data-tour="nav-${r.id}"><span class="ni" style="background:${r.color}">${r.icon}</span>${esc(r.label)}</a>`).join('') +
    `<div class="nav-foot"><b>Demonstration.</b> ${esc(DEMO_NOTE)}.</div>`;
}

export async function go(route, { fromTour = false } = {}) {
  if (!ROUTES.some(r => r.id === route)) route = 'overview';
  if (location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);
  if (route === currentRoute) return;
  const main = $('#view');
  closeDrawer();
  if (currentRoute && !reducedMotion()) {
    main.style.transition = 'opacity .16s ease';
    main.style.opacity = '0';
    await new Promise(r => setTimeout(r, 160));
  }
  currentRoute = route;
  destroyDecoSams();
  window.scrollTo({ top: 0, behavior: 'instant' });
  main.innerHTML = `<div class="view view-enter" data-view="${route}">${VIEWS[route]()}</div>`;
  main.style.opacity = '1';
  $$('#nav a').forEach(a => a.dataset.route === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const active = $(`#nav a[data-route="${route}"]`);
  if (active && window.innerWidth <= 960) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion() ? 'instant' : 'smooth' });
  AFTER[route]?.();
  document.title = `${ROUTES.find(r => r.id === route).label} · Survival League`;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (!fromTour) $('#view h1, #view h2')?.focus?.({ preventScroll: true });
}
export const route = () => currentRoute;

// ---------- views ----------
const head = (eyebrow, title, lead, extra = '') => `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 tabindex="-1">${esc(title)}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</div>${extra}</div>`;

const VIEWS = {
  overview() {
    const total = Object.values(BT.accounts).reduce((s, a) => s + a.equity.at(-1), 0);
    return `
    <section class="hero">
      <div>
        <div class="row" style="margin-bottom:14px"><span class="demo-pill" data-tour="demo-pill">Demonstration · simulated data</span></div>
        <h1 tabindex="-1">A research lab where <span>ten small bets</span> learn to survive.</h1>
        <p class="lead" data-tour="hero-lead">Survival League is a crypto research and paper-trading laboratory. Five researchers, ten strategy bots, an independent evidence reviewer and a head coach turn shared market observations into written, checkable decisions — on simulated prices with paper money only.</p>
        <div class="row" style="margin-top:20px">
          <button class="btn primary" data-action="start-tour" data-tour="start-tour">▶ Start the guided tour</button>
          <a class="btn" href="#/team">Meet the team</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="orb" style="width:180px;height:180px;left:-30px;top:-20px;background:radial-gradient(circle,#ffb38a,transparent 70%)"></div>
        <div class="orb" style="width:220px;height:220px;right:-50px;top:20px;background:radial-gradient(circle,#b9a8ff,transparent 70%)"></div>
        <div class="orb" style="width:200px;height:200px;left:30%;bottom:-80px;background:radial-gradient(circle,#8fd3ff,transparent 70%)"></div>
        <div class="sam-slot" data-deco-sam="250"></div>
      </div>
    </section>
    <div class="grid g4" data-tour="capital">
      <div class="card stat" data-tour="capital-500"><span class="muted small">Simulated capital</span><b>${money(START_CAPITAL, 0)}</b><span class="tiny muted">ten $50 paper accounts</span></div>
      <div class="card stat"><span class="muted small">Agents (simulated roles)</span><b>17</b><span class="tiny muted">5 researchers · 10 bots · Ava · Sam</span></div>
      <div class="card stat"><span class="muted small">Paper equity after backtest</span><b>${money(total)}</b><span class="tiny muted">on one simulated price path</span></div>
      <div class="card stat"><span class="muted small">Live connections</span><b>0</b><span class="tiny muted">no exchange, feed or order routing</span></div>
    </div>
    <h2 style="margin:34px 0 6px">How information becomes a decision</h2>
    <p class="muted" style="margin-bottom:14px">Every proposal travels the same seven stations. Each one leaves a written trace.</p>
    <div class="pipeline" data-tour="pipeline">
      <div class="st"><b>Observe</b>Shared, timestamped market observations reach every squad.</div>
      <div class="st"><b>Research</b>A squad's researcher writes notes for its two bots only.</div>
      <div class="st"><b>Propose</b>A bot proposes a paper trade with its required evidence.</div>
      <div class="st"><b>Review</b>Ava checks sources, timestamps and independence.</div>
      <div class="st"><b>Limit</b>The risk gate applies individual and combined limits.</div>
      <div class="st"><b>Decide</b>Sam approves, trims or declines — on paper.</div>
      <div class="st"><b>Record</b>A decision record explains what happened and why.</div>
    </div>
    <div class="grid g2" style="margin-top:26px">
      <div class="card pad-l" data-tour="honesty">
        <div class="label-demo">What's real and what's a demonstration</div>
        <ul class="ticks small" style="margin-top:10px">
          <li><b>Real here:</b> the rules engine, evidence checks, risk limits, correlation math and decision records all run in your browser.</li>
          <li><b>Simulated:</b> prices, volume, funding and news items come from a seeded simulator. Example alerts are previews and are never sent.</li>
          <li><b>Not present:</b> no live agents, no live market scans, no exchange connection, no order execution. The “agents” are defined roles applied by the engine.</li>
          <li><b>Paper only:</b> outcomes are paper results on one simulated path — not predictions and not advice.</li>
        </ul>
      </div>
      <div class="card pad-l">
        <div class="label-demo" style="color:var(--accent)">Controls against shared mistakes</div>
        <ul class="ticks small" style="margin-top:10px">
          <li>Shared observations reach every squad; research opinions stay inside their squad.</li>
          <li>Claims carry original sources and timestamps; copies of one claim count once.</li>
          <li>Ava reviews each squad separately. Agreement is not proof; disagreement alone is not disproof.</li>
          <li>Missing required evidence blocks a proposal. Individual and combined limits both apply.</li>
          <li>These controls <b>reduce</b> correlated mistakes. They do not eliminate them.</li>
        </ul>
      </div>
    </div>`;
  },

  team() {
    return head('My team', '17 agents, clear boundaries', 'Tap anyone to see their role, inputs, outputs, tools and restrictions. Arrows show who may send what to whom.') +
      `<div class="map-wrap" data-tour="map"><div id="map"></div>
        <div class="map-legend">
          <span><i style="border-color:#64748b"></i>shared observations</span>
          <span><i style="border-color:#ff7a45"></i>team-only research notes</span>
          <span><i style="border-color:#0a66e8"></i>proposals + evidence</span>
          <span><i style="border-color:#e2557a"></i>evidence verdict</span>
          <span><i class="dash" style="border-color:#5b78d6"></i>coaching</span>
          <span><b style="color:#d63a4a">⊘</b> blocked: no cross-squad opinions</span>
        </div></div>
        <div class="grid g3" style="margin-top:18px">
          <div class="card"><h3>Handoff rules</h3><ul class="ticks small" style="margin-top:8px"><li>Researcher → its two bots only.</li><li>Bot → Ava with every required evidence item attached.</li><li>Ava → risk gate with a verdict; never a size.</li><li>Risk gate → Sam with ok / trimmed / blocked.</li><li>Sam → paper ledger with a decision record.</li></ul></div>
          <div class="card"><h3>Communication boundaries</h3><ul class="ticks small" style="margin-top:8px"><li>Observations are shared with all squads.</li><li>Opinions and notes never leave their squad.</li><li>Ava sees one squad's proposal at a time.</li><li>Sam's coaching is general — never another squad's research.</li></ul></div>
          <div class="card"><h3>Honest status</h3><p class="small muted" style="margin-top:8px">These are role definitions executed by a deterministic engine in your browser — not autonomous AI agents running live. Nothing here contacts an exchange.</p></div>
        </div>`;
  },

  watchlist() {
    const rows = ASSETS.map(a => {
      const c = market.series[a.sym].close;
      const ch = c[T] / c[T - 7] - 1;
      const interested = AGENTS.filter(b => b.kind === 'bot' && (E.HOME_ASSET[b.strategy] === a.sym || b.strategy === 'rotation'));
      const signals = interested.map(b => ({ b, s: E.strategySignal(b.strategy, market, a.sym, T) }));
      const firing = signals.filter(x => x.s.signal);
      const status = firing.length ? `<span class="chip ok">${firing.length} signal${firing.length > 1 ? 's' : ''}</span>` : signals.length ? '<span class="chip">watching</span>' : '<span class="chip">no bot assigned</span>';
      const open = state.wlOpen === a.sym;
      return `<div class="wl-row" role="button" tabindex="0" aria-expanded="${open}" data-sym="${a.sym}" data-tour="wl-${a.sym}">
          <div><div class="sym">${a.sym}</div><div class="tiny muted hide-s">${esc(a.name)}</div></div>
          <div style="min-width:0">${spark(c.slice(-60), { color: ch >= 0 ? 'var(--ok)' : 'var(--bad)' })}</div>
          <div><div class="mono">${E.fmtP(c[T])}</div><div class="tiny ${ch >= 0 ? 'up' : 'down'}" style="white-space:nowrap" title="change over the last 7 simulated bars">${pct(ch)} <span class="muted">7d</span></div></div>
          <div class="hide-s">${status}</div>
          <div class="chev muted" aria-hidden="true">›</div>
        </div>
        <div class="wl-detail ${open ? 'open' : ''}" data-detail="${a.sym}" data-tour="wl-detail-${a.sym}">
          <div class="small muted" style="margin-bottom:6px">Why this is on the list — signal explanations from the strategy rules:</div>
          ${signals.length ? signals.map(({ b, s }) => `<div class="check"><span class="ic ${s.signal ? 'ok' : 'warn'}">${s.signal ? '✓' : '·'}</span><div><b>${esc(b.name)}</b> · ${esc(STRATEGIES[b.strategy].name)} — ${s.signal ? 'signal now' : 'no signal yet'}<div class="tiny muted">${esc(s.why)}</div></div></div>`).join('') : '<div class="small muted">No bot&rsquo;s strategy uses this asset. It is observed for correlation only.</div>'}
          <div class="tiny muted" style="margin-top:6px">Correlation cluster: ${cl.list[cl.of[a.sym]].join(' · ')}</div>
        </div>`;
    }).join('');
    return head('Watchlist', 'Research candidates', 'Simulated assets the squads watch, why each is interesting right now, and what an alert would look like.') +
      `<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)" id="wl-grid">
        <div class="card" data-tour="watchlist"><div class="card-title"><h3>Candidates</h3><span class="chip demo">simulated prices</span></div>${rows}</div>
        <div class="stack" data-tour="alerts">
          <div class="card-title" style="margin:0"><h3>Alert previews</h3><span class="chip demo">example · never sent</span></div>
          ${alertCard('BTC', 'Ben · Trend Rider', 'BTC 20-bar average is above the 50-bar average and price closed above it.', 'Would route to: Ava for evidence review', 'ok')}
          ${alertCard('SOL', 'Maya · Breakout Hunter', 'SOL closed above its 20-bar high. Volume confirmation is missing.', 'Would be blocked until volume is confirmed', 'warn')}
          ${alertCard('LINK', 'Ryan · Catalyst Checker', 'Four reports of a partnership — all trace to one post.', 'Counts as one source; not enough', 'bad')}
          <p class="tiny muted">Alert previews show the format only. No notifications, emails or messages are sent by this site.</p>
        </div>
      </div>`;
  },

  squads() {
    const total = Object.values(BT.accounts).reduce((s, a) => s + a.equity.at(-1), 0);
    return head('Squads', 'Five squads, ten $50 accounts', `Paper results of a backtest on one simulated price path (bars ${BT.from}–${BT.to}). Accounts never share money.`,
      `<div class="card stat" style="min-width:200px"><span class="small muted">Total paper equity</span><b>${money(total)}</b><span class="tiny ${total >= START_CAPITAL ? 'up' : 'down'}">${pct(total / START_CAPITAL - 1)} vs $500 · simulated</span></div>`) +
      `<div class="grid g3">${SQUADS.map(s => {
        const r = agentById[s.researcher];
        return `<div class="card squad-card" style="--sq:${s.color}" data-tour="squad-${s.id}">
          <div class="card-title"><h3>Squad ${esc(s.name)}</h3><span class="chip" style="background:${s.color}22;color:${s.color}">${esc(s.focus)}</span></div>
          <div class="member">${avatar(r, 'sm')}<div><b>${esc(r.name)}</b> <span class="tiny muted">researcher</span><div class="tiny muted">${esc(r.persona)}</div></div></div>
          ${s.bots.map(id => { const b = agentById[id]; const a = BT.accounts[id]; const eq = a.equity.at(-1); return `
            <div class="member" data-tour="acct-${id}">${avatar(b, 'sm')}<div style="flex:1;min-width:0">
              <div class="acct"><b>${esc(b.name)} <span class="tiny muted">${esc(STRATEGIES[b.strategy].name)}</span></b><span class="mono ${eq >= ACCOUNT_SIZE ? 'up' : 'down'}">${money(eq)}</span></div>
              ${spark(a.equity, { color: b.color, base: ACCOUNT_SIZE, h: 34 })}
              <div class="tiny muted">$50 start · ${a.buys} paper entr${a.buys === 1 ? 'y' : 'ies'} · ${pct(eq / ACCOUNT_SIZE - 1)}</div>
            </div></div>`; }).join('')}
        </div>`; }).join('')}
        <div class="card"><h3>Reading these numbers</h3><p class="small muted" style="margin-top:8px">One seeded simulated path cannot tell you whether a strategy works. The point is to compare behaviour under identical, documented rules — and to practise the review process — not to forecast returns.</p></div>
      </div>`;
  },

  strategies() {
    return head('Strategies', 'Ten explicit approaches', 'Each bot runs exactly one written strategy. The required evidence chips are what Ava checks before anything moves.') +
      `<div class="grid g2">${Object.entries(STRATEGIES).map(([k, s]) => { const b = agentById[s.bot]; const sq = SQUADS.find(q => q.id === b.squad); return `
        <div class="card strat" data-tour="strat-${k}">
          <h3>${avatar(b, 'sm')} <span>${esc(s.name)} <span class="tiny muted" style="font-weight:500">· ${esc(b.name)} · Squad ${esc(sq.name)}</span></span></h3>
          <p class="small muted" style="margin-top:6px">${esc(b.persona)}</p>
          <dl><dt>Entry</dt><dd>${esc(s.entry)}</dd><dt>Exit</dt><dd>${esc(s.exit)}</dd><dt>Stop</dt><dd>${esc(s.stop)}</dd><dt>Sizing</dt><dd>${esc(s.sizing)}</dd><dt>Weakness</dt><dd>${esc(s.weakness)}</dd></dl>
          <div class="row" data-tour="strat-ev-${k}"><span class="tiny muted">Required evidence:</span>${s.evidence.map(e => `<span class="chip acc" title="${esc(EVIDENCE_TYPES[e].desc)}">${esc(EVIDENCE_TYPES[e].label)}</span>`).join('')}</div>
        </div>`; }).join('')}</div>`;
  },

  safety() {
    const book = SCEN.find(s => s.id === 'correlated').portfolio;
    const cluster = cl.list[0];
    const cexp = book.filter(p => cluster.includes(p.asset)).reduce((s, p) => s + p.usd, 0);
    const gross = book.reduce((s, p) => s + p.usd, 0);
    const meter = (used, cap, label, tour) => `<div style="margin:12px 0" ${tour ? `data-tour="${tour}"` : ''}><div class="row" style="justify-content:space-between"><span class="small"><b>${esc(label)}</b></span><span class="mono">${money(used, 0)} / ${money(cap, 0)}</span></div><div class="meter" style="margin-top:6px"><span style="width:${Math.min(100, used / cap * 100)}%;${used / cap > 0.85 ? 'background:var(--warn)' : ''}"></span></div></div>`;
    const syms = corr.syms;
    const cell = v => { const a = Math.abs(v); const bg = v >= 0 ? `rgba(10,102,232,${(a * 0.75).toFixed(2)})` : `rgba(214,58,74,${(a * 0.75).toFixed(2)})`; return `<td class="mono" style="text-align:center;background:${bg};color:${a > 0.5 ? '#fff' : 'inherit'}">${v.toFixed(2)}</td>`; };
    return head('Safety rules', 'Limits that hold for everyone', 'Two layers: each $50 account has its own limits, and the whole $500 book has combined limits across correlated positions.') +
      `<div class="grid g2">
        <div class="card pad-l" data-tour="limits-individual"><div class="card-title"><h3>Individual limits · per $50 account</h3></div>
          <dl class="kv"><dt>Position size</dt><dd>≤ ${money(LIMITS.individual.maxPositionPct * ACCOUNT_SIZE, 0)} (50%)</dd>
          <dt>Loss at stop</dt><dd>≤ ${money(LIMITS.individual.maxRiskPct * ACCOUNT_SIZE)} (2%) — oversized requests are trimmed</dd>
          <dt>Open positions</dt><dd>≤ ${LIMITS.individual.maxOpenPositions}</dd>
          <dt>Stop</dt><dd>Required (scheduled-buy plan uses a $30 budget cap instead)</dd>
          <dt>Evidence</dt><dd>Every required item present and fresh — otherwise blocked</dd></dl>
        </div>
        <div class="card pad-l" data-tour="limits-combined"><div class="card-title"><h3>Combined limits · whole $500</h3><span class="chip demo">example book</span></div>
          ${meter(cexp, LIMITS.combined.clusterCapPct * START_CAPITAL, `Correlated cluster (${cluster.join(' · ')})`, 'cluster-meter')}
          ${meter(gross, LIMITS.combined.grossCapPct * START_CAPITAL, 'Total open exposure')}
          ${meter(book.filter(p => p.asset === 'BTC').reduce((s, p) => s + p.usd, 0), LIMITS.combined.sameAssetCapPct * START_CAPITAL, 'Same asset (BTC)')}
          <p class="tiny muted">Example book: ${book.map(p => `${agentById[p.bot].name} ${p.asset} $${p.usd}`).join(', ')}.</p>
        </div>
        <div class="card pad-l" data-tour="corr-matrix"><div class="card-title"><h3>Correlation matrix</h3><span class="chip demo">90 simulated bars</span></div>
          <div class="table-wrap"><table class="t" style="min-width:420px"><tr><th></th>${syms.map(s => `<th style="text-align:center">${s}</th>`).join('')}</tr>
          ${syms.map(a => `<tr><th>${a}</th>${syms.map(b => cell(corr.m[a][b])).join('')}</tr>`).join('')}</table></div>
          <p class="small muted" style="margin-top:10px">Assets correlated above ${LIMITS.combined.correlationThreshold} are grouped into one cluster: <b>${cl.list.map(g => g.join(' · ')).join('  |  ')}</b>. Four “different” bets in one cluster behave like one big bet.</p>
        </div>
        <div class="card pad-l" data-tour="honest-limits"><div class="card-title"><h3>What these controls can't do</h3></div>
          <div class="callout warn"><strong>They reduce correlated mistakes — they never eliminate them.</strong> Correlations change, especially in stress. Independent sources can still all be wrong. A shared data vendor can fail for everyone at once. Limits cap the damage; they don't guarantee anything.</div>
          <ul class="ticks small" style="margin-top:12px"><li>No agent — including Sam — can raise a limit or waive missing evidence.</li><li>Limit changes go through the Growth lab as a reviewed proposal.</li></ul>
        </div>
      </div>`;
  },

  research() {
    return head('Research', 'From evidence to decision', 'Choose an example, then press Next step to watch it move through each station. Below: the evidence registry and the squads\' private notebooks.') +
      `<div class="card pad-l" data-tour="lab"><div class="lab">
        <div><h3 style="margin-bottom:10px">Examples</h3><div class="example-list" id="examples">${SCEN.map(s => `<button aria-pressed="${state.lab.id === s.id}" data-example="${s.id}" data-tour="ex-${s.id}"><b>${esc(s.title)}</b><span>${esc(s.blurb)}</span></button>`).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="btn primary" id="lab-next" data-tour="next-step">Next step ›</button><button class="btn" id="lab-reset">Reset</button></div>
          <p class="tiny muted" style="margin-top:10px">Running an example writes a paper decision record to Activity.</p></div>
        <div class="stages" id="stages" aria-live="polite"></div>
      </div></div>
      <div class="card pad-l" style="margin-top:18px" data-tour="registry"><div class="card-title"><h3 data-tour="registry-title">Evidence registry</h3><span class="chip demo">example claims</span></div>
        <p class="small muted" style="margin-bottom:10px">Every claim keeps its original source, timestamp and dependency. Copies point back to their root, so four reports of one post count once.</p>
        <div class="table-wrap">${registryTable()}</div></div>
      <div class="card pad-l" style="margin-top:18px" data-tour="notebooks"><div class="card-title"><h3>Squad notebooks</h3><span class="chip">team-only</span></div>
        <p class="small muted" style="margin-bottom:10px">Research opinions stay inside their squad. Choose whose seat you're sitting in:</p>
        <div class="seg" id="nb-seg" role="group" aria-label="View notebooks as">${SQUADS.map(s => `<button aria-pressed="${state.notebookAs === s.id}" data-nb="${s.id}">${esc(s.name)}</button>`).join('')}</div>
        <div class="grid g5" style="margin-top:14px" id="nb-grid">${notebooks()}</div></div>`;
  },

  activity() {
    const f = state.activityFilter;
    const list = state.records.filter(r => f === 'all' || r.decision === f);
    return head('Activity', 'Decision records', 'Every proposal leaves a record a person can read: what was proposed, what evidence existed, which limits applied, and why the coach decided as he did.') +
      `<div class="seg" id="act-seg" role="group" aria-label="Filter decisions" style="margin-bottom:14px">${['all', 'approved', 'trimmed', 'declined', 'blocked'].map(k => `<button aria-pressed="${f === k}" data-f="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="stack" id="records">${list.length ? list.map(recordCard).join('') : '<div class="card muted">No records match.</div>'}</div>`;
  },

  training() {
    return head('Training room', 'Learn the system with Sam', 'A 38-step guided walkthrough that uses the real interface. Sam walks to each control, taps it, and explains.') +
      `<div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)" id="train-grid">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="stage-sam"><div class="floor"></div><div class="sam-slot" data-deco-sam="240"></div></div>
          <div style="padding:18px">
            <h3>Coach Sam</h3><p class="small muted" style="margin-top:4px">Older, friendly, gray-blue and furry, with a white beard, navy knit cap and cardigan — and a wooden stick that is a cane when he walks and a pointer when he teaches. Every pose is cut from your approved reference footage: his real walk, his real lift of the stick, and his real tapping arm.</p>
            <div class="row" style="margin-top:14px"><button class="btn primary" data-action="start-tour" data-tour="train-start">▶ Start walkthrough</button><button class="btn" data-action="resume-tour" id="resume-btn" hidden>Resume at step <span id="resume-n"></span></button></div>
          </div>
        </div>
        <div class="stack">
          <div class="card" data-tour="voice-note"><h3>About Sam's voice</h3>
            <p class="small" style="margin-top:6px">Sam speaks with <b>your approved recordings</b> where a line matches: “Take your time. I'll walk you through it.”, “Choose an example, then press Next step.” and “See what comes in, what happens, and what comes out.”</p>
            <p class="small muted" style="margin-top:6px">This site cannot recreate his voice for new sentences — no voice-cloning service is connected. Every other step is shown as live captions with matching mouth movement. You may opt in to your device's built-in voice in the tour options; it is clearly labelled and is <b>not</b> Sam's voice.</p></div>
          <div class="card chapters"><h3>Chapters</h3><ol id="chap-ol" class="small" style="margin-top:8px"></ol></div>
        </div>
      </div>`;
  },

  growth() {
    const imp = E.IMPROVEMENTS.find(i => i.id === state.growth.id);
    const r = E.compareImprovement(market, imp);
    const cellv = (label, x) => `<div class="cell"><div class="tiny muted">${label}</div><b class="${x.ret >= 0 ? 'up' : 'down'}">${pct(x.ret)}</b><div class="tiny muted">${x.trades} closed trades · max drawdown ${(x.maxDD * 100).toFixed(1)}%</div></div>`;
    const sub = state.growth.submitted;
    return head('Growth lab', 'Propose an improvement', 'Suggest a change, test it on bars it was not tuned on, and send it for review. Nothing changes until Ava and Sam review it.') +
      `<div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)" id="growth-grid">
        <div class="card pad-l" data-tour="growth-pick"><h3>1 · Choose a proposed change</h3>
          <div class="example-list" style="margin-top:10px">${E.IMPROVEMENTS.map(i => `<button aria-pressed="${i.id === imp.id}" data-imp="${i.id}" data-tour="imp-${i.id}"><b>${esc(i.title)}</b><span>${esc(STRATEGIES[agentById[i.bot].strategy].name)}</span></button>`).join('')}</div></div>
        <div class="card pad-l" data-tour="growth-compare"><div class="card-title"><h3>2 · Compare on unseen bars</h3><span class="chip demo">simulated</span></div>
          <p class="small muted">Tuning sample: bars 60–${r.split}. Unseen sample: bars ${r.split + 1}–${market.bars - 1}.</p>
          <div class="cmp" style="margin-top:12px">${cellv('Current · tuning sample', r.inBase)}${cellv('Proposed · tuning sample', r.inNew)}${cellv('Current · unseen bars', r.outBase)}${cellv('Proposed · unseen bars', r.outNew)}</div>
          <div class="callout ${r.verdict.tone === 'warn' ? 'warn' : ''}" style="margin-top:12px" data-tour="growth-verdict"><strong>Reading:</strong> ${esc(r.verdict.text)}${r.verdict.extra ? `<br><br>${esc(r.verdict.extra)}` : ''}</div>
          <div class="row" style="margin-top:14px"><button class="btn primary" id="growth-submit" data-tour="growth-submit">3 · Send for review</button><span class="tiny muted">Queues a review request in this browser only.</span></div>
        </div>
      </div>
      <div class="card pad-l" style="margin-top:18px"><h3>Review queue</h3><div id="growth-queue" style="margin-top:8px">${sub.length ? sub.map(s => `<div class="member"><span class="chip warn">awaiting review</span><div class="small"><b>${esc(s.title)}</b><div class="tiny muted">Submitted ${esc(s.when)} · next: Ava evidence review, then Sam (demonstration — no reviewer is running)</div></div></div>`).join('') : '<p class="small muted">No proposals yet.</p>'}</div></div>`;
  },
};

function alertCard(sym, who, text, route, tone) {
  return `<div class="alert-card" data-tour="alert-${sym}"><div class="row" style="align-items:flex-start;flex-wrap:nowrap"><span class="bell">🔔</span><div style="min-width:0"><div class="row" style="gap:6px"><b>${sym}</b><span class="tiny muted">${esc(who)}</span><span class="label-demo">example</span></div><p class="small" style="margin-top:4px">${esc(text)}</p><span class="chip ${tone}" style="margin-top:8px">${esc(route)}</span></div></div></div>`;
}

function registryTable() {
  const rows = claims.filter(c => c.type !== 'NOTE');
  const byProp = {};
  for (const c of rows.filter(c => c.type === 'CATALYST')) (byProp[c.asset] ||= []).push(c);
  return `<table class="t" style="min-width:720px"><thead><tr><th>Claim</th><th>Type</th><th>Source</th><th>Original source</th><th>Observed</th><th>Independent?</th></tr></thead><tbody>${rows.map(c => {
    const root = E.rootOf(c.source), chain = E.chainOf(c.source);
    const age = E.SIM_NOW - c.observedAt; const stale = age > E.MAX_AGE[c.type];
    let ind = '<span class="chip ok">root</span>';
    if (c.type === 'CATALYST') { const g = E.independence(byProp[c.asset]); ind = root === c.source ? `<span class="chip ${g.independent >= 2 ? 'ok' : 'warn'}">${g.copies} report${g.copies > 1 ? 's' : ''} → ${g.independent} independent</span>` : `<span class="chip warn">copy of ${esc(SOURCES[root].name.split(' (')[0])}</span>`; }
    const dep = SOURCES[c.source]?.dependsOn ? `<div class="tiny muted">depends on: ${esc(SOURCES[c.source].dependsOn)}</div>` : '';
    return `<tr ${c.id === 'c-link-a' ? 'data-tour="echo-row"' : ''}${c.id === 'c-btc-old' ? ' data-tour="stale-row"' : ''}><td style="max-width:260px">${esc(c.text)}</td><td><span class="chip">${esc(EVIDENCE_TYPES[c.type]?.label || c.type)}</span></td><td class="small">${esc(SOURCES[c.source].name)}${chain.length > 1 ? `<div class="tiny muted">via ${chain.slice(1).map(x => esc(SOURCES[x].name.split(' (')[0])).join(' → ')}</div>` : ''}${dep}</td><td class="small reg-root">${esc(SOURCES[root].name.split(' (')[0])}</td><td class="small"><span class="mono">${fmtTime(c.observedAt)}</span><div class="tiny ${stale ? 'down' : 'muted'}">${E.ageText(age)} ago${stale ? ' · stale' : ''}</div></td><td>${ind}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function notebooks() {
  return SQUADS.map(s => {
    const mine = s.id === state.notebookAs;
    const notes = claims.filter(c => c.scope === s.id);
    return `<div class="card" style="border-top:4px solid ${s.color};padding:14px" data-tour="nb-${s.id}"><h4>${esc(s.name)}</h4>${mine ? notes.map(n => `<p class="small" style="margin-top:8px">${esc(n.text)}</p><p class="tiny muted">${fmtTime(n.observedAt)}</p>`).join('') : `<p class="small muted lock" style="margin-top:8px">🔒 Private to Squad ${esc(s.name)}</p>`}</div>`;
  }).join('');
}

function recordCard(r) {
  const b = agentById[r.bot], sq = SQUADS.find(s => s.id === r.squad);
  const chip = { approved: 'ok', trimmed: 'warn', declined: 'bad', blocked: 'bad' }[r.decision];
  return `<article class="card rec ${r.decision}" data-rec="${r.id}" data-tour="rec-${r.id}">
    <div class="row" style="justify-content:space-between"><div class="row">${avatar(b, 'sm')}<div><b>${esc(b.name)}</b> <span class="small muted">· Squad ${esc(sq.name)} · ${r.asset} long</span><div class="tiny muted mono">${r.id} · ${fmtTime(r.at)}${r.example ? ' · example record' : ''}</div></div></div>
    <div class="row"><span class="chip ${chip}">${r.decision}</span><span class="chip demo">paper</span></div></div>
    <p class="small" style="margin-top:10px">${esc(r.rationale)}</p>
    <div class="row tiny muted" style="margin-top:6px"><span>Requested ${money(r.requested)}</span><span>→ Final ${money(r.final)}</span><span>Entry ${E.fmtP(r.entry)}</span>${r.stop ? `<span>Stop ${E.fmtP(r.stop)}</span>` : ''}</div>
    <details class="rec-more" data-tour="rec-more-${r.id}"><summary>Evidence and checks ›</summary>
      <div class="grid g2" style="margin-top:6px">
        <div><h4>Ava · evidence (${esc(r.ava.verdict)})</h4>${r.ava.checks.map(c => `<div class="check"><span class="ic ${c.status === 'ok' ? 'ok' : c.status === 'missing' ? 'bad' : 'warn'}">${c.status === 'ok' ? '✓' : c.status === 'missing' ? '✕' : '!'}</span><div><b>${esc(c.label)}</b> — ${esc(c.status)}<div class="tiny muted">${esc(c.detail)}</div></div></div>`).join('')}${r.ava.notes.map(n => `<p class="tiny muted" style="margin-top:4px">• ${esc(n)}</p>`).join('')}</div>
        <div><h4>Risk gate (${esc(r.risk.status)})</h4>${r.risk.checks.length ? r.risk.checks.map(c => `<div class="check"><span class="ic ${c.status === 'ok' ? 'ok' : c.status === 'blocked' ? 'bad' : 'warn'}">${c.status === 'ok' ? '✓' : c.status === 'blocked' ? '✕' : '↓'}</span><div><b>${esc(c.label)}</b> <span class="tiny muted">${esc(c.scope)} · ${esc(c.limit)}</span><div class="tiny muted">${esc(c.detail)}</div></div></div>`).join('') : '<p class="small muted">Not reached — the proposal stopped at evidence review.</p>'}</div>
      </div></details></article>`;
}

// ---------- research lab ----------
const STAGES = ['Observation', 'Research note', 'Proposal', 'Ava · evidence review', 'Risk gate', 'Sam · decision', 'Decision record'];
function renderStages() {
  const host = $('#stages'); if (!host) return;
  const sc = SCEN.find(s => s.id === state.lab.id);
  const res = state.lab.result || (state.lab.result = E.runScenario(sc, claims, cl));
  const k = state.lab.stage;
  const p = sc.proposal, b = agentById[p.bot], sq = SQUADS.find(s => s.id === p.squad);
  const avaTone = res.ava.verdict === 'sufficient' ? 'ok' : res.ava.verdict === 'blocked' ? 'bad' : 'warn';
  const riskTone = res.risk.status === 'ok' ? 'ok' : res.risk.status === 'trimmed' ? 'warn' : res.risk.status === 'skipped' ? '' : 'bad';
  const decTone = { approved: 'ok', trimmed: 'warn', declined: 'bad', blocked: 'bad' }[res.coach.decision];
  const body = [
    `<p class="small">${esc(sc.observation)}</p><span class="chip" style="margin-top:6px">shared with all five squads</span>`,
    `<p class="small">${esc(sc.note.text)}</p><span class="chip" style="margin-top:6px;background:${sq.color}22;color:${sq.color}">Squad ${esc(sq.name)} only</span>`,
    `<p class="small"><b>${esc(b.name)}</b> proposes a paper long of <b>${p.asset}</b> for ${money(p.sizeUsd)} at ${E.fmtP(p.entry)}, stop ${E.fmtP(p.stop)}.</p><div class="row" style="margin-top:6px">${p.evidence.map(id => { const c = claims.find(x => x.id === id); return `<span class="chip">${esc(EVIDENCE_TYPES[c.type].label)}</span>`; }).join('')}</div>${p.peerAgreement ? '<p class="tiny muted" style="margin-top:6px">Attached remark: “other squads agree”.</p>' : ''}${p.peerDisagreement ? '<p class="tiny muted" style="margin-top:6px">Attached remark: “another squad disagrees”.</p>' : ''}`,
    `<div data-tour="ava-checks">${res.ava.checks.map(c => `<div class="check" ${c.status !== 'ok' ? 'data-tour="ava-problem"' : ''}><span class="ic ${c.status === 'ok' ? 'ok' : c.status === 'missing' ? 'bad' : 'warn'}">${c.status === 'ok' ? '✓' : c.status === 'missing' ? '✕' : '!'}</span><div><b>${esc(c.label)}</b> — ${c.status === 'ok' ? 'present' : esc(c.status)}<div class="tiny muted">${esc(c.detail)}</div></div></div>`).join('')}</div>${res.ava.notes.map(n => `<p class="tiny muted" style="margin-top:4px">• ${esc(n)}</p>`).join('')}<span class="chip ${avaTone}" style="margin-top:8px" data-tour="ava-verdict">Verdict: ${esc(res.ava.verdict)}</span>`,
    res.risk.status === 'skipped' ? '<p class="small muted">Skipped — the proposal was stopped at evidence review. Limits are never a substitute for evidence.</p>' :
      `<div data-tour="risk-checks">${res.risk.checks.map(c => `<div class="check"><span class="ic ${c.status === 'ok' ? 'ok' : c.status === 'blocked' ? 'bad' : 'warn'}">${c.status === 'ok' ? '✓' : c.status === 'blocked' ? '✕' : '↓'}</span><div style="flex:1;min-width:0"><b>${esc(c.label)}</b> <span class="tiny muted">${esc(c.scope)} · ${esc(c.limit)}</span><div class="tiny muted">${esc(c.detail)}</div>${c.cap ? `<div class="meter" style="margin-top:4px"><span style="width:${c.used / c.cap * 100}%"></span><span class="add" style="left:${c.used / c.cap * 100}%;width:${c.add / c.cap * 100}%"></span></div>` : ''}</div></div>`).join('')}</div>`,
    `<span class="chip ${decTone}" data-tour="sam-decision">${esc(res.coach.decision)}</span><p class="small" style="margin-top:6px">${esc(res.coach.rationale)}</p>`,
    `<p class="small">Saved as <b class="mono">${esc(res.record.id)}</b> in Activity — proposal, evidence, checks, decision and rationale.</p><a class="btn sm" href="#/activity" style="margin-top:8px" data-tour="open-activity">Open Activity ›</a>`,
  ];
  const tones = ['', '', '', avaTone, riskTone, decTone, 'ok'];
  host.innerHTML = STAGES.map((s, i) => `<div class="stage ${i < k ? 'on ' + tones[i] : ''}" data-tour="stage-${i + 1}"><div class="dot">${i + 1}</div><div class="body"><h4>${esc(s)}</h4>${i < k ? `<div style="margin-top:6px">${body[i]}</div>` : '<p class="tiny muted">waiting…</p>'}</div></div>`).join('');
  const nb = $('#lab-next');
  if (nb) { nb.disabled = k >= STAGES.length; nb.textContent = k >= STAGES.length ? 'Done ✓' : k === 0 ? 'Next step › (start)' : 'Next step ›'; }
  if (k >= STAGES.length && !state.lab.saved) {
    state.lab.saved = true;
    const rec = { ...res.record, at: Date.now() };
    state.records.unshift(rec); saveRecords();
  }
}
export const lab = {
  select(id) { state.lab = { id, stage: 0, result: null, saved: false }; $$('#examples button').forEach(b => b.setAttribute('aria-pressed', b.dataset.example === id)); renderStages(); },
  next() { if (state.lab.stage < STAGES.length) { state.lab.stage++; renderStages(); } },
  setStage(n) { state.lab.stage = Math.max(0, Math.min(STAGES.length, n)); renderStages(); },
  get stage() { return state.lab.stage; },
  get id() { return state.lab.id; },
  latestRecordId() { return state.records[0]?.id; },
};

// ---------- after-render hooks ----------
const AFTER = {
  overview() { mountDecoSams(); },
  training() {
    mountDecoSams();
    const ol = $('#chap-ol');
    import('./steps.js').then(({ CHAPTERS }) => { if (ol) ol.innerHTML = CHAPTERS.map(c => `<li>${esc(c.title)} <span class="tiny muted">· ${c.count} steps</span></li>`).join(''); }).catch(() => {});
    const n = store.get('tourStep', 0);
    if (n > 0 && $('#resume-btn')) { $('#resume-btn').hidden = false; $('#resume-n').textContent = n + 1; }
  },
  team() {
    const host = $('#map');
    mapApi = renderMap(host, { onSelect: id => id ? openDrawer(id) : closeDrawer(), reducedMotion: reducedMotion() });
    let lastNarrow = mapApi.narrow;
    const ro = new ResizeObserver(() => {
      const narrow = host.clientWidth < 700;
      if (narrow !== lastNarrow && currentRoute === 'team') { lastNarrow = narrow; const cur = mapApi.current; mapApi = renderMap(host, { onSelect: id => id ? openDrawer(id) : closeDrawer(), reducedMotion: reducedMotion() }); if (cur) mapApi.select(cur, { silent: true }); }
    });
    ro.observe(host);
  },
  watchlist() {
    $$('.wl-row').forEach(r => {
      const t = () => watch.toggle(r.dataset.sym);
      r.addEventListener('click', t);
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
    });
    fitWatchGrid();
  },
  research() {
    $('#examples').addEventListener('click', e => { const b = e.target.closest('[data-example]'); if (b) lab.select(b.dataset.example); });
    $('#lab-next').addEventListener('click', () => lab.next());
    $('#lab-reset').addEventListener('click', () => lab.select(state.lab.id));
    $('#nb-seg').addEventListener('click', e => { const b = e.target.closest('[data-nb]'); if (b) notebook.view(b.dataset.nb); });
    renderStages();
  },
  activity() {
    $('#act-seg').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; state.activityFilter = b.dataset.f; const v = $('#view .view'); v.innerHTML = VIEWS.activity(); AFTER.activity(); });
  },
  growth() {
    $$('[data-imp]').forEach(b => b.addEventListener('click', () => growth.select(b.dataset.imp)));
    $('#growth-submit').addEventListener('click', () => growth.submit());
    fitGrowthGrid();
  },
  squads() {}, strategies() {}, safety() {},
};
function fitWatchGrid() { const g = $('#wl-grid'); if (g) g.style.gridTemplateColumns = window.innerWidth < 960 ? '1fr' : 'minmax(0,1.6fr) minmax(0,1fr)'; }
function fitGrowthGrid() { const g = $('#growth-grid'); if (g) g.style.gridTemplateColumns = window.innerWidth < 960 ? '1fr' : 'minmax(0,1fr) minmax(0,1.3fr)'; const t = $('#train-grid'); if (t) t.style.gridTemplateColumns = window.innerWidth < 960 ? '1fr' : 'minmax(0,1.2fr) minmax(0,1fr)'; }

export const watch = {
  toggle(sym, force) {
    const open = force ?? state.wlOpen !== sym;
    state.wlOpen = open ? sym : null;
    $$('.wl-row').forEach(r => r.setAttribute('aria-expanded', r.dataset.sym === state.wlOpen));
    $$('.wl-detail').forEach(d => d.classList.toggle('open', d.dataset.detail === state.wlOpen));
  },
};
export const notebook = {
  view(id) { state.notebookAs = id; $$('#nb-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.nb === id)); const g = $('#nb-grid'); if (g) g.innerHTML = notebooks(); },
};
export const growth = {
  select(id) { state.growth.id = id; const v = $('#view .view'); if (v && currentRoute === 'growth') { const y = window.scrollY; v.innerHTML = VIEWS.growth(); AFTER.growth(); window.scrollTo({ top: y, behavior: 'instant' }); } },
  submit() {
    const imp = E.IMPROVEMENTS.find(i => i.id === state.growth.id);
    if (!state.growth.submitted.some(s => s.id === imp.id)) {
      state.growth.submitted.unshift({ id: imp.id, title: imp.title, when: new Date().toLocaleString() });
      store.set('improvements', state.growth.submitted.slice(0, 20));
    }
    const q = $('#growth-queue');
    if (q) q.innerHTML = state.growth.submitted.map(s => `<div class="member"><span class="chip warn">awaiting review</span><div class="small"><b>${esc(s.title)}</b><div class="tiny muted">Submitted ${esc(s.when)} · next: Ava evidence review, then Sam (demonstration — no reviewer is running)</div></div></div>`).join('');
    toast('Queued for review (stored in this browser only).');
  },
};
export const team = {
  select(id) { if (mapApi) mapApi.select(id); else if (id) openDrawer(id); },
  clear() { mapApi?.select(null, { silent: true }); closeDrawer(); },
};

// ---------- drawer ----------
function openDrawer(id) {
  const a = nodeInfo(id); if (!a) return;
  const d = $('#drawer');
  const sq = a.squad ? SQUADS.find(s => s.id === a.squad) : null;
  const strat = a.strategy ? STRATEGIES[a.strategy] : null;
  const list = (t, arr, tour) => arr?.length ? `<section ${tour ? `data-tour="${tour}"` : ''}><h4>${t}</h4><ul class="ticks small">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
  let body;
  if (a.kind === 'bot') {
    const r = agentById[sq.researcher];
    body = `<section><h4>Role</h4><p class="small">Runs <b>${esc(strat.name)}</b> for Squad ${esc(sq.name)} with its own $50 paper account.</p></section>
      ${list('Responsibilities', ['Apply the written strategy rules exactly', 'Attach every required evidence item to a proposal', 'Respect the account\'s individual limits'])}
      ${list('Inputs', ['Shared market observations', `Research notes from ${r.name} (Squad ${sq.name} only)`, 'Coaching feedback from Sam'])}
      ${list('Outputs', ['Paper-trade proposals + evidence → Ava'])}
      ${list('Permitted tools', ['Shared market feed (read)', `${sq.name} notebook (read)`, 'Proposal form'])}
      ${list('Restrictions', ['Cannot see other squads\' notes', 'Cannot skip Ava or the risk gate', 'Cannot place orders — no exchange connection exists', 'Cannot change its own strategy (only via Growth lab review)'], 'drawer-restrictions')}
      <section><h4>Required evidence</h4><div class="row">${strat.evidence.map(e => `<span class="chip acc">${esc(EVIDENCE_TYPES[e].label)}</span>`).join('')}</div></section>
      <section><h4>Handoff</h4><p class="small">Sends a complete proposal to Ava; waits for Sam's decision record.</p></section>`;
  } else {
    body = `<section><h4>Role</h4><p class="small">${esc(a.role)}</p></section>
      ${list('Responsibilities', a.responsibilities)}${list('Inputs', a.inputs, 'drawer-inputs')}${list('Outputs', a.outputs)}${list('Permitted tools', a.tools)}${list('Restrictions', a.restrictions, 'drawer-restrictions')}
      <section><h4>Handoff</h4><p class="small">${esc(a.handoff)}</p></section>`;
  }
  d.innerHTML = `<button class="btn icon-btn ghost close" aria-label="Close details" data-tour="drawer-close">✕</button>
    <div class="row" style="flex-wrap:nowrap;padding-right:36px">${a.kind === 'system' ? `<span class="avatar lg" style="--c:${a.color}">◆</span>` : avatar(a, 'lg')}<div><h2 style="font-size:22px">${esc(a.name)}</h2><p class="small muted">${esc(a.persona || (a.kind === 'system' ? 'System component · not an agent' : ''))}</p>${sq ? `<span class="chip" style="margin-top:4px;background:${sq.color}22;color:${sq.color}">Squad ${esc(sq.name)}</span>` : ''}</div></div>${body}
    <p class="tiny muted" style="margin-top:16px">Role definition applied by the in-browser engine — not a live autonomous agent.</p>`;
  d.querySelector('.close').addEventListener('click', () => { team.clear(); });
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  d.scrollTop = 0;
  window.dispatchEvent(new Event('sl:layout'));
}
export function closeDrawer() {
  const d = $('#drawer'); if (!d || !d.classList.contains('open')) return;
  d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
  window.dispatchEvent(new Event('sl:layout'));
}

// ---------- decorative Sam ----------
let samModule = null;
export async function loadSam() {
  if (samModule) return samModule;
  samModule = await import('./sam.js');
  return samModule;
}
async function mountDecoSams() {
  if (document.body.classList.contains('touring')) return;
  try {
    const { createSam } = await loadSam();
    for (const slot of $$('[data-deco-sam]')) {
      if (slot.firstChild) continue;
      const size = Math.min(+slot.dataset.decoSam, Math.max(110, slot.parentElement.clientHeight * 0.78));
      const s = createSam({ size, reducedMotion: reducedMotion() });
      s.el.style.position = 'relative';
      slot.appendChild(s.el);
      s.setExpression('happy');
      decoSams.push(s);
    }
  } catch (e) { console.warn('Sam could not be drawn', e); }
}
function destroyDecoSams() { while (decoSams.length) { try { decoSams.pop().destroy(); } catch { /* ignore */ } } }
export function hideDecoSams(hide) { if (hide) { destroyDecoSams(); $$('[data-deco-sam]').forEach(s => (s.innerHTML = '')); } else mountDecoSams(); }

// ---------- boot ----------
export function init() {
  renderNav();
  const r = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'overview';
  go(r, { fromTour: true });
  window.addEventListener('hashchange', () => { const r2 = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (r2 && r2 !== currentRoute) go(r2); });
  window.addEventListener('resize', () => { fitWatchGrid(); fitGrowthGrid(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#drawer')?.classList.contains('open') && !document.body.classList.contains('sheet-open')) team.clear(); });
}
export { state, market, store, STAGES };
