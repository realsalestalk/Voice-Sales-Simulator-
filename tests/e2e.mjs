// End-to-end walkthrough verification with Playwright + Chromium.
// Usage: start a static server on :8080 (npm run serve), then `node tests/e2e.mjs [outDir]`.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.env.BASE || 'http://localhost:8080/';
const OUT = process.argv[2] || 'tests/out';
const ONLY = process.env.VP;
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
  { name: 'laptop-1280', width: 1280, height: 720, touch: false },
  { name: 'phone-390', width: 390, height: 844, touch: true, dpr: 3 },
  { name: 'phone-360', width: 360, height: 780, touch: true, dpr: 3 },
  { name: 'fold7-closed', width: 412, height: 960, touch: true, dpr: 2.625 },   // approx. cover screen
  { name: 'fold7-open', width: 832, height: 750, touch: true, dpr: 2.625 },     // approx. inner screen
].filter(v => !ONLY || v.name === ONLY);

const results = [];
const fail = (vp, msg) => { results.push({ vp, ok: false, msg }); console.log(`  ✗ ${msg}`); };
const pass = (vp, msg) => { results.push({ vp, ok: true, msg }); };

async function waitPhase(page, idx, phases = ['narrating', 'idle'], timeout = 20000) {
  return page.waitForFunction(([i, ph]) => { const d = window.__tour?.debug(); return d && d.idx === i && ph.includes(d.phase); }, [idx, phases], { timeout, polling: 50 });
}
async function measure(page) {
  return page.evaluate(() => {
    const t = window.__tour; const d = t.debug();
    const el = t.target; if (!el) return { d, missing: true };
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const dockTop = document.querySelector('.dock').getBoundingClientRect().top;
    const topSafe = t.topSafe();
    const samBox = { left: d.pos.x, top: d.pos.y, right: d.pos.x + d.samW, bottom: d.pos.y + d.samH };
    const body = { left: samBox.left + d.samW * 0.18, right: samBox.right - d.samW * 0.18, top: samBox.top + d.samH * 0.08, bottom: samBox.bottom };
    const ov = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; };
    const tip = d.tip, T = d.T;
    return {
      d, tipErr: tip && T ? Math.hypot(tip.x - T.x, tip.y - T.y) : null,
      targetVisible: r.bottom > topSafe && r.top < dockTop && r.right > 0 && r.left < vw,
      samInView: samBox.left >= -2 && samBox.right <= vw + 2 && samBox.top >= -2 && samBox.bottom <= vh + 2,
      samOverDock: samBox.bottom > dockTop + 4,
      coverFrac: ov(body, r) / Math.max(1, Math.min(r.width * r.height, (body.right - body.left) * (body.bottom - body.top))),
      scrollW: document.documentElement.scrollWidth - vw,
    };
  });
}

