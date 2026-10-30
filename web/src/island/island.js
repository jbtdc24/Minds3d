// Mind Island: your own island to clear, farm and grow, with your real Minds walking around on it.
// Hand: drag to look around, tap to do the obvious thing. Tools: drag across tiles. Your Minds walk over and do each job.
import { rarityOf } from '../nft2d.js';
import { chibi } from './chibi.js';
import { sfx } from '../audio.js';
import { gen, COVER, T, TW, TH, WW, WH, hash } from './gen.js';
import { groundFor, sprites, sprouts, heart, SOIL, toolSprites } from './art.js';
import { rng } from './pixel.js';
import { CROPS, coverAt, ripe, growMs, regrowMs, maxPlots, plotCount, PLOT_COST, speedBonus, BUILD, buildingAt, fits, footprint, maxOf, countOf, canAfford, costText } from './rules.js';
import { bsprites, drawSails, buildIcon } from './buildings.js';
import { isle, doAct, now, onChange, flush } from './store.js';

const cv = document.getElementById('island-cv');
const g = cv.getContext('2d');
const $ = s => document.querySelector(s);
const SPEED = 15;                  // Mind walking speed, px / s
let w = null, gr = null, minds = [], fx = [], running = false, raf = 0, last = 0, Tm = 0;
let W = 1, H = 1, DPR = 1, zMin = 2, zMax = 8, selected = null, selectedT = 0, hover = -1;
let buildType = 'house', moving = null;
let tool = 'hand', seed = 'bean', cb = { toast: () => {}, shop: () => {}, bag: () => {} };
const cam = { x: WW / 2, y: WH / 2, z: 3 };
const clouds = [];
const kx = k => k % TW, ky = k => (k / TW) | 0;
const tileAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= TW || ty >= TH ? -1 : ty * TW + tx; };

export const fmtTime = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
function hourNow() {
  const q = new URLSearchParams(location.search).get('hour');   // ?hour=21 previews the night
  return q !== null ? +q : new Date().getHours() + new Date().getMinutes() / 60;
}
function light() {
  const h = hourNow();
  if (h >= 7 && h < 17) return { tint: null, night: 0 };
  if (h >= 17 && h < 19) return { tint: '#ff8a4a', a: 0.14 * (h - 17) / 2 + 0.04, night: 0 };
  if (h >= 5 && h < 7) return { tint: '#ffb07a', a: 0.12, night: 0 };
  return { tint: '#1d2560', a: 0.36, night: 1 };
}

// ---------- camera ----------
function resize() {
  if (!innerWidth || !innerHeight) return;   // hidden window: keep the old size until it shows again
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  zMin = Math.max(W / WW, H / WH);
  zMax = Math.max(zMin * 4, 6);
  cam.z = Math.min(zMax, Math.max(zMin, cam.z));
  clampCam();
}
function clampCam() {
  const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
  cam.x = Math.min(WW - hw, Math.max(hw, cam.x));
  cam.y = Math.min(WH - hh, Math.max(hh, cam.y));
}
function fitCam() {
  cam.x = (w.house.x + 4) * T; cam.y = (w.house.y + 2) * T;
  cam.z = Math.min(zMax, Math.max(zMin, Math.min(W / 440, H / 300)));
  clampCam();
}
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });

// ---------- tiles ----------
const isFixed = k => w.cover[k] === COVER.FIXED;
const pathSet = () => w._paths ||= new Set(w.path);
// Minds can walk on open ground, plots and paths
function walk(x, y) {
  const k = tileAt(x, y);
  if (k < 0 || !w.land[k]) return false;
  if (isFixed(k)) return pathSet().has(k);
  return coverAt(isle.state, w, k) === COVER.NONE;
}
function valid(tl, k) {
  if (k < 0 || !w.land[k]) return false;
  const t = isle.state.tiles[k], cov = coverAt(isle.state, w, k);
  if (tl === 'clear') return cov >= COVER.WEEDS && cov <= COVER.TREE;
  if (tl === 'till') return cov === COVER.NONE && t?.s !== 'p' && !isFixed(k);
  if (tl === 'plant') return t?.s === 'p' && !t.c;
  if (tl === 'harvest') return ripe(t, now(), isle.minds);
  return cov !== COVER.NONE || t?.s === 'p' || isFixed(k);
}

