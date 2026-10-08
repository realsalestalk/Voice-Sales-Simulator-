// Narration: approved recorded clips where a line matches, otherwise timed captions.
// Optional (opt-in, clearly labelled) device speech synthesis — never presented as Sam's voice.
import { CLIPS } from './voice-data.js';

export const CANCELLED = Symbol('cancelled');

const syllables = w => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g) || []).length - (/[^aeiou]e$/i.test(w) ? 1 : 0));

// Build caption timing for plain text: [{word, start, dur, syl}]
export function captionTiming(words, rate = 1) {
  let t = 0; const out = [];
  for (const w of words) {
    const syl = syllables(w);
    const dur = (0.2 + 0.13 * syl) / rate;
    out.push({ word: w, start: t, dur, syl });
    t += dur;
    if (/[.!?…]$/.test(w)) t += 0.38 / rate; else if (/[,;:—–]$/.test(w) || w === '—') t += 0.16 / rate;
  }
  return { items: out, total: t + 0.2 };
}

export class Narrator {
  constructor({ clock, onWord, onMouth, onStatus }) {
    this.clock = clock; this.onWord = onWord; this.onMouth = onMouth; this.onStatus = onStatus;
    this.audio = {}; this.audioOk = true; this.soundOn = true; this.deviceVoice = false;
    this.token = 0; this.active = null; this.mouth = 0;
    this.voice = null;
  }

