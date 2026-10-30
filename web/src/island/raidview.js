// The raid screen: draws someone's island (or a bot village) and runs the raid sim live while you play.
// Tap a Mind, then tap open land away from buildings to send it in; tap a spell, then tap where to cast it.
// Every input is recorded with its tick so the server can replay the exact same raid.
import { gen, COVER, T, TW, TH, WW, WH, hash } from './gen.js';
import { groundFor, sprites, SOIL, toolSprites } from './art.js';
import { bsprites, drawSails } from './buildings.js';
import { chibi } from './chibi.js';
import { coverAt } from './rules.js';
import { createRaid, input, step, score, dropOk, SPELLS, TICK, MAX_TICKS, DROP_UNTIL, lootOf } from './raid.js';
import { sfx } from '../audio.js';

const $ = s => document.querySelector(s);
const cv = $('#raid-cv'), g = cv.getContext('2d');
let S = null, R = null, running = false, raf = 0, last = 0, acc = 0, Tm = 0;
let W = 1, H = 1, DPR = 1, sel = null, hover = -1, shake = 0;
const cam = { x: WW / 2, y: WH / 2, z: 2 };
let parts = [], shots = [], texts = [], gr = null, w = null, noDrop = null;
const kx = k => k % TW, ky = k => (k / TW) | 0;

function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  fit();
}
// frame the village: every building plus a margin, between the top bar and the bottom bar
function fit() {
  if (!S) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of S.structs) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); }
  const m = 3 * T; x0 -= m; y0 -= m; x1 += m; y1 += m;
  const top = 56, bottom = 120, vh = H - top - bottom;
  cam.z = Math.max(1.4, Math.min(W / (x1 - x0), vh / (y1 - y0)));
  cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2 - (top - bottom) / 2 / cam.z;
}
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
const tileAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= TW || ty >= TH ? -1 : ty * TW + tx; };

function computeNoDrop() {
  noDrop = new Uint8Array(TW * TH);
  for (let k = 0; k < TW * TH; k++) if (w.land[k] && !dropOk(S, k)) noDrop[k] = 1;
}

// ---------- effects ----------
function burst(x, y, cols, n = 12, sp = 50) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, g: 90, life: 0.6 + Math.random() * 0.4, max: 1, c: cols[(Math.random() * cols.length) | 0], s: 1 + (Math.random() * 2 | 0) }); } }
function takeFx() {
  for (const f of S.fx) {
    if (f.e === 'shot') { shots.push({ ...f, t: 0 }); if (Math.random() < 0.5) sfx('hit'); }
    else if (f.e === 'boom') { computeNoDrop(); burst(f.x, f.y, ['#ff9a4a', '#ffd84a', '#8b5a34', '#a3a2b5', '#2b2340'], f.type === 'wall' ? 10 : 30, f.type === 'wall' ? 40 : 80); shake = f.type === 'wall' ? 2 : 6; sfx(f.type === 'wall' ? 'block' : 'crit'); if (f.type !== 'wall') texts.push({ x: f.x, y: f.y - 20, text: f.type === 'home' ? 'HOUSE DOWN!' : 'Destroyed!', c: '#ffd84a', life: 1.4 }); }
    else if (f.e === 'ko') { burst(f.x, f.y - 8, ['#ffffff', '#cfcfdc', '#fff3b0'], 14, 40); sfx('defeat'); texts.push({ x: f.x, y: f.y - 24, text: f.kind === 'raider' ? 'KO' : 'Guard KO!', c: f.kind === 'raider' ? '#ff6a5a' : '#d4ff1f', life: 1.2 }); }
    else if (f.e === 'drop') { burst(f.x, f.y, ['#f3dfb6', '#ffffff', '#c99a63'], 14, 40); sfx('land'); }
    else if (f.e === 'trap') { burst(f.x, f.y, ['#ffffff', '#cfcfdc', '#ff5a4a'], 12, 50); sfx('trap'); texts.push({ x: f.x, y: f.y - 14, text: 'TRAP!', c: '#ff6a5a', life: 1.2 }); }
    else if (f.e === 'spell') {
      const col = { rage: '#ff4d6d', heal: '#7fff7f', bolt: '#fff3b0' }[f.id];
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 40, g: 0, life: 0.6, max: 0.6, c: col, s: 2 }); }
      if (f.id === 'bolt') { shake = 8; shots.push({ bolt: true, x: f.x, y: f.y - 120, tx: f.x, ty: f.y, t: 0 }); }
      sfx(f.id === 'heal' ? 'heal' : 'cast');
    }
  }
  S.fx.length = 0;
}