// ---------- Minds: they wander, and do the jobs you give them ----------
const GO_SPEED = 38;
const WORK_TIME = { [COVER.WEEDS]: 0.7, [COVER.BUSH]: 1, [COVER.ROCK]: 1.4, [COVER.TREE]: 1.7, till: 0.9, plant: 0.55, harvest: 0.6 };
let jobs = [];   // { type, k, crop?, m? } in the order you asked
function makeMind(id, i) {
  const r = rng(id * 2654435761);
  const hx = (w.house.x + 1.5) * T, hy = (w.house.y + 3.6) * T;
  let x = hx, y = hy;
  for (let k = 0; k < 80; k++) {
    const a = r() * Math.PI * 2, d = 12 + r() * 60, X = hx + Math.cos(a) * d, Y = hy + Math.sin(a) * d * 0.7;
    if (walk(X, Y)) { x = X; y = Y; break; }
  }
  return { id, c: chibi(id), x, y, tx: x, ty: y, dir: r() < 0.5 ? 1 : -1, state: 'idle', timer: 0.5 + i * 0.4 + r() * 2, phase: r() * 6, hop: 0, r, job: null, t: 0 };
}
function clearLine(ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
  for (let i = 1; i <= n; i++) if (!walk(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
  return true;
}
const toolFor = j => j.type === 'till' ? 'hoe' : j.type === 'plant' ? 'pouch' : j.type === 'harvest' ? 'basket'
  : j.cov === COVER.TREE || j.cov === COVER.BUSH ? 'axe' : j.cov === COVER.ROCK ? 'pick' : 'scythe';
// queue a job; a free Mind walks over and does it
function enqueue(type, k, extra = {}) {
  if (k < 0 || !w.land[k] || jobs.some(j => j.k === k)) return;
  if (!valid(type, k)) return;
  const st = isle.state, same = jobs.filter(j => j.type === type);
  let err = '';
  if (type === 'till' && plotCount(st) + same.length >= maxPlots(st, isle.minds)) err = 'No free plots left. Buy a Land Permit in the Shop, or own more Minds.';
  else if (type === 'till' && st.dust < PLOT_COST * (same.length + 1)) err = `You need ${PLOT_COST} ✨ Dust for each plot.`;
  else if (type === 'plant' && (st.inv['seed_' + extra.crop] || 0) <= same.filter(j => j.crop === extra.crop).length) err = `No ${CROPS[extra.crop].name} seeds left. Buy more in the Shop.`;
  if (err) { if (!strokeErr) { strokeErr = true; sfx('denied'); cb.toast(err, true); if (type === 'plant') openSeeds(true); } return; }
  const job = { type, k, cov: coverAt(st, w, k), ...extra };
  if (!minds.length) return apply(type, k, extra);
  jobs.push(job);
  sfx('hover');
}
function finishJob(j) {
  jobs = jobs.filter(x => x !== j);
  const res = apply(j.type, j.k, j.crop ? { crop: j.crop } : {});
  if (res?.error) jobs = jobs.filter(x => x.type !== j.type || x.m);   // can't do more of these (no seeds / Dust / plots)
}
function assignJobs() {
  for (const m of minds) {
    if (m.job || m.hop > 0) continue;
    let best = null, bd = 1e9;
    for (const j of jobs) {
      if (j.m) continue;
      const d = Math.hypot(kx(j.k) * T + 8 - m.x, ky(j.k) * T + 12 - m.y);
      if (d < bd) { bd = d; best = j; }
    }
    if (!best) continue;
    best.m = m; m.job = best; m.state = 'go';
    const cx = kx(best.k) * T + 8, side = m.x < cx ? -1 : 1;
    m.tx = cx + side * 10; m.ty = ky(best.k) * T + 13;
  }
}
function updateMind(m, dt, night) {
  m.hop = Math.max(0, m.hop - dt);
  if (m.state === 'go') {
    const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
    if (d < 1.5) {
      const j = m.job;
      if (!j || !jobs.includes(j) || !valid(j.type, j.k)) { if (j) jobs = jobs.filter(x => x !== j); m.job = null; m.state = 'idle'; m.timer = 0.1; return; }
      m.state = 'work'; m.t = 0; m.dir = kx(j.k) * T + 8 > m.x ? 1 : -1;
      m.dur = WORK_TIME[j.type === 'clear' ? coverAt(isle.state, w, j.k) : j.type] || 0.8;
    } else { const s = Math.min(d, GO_SPEED * dt); m.x += dx / d * s; m.y += dy / d * s; m.phase += dt * 16; if (Math.abs(dx) > 0.5) m.dir = dx > 0 ? 1 : -1; }
  } else if (m.state === 'work') {
    const before = m.t; m.t += dt;
    const j = m.job, sw = 0.32;
    if (Math.floor(m.t / sw) > Math.floor(before / sw) && j) {   // each swing knocks a few bits off
      const x = kx(j.k) * T + 8, y = ky(j.k) * T + 10;
      const col = j.type === 'till' ? [SOIL.base, SOIL.light] : j.type === 'plant' ? ['#f3dc9e'] : j.type === 'harvest' ? ['#fff3b0', '#d4ff1f']
        : j.cov === COVER.TREE ? ['#8b5a34', '#a87444', '#7fcf55'] : j.cov === COVER.ROCK ? ['#a3a2b5', '#cfcfdc'] : ['#58b046', '#7fcf55'];
      bits(x, y, col, 3, 18);
      if (j.cov === COVER.TREE || j.cov === COVER.ROCK) sfx('flip');
    }
    if (m.t >= m.dur) { const job = m.job; m.job = null; m.state = 'idle'; m.timer = 0.15; if (job && jobs.includes(job)) finishJob(job); }
  } else if (m.state === 'walk') {
    const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
    if (d < 1 || !walk(m.x + dx / d * 2, m.y + dy / d * 2)) { m.state = 'idle'; m.timer = 1.5 + m.r() * 4; if (m.r() < (night ? 0.5 : 0.15)) emote(m, night ? 'zzz' : 'heart'); }
    else { const s = Math.min(d, SPEED * dt); m.x += dx / d * s; m.y += dy / d * s; m.phase += dt * 11; if (Math.abs(dx) > 0.5) m.dir = dx > 0 ? 1 : -1; }
  } else if ((m.timer -= dt) <= 0 && !jobs.some(j => !j.m)) {
    for (let k = 0; k < 24; k++) {
      const a = m.r() * Math.PI * 2, d = 16 + m.r() * 70, X = m.x + Math.cos(a) * d, Y = m.y + Math.sin(a) * d * 0.7;
      if (walk(X, Y) && clearLine(m.x, m.y, X, Y)) { m.tx = X; m.ty = Y; m.state = 'walk'; break; }
    }
    if (m.state !== 'walk') m.timer = 1;
  }
}
function drawMind(m) {
  const c = m.c, moving = m.state === 'walk' || m.state === 'go', s = Math.sin(m.phase);
  const lift = m.hop > 0 ? Math.round(Math.sin((1 - m.hop / 0.5) * Math.PI) * 6) : 0;
  let body = 0, legL = 0, legR = 0, ang = 0;
  if (moving) { legL = s > 0 ? -1 : 0; legR = s > 0 ? 0 : -1; body = Math.abs(s) > 0.7 ? -1 : 0; }
  else if (m.state === 'work') {
    const u = (m.t / 0.32) % 1;                       // wind up, then strike
    ang = u < 0.6 ? -1.9 * (u / 0.6) : -1.9 + 2.6 * Math.min(1, (u - 0.6) / 0.15);
    body = u > 0.6 && u < 0.85 ? 1 : 0;
    if (m.job?.type === 'plant' || m.job?.type === 'harvest') { ang = 0.5 + Math.sin(m.t * 14) * 0.4; body = Math.sin(m.t * 14) > 0 ? 1 : 0; }
  } else body = Math.sin(Tm * 2.2 + m.id) > 0.75 ? 1 : 0;   // breathing
  g.fillStyle = 'rgba(43,35,64,.28)';
  g.beginPath(); g.ellipse(m.x, m.y, c.w * 0.32, 1.8, 0, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(Math.round(m.x), Math.round(m.y) - lift);
  if (m.dir < 0) g.scale(-1, 1);
  const ox = -Math.floor(c.w / 2), oy = -c.h + 1;
  g.drawImage(c.legL.cv, ox, oy + c.hip + legL);
  g.drawImage(c.legR.cv, ox + c.mid, oy + c.hip + legR);
  g.drawImage(c.body.cv, ox, oy + body);
  const job = m.job;
  if (job && (m.state === 'work' || m.state === 'go')) {
    const tl = toolSprites[toolFor(job)];
    g.save();
    g.translate(ox + c.hand.x, oy + c.hand.y + body);
    g.rotate(m.state === 'go' ? -0.4 : ang);
    g.drawImage(tl.cv, -2, -tl.h + 2);
    g.restore();
  }
  g.restore();
}
function emote(m, type) { fx.push({ type, x: m.x, y: m.y - m.c.h - 2, life: 1.6, max: 1.6 }); }

// ---------- effects ----------
const bits = (x, y, colors, n = 10, up = 30) => {
  for (let i = 0; i < n; i++) fx.push({ type: 'bit', x: x + (Math.random() - 0.5) * 8, y: y - Math.random() * 6, vx: (Math.random() - 0.5) * 40, vy: -up * (0.4 + Math.random()), life: 0.6 + Math.random() * 0.4, max: 1, c: colors[(Math.random() * colors.length) | 0] });
};
const popText = (x, y, text, color = '#fff8e4') => fx.push({ type: 'txt', x, y, text, color, life: 1.2, max: 1.2 });
function spawnFx(dt, L) {
  const hs = sprites.house(isle.seed, false);
  if (Math.random() < dt * 2.2) fx.push({ type: 'smoke', x: (w.house.x + 1.5) * T + 12 + (Math.random() - 0.5) * 2, y: (w.house.y + 3) * T - hs.h + 4, vx: 2 + Math.random() * 2, vy: -6 - Math.random() * 3, life: 3, max: 3 });
  if (Math.random() < dt * 3) fx.push({ type: 'glow', x: (w.well.x + 1) * T + (Math.random() - 0.5) * 12, y: (w.well.y + 2) * T - 10, vx: 0, vy: -5 - Math.random() * 4, life: 1.4, max: 1.4 });
  if (Math.random() < dt * 20) { const p = gr.waterPts[(Math.random() * gr.waterPts.length) | 0]; fx.push({ type: 'spark', x: p.x, y: p.y, life: 0.9, max: 0.9 }); }
  if (L.night && Math.random() < dt * 5) { const f = gr.flowerSpots[(Math.random() * gr.flowerSpots.length) | 0]; if (f) fx.push({ type: 'firefly', x: f.x, y: f.y - 6, vx: (Math.random() - 0.5) * 6, vy: -2, life: 3, max: 3, ph: Math.random() * 6 }); }
}
function drawFx(dt) {
  for (const f of fx) {
    f.life -= dt;
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; }
    if (f.type === 'bit') f.vy += 90 * dt;
    const u = Math.max(0, f.life / f.max);
    if (f.type === 'smoke') { const s = 2 + (1 - u) * 5; g.globalAlpha = u * 0.55; g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), Math.round(s), Math.round(s)); }
    else if (f.type === 'glow') { g.globalAlpha = u; g.fillStyle = u > 0.5 ? '#f1ffa8' : '#d4ff1f'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    else if (f.type === 'spark') { g.globalAlpha = Math.sin(u * Math.PI) * 0.9; g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x) - 1, Math.round(f.y), 3, 1); }
    else if (f.type === 'star') { g.globalAlpha = Math.sin(u * Math.PI); g.fillStyle = '#fff3b0'; const x = Math.round(f.x), y = Math.round(f.y); g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    else if (f.type === 'bit') { g.globalAlpha = Math.min(1, u * 2); g.fillStyle = f.c; g.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); }
    else if (f.type === 'firefly') { f.vx += Math.sin(Tm * 3 + f.ph) * dt * 8; g.globalAlpha = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(Tm * 9 + f.ph)); g.fillStyle = '#e8ff7a'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    else if (f.type === 'heart') { g.globalAlpha = Math.min(1, u * 3); g.drawImage(heart.cv, Math.round(f.x - heart.w / 2), Math.round(f.y - (1 - u) * 6)); }
    else if (f.type === 'zzz') { g.globalAlpha = Math.min(1, u * 3); g.fillStyle = '#ffffff'; g.font = '700 7px Nunito, sans-serif'; g.fillText('z', f.x + 3 + (1 - u) * 4, f.y - (1 - u) * 8); g.fillText('Z', f.x + 6 + (1 - u) * 6, f.y - 5 - (1 - u) * 8); }
  }
  g.globalAlpha = 1;
}
function drawTexts() {   // screen space so text stays sharp
  g.font = '900 15px Nunito, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
  for (const f of fx) {
    if (f.type !== 'txt') continue;
    const u = Math.max(0, f.life / f.max), p = toScreen(f.x, f.y - (1 - u) * 14);
    g.globalAlpha = Math.min(1, u * 2.5);
    g.lineWidth = 4; g.strokeStyle = '#1d1b2f'; g.strokeText(f.text, p.x, p.y);
    g.fillStyle = f.color; g.fillText(f.text, p.x, p.y);
  }
  g.globalAlpha = 1; g.textAlign = 'start';
  fx = fx.filter(f => f.life > 0);
}
function drawClouds(dt) {
  g.fillStyle = 'rgba(43,35,64,.07)';
  for (const c of clouds) {
    c.x += c.v * dt;
    if (c.x > WW + 80) c.x = -80;
    for (const [dx, dy, r] of c.puffs) { g.beginPath(); g.ellipse(c.x + dx, c.y + dy, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  }
}
function drawLights(L) {
  if (!L.night) return;
  g.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col) => { const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  const hx = (w.house.x + 1.5) * T, hy = (w.house.y + 3) * T;
  glow(hx - 9, hy - 14, 18, 'rgba(255,197,61,.45)'); glow(hx + 12, hy - 14, 18, 'rgba(255,197,61,.45)');
  glow((w.well.x + 1) * T, (w.well.y + 2) * T - 10, 22, 'rgba(212,255,31,.4)');
  g.globalCompositeOperation = 'source-over';
}

// ---------- the world ----------
function drawPlot(k, t, nowMs) {
  const x = kx(k) * T, y = ky(k) * T, st = isle.state;
  const plot = j => j >= 0 && st.tiles[j]?.s === 'p';
  const L = kx(k) > 0 && plot(k - 1), R = kx(k) < TW - 1 && plot(k + 1), U = plot(k - TW), D = plot(k + TW);
  const x0 = x + (L ? 0 : 1), x1 = x + T - (R ? 0 : 1), y0 = y + (U ? 0 : 1), y1 = y + T - (D ? 0 : 1);
  g.fillStyle = t.c ? SOIL.wet : SOIL.base; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = SOIL.dark;
  for (let yy = y + 2; yy < y1; yy += 4) g.fillRect(x0 + (L ? 0 : 1), yy, x1 - x0 - (L ? 0 : 1) - (R ? 0 : 1), 1);
  g.fillStyle = SOIL.light;
  for (let yy = y + 3; yy < y1; yy += 4) g.fillRect(x0 + 2, yy, x1 - x0 - 4, 1);
  g.fillStyle = '#4a2c18';
  if (!L) g.fillRect(x0, y0, 1, y1 - y0);
  if (!R) g.fillRect(x1 - 1, y0, 1, y1 - y0);
  if (!U) g.fillRect(x0, y0, x1 - x0, 1);
  if (!D) g.fillRect(x0, y1 - 1, x1 - x0, 1);
  if (t.c && nowMs - t.p < growMs(t.c, isle.minds) * 0.08) { g.fillStyle = '#f3dc9e'; for (const [a, b] of [[4, 5], [10, 5], [7, 10], [12, 11], [3, 11]]) g.fillRect(x + a, y + b, 1, 1); }
}
function frame(nowT) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowT - last) / 1000); last = nowT; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) { const first = W < 2; resize(); if (first) fitCam(); }
  if (!isle.state) return;
  const L = light(), nowMs = now(), st = isle.state;
  assignJobs();
  for (const m of minds) updateMind(m, dt, L.night);
  spawnFx(dt, L);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3b86d1'; g.fillRect(0, 0, W, H);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z) * DPR, (H / 2 - cam.y * cam.z) * DPR);
  g.drawImage(gr.ground.cv, 0, 0);
  const wave = Math.sin(Tm * 1.4);
  g.globalAlpha = 0.45 + 0.45 * wave; g.drawImage(gr.foamA.cv, 0, 0);
  g.globalAlpha = 0.45 - 0.45 * wave; g.drawImage(gr.foamB.cv, 0, 0);
  g.globalAlpha = 1;
  // only the tiles on screen
  const v0 = toWorld(0, 0), v1 = toWorld(W, H);
  const tx0 = Math.max(0, Math.floor(v0.x / T) - 2), tx1 = Math.min(TW - 1, Math.ceil(v1.x / T) + 2), ty0 = Math.max(0, Math.floor(v0.y / T) - 1), ty1 = Math.min(TH - 1, Math.ceil(v1.y / T) + 3);
  const items = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = ty * TW + tx;
    if (!w.land[k] || isFixed(k)) continue;
    const t = st.tiles[k], cov = coverAt(st, w, k), cx = tx * T + 8, by = ty * T + 15;
    if (t?.s === 'p') {
      drawPlot(k, t, nowMs);
      if (t.c) {
        const u = (nowMs - t.p) / growMs(t.c, isle.minds), stage = u >= 1 ? 3 : u >= 0.5 ? 2 : u >= 0.08 ? 1 : 0;
        if (stage) items.push({ y: by, spr: sprites.crop(t.c, stage), x: cx, ripe: stage === 3 });
      }
      continue;
    }
    if (t?.s === 'c' && nowMs - t.t > regrowMs(k, isle.seed) * 0.6) g.drawImage(sprouts.cv, tx * T + 2, ty * T + 9);
    const v = hash(tx, ty, 7) * 4 | 0, jx = Math.round((hash(ty, tx, 9) - 0.5) * 6), jy = Math.round(hash(tx, ty, 11) * 3);
    if (cov === COVER.WEEDS) items.push({ y: by - 1 - jy, spr: sprites.weeds(v), x: cx + jx });
    else if (cov === COVER.BUSH) items.push({ y: by, spr: sprites.bush(v % 3), x: cx });
    else if (cov === COVER.ROCK) items.push({ y: by - 1, spr: sprites.rock(v % 3), x: cx });
    else if (cov === COVER.TREE) items.push({ y: by, spr: sprites.tree(w.treeKinds[w.kind[k]], v % 3), x: cx, tree: true });
  }
  items.push({ y: (w.house.y + 3) * T - 1, spr: sprites.house(isle.seed, !!L.night), x: (w.house.x + 1.5) * T });
  // village buildings (walls join their neighbours; traps are only shown to you)
  const wallAt = new Set((st.b || []).filter(b => b.type === 'wall').map(b => b.k));
  for (const b of st.b || []) {
    if (moving && b.id === moving.id) continue;
    const d = BUILD[b.type], x0 = kx(b.k) * T, y0 = ky(b.k) * T, cx = x0 + d.w * T / 2, by = y0 + d.h * T - 1;
    if (b.type === 'wall') {
      const k = b.k, mask = (wallAt.has(k - TW) ? 1 : 0) | (kx(k) < TW - 1 && wallAt.has(k + 1) ? 2 : 0) | (wallAt.has(k + TW) ? 4 : 0) | (kx(k) > 0 && wallAt.has(k - 1) ? 8 : 0);
      items.push({ y: by, spr: bsprites.wall(mask), x: cx });
    } else if (b.type === 'trap') items.push({ y: y0 + 2, spr: bsprites.trap(), x: cx, flat: true });
    else if (b.type === 'mill') { items.push({ y: by, spr: bsprites.mill(), x: cx, sails: { x: cx, y: by - 26 } }); }
    else items.push({ y: by, spr: b.type === 'house' ? bsprites.house(L.night) : bsprites[b.type](), x: cx });
  }
  items.push({ y: (w.well.y + 2) * T - 1, spr: sprites.well(), x: (w.well.x + 1) * T });
  for (const m of minds) items.push({ y: m.y, mind: m });
  items.sort((a, b) => a.y - b.y);
  g.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(Tm * 6)})`; g.lineWidth = 1;
  for (const j of jobs) g.strokeRect(kx(j.k) * T + 1.5, ky(j.k) * T + 1.5, T - 3, T - 3);
  if (hover >= 0 && w.land[hover]) {   // tile cursor on the ground
    const ok = valid(tool, hover);
    g.fillStyle = tool === 'hand' ? 'rgba(255,255,255,.18)' : ok ? 'rgba(212,255,31,.35)' : 'rgba(255,90,74,.3)';
    g.fillRect(kx(hover) * T, ky(hover) * T, T, T);
  }
  for (const it of items) {
    if (it.mind) { drawMind(it.mind); continue; }
    const s = it.spr;
    if (it.tree) { g.fillStyle = 'rgba(43,35,64,.22)'; g.beginPath(); g.ellipse(it.x, it.y - 1, 9, 3, 0, 0, Math.PI * 2); g.fill(); }
    let dx = 0, dy = 0;
    if (it.tree) dx = Math.round(Math.sin(Tm * 1.3 + it.x * 0.1) * 0.6);
    if (it.ripe) { dy = -Math.round(Math.abs(Math.sin(Tm * 3 + it.x))); if (Math.random() < dt * 0.8) fx.push({ type: 'star', x: it.x + (Math.random() - 0.5) * 10, y: it.y - 6 - Math.random() * 8, life: 0.8, max: 0.8 }); }
    const hides = it.tree && minds.some(m => m.y < it.y - 2 && m.y > it.y - s.h + 6 && Math.abs(m.x - it.x) < s.w / 2);
    if (hides) g.globalAlpha = 0.55;
    g.drawImage(s.cv, it.x - (s.w >> 1) + dx, it.y - s.h + 1 + dy);
    if (it.sails) drawSails(g, it.sails.x, it.sails.y, Tm * 0.8);
    g.globalAlpha = 1;
  }
  if (tool === 'build' && hover >= 0) {
    const type = moving ? moving.type : buildType, d = BUILD[type], ok = fits(st, w, type, hover, moving);
    g.fillStyle = ok ? 'rgba(212,255,31,.35)' : 'rgba(255,90,74,.4)';
    g.fillRect(kx(hover) * T, ky(hover) * T, d.w * T, d.h * T);
    const s = type === 'wall' ? bsprites.wall(0) : type === 'house' ? bsprites.house(false) : bsprites[type]();
    g.globalAlpha = 0.65; g.drawImage(s.cv, kx(hover) * T + d.w * T / 2 - (s.w >> 1), ky(hover) * T + d.h * T - s.h); g.globalAlpha = 1;
  }
  if (hover >= 0 && w.land[hover] && tool !== 'hand' && tool !== 'build') {   // outline on top so it shows over tall weeds
    g.strokeStyle = valid(tool, hover) ? '#d4ff1f' : '#ff5a4a'; g.lineWidth = 1;
    g.strokeRect(kx(hover) * T + 0.5, ky(hover) * T + 0.5, T - 1, T - 1);
  }
  drawFx(dt);
  drawClouds(dt);
  if (L.tint) { g.globalAlpha = L.a; g.fillStyle = L.tint; g.fillRect(0, 0, WW, WH); g.globalAlpha = 1; }
  drawLights(L);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTexts();
  // label: the Mind you tapped, or the crop under the cursor
  let label = null;
  if (selected && (selectedT -= dt) > 0) label = { x: selected.x, y: selected.y - selected.c.h - 2, text: `#${selected.id} · ${rarityOf(selected.id)}`, a: Math.min(1, selectedT * 3) };
  else if (hover >= 0) {
    const t = st.tiles[hover];
    if (t?.s === 'p' && t.c) {
      const left = growMs(t.c, isle.minds) - (nowMs - t.p);
      label = { x: kx(hover) * T + 8, y: ky(hover) * T - 6, text: left > 0 ? `${CROPS[t.c].name} · ${fmtTime(left)}` : `${CROPS[t.c].name} · ready!`, a: 1 };
    }
  }
  if (label) {
    const p = toScreen(label.x, label.y);
    g.font = '800 14px Nunito, sans-serif';
    const tw = g.measureText(label.text).width + 16;
    g.globalAlpha = label.a;
    g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(p.x - tw / 2), Math.round(p.y - 24), Math.round(tw), 24);
    g.fillStyle = '#fff8e4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label.text, p.x, p.y - 12);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
  }
}

