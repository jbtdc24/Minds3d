// The raid screen: draws the target island and runs the raid sim live while you play.
// Pick a troop (or your hero / a spell) in the bar, then tap open land outside the red zone. Hold to drop several.
// Every input is recorded with its tick so the server can replay the exact same raid.
import { gen, COVER, T, TW, TH, WW, WH, hash } from './gen.js';
import { drawSky, groundFor, sprites, SOIL } from './art.js';
import { bsprites, drawSails } from './buildings.js';
import { chibi } from './chibi.js';
import { coverAt, BUILD } from './rules.js';
import { troopSprite, weapon, troopIcon } from './troops.js';
import { drawCinema, dropShadow } from './cinema.js';
import { createRaid, input, step, score, dropOk, SPELLS, TROOPS, CRY, TICK, MAX_TICKS, DROP_UNTIL } from './raid.js';
import { sfx, music } from '../audio.js';

const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const cv = $('#raid-cv'), g = cv.getContext('2d');
let S = null, R = null, running = false, raf = 0, last = 0, acc = 0, Tm = 0;
let W = 1, H = 1, DPR = 1, sel = null, hover = -1, shake = 0, holding = null, holdT = 0;
const cam = { x: WW / 2, y: WH / 2, z: 2 };
let parts = [], shots = [], texts = [], coins = [], gr = null, w = null, noDrop = null, lastStars = 0, flashA = 0;
const kx = k => k % TW, ky = k => (k / TW) | 0;

function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  fit();
}
function fit() {
  if (!S) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of S.structs) { x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); }
  const m = 3 * T; x0 -= m; y0 -= m; x1 += m; y1 += m;
  const top = 56, bottom = 124, vh = H - top - bottom;
  cam.z = Math.max(1.4, Math.min(W / (x1 - x0), vh / (y1 - y0)));
  cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2 - (top - bottom) / 2 / cam.z;
}
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });
const tileAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= TW || ty >= TH ? -1 : ty * TW + tx; };
function computeNoDrop() { noDrop = new Uint8Array(TW * TH); for (let k = 0; k < TW * TH; k++) if (w.land[k] && !dropOk(S, k)) noDrop[k] = 1; }

