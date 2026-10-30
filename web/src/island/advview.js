// Adventure screen: walk your hero around a wild island (tap to move, tap a monster to fight it, tap loot to
// gather it). Monsters roam and chase you; guards watch their chests; the Ogre sits at the ruined hut.
// Go home any time (or when the timer ends) to keep what you found; knocked out = you keep half.
import { gen, COVER, T, TW, TH, WW, WH, hash } from './gen.js';
import { drawSky, groundFor, sprites } from './art.js';
import { bsprites } from './buildings.js';
import { chibi } from './chibi.js';
import { troopSprite, weapon, nodeSprite, monsterSprite } from './troops.js';
import { advMap, advLoot, HEROES, MONSTERS, SPOTS, POTION_HEAL, BIOME, SPOT_BIOME } from './adventure.js';
import { createAdv, advInput, advStep, tileOf, CUT, STEP } from './advsim.js';
import { DROPS } from './rules.js';
import { drawCinema } from './cinema.js';
import { sfx, music } from '../audio.js';

const $ = s => document.querySelector(s);
const cv = $('#adv-cv'), g = cv.getContext('2d');
let A = null, running = false, raf = 0, last = 0, Tm = 0, W = 1, H = 1, DPR = 1, shake = 0, flashA = 0;
const cam = { x: WW / 2, y: WH / 2, z: 3 };
let parts = [], texts = [], w = null, gr = null, vig = null;
const kx = k => k % TW, ky = k => (k / TW) | 0;
const ICON = { dust: '✨', wood: '🪵', stone: '🪨', seed_carrot: '🥕', seed_melon: '🍈', seed_star: '⭐', herb: '🌿', gems: '💎' };

// ---------- biomes: the same island art recoloured (grass / trees / rocks) + weather ----------
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function recolor(srcCv, B) {
  const c = document.createElement('canvas'); c.width = srcCv.width; c.height = srcCv.height;
  const x = c.getContext('2d'); x.drawImage(srcCv, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data, G = B.g.map(hex), TR = B.tree.map(hex), RK = B.rock.map(hex);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    let ramp = null;
    if (B.water && b > r + 30 && b > g - 10 && l > 0.3) { const W2 = B.water.map(hex), t = W2[Math.max(0, Math.min(3, Math.round(l * 4.4 - 1)))]; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; continue; }   // pond → lava / ice
    if (g > r + 12 && g > b + 8) ramp = mx - mn > 70 && l < 0.5 ? TR : G;          // greens: grass and leaves
    else if (r > b + 25 && r >= g && mx < 215 && mx - mn > 30) ramp = RK;             // browns: cliffs, trunks, dirt
    if (!ramp) continue;
    const k = Math.max(0, Math.min(3, Math.round(l * 4.2 - 0.6))), t = ramp[k];
    d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2];
  }
  x.putImageData(id, 0, 0);
  return { cv: c, w: srcCv.width, h: srcCv.height };
}
const tintCache = new Map();
const tinted = (spr, B, key) => { const kk = key + (B?.g?.[0] || ''); if (!B || B === BIOME.meadow) return spr; if (!tintCache.has(kk)) tintCache.set(kk, recolor(spr.cv, B)); return tintCache.get(kk); };
let weather = [];
function biomeFx(dt) {
  const B = A.biome, v0 = toWorld(0, 0), v1 = toWorld(W, H), rx = () => v0.x + Math.random() * (v1.x - v0.x), ry = () => v0.y + Math.random() * (v1.y - v0.y);
  if (B.snow && Math.random() < dt * 40) weather.push({ x: rx(), y: v0.y - 4, vx: 6, vy: 18, life: 6, c: '#ffffff' });
  if (B.storm && Math.random() < dt * 70) weather.push({ x: rx(), y: v0.y - 4, vx: -20, vy: 160, life: 1.2, c: '#9fb4d8', rain: true });
  if (B.volcano && Math.random() < dt * 14) weather.push({ x: rx(), y: v1.y + 2, vx: (Math.random() - 0.5) * 8, vy: -22, life: 5, c: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a' });
  if (B.dragon && Math.random() < dt * 8) weather.push({ x: rx(), y: v1.y + 2, vx: 4, vy: -16, life: 5, c: '#ff8a5a' });
  if (B.crystal && Math.random() < dt * 12) weather.push({ x: rx(), y: ry(), vx: 0, vy: -4, life: 1, c: '#e0fbff', twinkle: true });
  if (B.flowers && Math.random() < dt * 10) weather.push({ x: v0.x - 4, y: ry(), vx: 14, vy: 4, life: 7, c: Math.random() < 0.5 ? '#ffb3d2' : '#ffffff' });
  if (B.mush && Math.random() < dt * 6) weather.push({ x: rx(), y: ry(), vx: 0, vy: -3, life: 2, c: '#d4ff7a', twinkle: true });
  if (B.storm && (A.flash = (A.flash || 0) - dt) < -4 - Math.random() * 4) { A.flash = 0.15; sfx('rumble'); }
  weather = weather.filter(p => {
    p.life -= dt; p.x += p.vx * dt + (p.rain ? 0 : Math.sin(Tm * 2 + p.y * 0.1) * 0.2); p.y += p.vy * dt;
    g.globalAlpha = p.twinkle ? Math.max(0, Math.sin(p.life * Math.PI)) : Math.min(1, p.life);
    g.fillStyle = p.c; if (p.rain) g.fillRect(p.x, p.y, 1, 4); else g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    return p.life > 0;
  });
  g.globalAlpha = 1;
}
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cam.z = Math.max(2.4, Math.min(4, Math.min(W, H * 1.6) / 300)); }
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });
function burst(x, y, cols, n = 10, sp = 40) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 90, life: 0.6 + Math.random() * 0.3, max: 0.9, c: cols[(Math.random() * cols.length) | 0], s: 1 + (Math.random() * 2 | 0) }); } }
const say = (x, y, text, c = '#fff8e4', big) => texts.push({ x, y, text, c, life: 1.3, big });
const sndGate = {};
const snd = (n, gap = 0.08) => { const t = performance.now() / 1000; if ((sndGate[n] || 0) > t) return; sndGate[n] = t + gap; sfx(n); };