// ---------- doing things ----------
const ICON = { dust: '✨', wood: '🪵', stone: '🪨' };
let strokeErr = false;
function apply(type, k, extra = {}) {
  const before = coverAt(isle.state, w, k);
  const res = doAct({ type, tiles: [k], ...extra });
  const x = kx(k) * T + 8, y = ky(k) * T + 10;
  if (res.error) { if (!strokeErr) { strokeErr = true; sfx('denied'); cb.toast(res.error, true); } return res; }
  if (!res.done) return res;
  let row = 0;
  for (const [item, n] of Object.entries(res.gain || {})) {
    if (item === 'dust' && n < 0) popText(x, y - 4, `−${-n} ✨`, '#ffc53d');
    else if (n > 0 && ICON[item]) popText(x, y - 4 - 9 * row++, `+${n} ${ICON[item]}`, item === 'dust' ? '#ffe27a' : '#fff8e4');
    else if (n > 0 && item.startsWith('crop_')) popText(x, y - 4, `+${n} ${CROPS[item.slice(5)].name}`, '#d4ff1f');
  }
  if (type === 'clear') {
    if (before === COVER.TREE) { bits(x, y - 8, ['#8b5a34', '#a87444', '#58b046', '#7fcf55'], 16, 50); sfx('hit'); }
    else if (before === COVER.ROCK) { bits(x, y, ['#a3a2b5', '#7c7b8f', '#cfcfdc'], 12, 40); sfx('block'); }
    else { bits(x, y, ['#58b046', '#7fcf55', '#3f8d38'], 8, 30); sfx('pop'); }
  } else if (type === 'till') { bits(x, y, [SOIL.base, SOIL.light, SOIL.dark], 10, 30); sfx('land'); }
  else if (type === 'plant') { bits(x, y, ['#f3dc9e', '#7fcf55'], 6, 20); sfx('flip'); }
  else if (type === 'harvest') { bits(x, y - 4, ['#fff3b0', '#d4ff1f', '#ffffff'], 12, 45); sfx('coin'); }
  return res;
}
// tap with the hand: do the obvious thing for that tile
function smart(k, p) {
  const m = [...minds].sort((a, b) => b.y - a.y).find(m => Math.abs(p.x - m.x) < m.c.w / 2 && p.y < m.y + 2 && p.y > m.y - m.c.h);
  if (m) { m.hop = 0.5; m.state = 'idle'; m.timer = 2; selected = m; selectedT = 3; emote(m, 'heart'); sfx('pop'); return; }
  if (k < 0 || !w.land[k] || pathSet().has(k)) return;
  const t = isle.state.tiles[k], cov = coverAt(isle.state, w, k);
  const bd = buildingAt(isle.state, k);
  if (bd) return openBMenu(bd);
  const hx = kx(k) - w.house.x, hy = ky(k) - w.house.y;
  if (hx >= 0 && hx < 3 && hy >= 0 && hy < 3) return cb.toast('Your home. Upgrades and decorations are coming next.');
  if (isFixed(k)) return cb.toast('Energy Well: it will make energy shards (3 shards = +1 ranked energy). Coming soon.');
  if (t?.s === 'p') {
    if (ripe(t, now(), isle.minds)) return enqueue('harvest', k);
    if (t.c) { sfx('click'); return cb.toast(`${CROPS[t.c].name}: ready in ${fmtTime(growMs(t.c, isle.minds) - (now() - t.p))}.`); }
    return enqueue('plant', k, { crop: seed });
  }
  if (cov >= COVER.WEEDS && cov <= COVER.TREE) return enqueue('clear', k);
  sfx('click');
  cb.toast(`Open ground. Use ⛏ Plot to make a farm plot here (${PLOT_COST} ✨).`);
}
function useTool(k) {
  if (k < 0 || !w.land[k] || tool === 'hand') return;
  if (tool === 'build') return placeAt(k);
  if (tool === 'plant') enqueue('plant', k, { crop: seed });
  else enqueue(tool, k);
}