async function runViewport(browser, vp) {
  console.log(`\n▶ ${vp.name} (${vp.width}×${vp.height})`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr || 1, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('sl:autoNext', 'false'); } catch {} });
  await page.goto(BASE + '#/overview');
  await page.waitForSelector('[data-tour="demo-pill"]');
  await page.click('.topbar [data-action="start-tour"]');
  await page.waitForFunction(() => window.__tour?.active && window.__tour.phase !== 'loading', null, { timeout: 10000 });

  const per = [];
  for (let i = 0; i < 38; i++) {
    if (i > 0) await page.evaluate(n => window.__tour.goTo(n), i);
    const t0 = Date.now();
    try { await waitPhase(page, i); } catch { fail(vp.name, `step ${i + 1}: did not reach narration`); continue; }
    const ms = Date.now() - t0;
    await page.waitForTimeout(250);
    const m = await measure(page);
    per.push({ step: i + 1, ms, tipErr: m.tipErr && +m.tipErr.toFixed(1), cover: +(m.coverFrac || 0).toFixed(2), side: m.d.side, mode: m.d.mode });
    if (m.missing) { fail(vp.name, `step ${i + 1}: target missing`); continue; }
    if (!m.targetVisible) fail(vp.name, `step ${i + 1}: target not visible`);
    if (m.tipErr == null || m.tipErr > 8) fail(vp.name, `step ${i + 1}: stick tip ${m.tipErr?.toFixed(1)}px from target centre`);
    if (!m.samInView) fail(vp.name, `step ${i + 1}: Sam outside viewport ${JSON.stringify(m.d.pos)}`);
    if (m.samOverDock) fail(vp.name, `step ${i + 1}: Sam overlaps dock`);
    if (m.scrollW > 0) fail(vp.name, `step ${i + 1}: horizontal page overflow ${m.scrollW}px`);
    if ([0, 4, 21, 33, 37].includes(i)) await page.screenshot({ path: `${OUT}/${vp.name}-step${String(i + 1).padStart(2, '0')}.png` });
  }
  pass(vp.name, 'all 38 steps exercised');
  fs.writeFileSync(`${OUT}/${vp.name}-steps.json`, JSON.stringify(per, null, 1));
  const worst = per.reduce((a, b) => (b.tipErr ?? 99) > (a.tipErr ?? 0) ? b : a, per[0] || {});
  console.log(`  steps measured: ${per.length}; worst tip error ${worst?.tipErr}px (step ${worst?.step}); max cover ${Math.max(...per.map(p => p.cover))}`);

  // narration progresses (captions)
  await page.evaluate(() => window.__tour.goTo(1));
  await waitPhase(page, 1, ['narrating']);
  const w1 = await page.evaluate(() => window.__tour.wordIdx);
  await page.waitForTimeout(1200);
  const w2 = await page.evaluate(() => window.__tour.wordIdx);
  w2 > w1 ? pass(vp.name, 'captions advance') : fail(vp.name, `captions did not advance (${w1}→${w2})`);

  // menu pauses; closing restores previous state
  await page.click('.dock [data-k="menu"]');
  let st = await page.evaluate(() => window.__tour.debug());
  st.paused && st.menuOpen ? pass(vp.name, 'menu pauses') : fail(vp.name, 'opening menu did not pause');
  const wA = await page.evaluate(() => window.__tour.wordIdx); await page.waitForTimeout(700);
  const wB = await page.evaluate(() => window.__tour.wordIdx);
  wA === wB ? pass(vp.name, 'narration frozen while menu open') : fail(vp.name, 'narration advanced while menu open');
  await page.click('.sheet [data-m="done"]');
  st = await page.evaluate(() => window.__tour.debug());
  !st.paused ? pass(vp.name, 'closing menu resumes when previously playing') : fail(vp.name, 'menu close did not resume');
  await page.click('.dock [data-k="play"]');
  await page.click('.dock [data-k="menu"]');
  await page.click('.sheet [data-m="done"]');
  st = await page.evaluate(() => window.__tour.debug());
  st.paused ? pass(vp.name, 'closing menu keeps a prior pause') : fail(vp.name, 'menu close lost the paused state');
  await page.click('.dock [data-k="play"]');

  // rapid navigation cancels stale motion/audio
  await page.evaluate(() => { const t = window.__tour; t.goTo(10); t.goTo(11); t.goTo(12); t.goTo(13); t.goTo(14); });
  await waitPhase(page, 14);
  await page.waitForTimeout(300);
  let m = await measure(page);
  (m.tipErr ?? 99) < 8 ? pass(vp.name, 'rapid navigation lands on the newest target') : fail(vp.name, `rapid navigation tip error ${m.tipErr}`);
  const words = await page.evaluate(() => [...document.querySelectorAll('.dock .cap .w')].length);
  words > 5 ? pass(vp.name, 'dock caption shows the current step') : fail(vp.name, 'caption missing');

  // user scroll during narration: Sam follows or parks, then re-aims
  await page.evaluate(() => window.__tour.goTo(32)); await waitPhase(page, 32);
  await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 3));
  await page.mouse.wheel(0, 140); await page.waitForTimeout(1600);
  m = await measure(page);
  (m.targetVisible ? (m.tipErr ?? 99) < 10 : true) && m.samInView ? pass(vp.name, 'follows user scrolling') : fail(vp.name, `after scroll: tip ${m.tipErr} visible ${m.targetVisible} inView ${m.samInView}`);

  // scrolling over Sam is never trapped (pointer-events none)
  const d = await page.evaluate(() => window.__tour.debug());
  const cx = Math.round(Math.min(vp.width - 5, Math.max(5, d.pos.x + d.samW / 2))), cy = Math.round(Math.min(vp.height - 5, Math.max(5, d.pos.y + d.samH / 2)));
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.closest('#tour-layer') ? 'tour-layer' : e.tagName) : null; }, [cx, cy]);
  hit !== 'tour-layer' ? pass(vp.name, 'Sam does not intercept touches/scrolls') : fail(vp.name, 'Sam intercepts pointer events');
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(cx, cy); await page.mouse.wheel(0, -120); await page.waitForTimeout(400);
  const y1 = await page.evaluate(() => scrollY);
  y1 !== y0 || y0 === 0 ? pass(vp.name, 'page scrolls when wheel is over Sam') : fail(vp.name, 'wheel over Sam did not scroll');

  // resize / fold change mid-step
  await page.evaluate(() => window.__tour.goTo(5)); await waitPhase(page, 5);
  const alt = vp.width > 700 ? { width: 412, height: 900 } : { width: 832, height: 750 };
  await page.setViewportSize(alt); await page.waitForTimeout(5000);
  m = await measure(page);
  (m.targetVisible ? (m.tipErr ?? 99) < 10 : true) && m.samInView ? pass(vp.name, `re-aims after resize to ${alt.width}×${alt.height}`) : fail(vp.name, `after resize: tip ${m.tipErr} visible ${m.targetVisible} inView ${m.samInView}`);
  await page.screenshot({ path: `${OUT}/${vp.name}-after-resize.png` });
  await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(1500);

  // takeover then resume
  await page.click('.dock [data-k="menu"]'); await page.click('.sheet [data-m="takeover"]'); await page.waitForTimeout(500);
  st = await page.evaluate(() => window.__tour.debug());
  st.phase === 'takeover' ? pass(vp.name, 'takeover mode') : fail(vp.name, 'takeover did not engage');
  await page.click('.dock [data-k="resume"]');
  await waitPhase(page, st.idx).then(() => pass(vp.name, 'resume after takeover'), () => fail(vp.name, 'resume after takeover failed'));

  // finish
  await page.evaluate(() => window.__tour.goTo(37)); await waitPhase(page, 37);
  const lbl = await page.evaluate(() => document.querySelector('.dock [data-k="next"]').getAttribute('aria-label'));
  lbl === 'Finish tour' ? pass(vp.name, 'last step shows Finish') : fail(vp.name, `last step label ${lbl}`);
  await page.click('.dock [data-k="next"]'); await page.waitForTimeout(400);
  const off = await page.evaluate(() => !window.__tour.active && document.getElementById('tour-layer').hidden);
  off ? pass(vp.name, 'finish closes the tour and removes overlays') : fail(vp.name, 'tour did not close');

  errors.length ? fail(vp.name, `console errors: ${errors.slice(0, 3).join(' | ')}`) : pass(vp.name, 'no console errors');
  await ctx.close();
}

