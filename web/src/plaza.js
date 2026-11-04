// 🧸 Lobby toy: grab a Mind on the plaza with the mouse (or a finger), swing it around and throw it. It flails, bounces off
// the ground and the screen edges, then reacts: happy after a gentle toss, dizzy after a big one, ANGRY when you keep
// doing it (stomps, shakes a fist, sometimes storms off the screen) and always marches back to its spot. Taps poke it.
// Pure fun: nothing here touches the game state or the server.
import { stage, burst, stars, shake, spawn } from './stage2d.js';
import { sfx, babble } from './audio.js';

const G = 22, BOUNCE = 0.42, FRICTION = 0.7, WALK = 2.6, MAXV = 26;
let K = null, held = null, last = [], downAt = null;

const screenToWorld = (sx, sy) => {
  const s = stage.K * stage.cam.zoom;
  return { x: stage.cam.x + (sx - innerWidth / 2) / s, y: (innerHeight * stage.groundAt - sy) / s + stage.cam.y };
};
// the walls are the edges of the open plaza (not behind the menu column or the leaderboard tab)
const edges = () => { const s = stage.K * stage.cam.zoom, b = K.bounds?.() || { l: 0, r: innerWidth }, wx = px => stage.cam.x + (px - innerWidth / 2) / s; return { l: wx(b.l) + 0.45, r: wx(b.r) - 0.45, top: innerHeight * stage.groundAt / s - 0.3 }; };
const hit = (w) => [...K.fighters()].reverse().find(f => Math.abs(w.x - f.pos.x) < 0.62 * f.scale && w.y > f.pos.y - 0.1 && w.y < f.pos.y + f.height + 0.1);
const say = (f, mood, ms = 1800) => K.say(f, babble(f.mindId || f.id, mood, 1), ms);
const mood = f => (f.grudge = Math.max(0, (f.grudge || 0) - (performance.now() - (f.grudgeAt || 0)) / 8000), f.grudgeAt = performance.now(), f.grudge);