// ---------- effects ----------
function burst(x, y, cols, n = 12, sp = 50, grav = 90) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, g: grav, life: 0.6 + Math.random() * 0.4, max: 1, c: cols[(Math.random() * cols.length) | 0], s: 1 + (Math.random() * 2 | 0) }); } }
function ring(x, y, col, r = 60) { for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; parts.push({ x, y, vx: Math.cos(a) * r, vy: Math.sin(a) * r * 0.6, g: 0, life: 0.6, max: 0.6, c: col, s: 2 }); } }
const say = (x, y, text, c, big) => texts.push({ x, y, text, c, life: 1.3, big });
const sndGate = {};
const snd = (name, gap = 0.06) => { const now = performance.now() / 1000; if ((sndGate[name] || 0) > now) return; sndGate[name] = now + gap; sfx(name); };
function takeFx() {
  for (const f of S.fx) {
    if (f.e === 'shot') { shots.push({ ...f, t: 0 }); snd('twang', 0.08); }
    else if (f.e === 'arrow') { shots.push({ ...f, t: 0, mine: true }); snd('twang', 0.1); }
    else if (f.e === 'smack') { burst(f.x, f.y, f.kind === 'giant' ? ['#c4b49c', '#ffffff', '#8a6a3a'] : ['#ffffff', '#ffe27a', '#c99a63'], f.kind === 'giant' ? 8 : 4, 40); snd('smash', 0.07); if (f.kind === 'giant') shake = Math.max(shake, 2); }
    else if (f.e === 'dmg') say(f.x, f.y, `-${f.n}`, '#ff8a7a');
    else if (f.e === 'bomb') { burst(f.x, f.y, ['#ff9a4a', '#ffd84a', '#2b2340', '#ffffff'], 30, 90); ring(f.x, f.y, '#ffb347', 70); shake = Math.max(shake, 6); flashA = 0.25; snd('boom', 0.05); }
    else if (f.e === 'boom') {
      computeNoDrop();
      const big = f.type !== 'wall';
      burst(f.x, f.y, ['#ff9a4a', '#ffd84a', '#8b5a34', '#a3a2b5', '#2b2340'], big ? 36 : 10, big ? 90 : 40);
      shake = Math.max(shake, big ? 7 : 2); snd(big ? 'crumble' : 'smash', 0.05);
      if (big) {
        say(f.x, f.y - 20, f.type === 'home' ? 'HOUSE DOWN!' : 'Destroyed!', '#ffd84a', f.type === 'home');
        if (R.loot) for (let i = 0; i < 8; i++) coins.push({ x: f.x + (Math.random() - 0.5) * 20, y: f.y - 10, vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 40, t: 0 });
        snd('coins', 0.1);
      }
    }
    else if (f.e === 'ko') { burst(f.x, f.y - 8, ['#ffffff', '#cfcfdc', '#fff3b0'], 14, 40); snd(f.kind === 'guard' ? 'ko' : 'miss', 0.1); if (f.kind === 'guard') say(f.x, f.y - 24, 'Guard down!', '#d4ff1f'); if (f.kind === 'hero' || f.kind === 'captain') say(f.x, f.y - 24, `${f.kind === 'hero' ? 'Hero' : 'Captain'} down`, '#ff6a5a'); }
    else if (f.e === 'drop') { burst(f.x, f.y, ['#f3dfb6', '#ffffff', '#c99a63'], f.kind === 'hero' ? 24 : 8, f.kind === 'hero' ? 60 : 35); snd(f.kind === 'hero' || f.kind === 'giant' ? 'land' : 'drop', 0.04); if (f.kind === 'hero') { ring(f.x, f.y, '#ffd84a', 50); snd('horn', 1); } if (f.kind === 'giant') snd('roar', 0.5); }
    else if (f.e === 'trap') { burst(f.x, f.y, ['#ffffff', '#cfcfdc', '#ff5a4a'], 14, 55); shake = Math.max(shake, 3); snd('trap', 0.1); say(f.x, f.y - 14, 'TRAP!', '#ff6a5a'); }
    else if (f.e === 'cry') { ring(f.x, f.y, '#ffd84a', CRY.radius * 1.4); ring(f.x, f.y, '#ff4d6d', CRY.radius); flashA = 0.2; snd('horn', 0.5); say(f.x, f.y - 30, 'BATTLE CRY!', '#ffd84a', true); }
    else if (f.e === 'spell') {
      const col = { rage: '#ff4d6d', heal: '#7fff7f', bolt: '#fff3b0' }[f.id];
      ring(f.x, f.y, col, SPELLS[f.id].radius * 1.3);
      if (f.id === 'bolt') { shake = 9; flashA = 0.5; shots.push({ bolt: true, x: f.x, y: f.y - 140, tx: f.x, ty: f.y, t: 0 }); snd('boom', 0.1); }
      else snd(f.id === 'heal' ? 'heal' : 'buff', 0.2);
    }
  }
  S.fx.length = 0;
}

