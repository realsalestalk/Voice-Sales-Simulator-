// Guided walkthrough engine: Sam walks to real controls, taps them, and explains.
import { STEPS, CHAPTERS, CHAPTER_TITLES } from './steps.js';
import { Narrator, CANCELLED } from './narrator.js';
import * as App from './app.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const raf = () => new Promise(r => requestAnimationFrame(() => r()));
const frames = async n => { for (let i = 0; i < n; i++) await raf(); };
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const BASE = 150; // Sam's rig height in CSS px before scaling

// ---------- pausable clock ----------
class Clock {
  constructor() { this.paused = false; this.offset = 0; this.pausedAt = 0; this.resumeWaiters = []; }
  now() { return (this.paused ? this.pausedAt : performance.now()) - this.offset; }
  pause() { if (!this.paused) { this.paused = true; this.pausedAt = performance.now(); } }
  resume() { if (this.paused) { this.offset += performance.now() - this.pausedAt; this.paused = false; this.resumeWaiters.splice(0).forEach(f => f()); } }
  untilResumed(live) {
    if (!this.paused) return Promise.resolve();
    return new Promise((res, rej) => {
      this.resumeWaiters.push(res);
      const chk = () => { if (!live()) rej(CANCELLED); else if (this.paused) setTimeout(chk, 120); };
      setTimeout(chk, 120);
    });
  }
  wait(ms, live) {
    const end = this.now() + ms;
    return new Promise((res, rej) => {
      const tick = () => { if (!live()) return rej(CANCELLED); if (this.now() >= end) return res(); setTimeout(tick, 30); };
      tick();
    });
  }
  tween(ms, fn, live) {
    const t0 = this.now();
    return new Promise((res, rej) => {
      const tick = () => {
        if (!live()) return rej(CANCELLED);
        const p = ms <= 0 ? 1 : clamp((this.now() - t0) / ms, 0, 1);
        fn(p);
        if (p >= 1) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });
  }
}

// ---------- geometry helpers ----------
function visibleRect(el) {
  let r = el.getBoundingClientRect();
  let { left, top, right, bottom } = r;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
      const pr = p.getBoundingClientRect();
      left = Math.max(left, pr.left); right = Math.min(right, pr.right); top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
    }
  }
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  left = Math.max(left, 0); right = Math.min(right, vw);
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top), raw: r };
}
function inFixed(el) { for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return p; return null; }
function overlapArea(a, b) { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; }
function scrollableAncestors(el) {
  const out = [];
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if ((/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) || (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2)) out.push(p);
  }
  return out;
}

export class Tour {
  constructor() {
    this.idx = 0; this.run = 0; this.active = false; this.phase = 'off';
    this.clock = new Clock(); this.userPaused = false; this.menuOpen = false; this.menuWasPaused = false;
    this.autoNext = App.store.get('autoNext', true);
    this.sam = null; this.scale = 1; this.pos = { x: -400, y: 0 }; this.geomCache = {};
    this.target = null; this.T = null; this.lastT = null; this.lastMoveAt = 0; this.needCheck = false; this.minorRun = 0;
    this.side = 'left'; this.wordIdx = -1; this.plan = null;
    this.narr = new Narrator({
      clock: this.clock,
      onWord: i => this.setWord(i),
      onMouth: v => { try { this.sam?.setMouth(v); } catch { /* ignore */ } },
      onStatus: s => this.status(s.message, s.retry),
    });
    this.narr.soundOn = App.store.get('soundOn', true);
    this.narr.deviceVoice = App.store.get('deviceVoice', false);
    this.buildDom();
  }