// ---------- input ----------
const ptrs = new Map();
let downAt = null, pinch = null, painting = false, lastPaint = -1;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeSeeds(); closeBuild(); closeBMenu();
  if (ptrs.size === 1) {
    downAt = { x: e.clientX, y: e.clientY, moved: 0, pan: tool === 'hand' || e.button !== 0 };
    if (!downAt.pan) { painting = true; strokeErr = false; const p = toWorld(e.clientX, e.clientY); lastPaint = tileAt(p.x, p.y); hover = lastPaint; useTool(lastPaint); }
  }
  if (ptrs.size === 2) { painting = false; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse') { const q = toWorld(e.clientX, e.clientY); hover = tileAt(q.x, q.y); } return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.x -= (mx - pinch.mx) / cam.z; cam.y -= (my - pinch.my) / cam.z; pinch.mx = mx; pinch.my = my;
    zoomAt(mx, my, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
  } else if (ptrs.size === 1 && downAt) {
    downAt.moved += Math.abs(dx) + Math.abs(dy);
    if (downAt.pan) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
    else if (painting) {
      const q = toWorld(e.clientX, e.clientY), k = tileAt(q.x, q.y);
      hover = k;
      if (k !== lastPaint) { lastPaint = k; useTool(k); }
    }
  }
});
const up = e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (e.type === 'pointerup' && downAt?.pan && downAt.moved < 8 && !ptrs.size && e.button === 0) {
    strokeErr = false;
    const p = toWorld(e.clientX, e.clientY);
    smart(tileAt(p.x, p.y), p);
  }
  if (!ptrs.size) { downAt = null; painting = false; if (e.pointerType !== 'mouse') hover = -1; flush(); }
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) hover = -1; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
function zoomAt(sx, sy, z) {
  const before = toWorld(sx, sy);
  cam.z = Math.min(zMax, Math.max(zMin, z));
  const after = toWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
}
addEventListener('keydown', e => {
  if (!running || e.target.closest?.('input,textarea')) return;
  const map = { 1: 'hand', 2: 'clear', 3: 'till', 4: 'plant', 5: 'harvest', 6: 'build' };
  if (e.key === 'Escape') { moving = null; closeBuild(); closeBMenu(); }
  if (map[e.key]) setTool(map[e.key]);
});