// the simulation (advsim.js) decides everything; this only shows what it reports
function show(f) {
  const h = A.hero;
  if (f.e === 'step') snd('step', 0.35);
  else if (f.e === 'swing') { const foe = f.foe, HD = HEROES[A.heroKind]; snd('smash', 0.1); burst((foe.x + h.x) / 2, foe.y - 8, ['#ffffff', '#ffe27a'], 4, 35); say(foe.x, foe.y - 18, `-${Math.round(HD.dps * 0.4 * (h.buff ? HD.ability.mult : 1))}`, '#ffe27a'); }
  else if (f.e === 'kill') {
    const foe = f.foe;
    add(foe.loot, foe.x, foe.y - 16);
    burst(foe.x, foe.y - 6, foe.type === 'slime' ? ['#9be05a', '#d4ff9a', '#ffffff'] : ['#ffffff', '#cfcfdc', '#ffd84a'], foe.type === 'ogre' ? 40 : 16, 60);
    snd(foe.type === 'slime' ? 'slime' : 'ko', 0.05);
    if (MONSTERS[foe.type].boss) { shake = 8; flashA = 0.3; say(foe.x, foe.y - 30, `${MONSTERS[foe.type].name.toUpperCase()} DEFEATED!`, '#ffd84a', true); snd('victory'); }
  } else if (f.e === 'cut') {
    const c = f.c;
    add(DROPS[COVER[c.type.toUpperCase()]] || {}, c.x, c.y - 10);
    burst(c.x, c.y - 4, c.type === 'tree' ? ['#8b5a34', '#58b046', '#7fcf55'] : c.type === 'rock' ? ['#a3a2b5', '#7c7b8f'] : ['#58b046', '#7fcf55'], 12, 45);
    snd(c.type === 'tree' ? 'hit' : c.type === 'rock' ? 'block' : 'pop', 0.05);
  } else if (f.e === 'chop') snd(f.c.type === 'rock' ? 'smash' : 'whoosh', 0.1);
  else if (f.e === 'guarded') say(f.n.x, f.n.y - 20, 'Beat the guard first!', '#ff8a7a');
  else if (f.e === 'node') {
    const n = f.n;
    add(n.loot, n.x, n.y - 14);
    burst(n.x, n.y - 6, n.type === 'ore' ? ['#a3a2b5', '#ffd84a'] : n.type === 'log' ? ['#8b5a34', '#c99a63'] : n.type.includes('chest') ? ['#ffd84a', '#fff3b0', '#ffffff'] : ['#7fcf55', '#e0304a'], n.type === 'bigchest' ? 30 : 12, 50);
    snd(n.type.includes('chest') ? 'chest' : 'pop', 0.05);
  } else if (f.e === 'dig') snd(f.n.type === 'ore' ? 'block' : f.n.type === 'log' ? 'hit' : 'flip', 0.1);
  else if (f.e === 'bite') { const m = f.m, D = MONSTERS[m.type]; snd(m.type === 'slime' ? 'slime' : 'hit', 0.12); say(h.x, h.y - 26, `-${Math.round(D.dps * 0.6)}`, '#ff6a5a'); if (D.boss) shake = 4; }
  else if (f.e === 'roar') { const m = f.m; snd(m.type === 'boar' ? 'roar' : 'denied', 0.3); say(m.x, m.y - 24, '!', '#ff5a4a', true); }
  else if (f.e === 'ability') { const ab = HEROES[A.heroKind].ability; burst(h.x, h.y - 10, ['#ffd84a', '#fff3b0', '#7fff7f'], 24, 60); flashA = 0.15; sfx(A.heroKind === 'hero' ? 'horn' : 'heal'); say(h.x, h.y - 30, ab.name.toUpperCase() + '!', '#ffd84a', true); }
  else if (f.e === 'potion') { burst(h.x, h.y - 10, ['#ff8aa8', '#ffffff', '#7fff7f'], 18, 50); sfx('heal'); say(h.x, h.y - 28, `+${POTION_HEAL}`, '#7fff7f', true); }
  else if (f.e === 'ko') { snd('defeat'); say(h.x, h.y - 30, 'Knocked out!', '#ff6a5a', true); setTimeout(() => A?.onEnd?.(A), 1500); }
  else if (f.e === 'time') { snd('round'); setTimeout(() => A?.onEnd?.(A), 600); }
}
// a tap: recorded with the tick it happened on, so the server can replay it exactly
function tap(a) { const res = advInput(A, a); A.inputs.push({ t: A.tick, ...a }); for (const f of A.fx.splice(0)) show(f); return res; }
function update(dt) {
  A.spare = Math.min(0.5, A.spare + dt);
  while (A.spare >= STEP && !A.over) { A.spare -= STEP; advStep(A); for (const f of A.fx.splice(0)) show(f); }
}
function add(loot, x, y) {
  let row = 0;
  for (const [k, n] of Object.entries(loot)) { A.bag[k] = (A.bag[k] || 0) + n; say(x, y - row++ * 10, `+${n} ${ICON[k] || k}`, k === 'dust' ? '#ffe27a' : '#d4ff1f'); }
  snd('coin', 0.05); paintBag();
}