// ---------- drawing ----------
function unitLook(u) {
  if (u.look) return u.look;
  if (u.kind === 'hero') u.look = { c: chibi(R.minds[0] ?? 49) };
  else if (u.kind === 'guard') u.look = { c: chibi(R.snap.guardIds?.[u.slot] ?? 1 + ((hash(u.slot, 3, R.snap.seed) * 3333) | 0)) };
  else u.look = { troop: u.kind };
  return u.look;
}
function drawChibi(u, c, toolKind) {
  const walking = u.act === 'walk', hitting = u.act === 'hit', s = Math.sin(Tm * 12 + u.id);
  let legL = 0, legR = 0, body = 0, ang = -0.4;
  if (walking) { legL = s > 0 ? -1 : 0; legR = s > 0 ? 0 : -1; body = Math.abs(s) > 0.7 ? -1 : 0; }
  if (hitting) { const t = (Tm * 2.6 + u.id * 0.3) % 1; ang = t < 0.6 ? -1.9 * (t / 0.6) : -1.9 + 2.6 * Math.min(1, (t - 0.6) / 0.15); body = t > 0.6 && t < 0.85 ? 1 : 0; }
  g.save(); g.translate(Math.round(u.x), Math.round(u.y));
  if (u.face < 0) g.scale(-1, 1);
  const ox = -Math.floor(c.w / 2), oy = -c.h + 1;
  g.drawImage(c.legL.cv, ox, oy + c.hip + legL); g.drawImage(c.legR.cv, ox + c.mid, oy + c.hip + legR);
  g.drawImage(c.body.cv, ox, oy + body);
  const wp = weapon[toolKind];
  g.save(); g.translate(ox + c.hand.x, oy + c.hand.y + body); g.rotate(ang); g.drawImage(wp.cv, -1, -wp.h + 2); g.restore();
  g.restore();
  return c.h;
}
function drawTroop(u) {
  const walking = u.act === 'walk', hitting = u.act === 'hit', fr = walking ? (Math.floor(Tm * 8 + u.id) % 2) : 0;
  const spr = troopSprite(u.kind, fr);
  g.save(); g.translate(Math.round(u.x), Math.round(u.y) - fr);
  if (u.face < 0) g.scale(-1, 1);
  g.drawImage(spr.cv, -Math.floor(spr.w / 2), -spr.h + 1);
  const wp = weapon[u.kind];
  if (wp) {
    let ang = u.kind === 'archer' ? 0 : -0.5;
    if (hitting && u.kind !== 'archer') { const t = (Tm * 2.8 + u.id * 0.37) % 1; ang = t < 0.6 ? -1.8 * (t / 0.6) : -1.8 + 2.4 * Math.min(1, (t - 0.6) / 0.15); }
    if (u.kind === 'bomber') g.drawImage(wp.cv, 2, -spr.h + 6);
    else { g.save(); g.translate(u.kind === 'archer' ? 6 : 4, -spr.h + 11); g.rotate(ang); g.drawImage(wp.cv, -1, -wp.h + 3); g.restore(); }
  }
  g.restore();
  return spr.h;
}
function drawUnit(u) {
  if (u.dead) return;
  const look = unitLook(u), big = u.kind === 'giant' || u.kind === 'hero';
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(u.x, u.y, big ? 9 : 5, big ? 2.6 : 1.8, 0, 0, Math.PI * 2); g.fill();
  if (u.kind === 'hero') { g.strokeStyle = `rgba(255,216,74,${0.6 + 0.3 * Math.sin(Tm * 6)})`; g.lineWidth = 1; g.beginPath(); g.ellipse(u.x, u.y, 10, 3, 0, 0, Math.PI * 2); g.stroke(); }
  if (u.rage) { g.fillStyle = `rgba(255,77,109,${0.22 + 0.12 * Math.sin(Tm * 12)})`; g.beginPath(); g.ellipse(u.x, u.y - 8, 9, 11, 0, 0, Math.PI * 2); g.fill(); if (Math.random() < 0.2) parts.push({ x: u.x + (Math.random() - 0.5) * 8, y: u.y - 4, vx: 0, vy: -25, g: 0, life: 0.4, max: 0.4, c: '#ff4d6d', s: 1 }); }
  const h = look.c ? drawChibi(u, look.c, u.kind === 'hero' ? 'captain' : 'brawler') : drawTroop(u);
  if (u.hit) { g.globalAlpha = 0.55; g.fillStyle = '#fff'; g.fillRect(u.x - 5, u.y - h, 10, h); g.globalAlpha = 1; }
  if (u.hp < u.max) hpBar(u.x, u.y - h - 4, u.hp / u.max, u.kind === 'guard' ? '#ff5a4a' : '#7fe04a', big ? 16 : 10);
}
function hpBar(x, y, f, col, w2 = 14) {
  g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(x - w2 / 2) - 1, Math.round(y) - 1, w2 + 2, 4);
  g.fillStyle = col; g.fillRect(Math.round(x - w2 / 2), Math.round(y), Math.round(w2 * Math.max(0, f)), 2);
}
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) resize();
  if (holding != null && sel?.kind === 'troop' && (holdT -= dt) <= 0) { holdT = 0.16; tryInput(holding, true); }   // hold = keep dropping
  acc += dt;
  while (acc >= TICK && !S.over) { acc -= TICK; step(S); takeFx(); }
  const sc = score(S);
  if (sc.stars > lastStars) { lastStars = sc.stars; snd('star', 0.2); flashA = 0.15; say(cam.x, cam.y - 40, '★'.repeat(sc.stars), '#ffc53d', true); }
  if (S.over && !R.ended) { R.ended = true; snd(sc.stars ? 'victory' : 'defeat', 1); music(null); setTimeout(() => R.onEnd?.(R.inputs, sc, R.army), 1100); }
  paintHud(sc);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 20);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false;
  drawSky(g, W, H, Tm);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z + sx) * DPR, (H / 2 - cam.y * cam.z + sy) * DPR);
  g.drawImage(gr.ground.cv, 0, 0);
  const wave = Math.sin(Tm * 1.4);
  g.globalAlpha = 0.45 + 0.45 * wave; g.drawImage(gr.foamA.cv, 0, 0); g.globalAlpha = 0.45 - 0.45 * wave; g.drawImage(gr.foamB.cv, 0, 0); g.globalAlpha = 1;
  const st = { tiles: S.snap.tiles }, items = [];
  for (let k = 0; k < TW * TH; k++) {
    if (!w.land[k] || w.cover[k] === COVER.FIXED) continue;
    const tx = kx(k), ty = ky(k), cx = tx * T + 8, by = ty * T + 15, t = st.tiles[k];
    if (t?.s === 'p') { g.fillStyle = SOIL.base; g.fillRect(tx * T + 1, ty * T + 1, T - 2, T - 2); g.fillStyle = SOIL.dark; g.fillRect(tx * T + 1, ty * T + 12, T - 2, 3); if (t.c) items.push({ y: by, spr: sprites.crop(t.c, 3), x: cx }); continue; }
    if (t?.s === 'b') continue;
    const cov = coverAt(st, w, k), v = hash(tx, ty, 7) * 4 | 0;
    if (cov === COVER.WEEDS) items.push({ y: by - 1, spr: sprites.weeds(v), x: cx });
    else if (cov === COVER.BUSH) items.push({ y: by, spr: sprites.bush(v % 3), x: cx });
    else if (cov === COVER.ROCK) items.push({ y: by - 1, spr: sprites.rock(v % 3), x: cx });
    else if (cov === COVER.TREE) items.push({ y: by, spr: sprites.tree(w.treeKinds[w.kind[k]], v % 3), x: cx, tree: true });
  }
  for (const b of S.decos) {   // the well, fences, lamps, statues: scenery
    const fp = BUILD[b.type], x0 = kx(b.k) * T, y0 = ky(b.k) * T;
    const spr = b.type === 'well' ? sprites.well() : b.type === 'fence' ? bsprites.fence(0) : bsprites[b.type]?.();
    if (spr) items.push({ y: y0 + fp.h * T - 1, spr, x: x0 + fp.w * T / 2 });
  }
  const walls = new Set(S.structs.filter(s => s.type === 'wall' && !s.dead).map(s => s.tiles[0]));
  S.structs.forEach((s, i) => {
    const by = s.y1 - 1, cx = s.cx;
    if (s.dead) { items.push({ y: by - 4, spr: bsprites.rubble(i % 5 + 1), x: cx, smoke: s.type !== 'wall' }); return; }
    let spr;
    if (s.type === 'home') spr = sprites.house(S.snap.seed, false);
    else if (s.type === 'wall') { const k = s.tiles[0]; spr = bsprites.wall((walls.has(k - TW) ? 1 : 0) | (walls.has(k + 1) && kx(k) < TW - 1 ? 2 : 0) | (walls.has(k + TW) ? 4 : 0) | (walls.has(k - 1) && kx(k) > 0 ? 8 : 0)); }
    else if (s.type === 'house') spr = bsprites.house(false);
    else spr = bsprites[s.type]();
    items.push({ y: by, spr, x: cx, s, sails: s.type === 'mill' ? { x: cx, y: by - 26 } : null, shadow: s.type === 'wall' ? 0 : s.x1 - s.x0 });
  });
  for (const tr of S.traps) if (!tr.armed) items.push({ y: ky(tr.k) * T + 4, spr: bsprites.trap(), x: kx(tr.k) * T + 8 });
  for (const u of S.units) if (!u.dead) items.push({ y: u.y, u });
  items.sort((a, b) => a.y - b.y);
  if (sel && sel.kind !== 'spell') {
    g.fillStyle = `rgba(255,50,50,${0.3 + 0.08 * Math.sin(Tm * 5)})`;
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
    if (it.u) { drawUnit(it.u); continue; }
    if (it.shadow) dropShadow(g, it.x, it.y - 1, it.shadow * 0.8);
    const s = it.spr, jx = it.s?.hit ? (Math.random() - 0.5) * 2 : 0;
    const sway = it.tree ? Math.round(Math.sin(Tm * 1.3 + it.x * 0.1) * 0.6) : 0;
    g.drawImage(s.cv, Math.round(it.x - (s.w >> 1) + jx + sway), it.y - s.h + 1);
    if (it.s?.hit) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillRect(it.s.x0, it.y - s.h + 1, it.s.x1 - it.s.x0, s.h); g.globalAlpha = 1; }
    if (it.sails) drawSails(g, it.sails.x, it.sails.y, Tm * 0.8);
    if (it.smoke && Math.random() < dt * 4) parts.push({ x: it.x + (Math.random() - 0.5) * 14, y: it.y - 8, vx: (Math.random() - 0.5) * 6, vy: -14, g: -4, life: 1.4, max: 1.4, c: Math.random() < 0.5 ? '#5b5a6e' : '#7c7b8f', s: 2 });
    if (it.s && it.s.hp < it.s.max && it.s.type !== 'wall') hpBar(it.x, it.y - s.h - 3, it.s.hp / it.s.max, '#ffc53d', 18);
  }
  shots = shots.filter(p => {
    p.t += dt / (p.bolt ? 0.15 : 0.22);
    const u = Math.min(1, p.t), x = p.x + (p.tx - p.x) * u, y = p.y + (p.ty - p.y) * u - (p.bolt ? 0 : Math.sin(u * Math.PI) * 10);
    if (p.bolt) { g.strokeStyle = '#fff3b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); for (let i = 1; i <= 7; i++) g.lineTo(p.tx + (i < 7 ? (Math.random() - 0.5) * 12 : 0), p.y + (p.ty - p.y) * i / 7); g.stroke(); }
    else { const a = Math.atan2(p.ty - p.y, p.tx - p.x); g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = p.mine ? '#e8e0d0' : '#4a2e1c'; g.fillRect(-3, 0, 6, 1); g.fillStyle = '#fff'; g.fillRect(3, 0, 1, 1); g.restore(); }
    if (u >= 1 && !p.bolt) { burst(p.tx, p.ty, ['#ffffff', '#cfcfdc'], 3, 20); snd('arrowHit', 0.08); }
    return u < 1;
  });
  parts = parts.filter(q => { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); return q.life > 0; });
  g.globalAlpha = 1;
  if (hover >= 0 && sel) {
    const ok = sel.kind === 'spell' || (!noDrop[hover] && w.land[hover]);
    g.strokeStyle = ok ? '#d4ff1f' : '#ff5a4a'; g.lineWidth = 1;
    if (sel.kind === 'spell') { const sp = SPELLS[sel.id]; g.beginPath(); g.arc(kx(hover) * T + 8, ky(hover) * T + 8, sp.radius, 0, Math.PI * 2); g.stroke(); }
    else g.strokeRect(kx(hover) * T + 0.5, ky(hover) * T + 0.5, T - 1, T - 1);
  }
  // screen space: loot coins flying to the counter, words, flash
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const lootEl = $('#raid-loot').getBoundingClientRect(), lx = lootEl.left + 14, ly = lootEl.top + lootEl.height / 2;
  coins = coins.filter(c => {
    c.t += dt;
    let p;
    if (c.t < 0.45) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 220 * dt; p = toScreen(c.x, c.y); }
    else { if (c.sx == null) { const q = toScreen(c.x, c.y); c.sx = q.x; c.sy = q.y; } const u = Math.min(1, (c.t - 0.45) / 0.5); p = { x: c.sx + (lx - c.sx) * u * u, y: c.sy + (ly - c.sy) * u * u }; if (u >= 1) { snd('coin', 0.05); return false; } }
    g.fillStyle = '#1d1b2f'; g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3b0'; g.fillRect(p.x - 2, p.y - 2, 2, 2);
    return true;
  });
  drawCinema(g, W, H, Tm, dt, { motes: 'dust' });
  texts = texts.filter(t => {
    t.life -= dt; const p = toScreen(t.x, t.y), py = p.y - (1.3 - t.life) * 30;
    g.globalAlpha = Math.min(1, t.life * 2); g.font = `900 ${t.big ? 26 : 16}px Nunito, sans-serif`; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = '#1d1b2f'; g.strokeText(t.text, p.x, py); g.fillStyle = t.c; g.fillText(t.text, p.x, py);
    g.globalAlpha = 1; g.textAlign = 'start';
    return t.life > 0;
  });
  if (flashA > 0.01) { g.globalAlpha = flashA; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; flashA *= Math.pow(0.02, dt); }
}

