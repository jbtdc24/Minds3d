// The world map: its own screen, drawn by code — a sky full of floating islands (rocky undersides, waterfalls,
// mushrooms, crystals, rope bridges, drifting clouds). Tap an island to see it; your airship decides how far you
// can fly (locked islands sit in fog). Fly = your airship crosses the sky, then the adventure starts.
import { makeNoise, fbm, rng } from './gen.js';
import { SPOTS, SHIPS, HOME_SPOT, spotLevel, POTIONS_MAX } from './adventure.js';
import { sfx, music } from '../audio.js';

const $ = s => document.querySelector(s);
const cv = $('#map-cv'), g = cv.getContext('2d');
const MW = 1600, MH = 1000;
let running = false, raf = 0, last = 0, Tm = 0, W = 1, H = 1, DPR = 1, M = null;
const cam = { x: MW / 2, y: MH / 2, z: 1 };
let art = null;

// ---------- the static art: every island drawn once into a big canvas ----------
function islandShape(cx, cy, r, seed) {
  const n = makeNoise(seed), pts = [];
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, k = 0.78 + fbm(n, Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 3) * 0.45; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.62]); }
  return pts;
}
function drawIsland(c, cx, cy, r, seed, opts = {}) {
  const R = rng(seed), top = islandShape(cx, cy, r, seed), depth = r * (0.9 + R() * 0.5);
  // underside: a jagged rock cone hanging below the top
  c.save();
  c.beginPath();
  const left = top.reduce((a, p) => p[0] < a[0] ? p : a), right = top.reduce((a, p) => p[0] > a[0] ? p : a);
  c.moveTo(left[0], left[1]);
  const steps = 9;
  for (let i = 1; i < steps; i++) {
    const u = i / steps, x = left[0] + (right[0] - left[0]) * u, tip = Math.sin(u * Math.PI);
    c.lineTo(x + (R() - 0.5) * 10, cy + depth * tip * (0.55 + R() * 0.45) + 6);
  }
  c.lineTo(right[0], right[1]);
  for (let i = top.length - 1; i >= 0; i--) if (top[i][1] >= cy - 2) c.lineTo(top[i][0], top[i][1]);
  c.closePath();
  const ug = c.createLinearGradient(0, cy, 0, cy + depth);
  ug.addColorStop(0, '#9a6a44'); ug.addColorStop(0.5, '#7a5236'); ug.addColorStop(1, '#4a3022');
  c.fillStyle = ug; c.fill();
  c.strokeStyle = '#3a2418'; c.lineWidth = 2; c.stroke();
  // rock strata lines
  c.strokeStyle = 'rgba(58,36,24,.45)'; c.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const x = left[0] + (right[0] - left[0]) * R(); c.beginPath(); c.moveTo(x, cy + 6); c.lineTo(x + (R() - 0.5) * 16, cy + depth * (0.3 + R() * 0.5)); c.stroke(); }
  // glowing crystals in the rock
  if (opts.crystal) for (let i = 0; i < 4; i++) { const x = cx + (R() - 0.5) * r, y = cy + depth * (0.2 + R() * 0.3); c.fillStyle = '#7fe8ff'; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 4, y); c.lineTo(x, y + 7); c.lineTo(x - 4, y); c.fill(); }
  c.restore();
  // grassy top with a lip
  c.beginPath(); top.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
  c.fillStyle = opts.grass || '#6cc24f'; c.fill();
  c.strokeStyle = '#3a6a28'; c.lineWidth = 2.5; c.stroke();
  // inner lighter grass
  c.save(); c.clip();
  c.fillStyle = 'rgba(160,230,110,.45)'; c.beginPath(); c.ellipse(cx - r * 0.15, cy - r * 0.12, r * 0.6, r * 0.32, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(40,90,30,.2)'; c.beginPath(); c.ellipse(cx + r * 0.25, cy + r * 0.2, r * 0.6, r * 0.25, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  // trees, rocks, mushrooms
  const items = [];
  for (let i = 0; i < r / 6; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.7; items.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.55, t: R() }); }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.t < 0.55) {   // tree
      c.fillStyle = 'rgba(30,50,20,.3)'; c.beginPath(); c.ellipse(it.x, it.y + 3, 7, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6b4428'; c.fillRect(it.x - 1.5, it.y - 6, 3, 8);
      c.fillStyle = opts.tree || '#3f8d38'; c.beginPath(); c.arc(it.x, it.y - 10, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(180,240,120,.5)'; c.beginPath(); c.arc(it.x - 3, it.y - 13, 3.5, 0, Math.PI * 2); c.fill();
    } else if (it.t < 0.75) { c.fillStyle = '#8f8ea6'; c.beginPath(); c.ellipse(it.x, it.y, 5, 3.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#cfcfdc'; c.fillRect(it.x - 2, it.y - 2, 2, 1); }
    else if (opts.mush || it.t > 0.92) { c.fillStyle = '#f3e6c4'; c.fillRect(it.x - 1, it.y - 4, 2, 5); c.fillStyle = '#e0503a'; c.beginPath(); c.arc(it.x, it.y - 5, 4, Math.PI, 0); c.fill(); c.fillStyle = '#fff'; c.fillRect(it.x - 2, it.y - 7, 1, 1); }
    else { c.fillStyle = ['#ff6fae', '#ffd84a', '#c9a6ff'][(it.t * 30 | 0) % 3]; c.fillRect(it.x, it.y, 2, 2); }
  }
  if (opts.peak) { c.fillStyle = '#7c7b8f'; c.beginPath(); c.moveTo(cx - 22, cy + 4); c.lineTo(cx, cy - 26); c.lineTo(cx + 24, cy + 4); c.fill(); c.fillStyle = '#e8e8f0'; c.beginPath(); c.moveTo(cx - 6, cy - 16); c.lineTo(cx, cy - 26); c.lineTo(cx + 7, cy - 15); c.fill(); }
  if (opts.portal) { c.fillStyle = '#d9c9a6'; c.beginPath(); c.arc(cx, cy, 16, 0, Math.PI * 2); c.fill(); c.fillStyle = '#5ec8ff'; c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill(); }
  return { left, right, depth, top };
}
function buildArt() {
  const c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const x = c.getContext('2d'), R = rng(77);
  // sky
  const gr = x.createLinearGradient(0, 0, 0, MH); gr.addColorStop(0, '#5fb8f0'); gr.addColorStop(0.6, '#8fd0ff'); gr.addColorStop(1, '#c9b8ff');
  x.fillStyle = gr; x.fillRect(0, 0, MW, MH);
  // soft cloud banks and a faint grid (map paper feel)
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.08 + R() * 0.12})`; x.beginPath(); x.ellipse(R() * MW, R() * MH, 60 + R() * 160, 30 + R() * 60, 0, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1;
  for (let gx = 0; gx < MW; gx += 40) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, MH); x.stroke(); }
  for (let gy = 0; gy < MH; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(MW, gy); x.stroke(); }
  // tiny islets for scale
  for (let i = 0; i < 26; i++) drawIsland(x, R() * MW, R() * MH, 12 + R() * 18, 900 + i, {});
  const looks = [{}, { mush: true }, {}, { crystal: true, peak: true }, { peak: true }, {}, { grass: '#9ac24f', tree: '#c95c22' }, {}, { mush: true }, { grass: '#7aa2a8', crystal: true, peak: true }, { portal: true, crystal: true }, { grass: '#8a9a5a', peak: true }];
  const isles = SPOTS.map((s, i) => ({ ...drawIsland(x, s.x, s.y, s.r, 300 + i * 17, looks[i]), i }));
  const home = drawIsland(x, HOME_SPOT.x, HOME_SPOT.y, HOME_SPOT.r, 42, {});
  // your house on the home island
  x.fillStyle = '#f3dfb6'; x.fillRect(HOME_SPOT.x - 12, HOME_SPOT.y - 14, 24, 16); x.fillStyle = '#3f6fd0'; x.beginPath(); x.moveTo(HOME_SPOT.x - 16, HOME_SPOT.y - 13); x.lineTo(HOME_SPOT.x, HOME_SPOT.y - 28); x.lineTo(HOME_SPOT.x + 16, HOME_SPOT.y - 13); x.fill();
  x.fillStyle = '#6b4428'; x.fillRect(HOME_SPOT.x - 3, HOME_SPOT.y - 6, 6, 8);
  // waterfalls off some islands
  const falls = [];
  [1, 4, 7, 10].forEach(i => { const s = SPOTS[i]; falls.push({ x: s.x + s.r * 0.35, y: s.y + s.r * 0.25, h: s.r * 1.6 }); });
  falls.push({ x: HOME_SPOT.x - 40, y: HOME_SPOT.y + 30, h: 150 });
  // rope bridges inside the home cluster
  x.strokeStyle = '#6b4428'; x.lineWidth = 2;
  for (const i of [0, 1, 2]) { const s = SPOTS[i]; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(HOME_SPOT.x, HOME_SPOT.y); x.quadraticCurveTo((HOME_SPOT.x + s.x) / 2, (HOME_SPOT.y + s.y) / 2 + 30, s.x, s.y); x.stroke(); }
  x.setLineDash([]);
  art = { cv: c, isles, home, falls, clouds: Array.from({ length: 14 }, () => ({ x: R() * MW, y: R() * MH, s: 0.6 + R() * 1.2, v: 6 + R() * 10 })) };
}

// ---------- live drawing ----------
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cam.z = Math.max(W / MW, H / MH) * 1.02; clamp(); }
function clamp() { const hw = W / 2 / cam.z, hh = H / 2 / cam.z; cam.x = Math.max(hw, Math.min(MW - hw, cam.x)); cam.y = Math.max(hh, Math.min(MH - hh, cam.y)); }
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
function shipPath(t) {
  const a = M.from, b = M.to, mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 120;
  const u = 1 - t; return { x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y };
}
function drawShip(x, y, tier, face = 1) {
  g.save(); g.translate(x, y); g.scale(face, 1);
  if (tier === 0) {   // balloon raft
    g.fillStyle = '#ff6a5a'; g.beginPath(); g.ellipse(0, -34, 16, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd84a'; g.fillRect(-16, -36, 32, 4);
    g.strokeStyle = '#3b2a20'; g.lineWidth = 1; g.beginPath(); g.moveTo(-10, -18); g.lineTo(-8, -4); g.moveTo(10, -18); g.lineTo(8, -4); g.stroke();
    g.fillStyle = '#8b5a34'; g.fillRect(-12, -4, 24, 7);
  } else {
    const len = 24 + tier * 8, sail = ['', '#f3e6c4', '#ffffff', '#ffe27a'][tier];
    g.fillStyle = '#6b4428'; g.beginPath(); g.moveTo(-len, -6); g.lineTo(len, -6); g.lineTo(len - 8, 6); g.lineTo(-len + 6, 6); g.fill();
    g.fillStyle = '#a87444'; g.fillRect(-len, -8, len * 2, 3);
    g.fillStyle = '#3b2a20'; g.fillRect(-2, -38, 3, 32);
    g.fillStyle = sail; g.beginPath(); g.moveTo(1, -36); g.quadraticCurveTo(len * 0.8, -24, 1, -10); g.fill();
    if (tier >= 2) { g.beginPath(); g.moveTo(-1, -34); g.quadraticCurveTo(-len * 0.6, -24, -1, -12); g.fill(); }
    // propeller / wings for the big ones
    g.fillStyle = '#cfcfdc'; g.fillRect(-len - 4, -4 + Math.sin(Tm * 30) * 3, 4, 8);
    if (tier === 3) { g.fillStyle = '#7fe8ff'; g.fillRect(-len + 6, 0, len * 1.6, 2); }
  }
  g.restore();
}
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) resize();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z) * DPR, (H / 2 - cam.y * cam.z) * DPR);
  g.drawImage(art.cv, 0, 0);
  // waterfalls (moving streaks) and mist
  for (const f of art.falls) {
    g.fillStyle = 'rgba(190,235,255,.75)'; g.fillRect(f.x - 3, f.y, 6, f.h);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 5; i++) { const yy = (Tm * 80 + i * f.h / 5) % f.h; g.fillRect(f.x - 2, f.y + yy, 2, 10); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(f.x, f.y + f.h, 16 + Math.sin(Tm * 3) * 2, 6, 0, 0, Math.PI * 2); g.fill();
  }
  // locked islands in fog, open ones glow; the selected one gets a ring
  SPOTS.forEach((s, i) => {
    const locked = s.tier > M.ship;
    if (locked) { g.fillStyle = 'rgba(200,210,235,.55)'; g.beginPath(); g.ellipse(s.x, s.y + s.r * 0.25, s.r * 1.25, s.r * 0.95, 0, 0, Math.PI * 2); g.fill(); }
    if (i === M.sel) { g.strokeStyle = `rgba(212,255,31,${0.6 + 0.35 * Math.sin(Tm * 5)})`; g.lineWidth = 4; g.beginPath(); g.ellipse(s.x, s.y, s.r * 1.08, s.r * 0.7, 0, 0, Math.PI * 2); g.stroke(); }
    // label
    g.font = '900 18px Nunito, sans-serif'; g.textAlign = 'center';
    const label = `${locked ? '🔒' : s.icon} ${s.name}`;
    g.lineWidth = 5; g.strokeStyle = '#1d1b2f'; g.strokeText(label, s.x, s.y - s.r * 0.62 - 6); g.fillStyle = locked ? '#d8d4e8' : '#fff8e4'; g.fillText(label, s.x, s.y - s.r * 0.62 - 6);
    g.font = '800 13px Nunito, sans-serif';
    const sub = locked ? `Needs ${SHIPS[s.tier].name}` : s.tier ? `⛽ ${s.tier} · level ${spotLevel(i)}` : `free · level ${spotLevel(i)}`;
    g.lineWidth = 4; g.strokeText(sub, s.x, s.y - s.r * 0.62 + 12); g.fillStyle = locked ? '#ffb0a0' : '#d4ff1f'; g.fillText(sub, s.x, s.y - s.r * 0.62 + 12);
  });
  g.textAlign = 'start';
  // drifting clouds over everything
  for (const c of art.clouds) {
    c.x = (c.x + c.v * dt) % (MW + 300);
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (const [dx, dy, r] of [[0, 0, 40], [40, 8, 32], [-36, 10, 28], [10, -16, 30]]) { g.beginPath(); g.arc(c.x - 150 + dx * c.s, c.y + dy * c.s, r * c.s, 0, Math.PI * 2); g.fill(); }
  }
  // your airship: parked at home, or flying
  if (M.fly) {
    M.fly.t = Math.min(1, M.fly.t + dt / 2.2);
    const e = M.fly.t < 0.5 ? 2 * M.fly.t * M.fly.t : 1 - (-2 * M.fly.t + 2) ** 2 / 2, p = shipPath(e), q = shipPath(Math.min(1, e + 0.01));
    drawShip(p.x, p.y + Math.sin(Tm * 3) * 2, M.ship, q.x < p.x ? -1 : 1);
    if (Math.random() < 0.6) M.trail.push({ x: p.x - 10, y: p.y, life: 1 });
    if (M.fly.t >= 1 && !M.fly.done) { M.fly.done = true; sfx('land'); setTimeout(() => M.onFly?.(M.sel, M.potions), 400); }
  } else drawShip(HOME_SPOT.x + 60, HOME_SPOT.y - 40 + Math.sin(Tm * 2) * 3, M.ship);
  M.trail = M.trail.filter(t => { t.life -= dt; g.fillStyle = `rgba(255,255,255,${t.life * 0.6})`; g.beginPath(); g.arc(t.x, t.y, 4 + (1 - t.life) * 6, 0, Math.PI * 2); g.fill(); return t.life > 0; });
}

// ---------- panel + input ----------
function paint() {
  const s = SPOTS[M.sel], locked = s.tier > M.ship, fuelOk = M.fuel >= s.tier;
  $('#map-ship').textContent = `${SHIPS[M.ship].icon} ${SHIPS[M.ship].name}`;
  $('#map-fuel').textContent = `⛽ ${M.fuel}`;
  $('#map-info').innerHTML = `<b>${s.icon} ${s.name}</b> <span>Level ${spotLevel(M.sel)} · ${s.desc}</span><span>${locked ? `🔒 Too far: needs the <b>${SHIPS[s.tier].name}</b>` : s.tier ? `Flight costs ⛽ ${s.tier} Sky Fuel ${fuelOk ? '' : '(not enough)'}` : 'Free to fly'}</span>`;
  $('#map-pot').innerHTML = `🧪 <button class="btn small" data-pot="-1">−</button><b>${M.potions}</b><button class="btn small" data-pot="1">+</button>`;
  $('#map-fly').disabled = locked || !fuelOk || !!M.fly;
  const next = SHIPS[M.ship + 1];
  $('#map-up').style.display = next ? '' : 'none';
  if (next) $('#map-up').textContent = `🛠️ ${next.name}`;
}
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture?.(e.pointerId); });
cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; cam.x -= dx / cam.z; cam.y -= dy / cam.z; clamp(); });
cv.addEventListener('pointerup', e => {
  if (!drag || M?.fly) { drag = null; return; }
  const moved = drag.moved; drag = null;
  if (moved > 8) return;
  const p = toWorld(e.clientX, e.clientY);
  const hit = SPOTS.findIndex(s => Math.hypot((p.x - s.x) / s.r, (p.y - s.y) / (s.r * 0.8)) < 1.1);
  if (hit >= 0) { M.sel = hit; sfx(SPOTS[hit].tier > M.ship ? 'denied' : 'select'); paint(); }
});
cv.addEventListener('wheel', e => { e.preventDefault(); const z0 = Math.max(W / MW, H / MH); cam.z = Math.max(z0, Math.min(z0 * 2.5, cam.z * Math.pow(1.0015, -e.deltaY))); clamp(); }, { passive: false });
$('#map-pot').addEventListener('click', e => { const b = e.target.closest('[data-pot]'); if (!b) return; M.potions = Math.max(0, Math.min(POTIONS_MAX, M.have, M.potions + +b.dataset.pot)); sfx('select'); paint(); });
$('#map-fly').onclick = () => {
  if (!M || M.fly) return;
  const s = SPOTS[M.sel];
  M.from = { x: HOME_SPOT.x + 60, y: HOME_SPOT.y - 40 }; M.to = { x: s.x, y: s.y - 30 };
  M.fly = { t: 0 }; sfx('whoosh'); setTimeout(() => sfx('horn'), 200); paint();
};
$('#map-up').onclick = () => M?.onUpgrade?.();
$('#map-back').onclick = () => M?.onBack?.();

// opts: { ship, fuel, potions (owned), sel, onFly(spot, potions), onBack(), onUpgrade() }
export function openMap(opts) {
  if (!art) buildArt();
  M = { ...opts, sel: Math.min(opts.sel || 0, SPOTS.length - 1), have: opts.potions || 0, potions: Math.min(POTIONS_MAX, opts.potions || 0), fly: null, trail: [] };
  resize(); cam.x = HOME_SPOT.x + 300; cam.y = HOME_SPOT.y - 150; clamp();
  paint(); music('adventure');
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function updateMap(patch) { if (!M) return; Object.assign(M, patch); paint(); }
export function closeMap() { running = false; cancelAnimationFrame(raf); M = null; }
