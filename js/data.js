// Static definitions for Survival League. Everything here describes a SIMULATION:
// no live data feeds, no live agents, no exchange connection, no real orders.

export const START_CAPITAL = 500;
export const ACCOUNT_SIZE = 50;

export const SQUADS = [
  { id: 'atlas',   name: 'Atlas',   color: '#ff7a45', focus: 'Trend & breakout',          researcher: 'alex',   bots: ['ben', 'maya'] },
  { id: 'tide',    name: 'Tide',    color: '#2fb5a8', focus: 'Mean reversion',            researcher: 'emma',   bots: ['grace', 'ethan'] },
  { id: 'compass', name: 'Compass', color: '#7c6cf2', focus: 'Rotation & pullbacks',      researcher: 'jack',   bots: ['noah', 'chloe'] },
  { id: 'lantern', name: 'Lantern', color: '#f2b72f', focus: 'Positioning & volatility',  researcher: 'olivia', bots: ['mason', 'luke'] },
  { id: 'harbor',  name: 'Harbor',  color: '#3b8ef0', focus: 'Accumulation & catalysts',  researcher: 'lily',   bots: ['zoe', 'ryan'] },
];

// Evidence types a strategy can require.
export const EVIDENCE_TYPES = {
  PRICE_SIGNAL:   { label: 'Price signal',        desc: 'The strategy rule computed from (simulated) price bars.' },
  VOLUME_CONFIRM: { label: 'Volume confirmation', desc: 'Volume at least 1.5× its 20-bar average on the signal bar.' },
  REGIME:         { label: 'Market regime',       desc: 'Shared observation: is the broad market trending, ranging or stressed?' },
  VOLATILITY:     { label: 'Volatility reading',  desc: 'Band width / ATR measurement from the shared feed.' },
  LIQUIDITY:      { label: 'Liquidity check',     desc: 'Simulated spread and depth are adequate for the size.' },
  FUNDING:        { label: 'Funding reading',     desc: 'Simulated perpetual funding rate (positioning proxy).' },
  CATALYST:       { label: 'Catalyst (2 independent sources)', desc: 'An event claim confirmed by at least two independent original sources.' },
  STOP_PLAN:      { label: 'Stop plan',           desc: 'A written exit price and the loss it implies.' },
  BUDGET_CAP:     { label: 'Budget cap',          desc: 'Maximum total allocation for a scheduled-buy plan.' },
};

const R = (id, name, squad, color, persona, extra) => ({ id, name, squad, color, persona, kind: 'researcher', ...extra });
const B = (id, name, squad, color, persona, extra) => ({ id, name, squad, color, persona, kind: 'bot', ...extra });