function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000); last = now; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) resize();
  if (!A.over) update(dt);
  paintHud();
  const h = A.hero;
  cam.x += (h.x - cam.x) * Math.min(1, dt * 6); cam.y += (h.y - 10 - cam.y) * Math.min(1, dt * 6);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 20);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false;
  drawSky(g, W, H, Tm);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z + sx) * DPR, (H / 2 - cam.y * cam.z + sy) * DPR);
  g.drawImage(A.ground.cv, 0, 0);
  const wave = Math.sin(Tm * 1.4);
  g.globalAlpha = 0.45 + 0.45 * wave; g.drawImage(gr.foamA.cv, 0, 0); g.globalAlpha = 0.45 - 0.45 * wave; g.drawImage(gr.foamB.cv, 0, 0); g.globalAlpha = 1;
  const v0 = toWorld(0, 0), v1 = toWorld(W, H), items = [];
  const tx0 = Math.max(0, Math.floor(v0.x / T) - 2), tx1 = Math.min(TW - 1, Math.ceil(v1.x / T) + 2), ty0 = Math.max(0, Math.floor(v0.y / T) - 1), ty1 = Math.min(TH - 1, Math.ceil(v1.y / T) + 3);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = ty * TW + tx, cov = w.cover[k];
    if (!w.land[k] || A.cut.has(k)) continue;
    const cx = tx * T + 8, by = ty * T + 15, v = hash(tx, ty, 7) * 4 | 0;
    const B = A.biome;
    if (cov === COVER.WEEDS) items.push({ y: by - 1, spr: tinted(sprites.weeds(v), B, 'w' + v), x: cx, cut: k });
    else if (cov === COVER.BUSH) items.push({ y: by, spr: tinted(sprites.bush(v % 3), B, 'b' + v % 3), x: cx, cut: k });
    else if (cov === COVER.ROCK) items.push({ y: by - 1, spr: tinted(sprites.rock(v % 3), B, 'r' + v % 3), x: cx, cut: k });
    else if (cov === COVER.TREE) { const kind = B === BIOME.meadow ? w.treeKinds[w.kind[k]] : B.snow || B.storm || B.crystal ? 'pine' : (w.kind[k] % 2 ? 'pine' : 'leaf'); items.push({ y: by, spr: tinted(sprites.tree(kind, v % 3), B, 't' + kind + v % 3), x: cx, tree: true, cut: k }); }
  }
  items.push({ y: (w.house.y + 3) * T - 4, spr: bsprites.rubble(3), x: (w.house.x + 1.5) * T });   // the ruined hut
  for (const n of A.nodes) if (!n.done) items.push({ y: n.y + 3, spr: nodeSprite(n.type), x: n.x, node: n });
  for (const m of A.mons) if (!m.dead) items.push({ y: m.y, mon: m });
  items.push({ y: h.y, hero: true });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.hero) { drawHero(); continue; }
    if (it.mon) { drawMon(it.mon); continue; }
    const s = it.spr, sway = it.tree ? Math.round(Math.sin(Tm * 1.3 + it.x * 0.1) * 0.6) : 0;
    const hide = it.tree && Math.abs(h.x - it.x) < s.w / 2 && h.y < it.y - 2 && h.y > it.y - s.h + 6;
    if (hide) g.globalAlpha = 0.5;
    g.drawImage(s.cv, Math.round(it.x - (s.w >> 1) + sway), Math.round(it.y - s.h + 1 - (it.node && it.node.type.includes('chest') ? Math.abs(Math.sin(Tm * 3)) : 0)));
    g.globalAlpha = 1;
    if (it.cut && h.gather?.k === it.cut) { g.fillStyle = '#1d1b2f'; g.fillRect(it.x - 9, it.y - s.h - 4, 18, 4); g.fillStyle = '#d4ff1f'; g.fillRect(it.x - 8, it.y - s.h - 3, 16 * Math.min(1, h.gather.prog), 2); }
    if (it.node) {
      if (Math.random() < dt * 2) parts.push({ x: it.x + (Math.random() - 0.5) * 10, y: it.y - 8 - Math.random() * 6, vx: 0, vy: -10, g: 0, life: 0.6, max: 0.6, c: it.node.type === 'herb' ? '#7fff9a' : '#fff3b0', s: 1 });
      if (h.gather === it.node) { g.fillStyle = '#1d1b2f'; g.fillRect(it.x - 9, it.y - s.h - 6, 18, 4); g.fillStyle = '#d4ff1f'; g.fillRect(it.x - 8, it.y - s.h - 5, 16 * Math.min(1, it.node.prog), 2); }
    }
  }
  if (h.path.length) { const t = h.path[h.path.length - 1]; g.strokeStyle = `rgba(212,255,31,${0.5 + 0.4 * Math.sin(Tm * 8)})`; g.lineWidth = 1; g.strokeRect(kx(t) * T + 2.5, ky(t) * T + 2.5, T - 5, T - 5); }
  parts = parts.filter(q => { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.5)); g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); return q.life > 0; });
  g.globalAlpha = 1;
  biomeFx(dt);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  // biome mood: a colour wash + vignette; storm lightning flash
  if (A.biome.volcano || A.biome.dragon) { g.fillStyle = 'rgba(255,90,40,.08)'; g.fillRect(0, 0, W, H); }
  if (A.biome.storm) { g.fillStyle = 'rgba(30,40,70,.18)'; g.fillRect(0, 0, W, H); if (A.flash > 0) { g.fillStyle = `rgba(230,240,255,${A.flash * 3})`; g.fillRect(0, 0, W, H); } }
  if (A.biome.snow) { g.fillStyle = 'rgba(220,235,255,.08)'; g.fillRect(0, 0, W, H); }
  drawCinema(g, W, H, Tm, dt, { motes: A.biome.snow || A.biome.storm ? 'none' : 'pollen', rays: !A.biome.storm });
  if (false) { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), gr2 = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); gr2.addColorStop(0, 'rgba(0,0,0,0)'); gr2.addColorStop(1, 'rgba(15,10,30,.45)'); x.fillStyle = gr2; x.fillRect(0, 0, W, H); vig = { cv: c, w: W, h: H }; }
  // monster levels
  g.font = '800 11px Nunito, sans-serif'; g.textAlign = 'center';
  for (const m of A.mons) { if (m.dead) continue; const p = toScreen(m.x, m.y - (MONSTERS[m.type].boss ? 38 : m.type === 'boar' ? 22 : 24)); if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue; const lab = `Lv${A.level}${MONSTERS[m.type].boss ? ' BOSS' : ''}`; g.lineWidth = 3; g.strokeStyle = '#1d1b2f'; g.strokeText(lab, p.x, p.y); g.fillStyle = MONSTERS[m.type].boss ? '#ff6a5a' : '#ffe27a'; g.fillText(lab, p.x, p.y); }
  g.textAlign = 'start';
  texts = texts.filter(t => {
    t.life -= dt; const p = toScreen(t.x, t.y), py = p.y - (1.3 - t.life) * 28;
    g.globalAlpha = Math.min(1, t.life * 2); g.font = `900 ${t.big ? 24 : 15}px Nunito, sans-serif`; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = '#1d1b2f'; g.strokeText(t.text, p.x, py); g.fillStyle = t.c; g.fillText(t.text, p.x, py);
    g.globalAlpha = 1; g.textAlign = 'start';
    return t.life > 0;
  });
  if (flashA > 0.01) { g.globalAlpha = flashA; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; flashA *= Math.pow(0.02, dt); }
}
function drawHero() {
  const h = A.hero, walking = h.act === 'walk', hitting = h.act === 'hit' || (h.gather && !h.path.length);
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(h.x, h.y, 7, 2.2, 0, 0, Math.PI * 2); g.fill();
  if (h.buff) { g.fillStyle = `rgba(255,216,74,${0.25 + 0.15 * Math.sin(Tm * 12)})`; g.beginPath(); g.ellipse(h.x, h.y - 10, 10, 13, 0, 0, Math.PI * 2); g.fill(); }
  let hgt;
  if (A.heroKind === 'hero') {
    const c = A.look, s = Math.sin(Tm * 12);
    let legL = 0, legR = 0, body = 0, ang = -0.4;
    if (walking) { legL = s > 0 ? -1 : 0; legR = s > 0 ? 0 : -1; body = Math.abs(s) > 0.7 ? -1 : 0; }
    if (hitting) { const t = (Tm * 2.6) % 1; ang = t < 0.6 ? -1.9 * (t / 0.6) : -1.9 + 2.6 * Math.min(1, (t - 0.6) / 0.15); body = t > 0.6 && t < 0.85 ? 1 : 0; }
    g.save(); g.translate(Math.round(h.x), Math.round(h.y)); if (h.face < 0) g.scale(-1, 1);
    const ox = -Math.floor(c.w / 2), oy = -c.h + 1;
    g.drawImage(c.legL.cv, ox, oy + c.hip + legL); g.drawImage(c.legR.cv, ox + c.mid, oy + c.hip + legR); g.drawImage(c.body.cv, ox, oy + body);
    const wp = weapon.captain; g.save(); g.translate(ox + c.hand.x, oy + c.hand.y + body); g.rotate(ang); g.drawImage(wp.cv, -1, -wp.h + 2); g.restore();
    g.restore(); hgt = c.h;
  } else {
    const fr = walking ? Math.floor(Tm * 8) % 2 : 0, spr = troopSprite('captain', fr);
    g.save(); g.translate(Math.round(h.x), Math.round(h.y) - fr); if (h.face < 0) g.scale(-1, 1);
    g.drawImage(spr.cv, -Math.floor(spr.w / 2), -spr.h + 1);
    let ang = -0.5; if (hitting) { const t = (Tm * 2.8) % 1; ang = t < 0.6 ? -1.8 * (t / 0.6) : -1.8 + 2.4 * Math.min(1, (t - 0.6) / 0.15); }
    g.save(); g.translate(4, -spr.h + 11); g.rotate(ang); g.drawImage(weapon.captain.cv, -1, -weapon.captain.h + 3); g.restore();
    g.restore(); hgt = spr.h;
  }
  if (h.hit) { g.globalAlpha = 0.5; g.fillStyle = '#ff5a4a'; g.fillRect(h.x - 6, h.y - hgt, 12, hgt); g.globalAlpha = 1; }
}
function drawMon(m) {
  const D = MONSTERS[m.type], fr = m.moving ? Math.floor(Tm * (m.type === 'slime' ? 5 : 8) + m.id) % 2 : 0;
  const spr = monsterSprite(m.type, m.type === 'slime' ? (m.moving ? fr * 2 : (Math.sin(Tm * 3 + m.id) > 0.6 ? 1 : 0)) : fr, m.color || 0);
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(m.x, m.y, spr.w * 0.35, 2, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.translate(Math.round(m.x), Math.round(m.y) - (m.type === 'slime' && m.moving ? fr * 2 : 0)); if (m.face < 0) g.scale(-1, 1);
  g.drawImage(spr.cv, -Math.floor(spr.w / 2), -spr.h + 1);
  g.restore();
  if (m.hit) { g.globalAlpha = 0.6; g.fillStyle = '#fff'; g.fillRect(m.x - spr.w / 2, m.y - spr.h, spr.w, spr.h); g.globalAlpha = 1; }
  if (m.hp < m.max || D.boss) { const w2 = D.boss ? 26 : 14; g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(m.x - w2 / 2) - 1, Math.round(m.y - spr.h - 5), w2 + 2, 4); g.fillStyle = D.boss ? '#ff4d6d' : '#ff8a5a'; g.fillRect(Math.round(m.x - w2 / 2), Math.round(m.y - spr.h - 4), Math.round(w2 * Math.max(0, m.hp / m.max)), 2); }
  if (m.guards && !m.angry) { g.font = '700 8px Nunito, sans-serif'; g.fillStyle = '#ffd84a'; g.fillText('🛡', m.x - 4, m.y - spr.h - 7); }
}

