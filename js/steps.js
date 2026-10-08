// The 38-step guided walkthrough. Each step uses the real interface.
// route: page to show · target: element Sam walks to and taps · prep: idempotent state setup
// (so any step can be reached directly) · act: what Sam's tap does · clip: approved recording.
const T = id => `[data-tour="${id}"]`;

export const CHAPTER_TITLES = [
  'Welcome', 'My team', 'Watchlist', 'Squads & strategies', 'Evidence review',
  'A valid proposal', 'Missing evidence', 'Correlated bets & risk limits', 'Decision records', 'Proposing improvements',
];

export const STEPS = [
  // 1 · Welcome
  { ch: 0, route: 'overview', target: T('demo-pill'), clip: 'sam-take-your-time', expr: 'happy',
    text: "Take your time. I'll walk you through it. This badge is the first thing to know: Survival League is a research and paper-trading lab, and everything in it runs on simulated data." },
  { ch: 0, route: 'overview', target: T('capital-500'),
    text: 'We start with five hundred simulated dollars, split into ten separate fifty-dollar accounts. One bot, one account. Money never moves between them.' },
  { ch: 0, route: 'overview', target: `${T('pipeline')} .st:first-child`, clip: 'sam-in-happens-out',
    text: 'See what comes in, what happens, and what comes out. Every idea passes the same seven stations: observe, research, propose, review, limit, decide, and record.' },
  { ch: 0, route: 'overview', target: `${T('honesty')} .label-demo`, expr: 'think',
    text: "Here's what is real and what isn't. The rules, checks and records truly run in your browser. Prices and news are simulated. There are no live agents, no live scans, and no orders." },

  // 2 · My team
  { ch: 1, route: 'team', target: T('node-feed'), clip: 'sam-walk-you-through', prep: a => a.team.clear(),
    text: "I'll walk you through it. This map shows who may talk to whom. At the top, the shared market feed sends the same timestamped observations to every squad." },
  { ch: 1, route: 'team', target: T('node-alex'), prep: a => a.team.clear(), act: a => a.team.select('alex'), after: '#drawer h2',
    text: "Each researcher serves exactly two bots. Alex writes notes only for Ben and Maya. Tapping him highlights his connections and opens his card." },
  { ch: 1, route: 'team', target: T('drawer-restrictions'), prep: a => a.team.select('alex'),
    text: "His card lists his role, inputs, outputs and permitted tools — and his restrictions. He can't read other squads' notebooks, and he can't size trades." },
  { ch: 1, route: 'team', target: T('map-blocked'), prep: a => a.team.clear(), expr: 'warn',
    text: "These red marks are the walls between squads. Research opinions never cross them, so one squad's mistake can't quietly become everyone's." },
  { ch: 1, route: 'team', target: T('node-ava'), prep: a => a.team.clear(), act: a => a.team.select('ava'), after: '#drawer h2',
    text: "Ava is our independent evidence reviewer. She reviews one squad at a time. Agreement doesn't convince her, and disagreement alone doesn't sink a sound proposal." },
  { ch: 1, route: 'team', target: T('node-sam'), prep: a => a.team.clear(), act: a => a.team.select('sam'), after: '#drawer h2', expr: 'happy',
    text: "And that's me, the head coach. I read Ava's verdict and the risk checks, apply the combined limits, and write the decision record. I can't override missing evidence." },

  // 3 · Watchlist
  { ch: 2, route: 'watchlist', target: T('wl-BTC'), prep: a => a.watch.toggle(null, false),
    text: 'The watchlist holds research candidates: simulated assets the squads keep an eye on, with a small chart and how many strategy signals are firing.' },
  { ch: 2, route: 'watchlist', target: T('wl-SOL'), prep: a => a.watch.toggle(null, false), act: a => a.watch.toggle('SOL', true),
    text: "Tap a row to see why it's here. Each line is a written strategy rule with the numbers behind it — never just a hunch." },
  { ch: 2, route: 'watchlist', target: `${T('alert-BTC')} b`, prep: a => a.watch.toggle('SOL', true),
    text: 'Alerts are previews only. They show what a notification would say and where it would go. Nothing is ever sent from this site.' },

  // 4 · Squads & strategies
  { ch: 3, route: 'squads', target: `${T('squad-atlas')} h3`,
    text: 'Five squads, each with one researcher and two bots. Their colours follow them everywhere, so you can always tell who said what.' },
  { ch: 3, route: 'squads', target: `${T('acct-ben')} .acct b`,
    text: "Each bot has its own fifty-dollar paper account. These are backtest results on one simulated price path — a practice field, not a forecast." },
  { ch: 3, route: 'strategies', target: `${T('strat-trend')} h3`,
    text: "Every strategy is written out: entry, exit, stop, sizing, and its known weakness. Ben's is the Trend Rider." },
  { ch: 3, route: 'strategies', target: T('strat-ev-trend'), expr: 'think',
    text: 'These chips are the evidence Ben must attach to every proposal. If any one of them is missing, the proposal stops.' },

  // 5 · Evidence review
  { ch: 4, route: 'research', target: T('registry-title'),
    text: 'This is the evidence registry. Every claim keeps its original source, its dependencies, and the time it was observed.' },
  { ch: 4, route: 'research', target: `${T('echo-row')} td:first-child`, expr: 'warn',
    text: 'Look closely. Four reports about LINK, but all of them trace back to a single social post. Copies count once. Repetition is not confirmation.' },
  { ch: 4, route: 'research', target: `${T('stale-row')} td:first-child`,
    text: "Timestamps matter too. This regime snapshot is three days old, so it no longer counts as fresh evidence." },
  { ch: 4, route: 'research', target: T('nb-atlas'), prep: a => a.notebook.view('atlas'),
    text: "Notebooks are private. In Atlas's seat I can read Atlas's notes. Every other squad's notebook stays locked." },

  // 6 · A valid proposal
  { ch: 5, route: 'research', target: T('ex-valid'), clip: 'sam-choose-example', act: a => a.lab.select('valid'),
    text: "Choose an example, then press Next step. Let's start with a valid proposal from Ben." },
  { ch: 5, route: 'research', target: T('next-step'), prep: a => { if (a.lab.id !== 'valid' || a.lab.stage > 0) a.lab.select('valid'); }, act: a => a.lab.setStage(3),
    text: "I press Next step. A shared observation arrives, Alex writes a team-only note, and Ben proposes a twenty-dollar paper trade with his evidence attached." },
  { ch: 5, route: 'research', target: T('ava-verdict'), prep: a => { if (a.lab.id !== 'valid') a.lab.select('valid'); a.lab.setStage(4); },
    text: "Ava checks each required item: present, fresh, and traceable to an original source. Everything's there, so her verdict is sufficient." },
  { ch: 5, route: 'research', target: T('sam-decision'), prep: a => { if (a.lab.id !== 'valid') a.lab.select('valid'); a.lab.setStage(7); }, expr: 'happy',
    text: 'The risk gate finds every limit holds, so I approve it — on paper. A decision record is saved automatically.' },

  // 7 · Missing evidence
  { ch: 6, route: 'research', target: T('ex-missing'), act: a => { a.lab.select('missing'); a.lab.setStage(4); },
    text: "Now Maya's breakout on SOL. The price broke out — but where is the volume confirmation her strategy requires?" },
  { ch: 6, route: 'research', target: T('ava-problem'), prep: a => { if (a.lab.id !== 'missing') a.lab.select('missing'); a.lab.setStage(4); }, expr: 'warn',
    text: "Missing. Because it's required, the proposal is blocked right here. It never even reaches the risk gate." },
  { ch: 6, route: 'research', target: T('sam-decision'), prep: a => { if (a.lab.id !== 'missing') a.lab.select('missing'); a.lab.setStage(7); },
    text: 'No one can override that — not even me. Maya can resubmit once the volume evidence exists. A good idea with missing evidence still waits.' },

  // 8 · Correlated bets & risk limits
  { ch: 7, route: 'research', target: T('ex-correlated'), act: a => { a.lab.select('correlated'); a.lab.setStage(5); },
    text: 'Correlated bets. Noah wants SOL — but other squads already hold BTC, ETH, AVAX and SOL. Another squad disagrees with him, too.' },
  { ch: 7, route: 'research', target: `${T('risk-checks')} .check:nth-child(4) b`, prep: a => { if (a.lab.id !== 'correlated') a.lab.select('correlated'); a.lab.setStage(5); }, expr: 'think',
    text: "The disagreement didn't block him; his evidence is complete. But those assets move together, and the cluster has only ten dollars of room left. So his trade is trimmed to ten." },
  { ch: 7, route: 'safety', target: `${T('limits-individual')} h3`,
    text: 'There are two layers of limits. Each fifty-dollar account may hold at most twenty-five dollars per position, and may lose no more than one dollar at the stop.' },
  { ch: 7, route: 'safety', target: T('cluster-meter'),
    text: 'Across the whole five hundred, correlated clusters, total exposure, and any single asset are each capped as well.' },
  { ch: 7, route: 'safety', target: `${T('corr-matrix')} h3`,
    text: 'The clusters come from this correlation matrix, computed from simulated returns. Four different names can really be one big bet.' },
  { ch: 7, route: 'safety', target: `${T('honest-limits')} .callout strong`, expr: 'think',
    text: 'An honest note: these controls reduce correlated mistakes. They never eliminate them. Correlations change, especially in a storm.' },

  // 9 · Decision records
  { ch: 8, route: 'activity', target: '#records article:first-of-type .chip',
    text: 'Every decision leaves a record you can read: who proposed what, which evidence existed, which limits applied, and why I decided as I did.' },
  { ch: 8, route: 'activity', target: '#records article:first-of-type details summary', act: a => { const d = document.querySelector('#records article:first-of-type details'); if (d) d.open = true; },
    text: "Open one to see Ava's checks and every risk-gate line. When something goes wrong later, this is where we learn from it." },

  // 10 · Proposing improvements
  { ch: 9, route: 'growth', target: T('imp-ben-fast'), act: a => a.growth.select('ben-fast'),
    text: "Anyone can propose an improvement. Here, faster averages for Ben. The lab compares it on bars it was tuned on, and on bars it has never seen." },
  { ch: 9, route: 'growth', target: T('growth-submit'), prep: a => a.growth.select('ben-fast'), act: a => a.growth.submit(), expr: 'happy',
    text: "If it only shines where it was tuned, that's curve-fitting. Either way, it goes to Ava and me for review before anything changes. That's the tour — thanks for walking with me!" },
];

export const CHAPTERS = CHAPTER_TITLES.map((title, i) => ({ title, first: STEPS.findIndex(s => s.ch === i), count: STEPS.filter(s => s.ch === i).length }));