// ---------- drawing ----------
function drawUnit(u, kind) {
  const c = u.c ||= chibi(kind === 'raider' ? R.minds[u.slot] ?? R.minds[0] : R.snap.guardIds?.[u.slot] ?? [12, 77, 301, 999][u.slot % 4]);
  const walking = u.act === 'walk', hitting = u.act === 'hit';
  const s = Math.sin(Tm * 12 + u.slot);
  let legL = 0, legR = 0, body = 0, ang = -0.4, lift = 0;
  if (walking) { legL = s > 0 ? -1 : 0; legR = s > 0 ? 0 : -1; body = Math.abs(s) > 0.7 ? -1 : 0; }
  if (hitting) { const t = (Tm * 2.6 + u.slot * 0.3) % 1; ang = t < 0.6 ? -1.9 * (t / 0.6) : -1.9 + 2.6 * Math.min(1, (t - 0.6) / 0.15); body = t > 0.6 && t < 0.85 ? 1 : 0; }
  if (u.dead) return;
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(u.x, u.y, c.w * 0.32, 1.8, 0, 0, Math.PI * 2); g.fill();
  if (u.rage) { g.fillStyle = `rgba(255,77,109,${0.25 + 0.15 * Math.sin(Tm * 10)})`; g.beginPath(); g.ellipse(u.x, u.y - c.h / 2, c.w * 0.6, c.h * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  g.save();
  g.translate(Math.round(u.x), Math.round(u.y) - lift);
  if (u.face < 0) g.scale(-1, 1);
  const ox = -Math.floor(c.w / 2), oy = -c.h + 1;
  g.drawImage(c.legL.cv, ox, oy + c.hip + legL); g.drawImage(c.legR.cv, ox + c.mid, oy + c.hip + legR);
  g.drawImage(c.body.cv, ox, oy + body);
  const tl = toolSprites[kind === 'raider' ? 'axe' : 'pick'];
  g.save(); g.translate(ox + c.hand.x, oy + c.hand.y + body); g.rotate(ang); g.drawImage(tl.cv, -2, -tl.h + 2); g.restore();
  g.restore();
  if (u.hit) { g.globalAlpha = 0.5; g.fillStyle = '#fff'; g.fillRect(u.x - c.w / 2, u.y - c.h, c.w, c.h); g.globalAlpha = 1; }
  hpBar(u.x, u.y - c.h - 4, u.hp / u.max, kind === 'raider' ? '#7fe04a' : '#ff5a4a');
}
function hpBar(x, y, f, col) {
  const w2 = 14;
  g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(x - w2 / 2) - 1, Math.round(y) - 1, w2 + 2, 4);
  g.fillStyle = col; g.fillRect(Math.round(x - w2 / 2), Math.round(y), Math.round(w2 * Math.max(0, f)), 2);
}
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) resize();
  // run the sim in fixed ticks
  acc += dt;
  while (acc >= TICK && !S.over) { acc -= TICK; step(S); takeFx(); }
  if (S.over && !R.ended) { R.ended = true; setTimeout(() => R.onEnd?.(R.inputs, score(S)), 900); }
  paintHud();
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 20);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#3b86d1'; g.fillRect(0, 0, W, H);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z + sx) * DPR, (H / 2 - cam.y * cam.z + sy) * DPR);
  g.drawImage(gr.ground.cv, 0, 0);
  const wave = Math.sin(Tm * 1.4);
  g.globalAlpha = 0.45 + 0.45 * wave; g.drawImage(gr.foamA.cv, 0, 0); g.globalAlpha = 0.45 - 0.45 * wave; g.drawImage(gr.foamB.cv, 0, 0); g.globalAlpha = 1;
  const st = { tiles: S.snap.tiles };
  const items = [];
  for (let k = 0; k < TW * TH; k++) {
    if (!w.land[k] || w.cover[k] === COVER.FIXED) continue;
    const tx = kx(k), ty = ky(k), cx = tx * T + 8, by = ty * T + 15, t = st.tiles[k];
    if (t?.s === 'p') { g.fillStyle = SOIL.base; g.fillRect(tx * T + 1, ty * T + 1, T - 2, T - 2); g.fillStyle = SOIL.dark; g.fillRect(tx * T + 1, ty * T + 12, T - 2, 3); continue; }
    if (t?.s === 'b') continue;
    const cov = coverAt(st, w, k), v = hash(tx, ty, 7) * 4 | 0;
    if (cov === COVER.WEEDS) items.push({ y: by - 1, spr: sprites.weeds(v), x: cx });
    else if (cov === COVER.BUSH) items.push({ y: by, spr: sprites.bush(v % 3), x: cx });
    else if (cov === COVER.ROCK) items.push({ y: by - 1, spr: sprites.rock(v % 3), x: cx });
    else if (cov === COVER.TREE) items.push({ y: by, spr: sprites.tree(w.treeKinds[w.kind[k]], v % 3), x: cx });
  }
  items.push({ y: (w.well.y + 2) * T - 1, spr: sprites.well(), x: (w.well.x + 1) * T });
  const walls = new Set(S.structs.filter(s => s.type === 'wall' && !s.dead).map(s => s.tiles[0]));
  S.structs.forEach((s, i) => {
    const by = s.y1 - 1, cx = s.cx;
    if (s.dead) { items.push({ y: by - 4, spr: bsprites.rubble(i % 5 + 1), x: cx, flat: true }); return; }
    let spr;
    if (s.type === 'home') spr = sprites.house(S.snap.seed, false);
    else if (s.type === 'wall') { const k = s.tiles[0]; spr = bsprites.wall((walls.has(k - TW) ? 1 : 0) | (walls.has(k + 1) && kx(k) < TW - 1 ? 2 : 0) | (walls.has(k + TW) ? 4 : 0) | (walls.has(k - 1) && kx(k) > 0 ? 8 : 0)); }
    else if (s.type === 'house') spr = bsprites.house(false);
    else spr = bsprites[s.type]();
    items.push({ y: by, spr, x: cx, s, sails: s.type === 'mill' ? { x: cx, y: by - 26 } : null });
  });
  for (const tr of S.traps) if (!tr.armed) items.push({ y: ky(tr.k) * T + 4, spr: bsprites.trap(), x: kx(tr.k) * T + 8, flat: true });
  for (const u of S.units) if (!u.dead) items.push({ y: u.y, u });
  items.sort((a, b) => a.y - b.y);
  // where you can't drop
  if (sel?.kind === 'mind') {
    g.fillStyle = `rgba(255,60,60,${0.28 + 0.08 * Math.sin(Tm * 5)})`;
    for (let k = 0; k < TW * TH; k++) if (noDrop[k]) g.fillRect(kx(k) * T, ky(k) * T, T, T);
    g.fillStyle = '#ff3b3b';
    for (let k = 0; k < TW * TH; k++) {
      if (!noDrop[k]) continue;
      const x = kx(k) * T, y = ky(k) * T, free = n => n >= 0 && n < TW * TH && w.land[n] && !noDrop[n];
      if (free(k - TW)) g.fillRect(x, y, T, 1); if (free(k + TW)) g.fillRect(x, y + T - 1, T, 1);
      if (kx(k) > 0 && free(k - 1)) g.fillRect(x, y, 1, T); if (kx(k) < TW - 1 && free(k + 1)) g.fillRect(x + T - 1, y, 1, T);
    }
  }
  for (const it of items) {
    if (it.u) { drawUnit(it.u, it.u.kind); continue; }
    const s = it.spr;
    let jx = 0;
    if (it.s?.hit) jx = (Math.random() - 0.5) * 2;
    g.drawImage(s.cv, Math.round(it.x - (s.w >> 1) + jx), it.y - s.h + 1);
    if (it.s?.hit) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillRect(it.s.x0, it.y - s.h + 1, it.s.x1 - it.s.x0, s.h); g.globalAlpha = 1; }
    if (it.sails) drawSails(g, it.sails.x, it.sails.y, Tm * 0.8);
    if (it.s && it.s.hp < it.s.max && it.s.type !== 'wall') hpBar(it.x, it.y - s.h - 3, it.s.hp / it.s.max, '#ffc53d');
  }
  // arrows and bolts
  shots = shots.filter(p => {
    p.t += dt / (p.bolt ? 0.15 : 0.25);
    const u = Math.min(1, p.t), x = p.x + (p.tx - p.x) * u, y = p.y + (p.ty - p.y) * u - (p.bolt ? 0 : Math.sin(u * Math.PI) * 10);
    if (p.bolt) { g.strokeStyle = '#fff3b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); for (let i = 1; i <= 6; i++) g.lineTo(p.x + (Math.random() - 0.5) * 10, p.y + (y - p.y) * i / 6); g.stroke(); }
    else { g.fillStyle = '#4a2e1c'; g.fillRect(Math.round(x) - 2, Math.round(y), 5, 1); g.fillStyle = '#fff'; g.fillRect(Math.round(x) + 2, Math.round(y), 1, 1); }
    return u < 1;
  });
  parts = parts.filter(q => { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); return q.life > 0; });
  g.globalAlpha = 1;
  // drop / cast cursor
  if (hover >= 0 && sel) {
    const ok = sel.kind === 'mind' ? !noDrop[hover] && w.land[hover] : true;
    g.strokeStyle = ok ? '#d4ff1f' : '#ff5a4a'; g.lineWidth = 1;
    if (sel.kind === 'spell') { const sp = SPELLS[sel.id]; g.beginPath(); g.arc(kx(hover) * T + 8, ky(hover) * T + 8, sp.radius, 0, Math.PI * 2); g.stroke(); }
    else g.strokeRect(kx(hover) * T + 0.5, ky(hover) * T + 0.5, T - 1, T - 1);
  }
  // floating words (screen space so they stay sharp)
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  texts = texts.filter(t => {
    t.life -= dt; const px = (t.x - cam.x) * cam.z + W / 2, py = (t.y - cam.y) * cam.z + H / 2 - (1.4 - t.life) * 30;
    g.globalAlpha = Math.min(1, t.life * 2); g.font = '900 18px Nunito, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = '#1d1b2f'; g.strokeText(t.text, px, py); g.fillStyle = t.c; g.fillText(t.text, px, py);
    g.globalAlpha = 1; g.textAlign = 'start';
    return t.life > 0;
  });
}