  // ---------- DOM ----------
  buildDom() {
    const layer = document.createElement('div');
    layer.id = 'tour-layer'; layer.hidden = true; layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="sam-host"></div>`;
    document.body.appendChild(layer);
    this.layer = layer; this.host = layer.querySelector('.sam-host');
    this.ring = document.createElement('div'); this.ring.className = 'tour-ring'; document.body.appendChild(this.ring);

    const dock = document.createElement('div');
    dock.className = 'dock'; dock.hidden = true; dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Guided tour controls');
    dock.innerHTML = `
      <div class="cap" aria-hidden="true"></div>
      <div class="sr-only" aria-live="polite" id="tour-live"></div>
      <div class="status" role="status"></div>
      <div class="bar">
        <button class="db" data-k="prev" aria-label="Previous step">‹<span class="lbl">&nbsp;Back</span></button>
        <button class="db main" data-k="play" aria-label="Pause">❚❚</button>
        <button class="db" data-k="next" aria-label="Next step"><span class="lbl">Next&nbsp;</span>›</button>
        <div class="prog"><div class="meter"><span style="width:0"></span></div><small></small></div>
        <button class="db" data-k="menu" aria-label="Tour options" aria-haspopup="dialog" aria-expanded="false">•••</button>
        <button class="db full-only" data-k="close" aria-label="End tour">✕</button>
      </div>`;
    document.body.appendChild(dock);
    this.dock = dock;
    dock.addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      ({ prev: () => this.prev(), next: () => this.next(), play: () => this.togglePause(), menu: () => this.openMenu(), close: () => this.end(), resume: () => this.endTakeover() })[b.dataset.k]?.();
    });
    new ResizeObserver(() => this.updateDockVar()).observe(dock);

    const scrim = document.createElement('div'); scrim.className = 'sheet-scrim'; scrim.hidden = true;
    scrim.addEventListener('click', () => this.closeMenu());
    const sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Tour options');
    document.body.append(scrim, sheet);
    this.scrim = scrim; this.sheet = sheet;

    // global listeners
    const onLayout = () => { this.needCheck = true; this.lastMoveAt = performance.now(); };
    window.addEventListener('resize', () => { this.forceResolve = true; onLayout(); });
    window.visualViewport?.addEventListener('resize', () => { this.forceResolve = true; onLayout(); });
    window.addEventListener('orientationchange', () => { this.forceResolve = true; onLayout(); });
    window.addEventListener('sl:layout', onLayout);
    new ResizeObserver(onLayout).observe(document.body);
    document.addEventListener('keydown', e => this.onKey(e));
    // user scroll gestures cancel our auto-scroll
    const userScroll = () => { this.userScrolled = performance.now(); };
    window.addEventListener('wheel', userScroll, { passive: true });
    window.addEventListener('touchmove', userScroll, { passive: true });
  }

  updateDockVar() {
    const h = this.dock.hidden ? 0 : this.dock.getBoundingClientRect().height + 20;
    document.documentElement.style.setProperty('--dock-h', `${Math.round(h)}px`);
  }

  status(msg, retry) {
    const s = this.dock.querySelector('.status');
    if (!msg) { s.innerHTML = ''; return; }
    s.innerHTML = `<span>${msg}</span>${retry ? '<button class="btn sm" data-retry>Retry sound</button>' : ''}`;
    s.querySelector('[data-retry]')?.addEventListener('click', async () => { s.innerHTML = '<span class="loading"><span class="spinner"></span> Retrying…</span>'; const ok = await this.narr.retryAudio(); this.status(ok ? '' : 'Sound is still unavailable. Captions continue.', !ok); });
  }

  // ---------- lifecycle ----------
  async start(i = 0) {
    if (this.active) { this.goTo(i); return; }
    this.active = true; this.phase = 'loading';
    document.body.classList.add('touring');
    App.hideDecoSams(true);
    this.layer.hidden = false; this.dock.hidden = false; this.dock.classList.remove('mini');
    this.setDockButtons();
    this.dock.querySelector('.cap').innerHTML = '<span class="loading"><span class="spinner"></span> Getting Sam ready…</span>';
    this.updateDockVar();
    this.userPaused = false; this.clock.resume();
    const unlock = this.narr.unlock().catch(() => false);
    const samLoad = Promise.race([App.loadSam(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
    const [samRes] = await Promise.allSettled([samLoad, unlock]);
    if (!this.active) return;
    if (samRes.status === 'fulfilled') {
      try {
        this.sam = samRes.value.createSam({ size: BASE, reducedMotion: App.reducedMotion() });
        this.host.innerHTML = ''; this.host.appendChild(this.sam.el);
        await Promise.race([this.sam.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
        this.sam.setMode?.('cane');
      } catch (e) { console.error(e); try { this.sam?.destroy(); } catch { /* ignore */ } this.sam = null; }
    }
    if (!this.sam) this.status('Sam could not be drawn on this device — the tour continues with highlights and captions.');
    this.computeScale();
    // enter from the bottom-left edge
    const H = BASE * this.scale;
    this.pos = { x: -(this.samW() + 20), y: this.bounds().maxY ?? (innerHeight - H - 120) };
    this.applyPos();
    this.startLoop();
    this.goTo(i);
  }

  end() {
    this.active = false; this.phase = 'off'; this.run++; this.minorRun++;
    this.narr.stop(); this.closeMenu(true);
    this.layer.hidden = true; this.dock.hidden = true; this.ring.classList.remove('on');
    this.updateDockVar();
    document.body.classList.remove('touring');
    try { this.sam?.destroy(); } catch { /* ignore */ }
    this.sam = null; this.host.innerHTML = ''; this.geomCache = {};
    cancelAnimationFrame(this.loopId);
    App.hideDecoSams(false);
  }

  goTo(i) {
    if (!this.active) return this.start(i);
    i = clamp(i, 0, STEPS.length - 1);
    this.idx = i; App.store.set('tourStep', i);
    const tok = ++this.run; this.minorRun++;
    this.narr.stop();
    this.status('');
    if (this.phase === 'takeover') this.endTakeover(true);
    this.updateDockUi();
    this.runStep(tok).catch(e => { if (e !== CANCELLED) { console.error(e); this.status('Something went wrong on this step. Use Next to continue.'); } });
  }
  next() { if (this.idx >= STEPS.length - 1) { this.end(); App.toast('Tour complete — revisit any chapter from the Training room.'); return; } this.goTo(this.idx + 1); }
  prev() { if (this.idx > 0) this.goTo(this.idx - 1); }
  repeat() { this.goTo(this.idx); }

  togglePause() { if (this.phase === 'takeover') return; this.userPaused ? this.resume() : this.pause(); }
  pause() { this.userPaused = true; this.clock.pause(); this.narr.pause(); try { this.sam?.setWalking(false); } catch { /* ignore */ } this.setDockButtons(); }
  resume() { this.userPaused = false; this.clock.resume(); this.narr.resume(); if (this.walking) try { this.sam?.setWalking(true); } catch { /* ignore */ } this.setDockButtons(); }

  // ---------- options menu ----------
  openMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true; this.menuWasPaused = this.userPaused;
    if (!this.userPaused) this.pause();
    document.body.classList.add('sheet-open');
    this.renderMenu();
    this.scrim.hidden = false; this.sheet.hidden = false;
    this.dock.querySelector('[data-k="menu"]').setAttribute('aria-expanded', 'true');
    this.sheet.querySelector('button')?.focus({ preventScroll: true });
  }
  closeMenu(silent) {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    document.body.classList.remove('sheet-open');
    this.scrim.hidden = true; this.sheet.hidden = true;
    this.dock.querySelector('[data-k="menu"]').setAttribute('aria-expanded', 'false');
    if (!silent && !this.menuWasPaused && this.active && this.phase !== 'takeover') this.resume();
    if (!silent) this.dock.querySelector('[data-k="menu"]').focus({ preventScroll: true });
  }
  renderMenu() {
    const sw = (k, on, label, sub, disabled) => `<div class="opt"><div><div>${label}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div><button class="switch" role="switch" aria-checked="${on}" data-sw="${k}" aria-label="${label}" ${disabled ? 'disabled' : ''}></button></div>`;
    const cur = STEPS[this.idx];
    this.sheet.innerHTML = `
      <div class="row" style="justify-content:space-between"><h3>Tour options</h3><button class="btn sm" data-m="done">Done</button></div>
      <p class="tiny muted" style="margin-top:4px">Playback is paused while this menu is open.</p>
      <h4>Chapters</h4>
      <div class="chap-list">${CHAPTERS.map((c, i) => `<button data-jump="${c.first}" class="${cur.ch === i ? 'cur' : ''}"><span class="mono tiny">${String(i + 1).padStart(2, '0')}</span><span>${c.title}</span><span class="tiny muted" style="margin-left:auto">${c.count}</span></button>`).join('')}</div>
      <h4>Sound & playback</h4>
      ${sw('sound', this.narr.soundOn, 'Sound', this.narr.audioOk ? 'Plays Sam\'s approved recordings where a line matches.' : 'Unavailable in this browser right now — captions continue.')}
      ${sw('device', this.narr.deviceVoice, 'Device voice for other lines', this.narr.deviceVoiceAvailable ? 'Your device\'s built-in voice. <b>Not Sam\'s voice</b> — his voice cannot be recreated here.' : 'Not supported in this browser.', !this.narr.deviceVoiceAvailable)}
      ${sw('auto', this.autoNext, 'Auto-next', 'Continue to the next step after Sam finishes.')}
      <div class="row" style="margin-top:12px">
        <button class="btn sm" data-m="repeat">↺ Repeat step</button>
        <button class="btn sm" data-m="takeover">✋ Take over</button>
        <button class="btn sm" data-m="end">End tour</button>
      </div>
      <h4>Transcript</h4>
      <div class="transcript">${STEPS.map((s, i) => `<p class="${i === this.idx ? 'cur' : ''}" data-jump="${i}" role="button" tabindex="0"><b>${i + 1}</b>${s.text}</p>`).join('')}</div>`;
    this.sheet.onclick = e => {
      const j = e.target.closest('[data-jump]');
      if (j) { this.menuWasPaused = false; this.closeMenu(true); this.userPaused = false; this.clock.resume(); this.setDockButtons(); this.goTo(+j.dataset.jump); return; }
      const s = e.target.closest('[data-sw]');
      if (s) {
        const on = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', on);
        if (s.dataset.sw === 'sound') { this.narr.soundOn = on; App.store.set('soundOn', on); if (!on) this.narr.stop(); }
        if (s.dataset.sw === 'device') { this.narr.deviceVoice = on; App.store.set('deviceVoice', on); }
        if (s.dataset.sw === 'auto') { this.autoNext = on; App.store.set('autoNext', on); }
        return;
      }
      const m = e.target.closest('[data-m]'); if (!m) return;
      if (m.dataset.m === 'done') this.closeMenu();
      if (m.dataset.m === 'repeat') { this.closeMenu(true); this.userPaused = false; this.clock.resume(); this.setDockButtons(); this.repeat(); }
      if (m.dataset.m === 'takeover') { this.closeMenu(true); this.takeover(); }
      if (m.dataset.m === 'end') { this.closeMenu(true); this.end(); }
    };
    this.sheet.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('p[data-jump]')) { e.preventDefault(); e.target.click(); } };
    this.sheet.querySelector('.transcript p.cur')?.scrollIntoView({ block: 'nearest' });
  }

  // Take over: user explores freely; Sam steps aside.
  async takeover() {
    this.run++; const mr = ++this.minorRun;
    this.narr.stop(); this.phase = 'takeover';
    this.userPaused = false; this.clock.resume();
    this.ring.classList.remove('on');
    this.dock.classList.add('mini');
    this.dock.querySelector('.bar').innerHTML = `<button class="db main" data-k="resume">▶ Resume tour</button><button class="db" data-k="close" aria-label="End tour">✕</button>`;
    const live = () => mr === this.minorRun && this.phase === 'takeover';
    try {
      const b = this.bounds();
      await this.walkTo({ x: b.maxX, y: b.maxY }, live);
      this.sam?.setFacing(-1); this.sam?.setExpression('happy');
    } catch { /* cancelled */ }
  }
  endTakeover(silent) {
    if (this.phase !== 'takeover') return;
    this.phase = 'idle';
    this.dock.classList.remove('mini');
    this.dock.querySelector('.bar').innerHTML = `
        <button class="db" data-k="prev" aria-label="Previous step">‹<span class="lbl">&nbsp;Back</span></button>
        <button class="db main" data-k="play" aria-label="Pause">❚❚</button>
        <button class="db" data-k="next" aria-label="Next step"><span class="lbl">Next&nbsp;</span>›</button>
        <div class="prog"><div class="meter"><span style="width:0"></span></div><small></small></div>
        <button class="db" data-k="menu" aria-label="Tour options" aria-haspopup="dialog" aria-expanded="false">•••</button>
        <button class="db full-only" data-k="close" aria-label="End tour">✕</button>`;
    this.updateDockUi();
    if (!silent) this.goTo(this.idx);
  }

  onKey(e) {
    if (!this.active) return;
    if (e.key === 'Escape' && this.menuOpen) { e.preventDefault(); this.closeMenu(); return; }
    if (this.menuOpen || this.phase === 'takeover') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    else if (e.key === ' ' && (tag === 'body' || tag === 'main' || tag === 'div')) { e.preventDefault(); this.togglePause(); }
  }

  setDockButtons() {
    const p = this.dock.querySelector('[data-k="play"]');
    if (p) { p.textContent = this.userPaused ? '▶' : '❚❚'; p.setAttribute('aria-label', this.userPaused ? 'Resume' : 'Pause'); }
  }
  updateDockUi() {
    const s = STEPS[this.idx];
    const prev = this.dock.querySelector('[data-k="prev"]'); if (prev) prev.disabled = this.idx === 0;
    const nx = this.dock.querySelector('[data-k="next"]');
    if (nx) { const last = this.idx === STEPS.length - 1; nx.innerHTML = last ? '<span class="lbl">Finish&nbsp;</span>✓' : '<span class="lbl">Next&nbsp;</span>›'; nx.setAttribute('aria-label', last ? 'Finish tour' : 'Next step'); }
    const m = this.dock.querySelector('.prog .meter span'); if (m) m.style.width = `${((this.idx + 1) / STEPS.length) * 100}%`;
    const sm = this.dock.querySelector('.prog small'); if (sm) sm.textContent = `${CHAPTER_TITLES[s.ch]} · ${this.idx + 1} / ${STEPS.length}`;
    this.setDockButtons();
    // caption (words dim until said)
    const words = s.text.split(/\s+/);
    this.dock.querySelector('.cap').innerHTML = `<span class="who">Sam</span>${words.map((w, i) => `<span class="w" data-i="${i}">${w}</span>`).join(' ')}`;
    this.wordIdx = -1;
    $('#tour-live').textContent = `Step ${this.idx + 1} of ${STEPS.length}. ${s.text}`;
  }
  setWord(i) {
    if (i === this.wordIdx) return;
    const ws = this.dock.querySelectorAll('.cap .w');
    const from = Math.min(i, this.wordIdx), to = Math.max(i, this.wordIdx);
    for (let k = Math.max(0, from); k <= to && k < ws.length; k++) ws[k].classList.toggle('said', k <= i);
    this.wordIdx = i;
    const cap = this.dock.querySelector('.cap');
    const w = ws[Math.max(0, i)]; if (w && cap.scrollHeight > cap.clientHeight) { const off = w.offsetTop - cap.offsetTop; if (off > cap.scrollTop + cap.clientHeight - 24 || off < cap.scrollTop) cap.scrollTop = off - 24; }
  }

  // ---------- sizing & bounds ----------
  computeScale() {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const s = clamp(Math.min(vw, vh) / 5.4 / BASE, 0.58, 0.95);
    if (Math.abs(s - this.scale) > 0.01) { this.scale = s; this.geomCache = {}; }
    this.applyPos();
  }
  samW() { return (this.sam?.width ?? BASE * 0.8) * this.scale; }
  samH() { return (this.sam?.height ?? BASE) * this.scale; }
  bounds() {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const dockTop = this.dock.hidden ? vh : this.dock.getBoundingClientRect().top;
    return { minX: 2, maxX: vw - this.samW() - 2, minY: 2, maxY: Math.min(vh, dockTop) - this.samH() - 4, vw, vh, dockTop };
  }
  applyPos() { this.host.style.transform = `translate(${this.pos.x.toFixed(1)}px, ${this.pos.y.toFixed(1)}px) scale(${this.scale})`; this.host.style.transformOrigin = '0 0'; }
  geom(facing, hand) {
    const k = `${facing}:${hand}`;
    if (this.geomCache[k]) return this.geomCache[k];
    if (!this.sam) return { shoulder: { x: BASE * 0.4, y: BASE * 0.5 }, reach: BASE * 0.9 };
    const prevF = this.facing ?? 1;
    this.sam.setFacing(facing);
    const g = this.sam.getPointerGeometry(hand);
    this.sam.setFacing(prevF);
    return (this.geomCache[k] = { shoulder: { ...g.shoulder }, reach: g.reach });
  }

  // Fraction of sample points under Sam's body that land on text, controls or diagram nodes.
  // dy: how far the page will scroll before he gets there (content moves up by dy).
  clutter(body, dy = 0) {
    let hits = 0, n = 0;
    const cols = 4, rows = 6;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = body.left + (body.right - body.left) * (i + 0.5) / cols;
      const y = body.top + (body.bottom - body.top) * (j + 0.5) / rows + dy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      n++;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (el.closest('.dock, .sheet')) { hits++; continue; }
      if (el.closest('button, a, input, select, .chip, .map-node, .wl-row, .meter, img, canvas')) { hits++; continue; }
      if (el instanceof SVGElement && el.closest('text, circle')) { hits++; continue; }
      let r = null;
      try {
        if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
        else if (document.caretPositionFromPoint) { const cp = document.caretPositionFromPoint(x, y); if (cp) { r = document.createRange(); r.setStart(cp.offsetNode, cp.offset); } }
      } catch { r = null; }
      if (r && r.startContainer.nodeType === 3 && r.startContainer.textContent.trim()) {
        const tn = r.startContainer, o = Math.min(r.startOffset, tn.length - 1);
        if (o >= 0) {
          const rr = document.createRange(); rr.setStart(tn, Math.max(0, o)); rr.setEnd(tn, Math.min(tn.length, o + 1));
          const b = rr.getBoundingClientRect();
          if (x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 4 && y <= b.bottom + 4) hits++;
        }
      }
    }
    return n ? hits / n : 0;
  }

  // Choose where Sam stands so his stick tip lands on T without covering `protect` or other text.
  solve(T, protect, avoid = [], dy = 0) {
    const b = this.bounds(); const s = this.scale;
    const W = this.samW(), H = this.samH();
    let best = null;
    const cands = [];
    const prefDeg = -12;
    const degs = [-12, -25, 0, -40, 12, -55, 25, -68, 40, 55, -80, 70];
    for (const side of ['left', 'right']) {
      const facing = side === 'left' ? 1 : -1, hand = side === 'left' ? 'right' : 'left';
      const g = this.geom(facing, hand);
      for (const ext of [1, 1.05, 1.1]) {
        for (const d of degs) {
          const th = (side === 'left' ? d : 180 - d) * Math.PI / 180;
          const R = g.reach * s * ext;
          const x = T.x - R * Math.cos(th) - g.shoulder.x * s;
          const y = T.y - R * Math.sin(th) - g.shoulder.y * s;
          const oob = Math.max(0, b.minX - x) + Math.max(0, x - b.maxX) + Math.max(0, b.minY - y) + Math.max(0, y - b.maxY);
          const body = { left: x + W * 0.1, right: x + W * 0.9, top: y + H * 0.04, bottom: y + H * 0.98 };
          let ov = protect ? overlapArea(body, protect) / (W * H) : 0;
          for (const a of avoid) ov += overlapArea(body, a) / (W * H) * 0.6;
          const dist = Math.hypot(x - this.pos.x, y - this.pos.y);
          const score = oob * 40 + ov * 900 + Math.abs(d - prefDeg) * 0.5 + (ext - 1) * 160 + dist * 0.02 + (side !== this.side ? 4 : 0);
          cands.push({ x, y, side, facing, hand, th, ext, score, oob, body });
        }
      }
    }
    // text-aware pass on the most promising candidates
    cands.sort((p, q) => p.score - q.score);
    for (const c of cands) {
      if (c.oob > 0) { c.total = c.score + 1e6; continue; }
      c.clut = this.clutter(c.body, dy);
      c.total = c.score + c.clut * 650;
    }
    best = cands.sort((p, q) => p.total - q.total)[0] || cands[0] || null;
    if (best && best.oob > 0) { best.x = clamp(best.x, b.minX, Math.max(b.minX, b.maxX)); best.y = clamp(best.y, b.minY, Math.max(b.minY, b.maxY)); best.clamped = true; }
    return best;
  }

  // ---------- motion primitives ----------
  async walkTo(p, live, minDur = 0) {
    const dx = p.x - this.pos.x, dy = p.y - this.pos.y, dist = Math.hypot(dx, dy);
    if (dist < 3 && minDur === 0) { this.pos = { ...p }; this.applyPos(); return; }
    if (App.reducedMotion()) {
      this.host.style.transition = 'opacity .18s'; this.host.style.opacity = '0';
      await this.clock.wait(180, live);
      this.pos = { ...p }; this.applyPos(); this.host.style.opacity = '1';
      await this.clock.wait(180, live); this.host.style.transition = '';
      return;
    }
    if (this.sam && this.mode !== 'cane') { this.mode = 'cane'; await Promise.race([this.sam.setMode('cane'), this.clock.wait(1400, live)]); }
    if (!live()) throw CANCELLED;
    if (Math.abs(dx) > 4) { this.facing = dx > 0 ? 1 : -1; this.sam?.setFacing(this.facing); }
    const speed = 380 * Math.max(0.75, this.scale);
    const dur = Math.max(minDur, clamp(dist / speed * 1000, 380, 1900));
    const from = { ...this.pos };
    this.walking = true; this.sam?.setWalking(true);
    try {
      await this.clock.tween(dur, p2 => { const e = easeSine(p2); this.pos = { x: from.x + dx * e, y: from.y + dy * e }; this.applyPos(); }, live);
    } finally { this.walking = false; this.sam?.setWalking(false); }
  }

  async smoothScroll(toY, dur, live) {
    const fromY = window.scrollY; const dy = toY - fromY;
    if (Math.abs(dy) < 2) return;
    if (App.reducedMotion() || dur <= 0) { window.scrollTo({ top: toY, behavior: 'instant' }); return; }
    const started = performance.now();
    await this.clock.tween(dur, p => {
      if (this.userScrolled && this.userScrolled > started) return; // user took control
      window.scrollTo({ top: fromY + dy * easeIO(p), behavior: 'instant' });
    }, live);
  }

  async aimAndTap(T, sol, live, taps = 3) {
    if (!this.sam) { if (taps) for (let k = 0; k < taps; k++) { this.ripple(T); await this.clock.wait(240, live); } return; }
    this.side = sol.side; this.facing = sol.facing;
    this.sam.setFacing(sol.facing);
    if (this.hand !== sol.hand) { this.hand = sol.hand; await Promise.race([this.sam.setHand(sol.hand), this.clock.wait(700, live)]); }
    if (!live()) throw CANCELLED;
    // exact aim from the actual shoulder position
    const g = this.geom(sol.facing, sol.hand); const s = this.scale;
    const sx = this.pos.x + g.shoulder.x * s, sy = this.pos.y + g.shoulder.y * s;
    const th = Math.atan2(T.y - sy, T.x - sx);
    const ext = clamp(Math.hypot(T.x - sx, T.y - sy) / (g.reach * s), 1, 1.15);
    this.sam.lookAt(clamp(Math.cos(th) * 0.8, -1, 1), clamp(Math.sin(th) * 0.8, -1, 1));
    if (this.mode !== 'pointer') { this.mode = 'pointer'; await Promise.race([this.sam.setMode('pointer'), this.clock.wait(1500, live)]); }
    await Promise.race([this.sam.aim(th, ext), this.clock.wait(600, live)]);
    this.aimTh = th; this.aimExt = ext;
    if (!live()) throw CANCELLED;
    for (let k = 0; k < taps; k++) {
      await this.clock.untilResumed(live);
      const tp = this.sam.tap();
      setTimeout(() => { if (live()) this.ripple(this.T || T); }, App.reducedMotion() ? 0 : 120);
      await Promise.race([tp, this.clock.wait(420, live)]);
      await this.clock.wait(70, live);
    }
  }

  ripple(T) {
    const r = document.createElement('div'); r.className = 'ripple';
    r.style.left = `${T.x}px`; r.style.top = `${T.y}px`;
    if (App.reducedMotion()) { r.style.animation = 'none'; r.style.transform = 'scale(2)'; r.style.opacity = '.85'; }
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }

  // ---------- target resolution ----------
  async findTarget(step, live) {
    const sel = step.target;
    const t0 = performance.now();
    let warned = false;
    while (performance.now() - t0 < 3000) {
      if (!live()) throw CANCELLED;
      const el = document.querySelector(sel);
      if (el && el.getClientRects().length) return el;
      if (!warned && performance.now() - t0 > 700) { warned = true; this.status('Finding the next control…'); }
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }
  measure(el) {
    const vr = visibleRect(el);
    const fixed = inFixed(el);
    // the block being explained (Sam should not stand on it), unless it fills the screen
    let pr = vr;
    const blk = el.closest('.card, .st, .alert-card, .stage, .member, .callout, .wl-row, .example-list button, .map-node, .page-head');
    if (blk && blk !== el) {
      const b = visibleRect(blk);
      if (b.width * b.height < innerWidth * innerHeight * 0.35) pr = b;
    }
    return { vr, pr, T: { x: vr.left + vr.width / 2, y: vr.top + vr.height / 2 }, fixed };
  }
  topSafe() {
    const tb = $('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const nav = $('#nav'); const nr = nav?.getBoundingClientRect();
    const navSticky = nr && getComputedStyle(nav).position === 'sticky' && nr.width > nr.height * 2 ? nr.bottom : 0;
    return Math.max(tb, navSticky);
  }

  // ---------- one step ----------
  async runStep(tok) {
    const live = () => tok === this.run && this.active;
    const step = STEPS[this.idx];
    this.phase = 'moving'; this.ring.classList.remove('on');
    this.plan = this.narr.prepare(step);           // prepare narration during movement
    try { this.sam?.setSpeaking(false); this.sam?.setExpression('neutral'); } catch { /* ignore */ }

    // 1. page transition (stick lowered while traveling)
    if (App.route() !== step.route) {
      if (this.sam && this.mode === 'pointer') { this.mode = 'cane'; await Promise.race([this.sam.setMode('cane'), this.clock.wait(1400, live)]); }
      await App.go(step.route, { fromTour: true });
      if (!live()) throw CANCELLED;
      await frames(2);
    }
    await step.prep?.(App);
    await frames(2);
    if (!live()) throw CANCELLED;

    // 2. find the real target
    const el = await this.findTarget(step, live);
    this.status('');
    this.target = el;
    if (!el) { this.status('This control is not visible right now — continuing with narration.'); this.phase = 'narrating'; await this.narrate(step, live); return this.afterNarration(live); }

    // 3. coordinated scroll + walk
    const moving = (async () => {
      for (const sc of scrollableAncestors(el)) { // inner scroll containers (drawer, tables)
        const er = el.getBoundingClientRect(), cr = sc.getBoundingClientRect();
        if (sc.scrollHeight > sc.clientHeight + 2 && (er.top < cr.top + 12 || er.bottom > cr.bottom - 12)) sc.scrollTo({ top: sc.scrollTop + (er.top - cr.top) - cr.height * 0.3, behavior: App.reducedMotion() ? 'instant' : 'smooth' });
        if (sc.scrollWidth > sc.clientWidth + 2 && (er.left < cr.left || er.left > cr.right - 60)) sc.scrollTo({ left: sc.scrollLeft + (er.left - cr.left) - 12, behavior: 'instant' });
        // let the inner scroll settle before measuring (bounded)
        let last = -1, still = 0; const t0 = performance.now();
        while (performance.now() - t0 < 900 && still < 3) { await raf(); if (Math.abs(sc.scrollTop - last) < 0.5) still++; else still = 0; last = sc.scrollTop; }
      }
      await frames(1);
      let m = this.measure(el);
      let delta = 0;
      if (!m.fixed) {
        const top = this.topSafe() + 10, bottom = this.bounds().dockTop - 12;
        const r = m.vr.raw;
        const visH = bottom - top;
        const fully = r.top >= top && r.bottom <= bottom;
        // leave room for Sam above or below small targets
        const roomy = fully && (r.top - top > this.samH() * 0.6 || bottom - r.bottom > this.samH() * 0.9 || r.width < innerWidth - this.samW() * 1.4);
        if (!roomy) {
          const want = r.height > visH * 0.7 ? top + 12 : top + (visH - r.height) * 0.38;
          const maxS = document.documentElement.scrollHeight - innerHeight;
          const toY = clamp(window.scrollY + (r.top - want), 0, Math.max(0, maxS));
          delta = toY - window.scrollY;
          if (Math.abs(delta) > 1) {
            const vr2 = { ...m.pr, top: m.pr.top - delta, bottom: m.pr.bottom - delta };
            const T2 = { x: m.T.x, y: m.T.y - delta };
            const sol = this.solve(T2, vr2, this.avoidRects(el), delta);
            const sDur = clamp(Math.abs(delta) * 0.55, 320, 950);
            const wDur = sol ? clamp(Math.hypot(sol.x - this.pos.x, sol.y - this.pos.y) / (380 * Math.max(0.75, this.scale)) * 1000, 0, 1900) : 0;
            const dur = Math.max(sDur, wDur);
            await Promise.all([this.smoothScroll(window.scrollY + delta, dur, live), sol ? this.walkTo(sol, live, Math.min(dur, 1900)) : null]);
            await frames(1);
          }
        }
      }
      if (!live()) throw CANCELLED;
      // settle: re-measure after scrolling (scroll may clamp) and correct with a short walk
      m = this.measure(el);
      this.T = m.T; this.lastT = { ...m.T };
      const sol = this.solve(m.T, m.pr, this.avoidRects(el));
      if (sol) await this.walkTo(sol, live);
      this.updateRing();
      return sol;
    })();
    const sol = await Promise.race([moving, this.clock.wait(9000, live).then(() => null)]);
    if (!live()) throw CANCELLED;
    await this.clock.wait(App.reducedMotion() ? 40 : 160, live); // settle before teaching

    // 4. tap three times at the center of the real target
    this.phase = 'tapping';
    const m2 = this.measure(el); this.T = m2.T; this.lastT = { ...m2.T };
    this.ring.classList.add('on'); this.updateRing();
    await this.aimAndTap(m2.T, sol || this.solve(m2.T, m2.pr), live, 3);
    if (!live()) throw CANCELLED;

    // 5. what the tap does
    if (step.act) {
      await step.act(App);
      await frames(2);
      if (!live()) throw CANCELLED;
      if (!el.isConnected) { const again = document.querySelector(step.target); if (again) { this.target = again; this.lastT = null; } }
      // if what the tap opened now covers the control, explain the opened panel instead
      if (step.after) {
        await this.clock.wait(App.reducedMotion() ? 30 : 420, live);
        const m0 = this.measure(this.target);
        const top = document.elementFromPoint(m0.T.x, m0.T.y);
        const nt = document.querySelector(step.after);
        if (nt && (!top || !this.target.contains(top))) {
          this.target = nt; this.lastT = null;
          const m1 = this.measure(nt);
          const sol2 = this.solve(m1.T, m1.pr, []);
          if (sol2) await this.walkTo(sol2, live);
          const m3 = this.measure(nt); this.T = m3.T; this.lastT = { ...m3.T };
          await this.aimAndTap(m3.T, sol2 || this.solve(m3.T, m3.pr), live, 1);
        }
      }
      this.needCheck = true; this.lastMoveAt = performance.now();
    }

    // 6. narrate (prepared during the walk)
    this.phase = 'narrating';
    await this.narrate(step, live);
    return this.afterNarration(live);
  }

  async narrate(step, live) {
    try { this.sam?.setExpression(step.expr === 'happy' ? 'happy' : 'talk'); this.sam?.setSpeaking(true); } catch { /* ignore */ }
    try { await this.narr.speak(this.plan, () => !live()); }
    finally { try { this.sam?.setSpeaking(false); this.sam?.setMouth(0); } catch { /* ignore */ } }
    if (!live()) throw CANCELLED;
    try { this.sam?.setExpression(step.expr && step.expr !== 'talk' ? step.expr : 'happy'); } catch { /* ignore */ }
  }

  async afterNarration(live) {
    this.phase = 'idle';
    this.setWord(STEPS[this.idx].text.split(/\s+/).length - 1);
    if (this.idx === STEPS.length - 1) { try { this.sam?.setExpression('happy'); } catch { /* ignore */ } return; }
    if (this.autoNext) {
      await this.clock.wait(1100, live);
      if (live() && !this.menuOpen) this.goTo(this.idx + 1);
    }
  }

  avoidRects(el) {
    const out = [];
    const d = $('#drawer.open'); if (d && !d.contains(el)) out.push(d.getBoundingClientRect());
    return out;
  }
  updateRing() {
    if (!this.target || !this.target.isConnected) { this.ring.classList.remove('on'); return; }
    const vr = visibleRect(this.target);
    if (vr.width < 1 || vr.height < 1) { this.ring.style.opacity = '0'; return; }
    this.ring.style.opacity = '';
    const pad = 6;
    Object.assign(this.ring.style, { left: `${vr.left - pad}px`, top: `${vr.top - pad}px`, width: `${vr.width + pad * 2}px`, height: `${vr.height + pad * 2}px` });
  }

  // ---------- follow loop: keeps Sam attached to his target ----------
  startLoop() {
    cancelAnimationFrame(this.loopId);
    const loop = () => {
      if (!this.active) return;
      this.loopId = requestAnimationFrame(loop);
      if (this.phase === 'takeover' || this.phase === 'loading') return;
      if (this.target && !this.target.isConnected && (this.phase === 'narrating' || this.phase === 'idle')) {
        const again = document.querySelector(STEPS[this.idx].target);   // the view re-rendered it
        if (again) { this.target = again; this.lastT = null; this.needCheck = true; this.lastMoveAt = performance.now(); }
      }
      if (this.target && this.target.isConnected && this.phase !== 'moving') {
        const m = this.measure(this.target);
        this.updateRing();
        if (this.lastT && !this.minorMoving) {
          const dx = m.T.x - this.lastT.x, dy = m.T.y - this.lastT.y;
          if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
            this.pos.x += dx; this.pos.y += dy; this.applyPos();
            this.lastMoveAt = performance.now(); this.needCheck = true;
          }
        }
        this.lastT = { ...m.T }; this.T = m.T;
        if (this.needCheck && performance.now() - this.lastMoveAt > 240 && !this.minorMoving && (this.phase === 'narrating' || this.phase === 'idle')) {
          this.needCheck = false;
          this.check(m);
        }
      }
    };
    this.loopId = requestAnimationFrame(loop);
  }

  // After scrolling, resizing, folding or drawer changes: re-solve if needed.
  async check(m) {
    if (this.forceResolve) { this.forceResolve = false; this.computeScale(); }
    const b = this.bounds();
    const visible = m.vr.width > 2 && m.vr.height > 2 && m.vr.bottom > this.topSafe() && m.vr.top < b.dockTop;
    const mr = ++this.minorRun;
    const live = () => mr === this.minorRun && this.active && (this.phase === 'narrating' || this.phase === 'idle');
    this.minorMoving = true;
    try {
      if (!visible) {
        // target scrolled away: lower the stick and wait at the nearest edge
        const goal = { x: clamp(this.pos.x, b.minX, b.maxX), y: m.T.y < this.topSafe() ? Math.max(b.minY, this.topSafe() + 4) : b.maxY };
        if (Math.abs(goal.x - this.pos.x) + Math.abs(goal.y - this.pos.y) > 4 || this.mode === 'pointer') await this.walkTo(goal, live);
        this.ring.classList.remove('on');
        this.needCheck = false; this.awayFromTarget = true;
        return;
      }
      const sol = this.solve(m.T, m.pr, this.avoidRects(this.target));
      const inB = this.pos.x >= b.minX - 1 && this.pos.x <= b.maxX + 1 && this.pos.y >= b.minY - 1 && this.pos.y <= b.maxY + 1;
      const tipErr = this.tipError(m.T);
      if (!this.awayFromTarget && inB && tipErr < 6) return;
      this.ring.classList.add('on');
      if (sol) await this.walkTo(sol, live);
      const m2 = this.measure(this.target); this.T = m2.T; this.lastT = { ...m2.T };
      await this.aimAndTap(m2.T, sol, live, 0);
      this.awayFromTarget = false;
    } catch (e) { if (e !== CANCELLED) console.error(e); }
    finally { this.minorMoving = false; }
  }
  tipError(T) {
    if (!this.sam || this.mode !== 'pointer') return Infinity;
    const tp = this.sam.getTipPosition();
    return Math.hypot(this.pos.x + tp.x * this.scale - T.x, this.pos.y + tp.y * this.scale - T.y);
  }
  // test hook
  debug() {
    const tp = this.sam?.getTipPosition?.();
    return { idx: this.idx, phase: this.phase, paused: this.userPaused, menuOpen: this.menuOpen, pos: { ...this.pos }, scale: this.scale, T: this.T, tip: tp ? { x: this.pos.x + tp.x * this.scale, y: this.pos.y + tp.y * this.scale } : null, mode: this.mode, side: this.side, word: this.wordIdx, samW: this.samW(), samH: this.samH() };
  }
}
