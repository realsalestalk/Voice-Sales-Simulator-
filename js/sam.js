// Sam — rendered from the approved reference footage (keyed video frames), not redrawn.
// The wooden stick is part of the frames while he walks (cane) and lifts/lowers it;
// while teaching, the baked stick is removed and the same stick is drawn from his real
// fist so it can aim anywhere. His fingers (a separate fist layer from the same frame)
// are always drawn over the handle, so it stays seated behind his fingers.
import { SAM_ATLAS as A } from './sam-data.js';

const ATLAS_URL = new URL('../assets/sam/sam-atlas.webp', import.meta.url).href;
let atlasImg = null, atlasReady = null;
function loadAtlas() {
  if (atlasReady) return atlasReady;
  atlasReady = new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { atlasImg = im; res(im); };
    im.onerror = () => { atlasReady = null; rej(new Error('Sam artwork failed to load')); };
    im.src = ATLAS_URL;
  });
  return atlasReady;
}

const F = A.frames;
const SETS = A.sets;
const bySrc = (set, src) => SETS[set].find(n => F[n].src === src);
const REST = bySrc('hold', 180);
const TAP = [160, 162, 164, 166, 168, 171, 174, 176, 178, 180].map(s => bySrc('hold', s));
const LIFE = [180, 181, 182, 183, 184, 185, 186].map(s => bySrc('hold', s));
const GRIP_INSET = 22 * A.k;           // handle depth inside the fist (atlas px)
const STICK_BAKED = F[REST].visLen + GRIP_INSET;   // length visible in the footage
const STICK_LEN = F[REST].visLen * 1.65 + GRIP_INSET; // teaching length (slid out through his grip)
const BOX = { l: F[REST].ox, t: F[REST].oy, r: F[REST].ox + F[REST].w, b: F[REST].oy + F[REST].h };
const CX = (BOX.l + BOX.r) / 2;        // mirror axis
const PAD = { x: 280, top: 330, bottom: 24 }; // canvas extent around the mirror axis / floor
const STAND_H = A.normH * A.k;         // atlas px for full standing height
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const preload = () => loadAtlas();