export const AGENTS = [
  // ---- Researchers: each serves exactly two bots, inside one squad ----
  R('alex', 'Alex', 'atlas', '#ff7a45', 'Map-reader. Calm, sketches trend lines in the margins.', {
    role: 'Researcher for Squad Atlas (Ben & Maya).',
    responsibilities: ['Turn shared observations into trend and breakout notes', 'Flag when a trend looks tired', 'Attach original sources and timestamps to every claim'],
    tools: ['Shared market feed (read)', 'Atlas notebook (read/write)', 'Evidence registry (append)'],
    inputs: ['Shared market observations'],
    outputs: ['Research notes → Ben, Maya only'],
    restrictions: ['Cannot read other squads\' notebooks', 'Cannot send opinions outside Atlas', 'Cannot propose or size trades'],
    handoff: 'Hands a note to Ben or Maya; the bot decides whether to propose.',
  }),
  R('emma', 'Emma', 'tide', '#2fb5a8', 'Patient tide-watcher. Loves a stretched rubber band.', {
    role: 'Researcher for Squad Tide (Grace & Ethan).',
    responsibilities: ['Find oversold / overstretched conditions', 'Check that the longer trend is not broken', 'Record sources and timestamps'],
    tools: ['Shared market feed (read)', 'Tide notebook (read/write)', 'Evidence registry (append)'],
    inputs: ['Shared market observations'],
    outputs: ['Research notes → Grace, Ethan only'],
    restrictions: ['Cannot read other squads\' notebooks', 'Cannot send opinions outside Tide', 'Cannot propose or size trades'],
    handoff: 'Hands a note to Grace or Ethan.',
  }),
  R('jack', 'Jack', 'compass', '#7c6cf2', 'Restless navigator. Always asks “stronger than what?”', {
    role: 'Researcher for Squad Compass (Noah & Chloe).',
    responsibilities: ['Rank assets by relative strength', 'Spot orderly pullbacks inside uptrends', 'Record sources and timestamps'],
    tools: ['Shared market feed (read)', 'Compass notebook (read/write)', 'Evidence registry (append)'],
    inputs: ['Shared market observations'],
    outputs: ['Research notes → Noah, Chloe only'],
    restrictions: ['Cannot read other squads\' notebooks', 'Cannot send opinions outside Compass', 'Cannot propose or size trades'],
    handoff: 'Hands a note to Noah or Chloe.',
  }),
  R('olivia', 'Olivia', 'lantern', '#f2b72f', 'Lantern-holder. Shines light on crowded positioning.', {
    role: 'Researcher for Squad Lantern (Mason & Luke).',
    responsibilities: ['Read simulated funding and volatility', 'Warn when the crowd leans one way', 'Record sources and timestamps'],
    tools: ['Shared market feed (read)', 'Lantern notebook (read/write)', 'Evidence registry (append)'],
    inputs: ['Shared market observations'],
    outputs: ['Research notes → Mason, Luke only'],
    restrictions: ['Cannot read other squads\' notebooks', 'Cannot send opinions outside Lantern', 'Cannot propose or size trades'],
    handoff: 'Hands a note to Mason or Luke.',
  }),
  R('lily', 'Lily', 'harbor', '#3b8ef0', 'Harbor-master. Careful with schedules and headlines.', {
    role: 'Researcher for Squad Harbor (Zoe & Ryan).',
    responsibilities: ['Maintain the scheduled-buy calendar', 'Trace every news claim back to its original source', 'Count independent confirmations, not copies'],
    tools: ['Shared market feed (read)', 'Harbor notebook (read/write)', 'Evidence registry (append)'],
    inputs: ['Shared market observations', 'Example news items (simulated)'],
    outputs: ['Research notes → Zoe, Ryan only'],
    restrictions: ['Cannot read other squads\' notebooks', 'Cannot send opinions outside Harbor', 'Cannot propose or size trades'],
    handoff: 'Hands a note to Zoe or Ryan.',
  }),

  // ---- Strategy bots ----
  B('ben', 'Ben', 'atlas', '#ff8f5e', 'Steady trend rider. Never argues with the tide.', { strategy: 'trend' }),
  B('maya', 'Maya', 'atlas', '#ff6b8b', 'Breakout hunter. Waits for the crowd to show up.', { strategy: 'breakout' }),
  B('grace', 'Grace', 'tide', '#36c9b4', 'Rubber-band stretcher. Buys calm after panic.', { strategy: 'reversion' }),
  B('ethan', 'Ethan', 'tide', '#4aa8d8', 'Band fader. Trusts the middle of the range.', { strategy: 'bands' }),
  B('noah', 'Noah', 'compass', '#8f7cf7', 'Relay runner. Passes the baton to the strongest.', { strategy: 'rotation' }),
  B('chloe', 'Chloe', 'compass', '#c36cf2', 'Pullback picker. Likes a pause in a climb.', { strategy: 'pullback' }),
  B('mason', 'Mason', 'lantern', '#e8a21f', 'Crowd contrarian. Leans against one-sided bets.', { strategy: 'funding' }),
  B('luke', 'Luke', 'lantern', '#d4c22a', 'Squeeze spotter. Watches quiet before noise.', { strategy: 'squeeze' }),
  B('zoe', 'Zoe', 'harbor', '#4f9df7', 'Steady stacker. Small, scheduled, capped.', { strategy: 'dca' }),
  B('ryan', 'Ryan', 'harbor', '#2f6fd6', 'Catalyst checker. Two real sources or no trade.', { strategy: 'catalyst' }),

  // ---- Independent reviewers ----
  {
    id: 'ava', name: 'Ava', kind: 'reviewer', color: '#e2557a',
    persona: 'Independent evidence reviewer. Polite, unimpressed by repetition.',
    role: 'Reviews each squad\'s proposals separately against the evidence registry.',
    responsibilities: ['Check every required evidence item is present', 'Trace claims to original sources and count independent ones', 'Check timestamps and freshness', 'Note shared dependencies (e.g. one data vendor behind two claims)'],
    tools: ['Evidence registry (read)', 'Shared market feed (read)', 'Proposal inbox (one squad at a time)'],
    inputs: ['Proposals + evidence from bots', 'Shared observations with timestamps'],
    outputs: ['Evidence verdict → Risk gate'],
    restrictions: ['Never sees other squads\' opinions while reviewing', 'Cannot size, approve or place trades', 'Agreement between squads is not counted as evidence', 'Cannot waive a missing required item'],
    handoff: 'Passes a verdict (sufficient / insufficient / blocked) to the risk gate.',
  },
  {
    id: 'sam', name: 'Sam', kind: 'coach', color: '#5b78d6',
    persona: 'Head coach. Warm, unhurried, carries a wooden stick.',
    role: 'Reviews checked proposals, applies combined limits, writes decision records and explains the system.',
    responsibilities: ['Read Ava\'s verdict and the risk-gate result', 'Apply combined limits across correlated positions', 'Approve, trim or decline — on paper only', 'Write an understandable decision record', 'Coach squads and review improvement proposals'],
    tools: ['Risk gate results (read)', 'Paper ledger (write)', 'Decision records (write)', 'Coaching notes (broadcast)'],
    inputs: ['Evidence verdict', 'Risk-gate checks', 'Current paper portfolio'],
    outputs: ['Decision record → Paper ledger', 'Coaching feedback → bots'],
    restrictions: ['Cannot override a missing-evidence block', 'Cannot exceed individual or combined limits', 'Paper decisions only — no exchange connection exists', 'Coaching is general, never another squad\'s research'],
    handoff: 'Writes the decision record; the paper ledger updates; feedback goes to the bot.',
  },
];