async function specialRuns(browser) {
  // audio blocked: requests for recordings fail → tour still starts with captions
  console.log('\n▶ audio-failure');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*.mp3', r => r.abort());
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('sl:autoNext', 'false'); } catch {} });
    await page.goto(BASE + '#/overview');
    await page.click('.topbar [data-action="start-tour"]');
    await waitPhase(page, 0, ['narrating', 'idle'], 20000).then(() => pass('audio-failure', 'start works when recordings fail'), () => fail('audio-failure', 'tour did not start without audio'));
    await page.waitForTimeout(2500);
    const w = await page.evaluate(() => window.__tour.wordIdx);
    w > 3 ? pass('audio-failure', 'captions continue without audio') : fail('audio-failure', 'captions stalled');
    errors.length ? fail('audio-failure', errors.join(' | ')) : pass('audio-failure', 'no page errors');
    await ctx.close();
  }
  // reduced motion
  console.log('\n▶ reduced-motion');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('sl:autoNext', 'false'); } catch {} });
    await page.goto(BASE + '#/overview');
    await page.click('.topbar [data-action="start-tour"]');
    for (const i of [0, 5, 11, 22, 29]) {
      if (i) await page.evaluate(n => window.__tour.goTo(n), i);
      try { await waitPhase(page, i); const m = await measure(page); (m.tipErr ?? 99) < 8 ? pass('reduced-motion', `step ${i + 1} aligned`) : fail('reduced-motion', `step ${i + 1} tip ${m.tipErr}`); }
      catch { fail('reduced-motion', `step ${i + 1} timeout`); }
    }
    errors.length ? fail('reduced-motion', errors.join(' | ')) : pass('reduced-motion', 'no page errors');
    await ctx.close();
  }
}