// ---------- HUD ----------
const TIPS = {
  hand: 'Tap weeds, rocks, trees or ripe crops and a Mind goes to work · drag to look around',
  clear: 'Drag across weeds, bushes, rocks and trees: your Minds clear them. Wild grass grows back if you stay away.',
  till: `Drag across open ground to make farm plots (${PLOT_COST} ✨ each)`,
  plant: 'Drag across empty plots to plant. Tap 🌱 again to pick another seed.',
  harvest: 'Drag across ripe crops to harvest them',
  build: 'Pick a building, then tap open cleared ground. Walls and traps: drag a line. Tap 🔨 again to pick another.',
};
export function setTool(t) {
  tool = t;
  document.querySelectorAll('#isl-tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('#isl-tip').textContent = TIPS[t];
  cv.style.cursor = t === 'hand' ? 'grab' : 'crosshair';
  if (t === 'plant' && (isle.state?.inv['seed_' + seed] || 0) < 1) openSeeds(true);
  if (t !== 'build') { moving = null; closeBuild(); }
  if (t === 'build' && moving) $('#isl-tip').textContent = `Moving your ${BUILD[moving.type].name}: tap where it should go (Esc to cancel).`;
}

// ---------- building ----------
function placeAt(k) {
  if (moving) {
    const res = doAct({ type: 'move', id: moving.id, k });
    if (res.error) { sfx('denied'); cb.toast(res.error, true); return; }
    sfx('land'); bits(kx(k) * T + 8, ky(k) * T + 12, ['#c99a63', '#a3a2b5', '#f3dfb6'], 14, 40);
    moving = null; setTool('hand'); return;
  }
  const d = BUILD[buildType];
  if (!canAfford(isle.state, d.cost)) { if (!strokeErr) { strokeErr = true; sfx('denied'); cb.toast(`A ${d.name} costs ${costText(d.cost)}.`, true); } return; }
  const res = doAct(d.w === 1 ? { type: 'build', item: buildType, tiles: [k] } : { type: 'build', item: buildType, k });
  if (res.error) { if (!strokeErr) { strokeErr = true; sfx('denied'); cb.toast(res.error, true); } return; }
  if (!res.done) return;
  const x = kx(k) * T + d.w * 8, y = ky(k) * T + d.h * 14;
  bits(x, y, ['#c99a63', '#a3a2b5', '#f3dfb6', '#ffffff'], d.w > 1 ? 24 : 8, 50); sfx(d.w > 1 ? 'levelup' : 'block');
  popText(x, y - d.h * 16, d.w > 1 ? `${d.name} built!` : costText(d.cost).replace(/(\d+)/g, '−$1'), '#fff8e4');
  // a Mind comes over to admire it
  const m = minds.find(m => !m.job); if (m) { m.tx = x + 12; m.ty = y + 4; m.state = 'go'; emote(m, 'heart'); }
  if (d.w > 1 && !(countOf(isle.state, buildType) < maxOf(buildType, isle.minds))) setTool('hand');
}
function openBuild(force) {
  const box = $('#isl-build');
  if (!force && box.classList.contains('on')) return closeBuild();
  const st = isle.state;
  box.innerHTML = Object.entries(BUILD).map(([type, d]) => {
    const n = countOf(st, type), max = maxOf(type, isle.minds), full = n >= max, poor = !canAfford(st, d.cost);
    return `<button data-build="${type}" class="${type === buildType ? 'on' : ''} ${full || poor ? 'none' : ''}"><img src="${buildIcon(type)}" alt=""><b>${d.name}</b><span>${d.desc}</span><span>${costText(d.cost)}</span><em>${n}/${max}</em></button>`;
  }).join('');
  box.classList.add('on');
}
function closeBuild() { $('#isl-build')?.classList.remove('on'); }
function openBMenu(b) {
  const d = BUILD[b.type], refund = costText(Object.fromEntries(Object.entries(d.cost).map(([i, n]) => [i, Math.floor(n / 2)])));
  const box = $('#isl-bmenu');
  box.innerHTML = `<img src="${buildIcon(b.type)}" alt=""><div><b>${d.name}</b><span>${d.desc}</span></div><button data-bm="move">↔ Move</button><button data-bm="demolish" title="Get back ${refund}">🗑 Remove</button><button data-bm="x">✕</button>`;
  box.dataset.id = b.id; box.classList.add('on'); sfx('click');
}
function closeBMenu() { $('#isl-bmenu')?.classList.remove('on'); }
const icons = {};
export const cropImg = c => (icons[c] ||= sprites.crop(c, 3).cv.toDataURL());
function openSeeds(force) {
  const box = $('#isl-seeds');
  if (!force && box.classList.contains('on')) return closeSeeds();
  box.innerHTML = Object.entries(CROPS).map(([c, d]) => {
    const n = isle.state?.inv['seed_' + c] || 0;
    return `<button data-seed="${c}" class="${c === seed ? 'on' : ''} ${n ? '' : 'none'}"><img src="${cropImg(c)}" alt=""><b>${d.name}</b><span>${fmtTime(growMs(c, isle.minds))} · sells ${d.sell} ✨</span><em>×${n}</em></button>`;
  }).join('') + '<button class="buy" data-shop="1">🛒 Buy seeds</button>';
  box.classList.add('on');
}
function closeSeeds() { $('#isl-seeds')?.classList.remove('on'); }
function paintHud() {
  if (!isle.state) return;
  const st = isle.state, inv = st.inv;
  $('#isl-dust').textContent = st.dust.toLocaleString();
  $('#isl-wood').textContent = inv.wood || 0;
  $('#isl-stone').textContent = inv.stone || 0;
  $('#isl-plots').textContent = `${plotCount(st)}/${maxPlots(st, isle.minds)}`;
  $('#isl-seed-ico').src = cropImg(seed);
  $('#isl-seed-n').textContent = inv['seed_' + seed] || 0;
  const ready = Object.values(st.tiles).filter(t => ripe(t, now(), isle.minds)).length;
  $('#isl-ready').textContent = ready || '';
  $('#isl-ready').classList.toggle('on', ready > 0);
  $('#isl-sync').textContent = isle.offline ? '⚠ Offline · not saved' : isle.error ? '⚠ Not saved yet, retrying…' : '☁ Saved';
  $('#isl-sync').classList.toggle('bad', isle.offline || !!isle.error);
  $('#isl-bonus').textContent = (minds.length ? `🧠 ${minds.length} Mind${minds.length > 1 ? 's' : ''} working${jobs.length ? ` · ${jobs.length} job${jobs.length > 1 ? 's' : ''} left` : ''}` : '')
    + (isle.minds ? ` · +${Math.min(isle.minds, 6)} plots · crops ${Math.round(speedBonus(isle.minds) * 100)}% faster` : ' · own Minds for more plots and faster crops');
  if ($('#isl-seeds').classList.contains('on')) openSeeds(true);
}
onChange(info => { if (info.failed && running) cb.toast('Island not saved yet: ' + info.failed, true); if (info.points) cb.toast(`+${info.points} leaderboard points from selling!`); paintHud(); });
setInterval(() => { if (running) paintHud(); }, 1000);
document.getElementById('isl-build').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  buildType = b.dataset.build; moving = null; closeBuild(); setTool('build'); sfx('select');
  const d = BUILD[buildType];
  if (countOf(isle.state, buildType) >= maxOf(buildType, isle.minds)) cb.toast(`You already have the most ${d.name}s you can build.`, true);
  else if (!canAfford(isle.state, d.cost)) cb.toast(`A ${d.name} costs ${costText(d.cost)}. Clear trees and rocks for 🪵 and 🪨, sell crops for ✨.`, true);
});
document.getElementById('isl-bmenu').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const box = $('#isl-bmenu'), b = (isle.state.b || []).find(x => x.id === +box.dataset.id);
  closeBMenu();
  if (!b || btn.dataset.bm === 'x') return;
  if (btn.dataset.bm === 'move') { moving = b; setTool('build'); return; }
  const res = doAct({ type: 'demolish', id: b.id });
  if (res.error) return cb.toast(res.error, true);
  sfx('hit'); bits(kx(b.k) * T + 8, ky(b.k) * T + 10, ['#c99a63', '#a3a2b5', '#8b5a34'], 18, 50);
});
document.getElementById('isl-tools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b?.dataset.tool) return;
  if (b.dataset.tool === 'build') { closeSeeds(); closeBMenu(); return openBuild(); }
  if (b.dataset.tool === 'plant' && tool === 'plant') return openSeeds();
  setTool(b.dataset.tool);
});
document.getElementById('isl-seeds').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.shop) { closeSeeds(); return cb.shop('seeds'); }
  seed = b.dataset.seed; closeSeeds(); setTool('plant'); paintHud();
});
document.getElementById('isl-shop').onclick = () => cb.shop();
document.getElementById('isl-bag').onclick = () => cb.bag();
document.getElementById('isl-home').onclick = () => { fitCam(); sfx('click'); };