// ---------- HUD + input ----------
function paintBag() { $('#adv-bag').innerHTML = Object.entries(A.bag).map(([k, n]) => `<span>${ICON[k] || ''} <b>${n}</b></span>`).join('') || '<span class="muted">Nothing yet</span>'; }
function paintHud() {
  const t = Math.max(0, A.time);
  $('#adv-time').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  $('#adv-time').classList.toggle('low', t < 20);
  $('#adv-hp i').style.width = `${Math.max(0, A.hero.hp / A.maxHp) * 100}%`;
  $('#adv-hp b').textContent = Math.max(0, Math.round(A.hero.hp));
  $('#adv-potion em').textContent = A.potions; $('#adv-potion').classList.toggle('used', !A.potions || A.hero.hp >= A.maxHp);
  $('#adv-gather').textContent = `🌿 ${Math.max(0, A.gatherLeft)}`;
  const ab = $('#adv-ability'), cd = A.hero.cd;
  ab.classList.toggle('used', cd > 0); ab.querySelector('em').textContent = cd > 0 ? Math.ceil(cd) : '';
}
cv.addEventListener('pointerdown', e => {
  if (!A || A.over) return;
  const p = toWorld(e.clientX, e.clientY);
  const mon = A.mons.find(m => !m.dead && Math.abs(p.x - m.x) < 10 && p.y < m.y + 3 && p.y > m.y - 22);
  if (mon) { tap({ hit: mon.id }); sfx('select'); return; }
  const node = A.nodes.find(n => !n.done && Math.abs(p.x - n.x) < 10 && Math.abs(p.y - n.y + 4) < 10);
  if (node) { tap({ node: node.id }); sfx('select'); return; }
  // grass, bushes, rocks and trees: cut them for your own island (limited per hour)
  const tk = tileOf(p.x, p.y), cov = w.cover[tk];
  if (w.land[tk] && CUT[cov] && !A.cut.has(tk)) {
    const why = tap({ cut: tk });
    if (why) { say(p.x, p.y - 10, why, '#ff8a7a'); sfx('denied'); } else sfx('select');
    return;
  }
  tap({ go: tk });
  burst(p.x, p.y, ['#d4ff1f', '#ffffff'], 4, 20);
});
$('#adv-ability').onclick = () => { if (A && !A.over && A.hero.cd <= 0) tap({ ability: 1 }); };
$('#adv-potion').onclick = () => { if (A && !A.over && A.potions && A.hero.hp < A.maxHp) tap({ potion: 1 }); };
$('#adv-home').onclick = () => { if (A && !A.over) { A.over = true; sfx('whoosh'); A.onEnd?.(A); } };