async function audioRun() {
  // Autoplay allowed: Sam's voice actually plays, starts while he walks, and keeps going.
  console.log('\n▶ narration');
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('sl:autoNext', 'false'); } catch {} });
  await page.goto(BASE + '#overview');
  await page.click('.topbar [data-action="start-tour"]');
  await page.waitForFunction(() => { const n = window.__tour?.narr; return n?.active?.kind === 'audio' && n.active.a.currentTime > 0.3; }, null, { timeout: 15000 })
    .then(async () => { const src = await page.evaluate(() => window.__tour.narr.el.src); /sam-take-your-time/.test(src) ? pass('narration', 'step 1 opens with the approved recording') : fail('narration', `step 1 first audio was ${src}`); })
    .catch(() => fail('narration', 'no audio playing at tour start'));
  // For a sample of steps: speech starts within 1.2 s (while he is still walking), and he talks most of the step.
  for (const i of [4, 11, 17, 22, 29, 30, 34, 36]) {
    await page.evaluate(n => window.__tour.goTo(n), i);
    const t0 = Date.now(); let firstSpeech = null, talking = 0, samples = 0, phasesWhileTalking = new Set();
    while (Date.now() - t0 < 60000) {
      const st = await page.evaluate(() => { const t = window.__tour, n = t.narr; return { phase: t.phase, idx: t.idx, audio: n.active?.kind === 'audio' && !n.active.a.paused, any: !!n.active }; });
      if (st.idx !== i) break;
      samples++; if (st.audio) { talking++; phasesWhileTalking.add(st.phase); if (firstSpeech === null) firstSpeech = Date.now() - t0; }
      if (st.phase === 'idle') break;
      await page.waitForTimeout(100);
    }
    const ratio = talking / Math.max(1, samples);
    const ok = firstSpeech !== null && firstSpeech < 1200 && ratio > 0.75 && phasesWhileTalking.has('moving') && phasesWhileTalking.has('tapping') && phasesWhileTalking.has('narrating');
    (ok ? pass : fail)('narration', `step ${i + 1}: speech starts ${firstSpeech}ms, talking ${(ratio * 100).toFixed(0)}% of the step, during ${[...phasesWhileTalking].join('/')}`);
    console.log(`  step ${i + 1}: first speech ${firstSpeech}ms · talking ${(ratio * 100).toFixed(0)}% · phases ${[...phasesWhileTalking].join(',')}`);
  }
  // pause freezes the voice
  await page.evaluate(() => window.__tour.goTo(12));
  await page.waitForFunction(() => window.__tour.narr.active?.kind === 'audio', null, { timeout: 10000 }).catch(() => {});
  await page.click('.dock [data-k="play"]');
  const a1 = await page.evaluate(() => window.__tour.narr.el.currentTime); await page.waitForTimeout(800);
  const a2 = await page.evaluate(() => ({ t: window.__tour.narr.el.currentTime, paused: window.__tour.narr.el.paused }));
  a2.paused && Math.abs(a2.t - a1) < 0.05 ? pass('narration', 'pause stops the voice') : fail('narration', `voice kept playing while paused ${JSON.stringify({ a1, a2 })}`);
  await page.click('.dock [data-k="play"]'); await page.waitForTimeout(600);
  const a3 = await page.evaluate(() => window.__tour.narr.el.currentTime);
  a3 > a2.t ? pass('narration', 'resume continues the voice') : fail('narration', 'voice did not resume');
  errors.length ? fail('narration', errors.join(' | ')) : pass('narration', 'no page errors');
  await b.close();
}

const browser = await chromium.launch();
if (ONLY !== 'narration') for (const vp of VIEWPORTS) await runViewport(browser, vp);
if (!ONLY) await specialRuns(browser);
await browser.close();
if (!ONLY || ONLY === 'narration') await audioRun();
const bad = results.filter(r => !r.ok);
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
