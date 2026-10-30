// Mind Town: every one of the 3,333 Minds lives here, walking the streets all day. Their paths are pure math from the
// id and the clock, so everyone sees the same crowd and it costs no server work. Real players walk among them with a
// name tag. Keep it open: you meet people, read the Town Board, and earn Town Time.
import { chibi, dropChibi } from './island/chibi.js';
import { bsprites } from './island/buildings.js';
import { sprites } from './island/art.js';
import { hash } from './island/gen.js';
import { babble, music, sfx } from './audio.js';

const $ = s => document.querySelector(s);
const W_ = 2400, H_ = 1600, ST = 240, ROAD = 64, COLS = 10, ROWS = 7, LEG = 15, REST = 0.22, ALL = 3333, LIMIT = 500, LOADS = 4;
const cv = document.getElementById('town-cv'), g = cv.getContext('2d');
let K = null, running = false, raf = 0, last = 0, W = 0, H = 0, DPR = 1, zoom = 2, bg = null, T0 = 0;
let meP = null, people = new Map(), bubbles = [], chatAfter = 0, beatT = 0, sayQ = '', talkT = 1, follow = null, stayLeft = 0, tap = null, drag = null;
const sized = new Map(), KINDS = ['leaf', 'pine', 'blossom', 'autumn'];
const tri = (n, N) => { const p = 2 * (N - 1), m = ((n % p) + p) % p; return m < N ? m : p - m; };
const node = (id, n) => {
  const a = hash(id, 1, 5), b = hash(id, 2, 5), half = Math.floor(n / 2);
  return { x: tri(half + (n & 1) + (a * 40 | 0), COLS) * ST + ST / 2 + (a - 0.5) * (ROAD - 14), y: tri(half + (b * 40 | 0), ROWS) * ST + ST / 2 + (b - 0.5) * (ROAD - 14) };
};
// where Mind `id` is at time t (seconds): it walks one block, rests a moment, walks on
function place(id, t) {
  const u = t / LEG + hash(id, 3, 5) * 500, n = Math.floor(u), f = u - n, A = node(id, n), B = node(id, n + 1), k = Math.min(1, f / (1 - REST));
  return { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, dir: B.x < A.x ? -1 : 1, walking: k < 1 };
}
function paintGround() {
  const c = document.createElement('canvas'); c.width = W_; c.height = H_;
  const q = c.getContext('2d');
  const mix = ['#5f9150', '#588a4a', '#659858', '#527f45'];
  for (let y = 0; y < H_; y += 16) for (let x = 0; x < W_; x += 16) { q.fillStyle = mix[hash(x, y, 3) * 4 | 0]; q.fillRect(x, y, 16, 16); }
  for (let i = 0; i < 26000; i++) { q.fillStyle = hash(i, 1, 9) < 0.5 ? '#6ea860' : '#487a3e'; q.fillRect(hash(i, 2, 9) * W_ | 0, hash(i, 3, 9) * H_ | 0, 2, 2); }
  const stones = ['#a39a86', '#958c78', '#b0a792', '#8a8270'];
  const road = (x, y, w, h) => {
    q.fillStyle = '#7a7160'; q.fillRect(x - 3, y - 3, w + 6, h + 6);
    for (let j = y; j < y + h; j += 8) for (let i = x + ((j / 8) & 1) * 4; i < x + w; i += 8) { q.fillStyle = stones[hash(i, j, 4) * 4 | 0]; q.fillRect(i, j, 7, 7); }
  };
  for (let i = 0; i < COLS; i++) road(i * ST + ST / 2 - ROAD / 2, ST / 2 - ROAD / 2, ROAD, (ROWS - 1) * ST + ROAD);
  for (let j = 0; j < ROWS; j++) road(ST / 2 - ROAD / 2, j * ST + ST / 2 - ROAD / 2, (COLS - 1) * ST + ROAD, ROAD);
  // each block gets a little scene
  const sp = [bsprites.house(false), bsprites.barn(), bsprites.mill(), bsprites.tower(), bsprites.camp(), bsprites.house(false)], deco = [bsprites.lamp(), bsprites.bench(), bsprites.flowers(), bsprites.banner()];
  const put = (s, x, y) => q.drawImage(s.cv, Math.round(x - s.w), Math.round(y - s.h * 2), s.w * 2, s.h * 2);
  for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
    const cx = i * ST + ST, cy = j * ST + ST, r = n => hash(i, j, n);
    if (Math.abs(i - 4) <= 0 && Math.abs(j - 2) <= 0) {   // the town square
      q.fillStyle = '#b0a792'; q.fillRect(cx - 86, cy - 86, 172, 172);
      put(bsprites.fountain(), cx, cy + 20); put(bsprites.crystal(), cx - 60, cy - 40); put(bsprites.crystal(), cx + 60, cy - 40); put(bsprites.lamp(), cx - 66, cy + 60); put(bsprites.lamp(), cx + 66, cy + 60);
      continue;
    }
    for (let n = 0; n < 7; n++) { const t = sprites.tree(KINDS[(i + j + n) % KINDS.length], n % 3); put(t, cx - 84 + r(n + 10) * 168, cy - 70 + r(n + 30) * 150); }
    put(sp[r(1) * sp.length | 0], cx - 34, cy + 16); put(sp[r(2) * sp.length | 0], cx + 40, cy + 62);
    put(deco[r(3) * deco.length | 0], cx - 66, cy + 66); put(deco[r(4) * deco.length | 0], cx + 70, cy - 20);
  }
  return c;
}
// Minds load a few per frame, and only the most recent are kept in memory
function look(id) {
  const hit = sized.get(id);
  if (hit) { sized.delete(id); sized.set(id, hit); return hit; }
  if (looks >= LOADS) return null;
  looks++;
  try { const c = chibi(id); sized.set(id, c.full); if (sized.size > LIMIT) { const old = sized.keys().next().value; sized.delete(old); dropChibi(old); } return c.full; } catch { return null; }
}
let looks = 0;
const CAM = { x: W_ / 2, y: H_ / 2 };
function drawMind(id, x, y, dir, step, mine) {
  const s = look(id);
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(x, y, 5, 1.6, 0, 0, 6.3); g.fill();
  if (!s) { g.fillStyle = `hsl(${hash(id, 4, 5) * 360} 35% 62%)`; g.fillRect(x - 4, y - 11, 8, 11); return; }
  g.save(); g.translate(Math.round(x), Math.round(y) - (step ? 1 : 0)); if (dir < 0) g.scale(-1, 1);
  g.drawImage(s.cv, -Math.floor(s.w / 2), 1 - s.h); g.restore();
  if (mine) { g.fillStyle = '#d4ff1f'; g.beginPath(); g.moveTo(x - 4, y - s.h - 8); g.lineTo(x + 4, y - s.h - 8); g.lineTo(x, y - s.h - 3); g.fill(); }
}
function tag(text, x, y, color = '#fff8e4', box = 'rgba(29,27,47,.82)') {
  g.font = '700 7px Nunito, sans-serif'; g.textAlign = 'center';
  const w = g.measureText(text).width + 6;
  g.fillStyle = box; g.fillRect(Math.round(x - w / 2), y - 8, w, 10);
  g.fillStyle = color; g.fillText(text, x, y);
}
function frame(tMs) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (tMs - last) / 1000); last = tMs; looks = 0;
  const t = Date.now() / 1000 - T0;
  if (meP.tx != null) { const d = Math.hypot(meP.tx - meP.x, meP.ty - meP.y), v = 60 * dt; if (d <= v) { meP.tx = null; } else { meP.dir = meP.tx < meP.x ? -1 : 1; meP.x += (meP.tx - meP.x) / d * v; meP.y += (meP.ty - meP.y) / d * v; } }
  if (follow != null) { const p = place(follow, t); CAM.x += (p.x - CAM.x) * 0.1; CAM.y += (p.y - CAM.y) * 0.1; }
  else if (!drag) { CAM.x += (meP.x - CAM.x) * 0.08; CAM.y += (meP.y - CAM.y) * 0.08; }
  const vw = W / zoom, vh = H / zoom;
  CAM.x = Math.max(vw / 2, Math.min(W_ - vw / 2, CAM.x)); CAM.y = Math.max(vh / 2, Math.min(H_ - vh / 2, CAM.y));
  const x0 = CAM.x - vw / 2, y0 = CAM.y - vh / 2;
  g.setTransform(DPR * zoom, 0, 0, DPR * zoom, -x0 * DPR * zoom, -y0 * DPR * zoom);
  g.imageSmoothingEnabled = false;
  g.drawImage(bg, Math.max(0, x0 | 0), Math.max(0, y0 | 0), Math.ceil(vw) + 2, Math.ceil(vh) + 2, Math.max(0, x0 | 0), Math.max(0, y0 | 0), Math.ceil(vw) + 2, Math.ceil(vh) + 2);
  const seen = [], step = Math.floor(tMs / 180) & 1;
  for (let id = 1; id <= ALL; id++) {
    const p = place(id, t);
    if (p.x < x0 - 20 || p.x > x0 + vw + 20 || p.y < y0 - 30 || p.y > y0 + vh + 30) continue;
    seen.push({ id, y: p.y, x: p.x, dir: p.dir, walking: p.walking });
  }
  for (const o of people.values()) { o.x += (o.tx - o.x) * 0.05; o.y += (o.ty - o.y) * 0.05; seen.push({ id: o.mind || 49, y: o.y, x: o.x, dir: o.tx < o.x ? -1 : 1, walking: Math.hypot(o.tx - o.x, o.ty - o.y) > 2, name: o.name }); }
  seen.push({ id: meP.mind, x: meP.x, y: meP.y, dir: meP.dir || 1, walking: meP.tx != null, name: 'You', mine: true });
  seen.sort((a, b) => a.y - b.y);
  const owned = K.minds();
  for (const m of seen) drawMind(m.id, m.x, m.y, m.dir, m.walking && step, m.mine || owned.includes(m.id));
  for (const m of seen) if (m.name) tag(m.name, m.x, m.y - 24, m.mine ? '#d4ff1f' : '#fff8e4');
  talkT -= dt;
  if (talkT <= 0 && seen.length) {   // somebody nearby says something
    talkT = 1.6 + Math.random() * 2.4;
    const m = seen[Math.random() * seen.length | 0];
    bubbles.push({ id: m.name ? null : m.id, x: m.x, y: m.y, text: babble(m.id, 'chat', 0.3), life: 2.4 });
  }
  for (const b of bubbles) {
    b.life -= dt;
    const p = b.id ? place(b.id, t) : b;
    tag(b.text, p.x, p.y - 22, '#2b2340', 'rgba(255,248,228,.95)');
  }
  bubbles = bubbles.filter(b => b.life > 0);
  beatT -= dt;
  if (beatT <= 0 && !document.hidden) { beatT = 10; beat(); }
}
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR; zoom = W < 720 ? 2 : 2.5;
}
async function beat() {
  if (!K.online()) return;
  const say = sayQ; sayQ = '';
  try {
    const r = await K.api('town', { x: meP.x | 0, y: meP.y | 0, mind: meP.mind, say, after: chatAfter });
    const ids = new Set(r.people.map(o => o.id));
    for (const k of people.keys()) if (!ids.has(k)) people.delete(k);
    for (const o of r.people) { const q = people.get(o.id); if (q) { q.tx = o.x; q.ty = o.y; q.mind = o.mind; } else people.set(o.id, { ...o, tx: o.x, ty: o.y }); }
    $('#town-count').textContent = `${ALL.toLocaleString()} Minds · ${r.count} ${r.count === 1 ? 'player' : 'players'} here`;
    stayLeft = r.stay; paintStay();
    for (const c of r.chat) {
      chatAfter = Math.max(chatAfter, c.id);
      $('#town-feed').insertAdjacentHTML('beforeend', `<div class="${c.kind === 'news' ? 'news' : ''}">${c.kind === 'news' ? '' : `<b>${K.esc(c.name)}</b> `}${K.esc(c.text)}</div>`);
      const who = c.kind === 'chat' && [...people.values()].find(o => o.name === c.name);
      if (who) bubbles.push({ x: who.x, y: who.y, text: c.text.slice(0, 40), life: 5 });
    }
    const f = $('#town-feed'); while (f.children.length > 40) f.firstChild.remove(); f.scrollTop = 1e9;
    if (r.got) { sfx('coin'); K.toast(r.got.kind === 'time' ? `Town Time! +${r.got.dust} ✨ (${r.got.n}/6 today)` : `You met ${r.got.who}! +${r.got.dust} ✨`); }
  } catch (e) { $('#town-count').textContent = /set up/.test(e.message) ? 'Town is being set up' : 'Reconnecting…'; }
}
function paintStay() { $('#town-stay').textContent = stayLeft ? `⏳ Town Time in ${Math.ceil(stayLeft / 60e3)} min` : ''; }
const toWorld = e => ({ x: CAM.x + (e.clientX - W / 2) / zoom, y: CAM.y + (e.clientY - H / 2) / zoom });
cv.addEventListener('pointerdown', e => { tap = { x: e.clientX, y: e.clientY, moved: 0 }; drag = null; });
cv.addEventListener('pointermove', e => {
  if (!tap) return;
  tap.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  if (tap.moved > 10) { drag = true; follow = null; CAM.x -= e.movementX / zoom; CAM.y -= e.movementY / zoom; }
});
cv.addEventListener('pointerup', e => {
  const moved = tap?.moved || 0; tap = null;
  if (moved > 10) return;
  const w = toWorld(e), t = Date.now() / 1000 - T0;
  let best = 0, bd = 11;
  for (let id = 1; id <= ALL; id++) { const p = place(id, t), d = Math.hypot(p.x - w.x, p.y - 6 - w.y); if (d < bd) { bd = d; best = id; } }
  drag = null; follow = null;
  if (best) {
    const mine = K.minds().includes(best);
    bubbles.push({ id: best, text: babble(best, 'happy', 0.8), life: 2.4 });
    return K.toast(`Mind #${best}${mine ? ' · yours!' : ''}`);
  }
  meP.tx = Math.max(10, Math.min(W_ - 10, w.x)); meP.ty = Math.max(10, Math.min(H_ - 10, w.y));
});
function send() {
  const b = $('#town-in'), text = b.value.trim();
  if (!text) return;
  b.value = ''; sayQ = text; beatT = 0;
  bubbles.push({ x: meP.x, y: meP.y, text: text.slice(0, 40), life: 5, me: 1 });
}
$('#town-send').onclick = send;
$('#town-in').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
$('#town-find').onclick = () => {
  const list = K.minds();
  if (!list.length) return K.toast('Connect a wallet to find your Minds in town.');
  follow = list[(list.indexOf(follow) + 1) % list.length];
  K.toast(`Following Mind #${follow}`); sfx('select');
};
$('#town-me').onclick = () => { follow = null; drag = null; };
addEventListener('resize', () => { if (running) resize(); });
export function initTown(ctx) { K = ctx; }
export function openTown() {
  bg ||= paintGround();
  T0 = 1.7e9; meP ||= { x: W_ / 2 + 40, y: ST * 3 - ST / 2 + 40, mind: K.minds()[0] || 49, dir: 1 };
  meP.mind = K.minds()[0] || 49; follow = null; drag = null; chatAfter = 0; $('#town-feed').innerHTML = ''; people.clear();
  CAM.x = meP.x; CAM.y = meP.y; beatT = 0.3;
  resize(); music('town');
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeTown() { running = false; cancelAnimationFrame(raf); }