// opts: { seed, level, heroKind: 'hero'|'captain', mind, onEnd(A) }
export function openAdventure(opts) {
  const map = advMap(opts.seed, opts.level);
  w = gen(opts.seed); gr = groundFor(opts.seed);
  const BB = BIOME[SPOT_BIOME[opts.area || 0]] || BIOME.meadow;
  weather = [];
  const HD = HEROES[opts.heroKind];
  A = Object.assign(createAdv(map, { heroKind: opts.heroKind, potions: opts.potions || 0, gatherLeft: opts.gatherLeft ?? 40, seed: opts.seed }), {
    ...opts, potions: opts.potions || 0, gatherLeft: opts.gatherLeft ?? 40, biome: BB, ground: BB === BIOME.meadow ? gr.ground : recolor(gr.ground.cv, BB), map, bag: {}, inputs: [], spare: 0,
    look: opts.heroKind === 'hero' ? chibi(opts.mind) : null,
  });
  for (const m of A.mons) if (m.type === 'slime') m.color = BB.volcano || BB.dragon ? 2 : BB.snow || BB.crystal || BB.storm ? 1 : m.color || 0;
  cam.x = A.hero.x; cam.y = A.hero.y;
  const ab = HD.ability;
  $('#adv-ability').innerHTML = `<b>${ab.icon}</b><span>${ab.name}</span><em></em>`;
  const AR = SPOTS[opts.area || 0];
  $('#adv-name').textContent = `${AR.icon} ${AR.name}`;
  parts = []; texts = []; shake = 0; flashA = 0;
  resize(); paintBag();
  music('wild');
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeAdventure() { running = false; cancelAnimationFrame(raf); A = null; music(null); }
export { advLoot };
// ?debug: lets a test script step the adventure without waiting for frames
if (new URLSearchParams(location.search).has('debug')) window.__adv = { A: () => A, step: n => { for (let i = 0; i < n && A && !A.over; i++) update(STEP); }, go: k => tap({ go: k }) };