export const agentById = Object.fromEntries(AGENTS.map(a => [a.id, a]));

// Ten explicitly defined strategies (each bot runs exactly one).
export const STRATEGIES = {
  trend: {
    bot: 'ben', name: 'Trend Rider',
    entry: 'Long when the 20-bar average is above the 50-bar average and price closes above the 20-bar average.',
    exit: 'Close when price closes below the 50-bar average, or the stop is hit.',
    stop: '2 × ATR(14) below entry.',
    sizing: 'Risk at most 2% of the $50 account per trade; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'REGIME', 'STOP_PLAN'],
    weakness: 'Choppy, sideways markets cause repeated small losses.',
  },
  breakout: {
    bot: 'maya', name: 'Breakout Hunter',
    entry: 'Long when price closes above its 20-bar high AND volume is at least 1.5× its 20-bar average.',
    exit: 'Close on a close back below the 10-bar low, or the stop.',
    stop: 'Just below the breakout level (prior 20-bar high − 1 × ATR).',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'VOLUME_CONFIRM', 'STOP_PLAN'],
    weakness: 'False breakouts; needs volume to separate real moves from noise.',
  },
  reversion: {
    bot: 'grace', name: 'Rubber Band',
    entry: 'Long when RSI(14) is below 35 while price is still above the 100-bar average.',
    exit: 'Close at the 20-bar average, or after 10 bars, or at the stop.',
    stop: '1.5 × ATR(14) below entry.',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'REGIME', 'STOP_PLAN'],
    weakness: 'Catching falling knives when the long-term trend breaks.',
  },
  bands: {
    bot: 'ethan', name: 'Band Fader',
    entry: 'Long when price closes back inside the lower Bollinger band (20, 2σ) after closing below it.',
    exit: 'Close at the middle band, or at the stop.',
    stop: 'Lowest low of the last 5 bars.',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'VOLATILITY', 'STOP_PLAN'],
    weakness: 'Strong trends walk along the band and never revert.',
  },
  rotation: {
    bot: 'noah', name: 'Relay Runner',
    entry: 'Hold the one asset with the best 30-bar return relative to BTC, only if its own 30-bar return is positive.',
    exit: 'Rotate when another asset leads for 3 consecutive bars; exit to cash if returns turn negative.',
    stop: '10% below entry.',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'LIQUIDITY', 'STOP_PLAN'],
    weakness: 'Late to turns; leaders can reverse together.',
  },
  pullback: {
    bot: 'chloe', name: 'Pullback Picker',
    entry: 'Long when the 50-bar average is rising and price has fallen 2 bars in a row to within 2% of the 20-bar average.',
    exit: 'Close at the prior swing high, or at the stop.',
    stop: '1 × ATR below the 20-bar average.',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['PRICE_SIGNAL', 'REGIME', 'STOP_PLAN'],
    weakness: 'A pullback can become a reversal.',
  },
  funding: {
    bot: 'mason', name: 'Crowd Contrarian',
    entry: 'Long when simulated funding is below −0.02% for 2 bars (crowd heavily short) and price makes a higher low.',
    exit: 'Close when funding returns to neutral (above 0%) or at the stop.',
    stop: 'Below the most recent swing low.',
    sizing: '2% account risk cap; position at most $20.',
    evidence: ['FUNDING', 'PRICE_SIGNAL', 'STOP_PLAN'],
    weakness: 'Crowds can stay one-sided longer than the account can wait.',
  },
  squeeze: {
    bot: 'luke', name: 'Squeeze Spotter',
    entry: 'Long when Bollinger band width touched (within 15%) its 60-bar low in the last 5 bars and price closes above the upper band on volume ≥ 1.2× average.',
    exit: 'Close when price closes back inside the middle band, or at the stop.',
    stop: 'Middle band at entry.',
    sizing: '2% account risk cap; position at most $25.',
    evidence: ['VOLATILITY', 'PRICE_SIGNAL', 'VOLUME_CONFIRM', 'STOP_PLAN'],
    weakness: 'Squeezes can resolve downward; long-only misses those.',
  },
  dca: {
    bot: 'zoe', name: 'Steady Stacker',
    entry: 'Buy $2 of BTC every 7 bars, whatever the price.',
    exit: 'No timed exit; the plan pauses once $30 is allocated.',
    stop: 'None by design — the budget cap is the protection.',
    sizing: '$2 per buy; total allocation capped at $30 of the $50 account.',
    evidence: ['BUDGET_CAP'],
    weakness: 'No downside exit; relies entirely on the cap.',
  },
  catalyst: {
    bot: 'ryan', name: 'Catalyst Checker',
    entry: 'Long only when an event claim has at least two independent original sources, both fresh (< 24h), and price confirms (close above prior day high).',
    exit: 'Close after 5 bars or at the stop.',
    stop: 'Prior day low.',
    sizing: '2% account risk cap; position at most $20.',
    evidence: ['CATALYST', 'PRICE_SIGNAL', 'STOP_PLAN'],
    weakness: 'Echoed headlines look like confirmation but are one source.',
  },
};

