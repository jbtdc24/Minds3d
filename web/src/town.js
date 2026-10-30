// Mind Town: a small top-down harbour town drawn in code. Zoom right out to see the whole map. Real players who are here
// walk around with name tags, and a few resident Minds stroll about so it never feels empty (their paths are pure math
// from the clock, so everyone sees the same ones). Tap a building to walk there and use it.
import { chibi } from './island/chibi.js';
import { makeNoise, fbm } from './island/pixel.js';
import { hash } from './island/gen.js';
import { T, WATER, SAND, GRASS, PAVE, PATH, PLANK, ROCK, MEADOW, paintTile, shop, tower, arena, pier, tree, hedge, lampPost, bench, bed, fountain } from './townart.js';
import { liveRoom } from './net.js';
import { babble, music, sfx } from './audio.js';

const $ = s => document.querySelector(s);
const TW = 100, TH = 65, WW = TW * T, WH = TH * T, RESIDENTS = 14, WALK = 72, LOADS = 3;
const cv = document.getElementById('town-cv'), g = cv.getContext('2d');
let K = null, running = false, raf = 0, last = 0, W = 0, H = 0, DPR = 1, zoom = 1.3, map = null;
let frames = [], room = null, roster = new Map(), rosterAt = 0, chatPing = 0;
let meP = null, people = new Map(), bubbles = [], chatAfter = 0, sayQ = '', talkT = 1, stayLeft = 0, loads = 0, free = false;
const ptrs = new Map(), CAM = { x: WW / 2, y: WH / 2 }, looks = new Map();
let tap = null, pinch = null;
const key = (x, y) => y * TW + x;