// ---------- HUD ----------
function paintHud(sc) {
  const left = Math.max(0, MAX_TICKS - S.tick) * TICK;
  $('#raid-time').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('#raid-time').classList.toggle('low', left < 15);
  $('#raid-pct').textContent = `${Math.round(sc.pct * 100)}%`;
  $('#raid-stars').innerHTML = [0, 1, 2].map(i => `<i class="${i < sc.stars ? 'on' : ''}">★</i>`).join('');
  $('#raid-loot').textContent = `💰 ${Math.floor(R.loot * sc.pct).toLocaleString()} ✨`;
  const late = S.tick > DROP_UNTIL;
  $$('#raid-bar [data-troop]').forEach(b => { const k = b.dataset.troop, n = S.left[k] || 0; b.querySelector('em').textContent = `×${n}`; b.classList.toggle('used', !n || late); b.classList.toggle('on', sel?.kind === 'troop' && sel.id === k); });
  const hb = $('#raid-bar [data-hero]');
  if (hb) { hb.classList.toggle('used', S.heroOut || late); hb.classList.toggle('on', sel?.kind === 'hero'); }
  const cb = $('#raid-bar [data-cry]');
  if (cb) { const h = S.units.find(u => u.kind === 'hero' && !u.dead); cb.classList.toggle('used', !h || S.cried); cb.classList.toggle('ready', !!h && !S.cried); }
  $$('#raid-bar [data-spell]').forEach(b => { b.classList.toggle('used', !!S.spellsUsed[b.dataset.spell] || !S.anyDrop); b.classList.toggle('on', sel?.kind === 'spell' && sel.id === b.dataset.spell); });
  const tip = sel?.kind === 'troop' ? `${TROOPS[sel.id].name}: ${TROOPS[sel.id].desc} Tap or hold outside the red.` : sel?.kind === 'hero' ? `${R.army.hero === 'hero' ? 'Your Mind' : 'Your Captain'} leads the attack. Tap outside the red.` : sel?.kind === 'spell' ? `${SPELLS[sel.id].name}: ${SPELLS[sel.id].desc}. Tap where.` : S.over ? '' : !S.anyDrop ? 'Pick a troop below, then tap outside the red zone' : 'Send more troops, cast spells, use your hero!';
  $('#raid-tip').textContent = tip;
}
function paintBar() {
  const heroImg = R.army.hero === 'hero' ? chibi(R.minds[0] ?? 49).full.cv.toDataURL() : troopIcon('captain');
  $('#raid-bar').innerHTML = Object.entries(TROOPS).filter(([k]) => (S.left[k] || 0) > 0).map(([k, d]) => `<button data-troop="${k}" title="${d.desc}"><img src="${troopIcon(k)}" alt=""><span>${d.name}</span><em></em></button>`).join('')
    + `<button data-hero="1" class="hero"><img src="${heroImg}" alt=""><span>${R.army.hero === 'hero' ? `#${R.minds[0]}` : 'Captain'}</span></button>`
    + (R.army.hero === 'hero' ? `<button data-cry="1" title="Battle Cry: troops near your hero hit ${Math.round((CRY.mult - 1) * 100)}% harder and heal"><b>📯</b><span>Cry</span></button>` : '')
    + '<i class="sep"></i>' + Object.entries(SPELLS).map(([k, s]) => `<button data-spell="${k}" title="${s.desc}"><b>${s.icon}</b><span>${s.name}</span></button>`).join('');
}
$('#raid-bar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.classList.contains('used')) return;
  if (b.dataset.cry) { const a = { t: S.tick, cry: 1 }; if (!input(S, a)) { R.inputs.push(a); takeFx(); } return; }
  const next = b.dataset.troop ? { kind: 'troop', id: b.dataset.troop } : b.dataset.hero ? { kind: 'hero' } : { kind: 'spell', id: b.dataset.spell };
  sel = sel && sel.kind === next.kind && sel.id === next.id ? null : next;
  sfx('select');
});
function tryInput(k, quiet) {
  if (!sel || S.over) return false;
  const a = sel.kind === 'spell' ? { t: S.tick, spell: sel.id, k } : { t: S.tick, drop: sel.kind === 'hero' ? 'hero' : sel.id, k };
  const err = input(S, a);
  if (err) { if (!quiet) { sfx('denied'); R.toast?.(err, true); } holding = null; return false; }
  R.inputs.push(a);
  takeFx();
  if (sel.kind === 'spell' || sel.kind === 'hero') sel = null;
  else if (!(S.left[sel.id] > 0)) { const more = Object.keys(TROOPS).find(t => S.left[t] > 0); sel = more ? { kind: 'troop', id: more } : (S.heroOut ? null : { kind: 'hero' }); holding = null; }
  return true;
}
cv.addEventListener('pointermove', e => { const p = toWorld(e.clientX, e.clientY); hover = tileAt(p.x, p.y); if (holding != null) holding = hover; });
cv.addEventListener('pointerdown', e => {
  if (!S || S.over) return;
  cv.setPointerCapture?.(e.pointerId);
  const p = toWorld(e.clientX, e.clientY), k = tileAt(p.x, p.y);
  hover = k;
  if (!sel) { const more = Object.keys(TROOPS).find(t => S.left[t] > 0); if (S.tick > DROP_UNTIL) return; sel = more ? { kind: 'troop', id: more } : S.heroOut ? null : { kind: 'hero' }; if (!sel) return; }
  const troop = sel.kind === 'troop';
  if (tryInput(k) && troop) { holding = k; holdT = 0.35; }
});
const release = () => { holding = null; };
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
$('#raid-end').onclick = () => { if (S && !S.over) S.over = true; };

// ---------- open / close ----------
// opts: { snap, minds, army: { troops, hero }, loot, name, onEnd(inputs, result, army), toast }
export function openRaid(opts) {
  R = { ...opts, inputs: [], ended: false };
  S = createRaid(opts.snap, opts.army);
  w = gen(opts.snap.seed); gr = groundFor(opts.snap.seed);
  computeNoDrop(); parts = []; shots = []; texts = []; coins = []; acc = 0; lastStars = 0; shake = 0; flashA = 0; holding = null;
  const first = Object.keys(TROOPS).find(t => S.left[t] > 0);
  sel = first ? { kind: 'troop', id: first } : { kind: 'hero' };
  $('#raid-name').textContent = opts.name || 'Raid';
  paintBar(); resize();
  music('raid'); setTimeout(() => sfx('horn'), 300);
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeRaid() { running = false; cancelAnimationFrame(raf); S = null; }