// Risk limits. Individual limits apply per $50 account; combined limits across the $500.
export const LIMITS = {
  individual: {
    maxPositionPct: 0.5,     // $25 of $50
    maxRiskPct: 0.02,        // $1 of $50 at the stop
    maxOpenPositions: 2,
    stopRequired: true,
  },
  combined: {
    clusterCapPct: 0.25,     // correlated cluster exposure ≤ $125
    grossCapPct: 0.6,        // all open exposure ≤ $300
    sameAssetCapPct: 0.2,    // any one asset across all accounts ≤ $100
    correlationThreshold: 0.6,
    minTradeUsd: 5,
  },
};

// Simulated asset parameters (single-factor model: return = beta·market + idiosyncratic).
export const ASSETS = [
  { sym: 'BTC',  name: 'Bitcoin (simulated)',   start: 62000, beta: 1.0,  idio: 0.006, drift: 0.0008 },
  { sym: 'ETH',  name: 'Ether (simulated)',     start: 3100,  beta: 1.15, idio: 0.009, drift: 0.0006 },
  { sym: 'SOL',  name: 'Solana (simulated)',    start: 145,   beta: 1.35, idio: 0.013, drift: 0.0010 },
  { sym: 'AVAX', name: 'Avalanche (simulated)', start: 28,    beta: 1.3,  idio: 0.014, drift: 0.0002 },
  { sym: 'LINK', name: 'Chainlink (simulated)', start: 14,    beta: 0.7,  idio: 0.026, drift: 0.0007 },
  { sym: 'DOGE', name: 'Dogecoin (simulated)',  start: 0.12,  beta: 0.55, idio: 0.038, drift: 0.0003 },
];

// Sources for the evidence registry. "root" marks an original source.
export const SOURCES = {
  feed:      { name: 'Shared market feed (simulated bars)', kind: 'market-data', root: true },
  feedVol:   { name: 'Shared feed — volume bars',           kind: 'market-data', root: true, dependsOn: 'Exchange data vendor A (simulated)' },
  feedFund:  { name: 'Shared feed — funding rates',         kind: 'market-data', root: true, dependsOn: 'Exchange data vendor A (simulated)' },
  regime:    { name: 'Shared regime monitor',               kind: 'derived',     root: true },
  postX:     { name: 'Single social post by @chainwhisper (example)', kind: 'social', root: true },
  blogA:     { name: 'CryptoDaily Wire (example)',           kind: 'news', root: false, cites: 'postX' },
  blogB:     { name: 'Token Times (example)',                kind: 'news', root: false, cites: 'postX' },
  blogC:     { name: 'Market Minute newsletter (example)',   kind: 'news', root: false, cites: 'blogA' },
  filing:    { name: 'Project governance forum post (example)', kind: 'primary', root: true },
  exchNote:  { name: 'Exchange listing notice (example)',    kind: 'primary', root: true },
  notebook:  { name: 'Squad notebook (team-only)',           kind: 'research', root: true },
};

export const DEMO_NOTE = 'Simulated prices · Paper accounts · Example alerts · No live agents, scans, or orders';