const SPOTS = [
  { name: 'Arena', go: 'ranked', x: 50, y: 19, tall: 5, make: arena },
  { name: 'Market', go: 'shop', x: 40, y: 31, tall: 5, make: () => shop(92, 80, '#b84a34', { awning: true, sign: '#ffd86a' }) },
  { name: 'Post Office', go: 'mail', x: 60, y: 31, tall: 5, make: () => shop(92, 80, '#3f72b0', { bricks: true, sign: '#e8eef8' }) },
  { name: 'Cup Hall', go: 'cup', x: 40, y: 45, tall: 5, make: () => shop(92, 84, '#c8922c', { awning: true, sign: '#fff0a8' }) },
  { name: 'Inn', x: 60, y: 45, tall: 5, make: () => shop(92, 80, '#3f8d62', { bricks: true }) },
  { name: 'Sky Tower', x: 40, y: 24, tall: 3, make: () => tower(84, 170, '#6a7c94') },
  { name: 'Mind Tower', x: 60, y: 24, tall: 3, make: () => tower(84, 196, '#74608e', { roofTone: '#6a5a80' }) },
  { name: 'Island Dock', go: 'island', x: 50, y: 60, tall: 1, make: pier, flat: true },
  ...[[23, 24, '#b84a34'], [23, 39, '#3f72b0'], [32, 53, '#3f8d62'], [77, 24, '#c8922c'], [77, 39, '#74608e'], [68, 53, '#b84a34'], [8, 29, '#3f8d62'], [92, 29, '#3f72b0']].map(([x, y, tone], i) => ({ x, y, tall: 4, make: () => shop(68, 66, tone, { bricks: i % 2 === 0 }) })),
];
// ---------- the map ----------
function buildMap() {
  const n = makeNoise(4211), t = new Uint8Array(TW * TH), block = new Uint8Array(TW * TH), props = [], doors = {};
  const blob = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (fbm(n, x / 6, y / 6, 3) - 0.5) * 0.42 < 1;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (blob(x, y, 50, 32, 33, 27) || blob(x, y, 8, 31, 7, 10) || blob(x, y, 92, 31, 7, 10)) t[key(x, y)] = GRASS;
  const land = (x, y) => x >= 0 && y >= 0 && x < TW && y < TH && t[key(x, y)] !== WATER;
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < TW && y < TH) t[key(x, y)] = v; };
  const lay = (x0, y0, x1, y1, wide, ground) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let w = 0; w < wide; w++) { const X = x0 === x1 ? x + w : x, Y = x0 === x1 ? y : y + w; set(X, Y, land(X, Y) && t[key(X, Y)] !== PLANK ? ground : PLANK); } };
  const sand = [];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (t[key(x, y)] === GRASS && [[1, 0], [-1, 0], [0, -1], [2, 0], [-2, 0], [0, -2]].some(([a, b]) => !land(x + a, y + b))) sand.push(key(x, y));
  for (const k of sand) t[k] = SAND;
  // terraced rock hills at the top corners, wild meadow patches
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const k = key(x, y);
    if (t[k] !== GRASS) continue;
    if (y < 13 + fbm(n, x / 5, 3, 2) * 3 && Math.abs(x - 50) > 11 && x > 20 && x < 80) { t[k] = ROCK; block[k] = 1; }
    else if (fbm(n, x / 4 + 9, y / 4 + 9, 2) > 0.6) t[k] = MEADOW;
  }
  // the square, the ring road, the avenues and bridges
  for (let y = 20; y <= 47; y++) for (let x = 34; x <= 66; x++) { const c = Math.max(0, 4 - Math.min(y - 20, 47 - y)); if (x - 34 >= c && 66 - x >= c) set(x, y, PAVE); }
  lay(5, 32, 34, 32, 3, PATH); lay(66, 32, 95, 32, 3, PATH); lay(49, 47, 49, 61, 3, PATH);
  lay(28, 18, 28, 50, 2, PATH); lay(71, 18, 71, 50, 2, PATH); lay(28, 50, 49, 50, 2, PATH); lay(51, 50, 72, 50, 2, PATH);
  lay(23, 24, 28, 24, 2, PATH); lay(23, 39, 28, 39, 2, PATH); lay(72, 24, 77, 24, 2, PATH); lay(72, 39, 77, 39, 2, PATH); lay(32, 51, 32, 53, 2, PATH); lay(68, 51, 68, 53, 2, PATH);
  lay(8, 29, 8, 32, 2, PATH); lay(92, 29, 92, 32, 2, PATH);
  // fountain, flower beds and benches in the square
  for (let y = 31; y <= 34; y++) for (let x = 48; x <= 52; x++) block[key(x, y)] = 1;
  props.push({ spr: fountain(), x: 50 * T + 8, y: 35 * T });
  for (const [x, y] of [[45, 26], [55, 26], [45, 38], [55, 38]]) {
    for (let j = 0; j < 1; j++) for (let i = -1; i <= 2; i++) block[key(x + i, y + j)] = 1;
    props.push({ spr: bed(64), x: x * T + 8, y: y * T + 14 }, { spr: bench(), x: x * T + 8, y: y * T + 40 });
  }
  for (const [x, y] of [[37, 35], [63, 35], [46, 22], [54, 22], [46, 44], [54, 44], [33, 33], [67, 30], [29, 36], [72, 36], [50, 52], [28, 26], [71, 44]]) { block[key(x, y)] = 1; props.push({ spr: lampPost(), x: x * T + 8, y: y * T + 15 }); }
  for (const b of SPOTS) {
    b.spr = b.make();
    const wt = Math.ceil(b.spr.w / T / 2);
    if (!b.flat) for (let y = b.y - b.tall; y < b.y; y++) for (let x = b.x - wt; x <= b.x + wt - 1; x++) if (x >= 0 && y >= 0) block[key(x, y)] = 1;
    b.px = b.x * T + (b.flat ? 8 : 0); b.py = b.y * T;
    if (b.name) doors[b.name] = { x: b.x, y: b.y + (b.flat ? -1 : 0) };
    props.push({ spr: b.spr, x: b.px, y: b.py, flat: !!b.flat, shade: !b.flat });
    for (const x of [b.x - 1, b.x]) if ([GRASS, MEADOW].includes(t[key(x, b.y)])) t[key(x, b.y)] = PATH;
  }
  // hedges line the houses, trees gather in small woods
  for (const b of SPOTS) if (!b.name) for (const dx of [-3, 3]) { const k = key(b.x + dx, b.y); if (t[k] === GRASS || t[k] === MEADOW) { block[k] = 1; props.push({ spr: hedge(32), x: (b.x + dx) * T + 8, y: b.y * T + 14 }); } }
  const open = k => t[k] !== WATER && !block[k];
  for (let y = 2; y < TH - 2; y++) for (let x = 2; x < TW - 2; x++) {
    const k = key(x, y);
    if (![GRASS, MEADOW].includes(t[k]) || block[k]) continue;
    const wood = fbm(n, x / 5 + 20, y / 5 + 20, 2);
    if (hash(x, y, 91) > (wood > 0.52 ? 0.55 : 0.05)) continue;
    if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, 2], [1, 1], [-1, 1]].some(([a, b]) => { const q = key(x + a, y + b); return [PATH, PAVE, PLANK].includes(t[q]) || block[q]; })) continue;
    block[k] = 1;
    props.push({ spr: tree(hash(x, y, 92) * 3 | 0), x: x * T + 8, y: y * T + 15 });
  }
  return { t, block, props, doors, open };
}
function paintGround(phase) {
  const c = document.createElement('canvas'); c.width = WW; c.height = WH;
  const q = c.getContext('2d'), { t } = map, at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? WATER : t[key(x, y)]);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) paintTile(q, at(x, y), x, y, at, phase);
  for (const p of map.props) if (p.shade) { q.fillStyle = 'rgba(30,30,50,.22)'; q.fillRect(p.x - p.spr.w / 2 + 6, p.y - 2, p.spr.w, 7); q.fillRect(p.x + p.spr.w / 2, p.y - 34, 6, 34); }
  return c;
}
// walk along tile centres (shortest way round water, trees and buildings)
function pathTo(sx, sy, tx, ty) {
  const s = key(sx / T | 0, sy / T | 0);
  let goal = key(Math.max(0, Math.min(TW - 1, tx / T | 0)), Math.max(0, Math.min(TH - 1, ty / T | 0)));
  if (!map.open(goal)) {
    let best = -1, bd = 1e9;
    for (let k = 0; k < TW * TH; k++) if (map.open(k)) { const d = Math.hypot(k % TW - goal % TW, (k / TW | 0) - (goal / TW | 0)); if (d < bd) { bd = d; best = k; } }
    goal = best;
  }
  const from = new Int32Array(TW * TH).fill(-1), q = [s];
  from[s] = s;
  for (let i = 0; i < q.length && from[goal] < 0; i++) {
    const k = q[i], x = k % TW;
    for (const n of [x > 0 ? k - 1 : -1, x < TW - 1 ? k + 1 : -1, k - TW, k + TW]) if (n >= 0 && n < TW * TH && from[n] < 0 && map.open(n)) { from[n] = k; q.push(n); }
  }
  if (from[goal] < 0) return [];
  const out = [];
  for (let k = goal; k !== s; k = from[k]) out.push({ x: (k % TW) * T + 8, y: (k / TW | 0) * T + 10 });
  return out.reverse();
}
// a loop around town the residents share; pure math from the clock so everyone sees them in the same place
let loop = [], loopLen = 0;
function buildLoop() {
  const stops = [[50, 38], [40, 40], [34, 32], [14, 33], [34, 32], [44, 25], [62, 26], [86, 34], [66, 34], [50, 44], [50, 56], [50, 44]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 8 }));
  loop = [stops[0]];
  for (let i = 1; i <= stops.length; i++) { const p = stops[i % stops.length], l = loop[loop.length - 1]; loop.push(...pathTo(l.x, l.y, p.x, p.y)); }
  loopLen = loop.length;
}
function resident(i, t) {
  const a = hash(i, 1, 6), b = hash(i, 2, 6), speed = 1.1 + a * 0.5;
  const u = (t * speed + a * loopLen) % loopLen, n = u | 0, f = u - n, A = loop[n], B = loop[(n + 1) % loopLen];
  return { id: 1 + (hash(i, 3, 6) * 3333 | 0), x: A.x + (B.x - A.x) * f + (a - 0.5) * 8, y: A.y + (B.y - A.y) * f + (b - 0.5) * 6, dir: B.x < A.x ? -1 : 1, walking: true };
}
const look = id => { if (looks.has(id)) return looks.get(id); if (loads >= LOADS) return null; loads++; try { const c = chibi(id).full; looks.set(id, c); return c; } catch { return null; } };
function drawMind(m, step) {
  const s = look(m.id);
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(m.x, m.y, 5, 1.6, 0, 0, 6.3); g.fill();
  if (!s) return;
  g.save(); g.translate(Math.round(m.x), Math.round(m.y) - (step && m.walking ? 1 : 0)); if (m.dir < 0) g.scale(-1, 1);
  g.drawImage(s.cv, -Math.floor(s.w / 2), 1 - s.h); g.restore();
}
function label(text, wx, wy, color = '#fff8e4', box = 'rgba(29,27,47,.85)', size = 13) {
  const x = (wx - CAM.x) * zoom + W / 2, y = (wy - CAM.y) * zoom + H / 2;
  if (x < -80 || x > W + 80 || y < -20 || y > H + 20) return;
  g.font = `800 ${size}px Nunito, sans-serif`; g.textAlign = 'center';
  const w = g.measureText(text).width + 12;
  g.fillStyle = box; g.fillRect(Math.round(x - w / 2), Math.round(y - size - 3), w, size + 8);
  g.fillStyle = color; g.fillText(text, x, y);
}
function clampCam() {
  const vw = W / zoom, vh = H / zoom;
  CAM.x = vw >= WW ? WW / 2 : Math.max(vw / 2, Math.min(WW - vw / 2, CAM.x));
  CAM.y = vh >= WH ? WH / 2 : Math.max(vh / 2, Math.min(WH - vh / 2, CAM.y));
}
const minZoom = () => Math.min(1, Math.min(W / WW, H / WH));
function setZoom(z) { zoom = Math.max(minZoom(), Math.min(3, z)); clampCam(); }
function frame(tMs) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (tMs - last) / 1000); last = tMs; loads = 0;
  const t = Date.now() / 1000 - 1.79e9;
  if (meP.path?.length) {
    const p = meP.path[0], d = Math.hypot(p.x - meP.x, p.y - meP.y), v = WALK * dt;
    if (p.x !== meP.x) meP.dir = p.x < meP.x ? -1 : 1;
    if (d <= v) { meP.x = p.x; meP.y = p.y; meP.path.shift(); if (!meP.path.length && meP.arrive) { const a = meP.arrive; meP.arrive = null; K.go(a); } }
    else { meP.x += (p.x - meP.x) / d * v; meP.y += (p.y - meP.y) / d * v; }
  }
  if (!free) { CAM.x += (meP.x - CAM.x) * 0.08; CAM.y += (meP.y - CAM.y) * 0.08; }
  clampCam();
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3a86c8'; g.fillRect(0, 0, cv.width, cv.height);
  const S = DPR * zoom, ox = W * DPR / 2 - CAM.x * S, oy = H * DPR / 2 - CAM.y * S;
  g.setTransform(S, 0, 0, S, ox, oy); g.imageSmoothingEnabled = false;
  g.drawImage(frames[Math.floor(tMs / 650) & 1], 0, 0);
  const x0 = CAM.x - W / zoom / 2 - 90, x1 = CAM.x + W / zoom / 2 + 90, y0 = CAM.y - H / zoom / 2 - 40, y1 = CAM.y + H / zoom / 2 + 170;
  const draw = [];
  for (const p of map.props) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) draw.push(p);
  for (let i = 0; i < RESIDENTS; i++) { const r = resident(i, t); if (r.x > x0 && r.x < x1 && r.y > y0 && r.y < y1) draw.push({ y: r.y, mind: r }); }
  for (const o of people.values()) {
    const to = o.path?.[0] || { x: o.tx, y: o.ty }, d = Math.hypot(to.x - o.x, to.y - o.y), v = WALK * dt;
    if (d > v) { o.dir = to.x < o.x ? -1 : 1; o.x += (to.x - o.x) / d * v; o.y += (to.y - o.y) / d * v; } else { o.x = to.x; o.y = to.y; o.path?.shift(); }
    draw.push({ y: o.y, mind: { id: o.mind || 49, x: o.x, y: o.y, dir: o.dir || 1, walking: d > v } });
  }
  draw.push({ y: meP.y, mind: { id: meP.mind, x: meP.x, y: meP.y, dir: meP.dir || 1, walking: !!meP.path?.length } });
  draw.sort((a, b) => (a.flat ? -1 : a.y) - (b.flat ? -1 : b.y));
  const step = Math.floor(tMs / 170) & 1;
  for (const d of draw) {
    if (d.mind) drawMind(d.mind, step);
    else g.drawImage(d.spr.cv, Math.round(d.x - d.spr.w / 2), Math.round(d.y - d.spr.h));
  }
  // words stay the same size at every zoom
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const b of SPOTS) if (b.name) label(b.name, b.px, b.py - b.spr.h + (b.flat ? 2 : -3), b.go ? '#d4ff1f' : '#fff8e4', undefined, 12);
  for (const o of people.values()) label(o.name, o.x, o.y - 26);
  label('You', meP.x, meP.y - 26, '#d4ff1f');
  talkT -= dt;
  if (talkT <= 0) {   // a resident near you says something
    talkT = 2.5 + Math.random() * 3;
    const i = Math.random() * RESIDENTS | 0, r = resident(i, t);
    if (Math.hypot(r.x - meP.x, r.y - meP.y) < 320) bubbles.push({ res: i, text: babble(r.id, 'chat', 0.85), life: 2.6 });
  }
  for (const b of bubbles) {
    b.life -= dt;
    const p = b.res != null ? resident(b.res, t) : b.me ? meP : b;
    label(b.text, p.x, p.y - 38, '#2b2340', 'rgba(255,248,228,.96)');
  }
  bubbles = bubbles.filter(b => b.life > 0);
}
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR; setZoom(zoom);
}
let beating = false, again = false, beatTimer = 0;
// runs on its own timer, not the drawing loop, so an AFK player in a background tab stays in town and keeps earning
async function beat() {
  if (beating) { again = true; return; }
  if (!K.online()) { $('#town-count').textContent = 'Offline: only you here'; return; }
  const say = sayQ; sayQ = '';
  beating = true;
  try {
    const r = await K.api('town', { x: meP.x | 0, y: meP.y | 0, mind: meP.mind, say, after: chatAfter });
    if (say) room?.ping();
    room?.move(myPos());
    roster = new Map(r.people.map(o => [o.id, o.name])); rosterAt = Date.now();
    if (!room?.live()) {   // no live link: fall back to what the server saw
      const ids = new Set(r.people.map(o => o.id));
      for (const k of people.keys()) if (!ids.has(k)) people.delete(k);
      for (const o of r.people) { const q = people.get(o.id); if (q) walkTo(q, o.x, o.y); else people.set(o.id, { ...o, tx: o.x, ty: o.y }); }
    } else syncRoom();
    counts = { here: Math.max(r.count, people.size + 1), online: r.online };
    paintCount();
    stayLeft = r.stay; paintStay();
    for (const c of r.chat) {
      chatAfter = Math.max(chatAfter, c.id);
      $('#town-feed').insertAdjacentHTML('beforeend', `<div class="${c.kind === 'news' ? 'news' : ''}">${c.kind === 'news' ? '' : `<b>${K.esc(c.name)}</b> `}${K.esc(c.text)}</div>`);
      const who = c.kind === 'chat' && [...people.values()].find(o => o.name === c.name);
      if (who) bubbles.push({ x: who.x, y: who.y, text: c.text.slice(0, 48), life: 5 });
    }
    const f = $('#town-feed'); while (f.children.length > 40) f.firstChild.remove(); f.scrollTop = 1e9;
    if (r.got) { sfx('coin'); K.toast(r.got.kind === 'time' ? `Town Time! +${r.got.dust} ✨ (${r.got.n}/6 today)` : `You met ${r.got.who}! +${r.got.dust} ✨`); }
  } catch { $('#town-count').textContent = 'Reconnecting…'; }
  beating = false;
  if (again) { again = false; beat(); }
}
let counts = { here: 1, online: 0 };
const paintCount = () => { $('#town-count').textContent = `🟢 ${counts.here} here${counts.online ? ` · ${counts.online} online` : ''}`; };
function walkTo(o, x, y) { if (o.goX === x && o.goY === y) return; o.goX = x; o.goY = y; o.path = pathTo(o.x, o.y, x, y); o.tx = x; o.ty = y; }
// who is in the room right now. Names come from the server list, so nobody can fake one.
function syncRoom() {
  const list = room?.list() || [];
  const ids = new Set(list.map(o => o.id));
  for (const k of people.keys()) if (!ids.has(k)) people.delete(k);
  let unknown = false;
  for (const o of list) {
    const name = roster.get(o.id);
    if (o.id === K.me()) continue;
    if (!name) { unknown = true; continue; }
    const q = people.get(o.id);
    if (q) { q.mind = o.mind; walkTo(q, o.gx ?? o.x, o.gy ?? o.y); } else people.set(o.id, { id: o.id, name, mind: o.mind, x: o.x, y: o.y, tx: o.x, ty: o.y });
  }
  counts.here = people.size + 1; paintCount();
  if (unknown && Date.now() - rosterAt > 1500) { rosterAt = Date.now(); beat(); }
}
const myPos = () => ({ id: K.me(), mind: meP.mind, x: meP.x | 0, y: meP.y | 0, gx: (meP.path?.at(-1)?.x ?? meP.x) | 0, gy: (meP.path?.at(-1)?.y ?? meP.y) | 0 });
async function joinRoom() {
  room = await liveRoom('town-live', K.me(), myPos(), { onChange: syncRoom, onPing: () => { clearTimeout(chatPing); chatPing = setTimeout(beat, 150 + Math.random() * 400); } });
}
function paintStay() { $('#town-stay').textContent = stayLeft ? `⏳ Town Time in ${Math.ceil(stayLeft / 60e3)} min` : ''; }
const toWorld = (cx, cy) => ({ x: CAM.x + (cx - W / 2) / zoom, y: CAM.y + (cy - H / 2) / zoom });
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tap = { x: e.clientX, y: e.clientY, moved: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; tap = null; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
  if (!tap) return;
  tap.moved += Math.abs(dx) + Math.abs(dy);
  if (tap.moved > 8) { free = true; CAM.x -= dx / zoom; CAM.y -= dy / zoom; clampCam(); }
});
const release = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (e.type !== 'pointerup' || !tap || tap.moved > 8) { if (!ptrs.size) tap = null; return; }
  tap = null;
  const w = toWorld(e.clientX, e.clientY), b = SPOTS.find(s => s.name && Math.abs(w.x - s.px) < s.spr.w / 2 && w.y < s.py + 2 && w.y > s.py - s.spr.h - 22 / zoom);
  free = false;
  const d = b ? map.doors[b.name] : null;
  meP.path = pathTo(meP.x, meP.y, d ? d.x * T + 8 : w.x, d ? d.y * T + 10 : w.y);
  meP.arrive = b?.go || null;
  room?.move(myPos());
  if (b?.go) sfx('select');
  if (b?.go && !meP.path.length) { meP.arrive = null; K.go(b.go); }
};
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 0.87)); }, { passive: false });
$('#town-in-z').onclick = () => setZoom(zoom * 1.3);
$('#town-out-z').onclick = () => setZoom(zoom / 1.3);
$('#town-all').onclick = () => { free = true; setZoom(minZoom()); };
$('#town-me').onclick = () => { free = false; setZoom(1.3); };
function send() {
  const b = $('#town-in'), text = b.value.trim();
  if (!text) return;
  b.value = ''; sayQ = text; beat();
  bubbles.push({ me: 1, text: text.slice(0, 48), life: 5 });
}
$('#town-send').onclick = send;
$('#town-in').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
addEventListener('resize', () => { if (running) resize(); });
export function initTown(ctx) { K = ctx; }
export function openTown() {
  if (!map) { map = buildMap(); frames = [paintGround(0), paintGround(1)]; buildLoop(); }
  meP ||= { x: 50 * T, y: 38 * T, mind: 49, dir: 1, path: [] };
  meP.mind = K.minds()[0] || 49; meP.path = []; meP.arrive = null; free = false; chatAfter = 0; $('#town-feed').innerHTML = ''; people.clear();
  CAM.x = meP.x; CAM.y = meP.y; zoom = 1.3;
  resize(); music('town'); joinRoom(); beat();
  clearInterval(beatTimer); beatTimer = setInterval(beat, 10000);
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeTown() { clearInterval(beatTimer); running = false; cancelAnimationFrame(raf); room?.leave(); room = null; }