// what a Mind does while it is a toy (called from Fighter.update instead of its normal pose)
function step(f, P, dt, t) {
  const T = f.toy;
  T.t += dt;
  if (T.mode === 'held') {
    const k = Math.min(1, dt * 18);
    T.x += (T.gx - T.x) * k; T.y += (T.gy - T.y) * k;
    const vx = (T.gx - T.x) * 8;
    Object.assign(P, { armF: 2.7 + Math.sin(t * 22) * 0.4, armB: 2.7 - Math.sin(t * 22) * 0.4, legF: Math.sin(t * 17) * 0.6 - vx * 0.03, legB: -Math.sin(t * 17) * 0.6 - vx * 0.03, head: Math.sin(t * 9) * 0.2, spin: Math.max(-0.7, Math.min(0.7, -vx * 0.05)), sq: 1.06 });
  } else if (T.mode === 'fly') {
    const e = edges();
    T.vy -= G * dt; T.x += T.vx * dt; T.y += T.vy * dt; T.spin += T.vs * dt;
    if (T.x < e.l || T.x > e.r) { T.x = Math.max(e.l, Math.min(e.r, T.x)); T.vx *= -0.55; T.vs *= -0.6; bonk(f, T, Math.abs(T.vx)); }
    if (T.y > e.top) { T.y = e.top; T.vy = -Math.abs(T.vy) * 0.3; bonk(f, T, 6); }
    if (T.y <= 0) {
      const hard = Math.abs(T.vy);
      T.y = 0;
      if (hard > 2.2) { T.vy = hard * BOUNCE; T.vx *= FRICTION; T.vs *= 0.5; T.squash = Math.min(0.45, hard * 0.03); burst(T.x, 0.05, ['#ffffff', '#e8d9b5'], Math.min(24, 6 + hard * 1.5 | 0), 0.5 + hard * 0.04); sfx('land'); if (hard > 9) shake(Math.min(10, hard * 0.5)); }
      else { T.vy = 0; T.vx *= 0.8; if (Math.abs(T.vx) < 0.6) land(f, T); }
    }
    T.squash = Math.max(0, (T.squash || 0) - dt * 2.5);
    const flail = Math.sin(t * 30);
    Object.assign(P, { armF: 2.6 + flail * 0.5, armB: 2.6 - flail * 0.5, legF: flail * 0.7, legB: -flail * 0.7, head: flail * 0.15, spin: T.spin, sq: 1 - T.squash });
  } else if (T.mode === 'dizzy') {
    const w = Math.sin(T.t * 7) * Math.max(0, 1 - T.t / T.dur);
    Object.assign(P, { spin: w * 0.35, head: w * 0.5, lean: w * 0.2, armF: 0.5 + w, armB: 0.5 - w });
    if (Math.random() < dt * 6) stars(T.x + Math.sin(T.t * 6) * 0.35, f.height + 0.15, 1);
    if (T.t > T.dur) home(f, T);
  } else if (T.mode === 'angry') {
    const stomp = Math.abs(Math.sin(T.t * 9));
    Object.assign(P, { y: stomp * 0.18, sq: 1 - stomp * 0.12, armF: 2.4 + Math.sin(T.t * 26) * 0.5, armFx: 0.1, armB: 0.3, lean: 0.15, head: -0.1 + Math.sin(T.t * 26) * 0.06 });
    f.flash = Math.max(f.flash, 0.15 + 0.15 * Math.sin(T.t * 20));
    if (Math.random() < dt * 10) spawn({ x: T.x + (Math.random() - 0.5) * 0.4, y: f.height + 0.1, vx: (Math.random() - 0.5) * 0.6, vy: 1.4, life: 0.6, size: 0.07, color: Math.random() < 0.5 ? '#ff3b3b' : '#ffffff', glow: true });   // steam
    if (stomp > 0.97 && !T.thud) { T.thud = true; sfx('step'); } else if (stomp < 0.5) T.thud = false;
    if (T.t > T.dur) T.runOff ? storm(f, T) : home(f, T);
  } else if (T.mode === 'happy') {
    Object.assign(P, { y: Math.abs(Math.sin(T.t * 8)) * 0.35, armF: 2.8, armB: 2.8, head: 0.2 });
    if (T.t > T.dur) home(f, T);
  } else if (T.mode === 'walk') {
    const d = T.to - T.x, sp = T.fast ? WALK * 1.7 : WALK;
    f.dir = d >= 0 ? 1 : -1;
    T.x += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
    Object.assign(P, { run: 1, lean: 0.12 });
    if (Math.abs(T.to - T.x) < 0.02) {
      if (T.then === 'back') { T.x = T.from; T.to = f.home.x; T.then = null; T.fast = false; K.say(f, ['hmph.', 'I am back.', 'ok, calm now', '...'][Math.random() * 4 | 0], 1800); }
      else if (T.then === 'wait') { T.mode = 'gone'; T.t = 0; }
      else { f.dir = f.side ? -1 : 1; f.toy = null; }
    }
  } else if (T.mode === 'gone') {
    T.x = T.to;   // off screen, sulking
    if (T.t > 2.6) { T.mode = 'walk'; T.x = T.from; T.to = f.home.x; T.then = null; T.fast = false; K.say(f, 'hmph.', 1500); }
  } else if (T.mode === 'poked') {
    Object.assign(P, { y: Math.sin(Math.min(1, T.t / 0.35) * Math.PI) * 0.3, sq: T.t < 0.1 ? 0.85 : 1, armF: 1.6, armB: 1.6 });
    if (T.t > 0.45) f.toy = null;
  }
  f.pos = { x: T.x, y: Math.max(0, T.y + (P.y || 0)) };
}
function bonk(f, T, v) {
  if (v < 3) return;
  stars(T.x, T.y + f.height * 0.6, 5); sfx('hit'); shake(Math.min(8, v * 0.4));
  if (!T.bonked) { T.bonked = true; say(f, 'ouch', 1200); }
}
// it stopped moving: react to how it was treated
function land(f, T) {
  const g = mood(f);
  T.vx = T.vy = 0; T.spin = 0; T.t = 0;
  if (g >= 4) { T.mode = 'angry'; T.dur = 1.6; T.runOff = Math.random() < 0.55; K.say(f, `💢 ${babble(f.mindId || f.id, 'angry', 1.1)}`, 2000); sfx('roar'); shake(6); }
  else if (g >= 2.2 || T.max > 14) { T.mode = 'angry'; T.dur = 1.1; K.say(f, `💢 ${babble(f.mindId || f.id, 'angry', 1)}`, 1700); sfx('roar'); }
  else if (T.max > 7) { T.mode = 'dizzy'; T.dur = 1.6; say(f, 'dizzy'); }
  else { T.mode = 'happy'; T.dur = 0.9; say(f, 'happy'); }
}
function home(f, T) { Object.assign(T, { mode: 'walk', to: f.home.x, t: 0, fast: false, then: null }); }
// storms off the nearest edge, sulks out of sight, then walks back in
function storm(f, T) {
  const e = edges(), left = T.x < stage.cam.x;
  Object.assign(T, { mode: 'walk', to: left ? e.l - 2.5 : e.r + 2.5, from: left ? e.l - 2.5 : e.r + 2.5, then: 'wait', fast: true, t: 0 });
  K.say(f, ['I am leaving!', 'bye!!', 'not playing with you'][Math.random() * 3 | 0], 1500);
}