// ---------- HUD ----------
function paintHud() {
  const sc = score(S), left = Math.max(0, MAX_TICKS - S.tick) * TICK;
  $('#raid-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('#raid-time').classList.toggle('low', left < 15);
  $('#raid-pct').textContent = `${Math.round(sc.pct * 100)}%`;
  $('#raid-stars').innerHTML = [0, 1, 2].map(i => `<i class="${i < sc.stars ? 'on' : ''}">★</i>`).join('');
  $('#raid-loot').textContent = R.loot ? `💰 ${Math.floor(R.loot * sc.pct).toLocaleString()} / ${R.loot.toLocaleString()} ✨` : 'Practice raid';
  $$('#raid-bar [data-mind]').forEach(b => { const out = S.dropped.includes(+b.dataset.mind); b.classList.toggle('used', out || S.tick > DROP_UNTIL); b.classList.toggle('on', sel?.kind === 'mind' && sel.slot === +b.dataset.mind); });
  $$('#raid-bar [data-spell]').forEach(b => { b.classList.toggle('used', !!S.spellsUsed[b.dataset.spell] || !S.dropped.length); b.classList.toggle('on', sel?.kind === 'spell' && sel.id === b.dataset.spell); });
  const tip = sel?.kind === 'mind' ? 'Tap open land (not red) to send this Mind in' : sel?.kind === 'spell' ? `${SPELLS[sel.id].name}: tap where to cast it` : !S.dropped.length ? 'Tap a Mind below, then tap the edge of the village to attack' : S.over ? '' : 'Your Minds smash the nearest building. Use spells to help them!';
  $('#raid-tip').textContent = tip;
}
const $$ = s => document.querySelectorAll(s);
function paintBar() {
  $('#raid-bar').innerHTML = R.minds.map((id, i) => `<button data-mind="${i}"><img src="${chibi(id).full.cv.toDataURL()}" alt=""><span>#${id}</span></button>`).join('')
    + '<i class="sep"></i>' + Object.entries(SPELLS).map(([k, s]) => `<button data-spell="${k}" title="${s.desc}"><b>${s.icon}</b><span>${s.name}</span></button>`).join('');
}
$('#raid-bar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.classList.contains('used')) return;
  if (b.dataset.mind != null) sel = sel?.kind === 'mind' && sel.slot === +b.dataset.mind ? null : { kind: 'mind', slot: +b.dataset.mind };
  else sel = sel?.kind === 'spell' && sel.id === b.dataset.spell ? null : { kind: 'spell', id: b.dataset.spell };
  sfx('select');
});
cv.addEventListener('pointermove', e => { const p = toWorld(e.clientX, e.clientY); hover = tileAt(p.x, p.y); });
cv.addEventListener('pointerdown', e => {
  if (!S || S.over) return;
  const p = toWorld(e.clientX, e.clientY), k = tileAt(p.x, p.y);
  hover = k;
  if (!sel) {   // no selection: pick the next Mind that is still waiting
    const next = R.minds.findIndex((_, i) => !S.dropped.includes(i));
    if (next < 0 || S.tick > DROP_UNTIL) return;
    sel = { kind: 'mind', slot: next };
  }
  const a = sel.kind === 'mind' ? { t: S.tick, drop: sel.slot, k } : { t: S.tick, spell: sel.id, k };
  const err = input(S, a);
  if (err) { sfx('denied'); R.toast?.(err, true); return; }
  R.inputs.push(a);
  takeFx();
  sel = null;
  if (a.drop != null) { const next = R.minds.findIndex((_, i) => !S.dropped.includes(i)); if (next >= 0) sel = { kind: 'mind', slot: next }; }
});
$('#raid-end').onclick = () => { if (S && !S.over) { S.over = true; } };

// ---------- open / close ----------
// opts: { snap, minds: [ids for the 3 raiders], loot: max loot (0 = practice), name, onEnd(inputs, result), toast }
export function openRaid(opts) {
  R = { ...opts, inputs: [], ended: false };
  S = createRaid(opts.snap, 3);
  w = gen(opts.snap.seed); gr = groundFor(opts.snap.seed);
  computeNoDrop(); parts = []; shots = []; texts = []; sel = { kind: 'mind', slot: 0 }; acc = 0;
  $('#raid-name').textContent = opts.name || 'Raid';
  paintBar(); resize();
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeRaid() { running = false; cancelAnimationFrame(raf); S = null; }