// ---------- open / close ----------
export function openIsland({ minds: ids = [], toast, shop, bag } = {}) {
  cb = { toast: toast || cb.toast, shop: shop || cb.shop, bag: bag || cb.bag };
  w = gen(isle.seed); gr = groundFor(isle.seed);
  const r = rng(isle.seed ^ 0x5bd1e995);
  clouds.length = 0;
  for (let i = 0; i < 6; i++) clouds.push({ x: r() * WW, y: 40 + r() * (WH - 80), v: 3 + r() * 3, puffs: Array.from({ length: 4 }, () => [(r() - 0.5) * 50, (r() - 0.5) * 16, 14 + r() * 14]) });
  minds = ids.slice(0, 12).map(makeMind);
  fx = []; jobs = []; selected = null; hover = -1;
  resize(); fitCam(); setTool(tool); paintHud();
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeIsland() {
  if (running) { for (const j of [...jobs]) finishJob(j); for (const m of minds) { m.job = null; m.state = 'idle'; } flush(); }
  jobs = []; running = false; cancelAnimationFrame(raf);
}
export const refreshHud = paintHud;
addEventListener('resize', () => { if (running) resize(); });
// ?debug: lets a test script queue jobs and step the Minds without waiting for frames
if (new URLSearchParams(location.search).has('debug')) window.__island = { enqueue, jobs: () => jobs, minds: () => minds, w: () => w, focus: (x, y, z) => { cam.x = x; cam.y = y; if (z) cam.z = z; clampCam(); }, tick: n => { for (let i = 0; i < n; i++) { Tm += 0.05; assignJobs(); minds.forEach(m => updateMind(m, 0.05, 0)); } } };