function down(e) {
  if (!K.active() || held || e.button > 0) return;
  if (e.target.closest('button, a, input, textarea, select, label, .panel, .mode, .topbar, .col-play, .col-board, .board-tab, .mdock, #modal, .share-row, .sharebtn')) return;
  const w = screenToWorld(e.clientX, e.clientY), f = hit(w);
  if (!f || (f.toy && f.toy.mode === 'gone')) return;
  e.preventDefault();
  const T = f.toy || {};
  f.toy = Object.assign(T, { mode: 'held', t: 0, x: f.pos.x, y: f.pos.y, gx: f.pos.x, gy: f.pos.y, oy: w.y - f.pos.y, ox: w.x - f.pos.x, spin: 0, max: 0, bonked: false, step });
  held = f; last = [{ x: w.x, y: w.y, at: performance.now() }]; downAt = { x: e.clientX, y: e.clientY, at: performance.now() };
  document.body.classList.add('plaza-grab');
  sfx('select');
}
function move(e) {
  if (!K.active()) return;
  if (!held) { document.body.classList.toggle('plaza-hover', !e.target.closest('button, a, input, .panel, .mode, .topbar, .col-play, .col-board, .mdock, #modal') && !!hit(screenToWorld(e.clientX, e.clientY))); return; }
  const w = screenToWorld(e.clientX, e.clientY), T = held.toy;
  T.gx = w.x - T.ox; T.gy = Math.max(0, w.y - T.oy);
  last.push({ x: w.x, y: w.y, at: performance.now() }); while (last.length > 6) last.shift();
  if (!T.squeaked && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) { T.squeaked = true; say(held, 'grab', 1500); }
}
function up(e) {
  if (!held) return;
  const f = held, T = f.toy, now = performance.now();
  held = null; document.body.classList.remove('plaza-grab');
  const tap = downAt && now - downAt.at < 250 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10;
  if (tap) {   // a poke: giggles at first, gets cross if you keep poking
    f.pokes = (now - (f.pokeAt || 0) < 4000 ? f.pokes || 0 : 0) + 1; f.pokeAt = now;
    Object.assign(T, { mode: 'poked', t: 0, y: 0 });
    if (f.pokes >= 5) { f.grudge = (f.grudge || 0) + 1; K.say(f, '💢 stop poking!', 1500); sfx('roar'); }
    else say(f, 'poke', 1200);
    return;
  }
  const a = last[0], b = last[last.length - 1], dt = Math.max(0.016, (b.at - a.at) / 1000);
  T.vx = Math.max(-MAXV, Math.min(MAXV, (b.x - a.x) / dt)); T.vy = Math.max(-MAXV, Math.min(MAXV, (b.y - a.y) / dt));
  T.vs = -T.vx * 0.9; T.max = Math.hypot(T.vx, T.vy); T.mode = 'fly'; T.t = 0;
  const g = mood(f); f.grudge = g + (T.max > 7 ? 1.4 : 0.6);
  if (T.max > 7) { sfx('whoosh'); say(f, 'throw', 1400); }
}

export function initPlaza(ctx) {
  K = ctx;
  addEventListener('pointerdown', down, { passive: false });
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  addEventListener('touchmove', e => { if (held) e.preventDefault(); }, { passive: false });   // no page scroll while holding a Mind
}
// a new plaza (screen change): let go of everything
export function resetPlaza() { held = null; document.body.classList.remove('plaza-grab', 'plaza-hover'); }