export function createSam({ size = 150, reducedMotion = false } = {}) {
  const s = size / STAND_H;               // CSS px per atlas px
  const W = (BOX.r - BOX.l) * s, H = (BOX.b - BOX.t) * s;
  const el = document.createElement('div');
  el.className = 'sam';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'relative', width: `${W}px`, height: `${H}px`, pointerEvents: 'none', touchAction: 'auto', userSelect: 'none' });
  const cv = document.createElement('canvas');
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const cw = PAD.x * 2 * s, ch = (PAD.top + PAD.bottom) * s;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  Object.assign(cv.style, { position: 'absolute', width: `${cw}px`, height: `${ch}px`, left: `${(CX - PAD.x - BOX.l) * s}px`, top: `${(-PAD.top - BOX.t) * s}px`, pointerEvents: 'none' });
  el.appendChild(cv);
  const ctx = cv.getContext('2d');

  // ---------- state ----------
  const st = {
    facing: 1, mode: 'cane', anim: null, walking: false, walkT: 0,
    aim: F[REST].angle, ext: 1, lenT: 0, lenFrom: 0, lenTo: null, lenT0: 0, aimFrom: null, aimTo: null, aimT0: 0, aimDur: 0, aimRes: null,
    mouth: 0, mouthT: 0, blink: 0, nextBlink: performance.now() + 2000 + Math.random() * 3000, blinkT0: 0,
    paused: false, last: performance.now(), lifeT: 0, idleT: Math.random() * 10,
    frame: F[SETS.idle[0]], prevFrame: null, modeTok: 0, branch: '', fadeT: 1, destroyed: false, tapping: null,
  };
  let lidColor = '#7f97d6';

  // ---------- frame sequencing ----------
  function show(frameIdx, fade = 0) {
    const f = F[frameIdx];
    if (st.frame !== f) { if (fade > 0 && !reducedMotion) { st.prevFrame = st.frame; st.fadeT = 0; st.fadeDur = fade; } st.frame = f; }
  }
  function playSeq(list, fps, { fadeIn = 90 } = {}) {
    return new Promise(res => {
      if (reducedMotion) { show(list[list.length - 1]); res(); return; }
      st.anim = { list, fps, t: 0, res, fadeIn, first: true };
    });
  }

  // ---------- render ----------
  function drawFrame(f, alpha = 1) {
    if (!atlasImg) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(atlasImg, f.x, f.y, f.w, f.h, f.ox, f.oy, f.w, f.h);
    ctx.globalAlpha = 1;
  }
  function stickPose(f) {
    const g = f.grip, a = st.aim, L = (STICK_BAKED + (STICK_LEN - STICK_BAKED) * st.lenT) * st.ext;
    return { gx: g[0], gy: g[1], a, L, tx: g[0] + Math.cos(a) * L, ty: g[1] + Math.sin(a) * L };
  }
  function drawStick(f) {
    const p = stickPose(f);
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    const w0 = 3.4, w1 = 2.3; // half-widths (atlas px) at handle and tip
    const nx = -sa, ny = ca;
    const bx = p.gx - ca * 4, by = p.gy - sa * 4;
    ctx.save();
    const grad = ctx.createLinearGradient(bx + nx * w0, by + ny * w0, bx - nx * w0, by - ny * w0);
    grad.addColorStop(0, '#e8c48f'); grad.addColorStop(0.45, '#cf9c5f'); grad.addColorStop(1, '#9a6a37');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx + nx * w0, by + ny * w0);
    ctx.lineTo(p.tx + nx * w1, p.ty + ny * w1);
    ctx.arc(p.tx, p.ty, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(bx - nx * w0, by - ny * w0);
    ctx.closePath(); ctx.fill();
    // grain
    ctx.strokeStyle = 'rgba(120,78,38,.45)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(bx + nx * 1.2, by + ny * 1.2); ctx.lineTo(p.tx + nx * 0.6, p.ty + ny * 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,215,.5)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(bx + nx * 2.2, by + ny * 2.2); ctx.lineTo(p.tx + nx * 1.4, p.ty + ny * 1.4); ctx.stroke();
    ctx.restore();
  }
  function drawFace(f) {
    if (!f.face) return;
    // eyelids (blink)
    if (st.blink > 0.02) {
      for (const [k, rx, ry] of [['eyeL', 9.5, 7.6], ['eyeR', 6.2, 7.8]]) {
        const [ex, ey] = f.face[k];
        ctx.save();
        ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
        const yb = ey - ry + 2 * ry * st.blink;
        ctx.fillStyle = lidColor; ctx.fillRect(ex - rx - 1, ey - ry - 1, 2 * rx + 2, yb - (ey - ry) + 1);
        ctx.strokeStyle = 'rgba(40,40,70,.8)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(ex - rx, yb); ctx.quadraticCurveTo(ex, yb + 1.4, ex + rx, yb); ctx.stroke();
        ctx.restore();
      }
    }
    // mouth (lip sync) under the moustache
    const m = st.mouth;
    if (m > 0.04) {
      const [mx, my] = f.face.mouth;
      const w = 3.6 + m * 2.4, h = 1 + m * 4.8;
      ctx.save();
      const g = ctx.createRadialGradient(mx, my + h * 0.3, 0.2, mx, my + h * 0.3, Math.max(w, h));
      g.addColorStop(0, '#3a1a22'); g.addColorStop(0.7, '#2a1420'); g.addColorStop(1, 'rgba(42,20,32,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(mx, my + h * 0.35, w, h, 0, 0, Math.PI * 2); ctx.fill();
      if (m > 0.35) { ctx.fillStyle = 'rgba(190,90,105,.75)'; ctx.beginPath(); ctx.ellipse(mx, my + h * 0.75, w * 0.55, h * 0.28, 0, 0, Math.PI * 2); ctx.fill(); }
      // moustache fringe over the top lip
      ctx.fillStyle = 'rgba(214,214,226,.92)';
      ctx.beginPath(); ctx.ellipse(mx, my - 1.2, w + 2.2, 2.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!atlasImg) return;
    const k = s * dpr;
    // origin: mirror axis at canvas centre, floor at PAD.top
    ctx.setTransform(k * st.facing, 0, 0, k, (PAD.x) * k, PAD.top * k);
    ctx.translate(-CX, 0);
    // soft floor shadow
    const sh = ctx.createRadialGradient(CX, 0, 2, CX, 0, 70);
    sh.addColorStop(0, 'rgba(20,24,40,.28)'); sh.addColorStop(1, 'rgba(20,24,40,0)');
    ctx.save(); ctx.scale(1, 0.16); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(CX, 0, 70, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const f = st.frame;
    if (st.prevFrame && st.fadeT < 1) drawFrame(st.prevFrame, 1);
    drawFrame(f, st.prevFrame && st.fadeT < 1 ? ease(st.fadeT) : 1);
    if (f.grip && st.mode === 'pointer') {
      drawStick(f);
      const fi = f.fist; if (fi) ctx.drawImage(atlasImg, fi.x, fi.y, fi.w, fi.h, fi.ox, fi.oy, fi.w, fi.h);
    }
    if (f.face) drawFace(f);
  }

  // ---------- loop ----------
  let raf = 0;
  function tick(now) {
    if (st.destroyed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    if (st.prevFrame && st.fadeT < 1) { st.fadeT = Math.min(1, st.fadeT + dt * 1000 / (st.fadeDur || 100)); if (st.fadeT >= 1) st.prevFrame = null; }
    // aim tween
    if (st.aimTo) {
      const p = st.aimDur ? Math.min(1, (now - st.aimT0) / st.aimDur) : 1, e = ease(p);
      st.aim = st.aimFrom.a + (st.aimTo.a - st.aimFrom.a) * e;
      st.ext = st.aimFrom.ext + (st.aimTo.ext - st.aimFrom.ext) * e;
      if (p >= 1) { st.aimTo = null; const r = st.aimRes; st.aimRes = null; r && r(); }
    }
    if (st.lenTo !== null) {
      const p = Math.min(1, (now - st.lenT0) / 320), e = ease(p);
      st.lenT = st.lenFrom + (st.lenTo - st.lenFrom) * e;
      if (p >= 1) { st.lenT = st.lenTo; st.lenTo = null; }
    }
    // blinking (pointer pose; idle frames carry real blinks)
    if (!st.paused && now > st.nextBlink) { st.blinkT0 = now; st.nextBlink = now + 2400 + Math.random() * 3600 + (Math.random() < 0.15 ? -2000 : 0); }
    const bt = (now - st.blinkT0) / 150; st.blink = bt >= 0 && bt < 2 ? (bt < 1 ? bt : 2 - bt) : 0;
    // sequences
    if (st.anim) {
      st.branch = 'anim';
      const a = st.anim; a.t += dt;
      const i = Math.min(a.list.length - 1, Math.floor(a.t * a.fps));
      show(a.list[i], a.first ? a.fadeIn : 0); a.first = false;
      if (a.t * a.fps >= a.list.length) { st.anim = null; a.res(); }
    } else if (st.tapping) {
      const tp = st.tapping; tp.t += dt;
      const i = Math.min(TAP.length - 1, Math.floor(tp.t * 30));
      show(TAP[i]);
      if (tp.t * 30 >= TAP.length) { st.tapping = null; show(REST); tp.res(); }
    } else if (st.mode === 'pointer') {
      if (st.branch !== 'point') { st.branch = 'point'; show(REST, 110); }
      if (!reducedMotion && !st.paused) { st.lifeT += dt; const n = LIFE.length, ph = Math.floor(st.lifeT * 6) % (2 * n - 2); show(LIFE[ph < n ? ph : 2 * n - 2 - ph]); }
      else show(REST);
    } else if (st.walking && !reducedMotion) {
      if (st.branch !== 'walk') { st.branch = 'walk'; show(SETS.walk[0], 110); }
      st.walkT += dt; const w = SETS.walk; show(w[Math.floor(st.walkT * 15) % w.length], st.walkT < 0.05 ? 110 : 0);
    } else {
      if (st.branch !== 'idle') { st.branch = 'idle'; show(SETS.idle[0], 130); }
      if (!reducedMotion && !st.paused) st.idleT += dt;
      const n = SETS.idle.length, ph = Math.floor(st.idleT * 9) % (2 * n - 2);
      show(SETS.idle[ph < n ? ph : 2 * n - 2 - ph], st.wasWalking ? 140 : 0);
    }
    st.wasWalking = st.walking && st.mode === 'cane' && !st.anim;
    render();
  }
  const ready = loadAtlas().then(() => {
    try {
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; const x = c.getContext('2d');
      const f = F[REST]; const [ex, ey] = f.face.eyeL;
      x.drawImage(atlasImg, f.x + (ex - f.ox), f.y + (ey - 13 - f.oy), 1, 1, 0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data; lidColor = `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch { /* keep default */ }
    render();
  });
  raf = requestAnimationFrame(tick);

  function slide(to) {
    if (reducedMotion) { st.lenT = to; st.lenTo = null; return Promise.resolve(); }
    st.lenFrom = st.lenT; st.lenTo = to; st.lenT0 = performance.now();
    return new Promise(r => setTimeout(r, 330));
  }

  // ---------- geometry (CSS px relative to el's top-left, current facing) ----------
  const toEl = (x, y) => ({ x: ((st.facing === 1 ? x : 2 * CX - x) - BOX.l) * s, y: (y - BOX.t) * s });
  const restGrip = () => F[REST].grip;

  const api = {
    el, ready, width: W, height: H,
    setFacing(dir) { st.facing = dir < 0 ? -1 : 1; },
    setHand() { return Promise.resolve(); }, // the stick hand follows his facing (mirrored footage)
    async setMode(mode) {
      const tok = ++st.modeTok;
      if (st.anim) { const a = st.anim; st.anim = null; a.res(); }   // supersede any running clip
      if (mode === 'pointer') {
        if (st.mode !== 'pointer') {
          st.walking = false;
          await playSeq(SETS.lift, 22, { fadeIn: 120 });
          if (tok !== st.modeTok) return;
          st.aim = F[REST].angle; st.ext = 1; st.aimTo = null; st.lenT = 0;
          st.mode = 'pointer'; show(REST, 90);
        }
        await slide(1);
      } else if (st.mode !== 'cane') {
        const baked = F[SETS.lower[0]].angle ?? F[REST].angle;
        await Promise.all([api.aim(st.facing === 1 ? baked : Math.PI - baked, 1, 220), slide(0)]);
        if (tok !== st.modeTok) return;
        st.mode = 'cane';
        await playSeq(SETS.lower, 24, { fadeIn: 60 });
      }
    },
    setWalking(on) { if (on && !st.walking) st.walkT = 0; st.walking = !!on; },
    getPointerGeometry() { const g = restGrip(); return { shoulder: toEl(g[0], g[1]), reach: STICK_LEN * s }; },
    aim(angle, extension = 1, dur = reducedMotion ? 0 : 260) {
      const internal = st.facing === 1 ? angle : Math.PI - angle;
      // shortest rotation
      let a = internal; while (a - st.aim > Math.PI) a -= 2 * Math.PI; while (a - st.aim < -Math.PI) a += 2 * Math.PI;
      const ext = Math.max(1, Math.min(1.15, extension));
      if (st.aimRes) { const r = st.aimRes; st.aimRes = null; r(); }
      return new Promise(res => {
        st.aimFrom = { a: st.aim, ext: st.ext }; st.aimTo = { a, ext }; st.aimT0 = performance.now(); st.aimDur = dur; st.aimRes = res;
        if (!dur) { st.aim = a; st.ext = ext; st.aimTo = null; st.aimRes = null; res(); }
      });
    },
    getTipPosition() {
      const f = st.frame.grip ? st.frame : F[REST];
      const p = stickPose(f);
      return toEl(p.tx, p.ty);
    },
    tap() {
      if (st.mode !== 'pointer') return Promise.resolve();
      if (reducedMotion) return new Promise(r => setTimeout(r, 120));
      return new Promise(res => { st.tapping = { t: 0, res }; });
    },
    setMouth(v) { st.mouth = Math.max(0, Math.min(1, v || 0)); },
    setExpression() { /* expressions come from the reference frames themselves */ },
    lookAt() { /* gaze comes from the reference frames (he looks toward what he points at) */ },
    setSpeaking() {},
    pause() { st.paused = true; },
    resume() { st.paused = false; },
    destroy() { st.destroyed = true; cancelAnimationFrame(raf); el.remove(); },
    get mode() { return st.mode; },
  };
  return api;
}