  // Called from the Start button's user gesture. Never throws; resolves within ~1.5s.
  async unlock() {
    const tasks = Object.entries(CLIPS).map(([k, c]) => {
      try {
        const a = new Audio(); a.preload = 'auto'; a.src = c.src; a.load?.();
        this.audio[k] = a;
      } catch { /* ignore */ }
    });
    void tasks;
    const first = Object.values(this.audio)[0];
    if (!first) { this.audioOk = false; return false; }
    try {
      first.muted = true;
      const p = first.play();
      await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
      first.pause(); first.currentTime = 0; first.muted = false;
      this.audioOk = true;
    } catch (e) {
      first.muted = false;
      this.audioOk = false;
      this.onStatus?.({ kind: 'audio-blocked', message: 'Sound could not start on this browser. Captions will continue.' });
    }
    try { this.pickVoice(); speechSynthesis?.addEventListener?.('voiceschanged', () => this.pickVoice()); } catch { /* no speech */ }
    return this.audioOk;
  }
  pickVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      const pref = ['Daniel', 'Google UK English Male', 'Alex', 'Aaron', 'Fred', 'Microsoft Guy', 'Microsoft David', 'Arthur', 'Rishi'];
      this.voice = pref.map(n => vs.find(v => v.name.includes(n))).find(Boolean) || vs.find(v => /male/i.test(v.name)) || vs[0] || null;
    } catch { this.voice = null; }
  }
  get deviceVoiceAvailable() { try { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'; } catch { return false; } }

  // Prepare a step's narration (during Sam's walk). Returns a plan.
  prepare(step) {
    const text = step.text;
    const words = text.split(/\s+/).filter(Boolean);
    const segs = [];
    let i = 0;
    if (step.clip && CLIPS[step.clip]) {
      const c = CLIPS[step.clip];
      const n = c.text.split(/\s+/).length;
      segs.push({ kind: 'clip', clip: step.clip, from: 0, to: n });
      i = n;
      const a = this.audio[step.clip];
      if (a && a.readyState < 2) { try { a.load(); } catch { /* ignore */ } }
    }
    if (i < words.length) segs.push({ kind: 'speech', from: i, to: words.length });
    return { words, segs, step };
  }

  async speak(plan, isCancelled) {
    const my = ++this.token;
    const live = () => my === this.token && !isCancelled();
    for (const seg of plan.segs) {
      if (!live()) throw CANCELLED;
      if (seg.kind === 'clip' && this.soundOn && this.audioOk) {
        const ok = await this.playClip(seg, plan, live).catch(e => { if (e === CANCELLED) throw e; return false; });
        if (ok) continue;
      }
      if (seg.kind === 'clip' || !this.deviceVoice || !this.soundOn || !this.deviceVoiceAvailable) await this.captions(seg, plan, live);
      else await this.device(seg, plan, live);
    }
    this.setMouth(0);
  }

  setMouth(v) { this.mouth = v; this.onMouth?.(v); }

  async playClip(seg, plan, live) {
    const c = CLIPS[seg.clip]; const a = this.audio[seg.clip];
    if (!a) return false;
    // wait for data (bounded)
    if (a.readyState < 3) {
      await Promise.race([
        new Promise(r => a.addEventListener('canplaythrough', r, { once: true })),
        new Promise(r => setTimeout(r, 3500)),
      ]);
    }
    if (!live()) throw CANCELLED;
    if (a.readyState < 2) { this.onStatus?.({ kind: 'clip-failed', message: 'A recorded line did not load — showing captions instead.', retry: true }); return false; }
    a.currentTime = 0;
    try { await a.play(); } catch { this.onStatus?.({ kind: 'audio-blocked', message: 'Sound was blocked by the browser — captions continue.', retry: true }); return false; }
    this.active = { kind: 'clip', a };
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (!live()) { a.pause(); this.active = null; reject(CANCELLED); return; }
        const t = a.currentTime;
        const idx = Math.floor(t * c.fps);
        const env = c.env[idx] ?? 0;
        this.setMouth(a.paused ? 0 : Math.min(1, env * 1.15));
        let w = -1; for (let k = 0; k < c.wordTimes.length; k++) if (t >= c.wordTimes[k] - 0.05) w = k;
        this.onWord?.(seg.from + w);
        if (a.ended || t >= c.dur - 0.02) { this.active = null; this.onWord?.(seg.to - 1); resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return true;
  }

  async captions(seg, plan, live) {
    const words = plan.words.slice(seg.from, seg.to);
    const { items, total } = captionTiming(words);
    const t0 = this.clock.now();
    this.active = { kind: 'captions' };
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (!live()) { this.active = null; reject(CANCELLED); return; }
        const t = (this.clock.now() - t0) / 1000;
        let w = -1, mouth = 0;
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          if (t >= it.start) w = k;
          if (t >= it.start && t < it.start + it.dur) {
            const p = (t - it.start) / it.dur * it.syl;
            mouth = 0.12 + 0.62 * Math.abs(Math.sin(Math.PI * p));
          }
        }
        if (this.clock.paused) mouth = 0;
        this.setMouth(mouth);
        this.onWord?.(seg.from + w);
        if (t >= total) { this.active = null; resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  async device(seg, plan, live) {
    const words = plan.words.slice(seg.from, seg.to);
    const starts = []; let pos = 0; for (const w of words) { starts.push(pos); pos += w.length + 1; }
    let resumeFrom = 0;
    while (resumeFrom < words.length) {
      if (!live()) throw CANCELLED;
      const text = words.slice(resumeFrom).join(' ');
      const base = resumeFrom;
      let cur = base, lastBoundary = performance.now(), gotBoundary = false;
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 0.98; u.pitch = 0.8; u.lang = this.voice?.lang || 'en-US';
      const offs = []; let p2 = 0; for (const w of words.slice(base)) { offs.push(p2); p2 += w.length + 1; }
      u.onboundary = e => { gotBoundary = true; lastBoundary = performance.now(); let k = 0; for (let j = 0; j < offs.length; j++) if (e.charIndex >= offs[j]) k = j; cur = base + k; };
      const t0 = performance.now();
      const est = captionTiming(words.slice(base), 0.98);
      const done = new Promise(res => { u.onend = () => res('end'); u.onerror = () => res('error'); });
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { await this.captions({ from: seg.from + base, to: seg.to }, plan, live); return; }
      this.active = { kind: 'device' };
      let paused = false;
      const result = await new Promise((resolve) => {
        const tick = () => {
          if (!live()) { try { speechSynthesis.cancel(); } catch { /* ignore */ } resolve('cancel'); return; }
          if (this.clock.paused && !paused) { paused = true; try { speechSynthesis.cancel(); } catch { /* ignore */ } resolve('paused'); return; }
          if (!gotBoundary) { const t = (performance.now() - t0) / 1000; let k = 0; est.items.forEach((it, j) => { if (t >= it.start) k = j; }); cur = base + k; }
          const since = performance.now() - lastBoundary;
          const m = gotBoundary ? (since < 260 ? 0.15 + 0.6 * Math.abs(Math.sin(since / 260 * Math.PI)) : 0.1) : 0.15 + 0.5 * Math.abs(Math.sin(performance.now() / 120));
          this.setMouth(m);
          this.onWord?.(seg.from + cur);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        done.then(r => resolve(r));
      });
      this.active = null;
      if (result === 'cancel') throw CANCELLED;
      if (result === 'paused') {
        this.setMouth(0);
        await this.clock.untilResumed(live);
        // restart from the start of the current sentence
        let k = cur; while (k > base && !/[.!?]$/.test(words[k - 1 - 0] || '')) k--;
        resumeFrom = Math.max(0, k);
        continue;
      }
      if (result === 'error') { await this.captions({ from: seg.from + cur, to: seg.to }, plan, live); return; }
      this.onWord?.(seg.to - 1);
      return;
    }
  }

  pause() { if (this.active?.kind === 'clip') this.active.a.pause(); }
  resume() { if (this.active?.kind === 'clip') this.active.a.play().catch(() => {}); }
  stop() {
    this.token++;
    for (const a of Object.values(this.audio)) { try { a.pause(); } catch { /* ignore */ } }
    try { speechSynthesis?.cancel(); } catch { /* ignore */ }
    this.active = null; this.setMouth(0);
  }
  async retryAudio() {
    for (const [k, c] of Object.entries(CLIPS)) { try { const a = new Audio(); a.preload = 'auto'; a.src = c.src + '?r=' + Date.now(); a.load(); this.audio[k] = a; } catch { /* ignore */ } }
    return this.unlock();
  }
}
