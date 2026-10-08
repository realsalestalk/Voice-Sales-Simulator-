// Narration for the walkthrough. Sam talks the whole way through:
//  - his approved recordings play where a line matches them exactly;
//  - every other line is pre-generated audio (tools/build_voice.py), a voice chosen to resemble his
//    recordings — clearly labelled in the UI, never presented as a clone;
//  - if audio is off or fails, the same lines run as timed captions with matching mouth movement.
// All playback goes through ONE persistent <audio> element, unlocked by the Start tap, so mobile
// browsers that only allow gesture-started audio keep it working for the whole tour.
import { CLIPS } from './voice-data.js';
import { LINES } from './voice-lines.js';

export const CANCELLED = Symbol('cancelled');

const syllables = w => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g) || []).length - (/[^aeiou]e$/i.test(w) ? 1 : 0));

// Caption timing for text with no audio: [{ start, dur, syl }]
export function captionTiming(words, rate = 1) {
  let t = 0; const out = [];
  for (const w of words) {
    const syl = syllables(w);
    const dur = (0.2 + 0.13 * syl) / rate;
    out.push({ word: w, start: t, dur, syl });
    t += dur;
    if (/[.!?…]$/.test(w)) t += 0.38 / rate; else if (/[,;:—–]$/.test(w)) t += 0.16 / rate;
  }
  return { items: out, total: t + 0.15 };
}

const SILENT = new URL('../assets/audio/silence.mp3', import.meta.url).href;

export class Narrator {
  constructor({ clock, onWord, onMouth, onStatus }) {
    this.clock = clock; this.onWord = onWord; this.onMouth = onMouth; this.onStatus = onStatus;
    this.soundOn = true; this.audioOk = true; this.token = 0; this.active = null; this.mouth = 0;
    this.el = null; this.cache = new Map();
  }

  // Called from the Start tap. Never throws; resolves within ~1.5 s.
  async unlock() {
    try {
      if (!this.el) { this.el = new Audio(); this.el.preload = 'auto'; this.el.setAttribute('playsinline', ''); }
      this.el.src = SILENT; this.el.muted = true;
      await Promise.race([this.el.play(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
      this.el.pause(); this.el.muted = false;
      this.audioOk = true;
    } catch {
      if (this.el) this.el.muted = false;
      this.audioOk = false;
      this.onStatus?.({ message: 'Sound could not start on this browser. Sam’s captions will continue.', retry: true });
    }
    return this.audioOk;
  }
  async retryAudio() { this.audioOk = true; return this.unlock(); }

  // Warm the browser cache for a step's audio (called ahead of time).
  preload(step) {
    if (!step) return;
    for (const k of ['go', 'tap', 'say']) for (const p of step[k] || []) {
      const src = p.clip ? CLIPS[p.clip]?.src : LINES[p.tts]?.src;
      if (!src || this.cache.has(src)) continue;
      try { const a = new Audio(); a.preload = 'auto'; a.src = src; this.cache.set(src, a); } catch { /* ignore */ }
    }
  }

  // Build the plan for a step: parts with their global word offsets in step.text.
  prepare(step) {
    let offset = 0;
    const seg = k => (step[k] || []).map(p => {
      const text = p.clip ? CLIPS[p.clip].text : p.tts;
      const words = text.split(/\s+/).filter(Boolean);
      const part = { kind: p.clip ? 'clip' : 'line', text, words, from: offset, data: p.clip ? CLIPS[p.clip] : LINES[p.tts] };
      offset += words.length; return part;
    });
    return { go: seg('go'), tap: seg('tap'), say: seg('say'), total: offset };
  }

  async speak(parts, isCancelled) {
    const my = ++this.token;
    const live = () => my === this.token && !isCancelled();
    for (const part of parts) {
      if (!live()) throw CANCELLED;
      let ok = false;
      if (this.soundOn && this.audioOk && part.data?.src) ok = await this.playAudio(part, live);
      if (!ok) await this.captions(part, live);
    }
    this.setMouth(0);
  }

  setMouth(v) { this.mouth = v; this.onMouth?.(v); }

  async playAudio(part, live) {
    const d = part.data, a = this.el;
    if (!a) return false;
    try {
      if (!a.src.endsWith(d.src)) { a.src = d.src; a.load?.(); }
      a.currentTime = 0;
    } catch { return false; }
    if (a.readyState < 3) {
      await Promise.race([
        new Promise(r => { const f = () => { a.removeEventListener('canplaythrough', f); a.removeEventListener('canplay', f); r(); }; a.addEventListener('canplaythrough', f); a.addEventListener('canplay', f); }),
        new Promise(r => setTimeout(r, 4000)),
      ]);
    }
    if (!live()) throw CANCELLED;
    if (a.readyState < 2) { this.onStatus?.({ message: 'A line of Sam’s narration didn’t load, so it’s shown as captions.', retry: true }); return false; }
    await this.clock.untilResumed(live);
    try { await a.play(); } catch { this.audioOk = false; this.onStatus?.({ message: 'The browser blocked sound. Tap Retry sound, or keep going with captions.', retry: true }); return false; }
    this.active = { kind: 'audio', a };
    const wt = d.wordTimes || [];
    let lastKick = performance.now();
    try {
      await new Promise((resolve, reject) => {
        const tick = () => {
          if (!live()) { reject(CANCELLED); return; }   // stop() owns pausing the shared element
          if (a.paused && !a.ended && !this.clock.paused && performance.now() - lastKick > 400) { lastKick = performance.now(); a.play().catch(() => {}); }
          const t = a.currentTime;
          const env = d.env[Math.floor(t * d.fps)] ?? 0;
          this.setMouth(a.paused ? 0 : Math.min(1, env * 1.15));
          let w = -1; for (let k = 0; k < wt.length; k++) if (t >= wt[k] - 0.04) w = k;
          this.onWord?.(part.from + w);
          if (a.ended || t >= d.dur - 0.03) { this.onWord?.(part.from + part.words.length - 1); resolve(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } finally { this.active = null; }
    return true;
  }

  async captions(part, live) {
    const { items, total } = captionTiming(part.words);
    const t0 = this.clock.now();
    this.active = { kind: 'captions' };
    try {
      await new Promise((resolve, reject) => {
        const tick = () => {
          if (!live()) { reject(CANCELLED); return; }
          const t = (this.clock.now() - t0) / 1000;
          let w = -1, mouth = 0;
          for (let k = 0; k < items.length; k++) {
            const it = items[k];
            if (t >= it.start) w = k;
            if (t >= it.start && t < it.start + it.dur) mouth = 0.12 + 0.62 * Math.abs(Math.sin(Math.PI * (t - it.start) / it.dur * it.syl));
          }
          this.setMouth(this.clock.paused ? 0 : mouth);
          this.onWord?.(part.from + w);
          if (t >= total) { resolve(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    } finally { this.active = null; }
  }

  pause() { if (this.active?.kind === 'audio') this.active.a.pause(); }
  resume() { if (this.active?.kind === 'audio') this.active.a.play().catch(() => {}); }
  stop() {
    this.token++;
    try { this.el?.pause(); } catch { /* ignore */ }
    this.active = null; this.setMouth(0);
  }
}
