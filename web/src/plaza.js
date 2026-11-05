// 🧸 Lobby toy: play with the Minds on the plaza using the mouse (or a finger). Pure fun: nothing here touches the game
// state or the server.
//   drag = pick up and swing (shake it fast and it gets sick of it; hold it too long and it wriggles free)
//   flick = throw it: it tumbles, bounces off the ground and the plaza edges, faceplants on hard landings, knocks other
//           Minds over (they get up and chase the thrower for a bonk) or lands on another Mind's head (who shakes it off)
//   press and hold still (or rub it with the mouse) = pet it: hearts, it forgives you
//   tap = poke · double tap = a flip trick (sometimes a faceplant) · leave them alone = they fall asleep
// Reactions follow its mood: happy, dizzy, ANGRY (stomps, steam, may storm off the screen), and a very cross Mind
// dodges your hand. The others laugh or gasp at whoever got thrown. Every Mind always walks back to its spot.
import { stage, burst, stars, shake, spawn } from './stage2d.js';
import { sfx, babble } from './audio.js';

const G = 22, BOUNCE = 0.42, FRICTION = 0.7, WALK = 2.6, MAXV = 26;
let K = null, held = null, last = [], downAt = null, lastTap = { f: null, at: 0 }, touchedAt = performance.now(), rub = { f: null, d: 0, at: 0 };

const screenToWorld = (sx, sy) => {
  const s = stage.K * stage.cam.zoom;
  return { x: stage.cam.x + (sx - innerWidth / 2) / s, y: (innerHeight * stage.groundAt - sy) / s + stage.cam.y };
};
// the walls are the edges of the open plaza (not behind the menu column or the leaderboard tab)
const edges = () => {
  const s = stage.K * stage.cam.zoom, b = K.bounds?.() || { l: 0, r: innerWidth }, wx = px => stage.cam.x + (px - innerWidth / 2) / s;
  let l = wx(b.l) + 0.45, r = wx(b.r) - 0.45;
  if (r - l < 2) { const m = (l + r) / 2; l = m - 1; r = m + 1; }   // never a box too small to land in
  return { l, r, top: innerHeight * stage.groundAt / s - 0.3 };
};
const all = () => [...K.fighters()];
const hit = w => all().reverse().find(f => Math.abs(w.x - f.pos.x) < 0.62 * f.scale && w.y > f.pos.y - 0.1 && w.y < f.pos.y + f.height + 0.1);
const idOf = f => f.mindId ?? f.id;
const say = (f, mood, ms = 1800, pre = '') => K.say(f, pre + babble(idOf(f), mood, 1, 0.8), ms);   // reactions: mostly real words
const mood = f => (f.grudge = Math.max(0, (f.grudge || 0) - (performance.now() - (f.grudgeAt || 0)) / 8000), f.grudgeAt = performance.now(), f.grudge);
const toyOf = f => f.toy || (f.toy = { step, t: 0, x: f.pos.x, y: f.pos.y, spin: 0, vx: 0, vy: 0, vs: 0 });
const free = f => !f.toy || ['walk', 'sleep'].includes(f.toy.mode) && f.toy.then !== 'wait';
const hearts = (x, y, n = 1) => { for (let i = 0; i < n; i++) spawn({ x: x + (Math.random() - 0.5) * 0.5, y, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), life: 1.1, size: 0.09, color: Math.random() < 0.7 ? '#ff5fa2' : '#ffd1e6', glow: true, star: true, spin: 0 }); };
// a new action: what was left over from the last one (who to chase, who it already hit) is cleared
const set = (f, mode, extra = {}) => Object.assign(toyOf(f), { mode, t: 0, revenge: null, hits: null, noHit: false, firstImpact: 0, bonked: false }, extra);

// what a Mind does while it is a toy (called from Fighter.update instead of its normal pose)
function step(f, P, dt, t) {
  const T = f.toy;
  T.t += dt;
  const M = MODES[T.mode];
  if (M) M(f, T, P, dt, t); else f.toy = null;
  f.pos = { x: T.x, y: Math.max(0, T.y + (P.y || 0)) };
}
const MODES = {
  held(f, T, P, dt, t) {
    const k = Math.min(1, dt * 18);
    T.x += (T.gx - T.x) * k; T.y += (T.gy - T.y) * k;
    const vx = (T.gx - T.x) * 8, fight = T.t > 4.5;   // held too long: it struggles, then wriggles free
    const w = fight ? 34 : 22;
    Object.assign(P, { armF: 2.7 + Math.sin(t * w) * (fight ? 0.9 : 0.4), armB: 2.7 - Math.sin(t * w) * (fight ? 0.9 : 0.4), legF: Math.sin(t * w * 0.8) * (fight ? 1.1 : 0.6) - vx * 0.03, legB: -Math.sin(t * w * 0.8) * (fight ? 1.1 : 0.6) - vx * 0.03,
      head: Math.sin(t * 9) * 0.2, spin: Math.max(-0.7, Math.min(0.7, -vx * 0.05)) + (fight ? Math.sin(t * 30) * 0.25 : 0), sq: 1.06 });
    if (fight && !T.fought) { T.fought = true; say(f, 'struggle', 1600); sfx('roar'); }
    if (T.t > 7) { let_go(); Object.assign(T, { mode: 'fly', t: 0, vx: (Math.random() - 0.5) * 6, vy: 5, vs: 6, max: 5 }); f.grudge = (f.grudge || 0) + 1; say(f, 'escape', 1400); }
    if (T.shook && !T.shookSaid) { T.shookSaid = true; say(f, 'shake', 1600); sfx('slime'); }
    if (T.shook && Math.random() < dt * 14) stars(T.x, T.y + f.height * 0.7, 1);
  },
  fly(f, T, P, dt, t) {
    const e = edges();
    T.vy -= G * dt; T.x += T.vx * dt; T.y += T.vy * dt; T.spin += T.vs * dt;
    if (T.x < e.l || T.x > e.r) { T.x = Math.max(e.l, Math.min(e.r, T.x)); T.vx = -T.vx * 0.55; T.vs *= -0.6; bonk(f, T, Math.abs(T.vx) / 0.55); }
    if (T.y > e.top) { T.y = e.top; T.vy = -Math.abs(T.vy) * 0.3; bonk(f, T, 6); }
    collide(f, T);
    // a head to land on?
    const under = T.vy < 0 && all().find(o => o !== f && o.toy?.mode !== 'fly' && o.toy?.mode !== 'held' && !T.hits?.has(o) && Math.abs(o.pos.x - T.x) < 0.45 * o.scale && T.y <= o.pos.y + o.height && T.y > o.pos.y + o.height - 0.4);
    if (under) {
      if (-T.vy < 11) { stack(f, T, under); return; }
      T.y = under.pos.y + under.height; T.vy = -T.vy * 0.5; T.vx += (T.x - under.pos.x) * 4; stars(T.x, T.y, 4); sfx('hit'); say(under, 'bonked', 1200, '💢 '); under.grudge = (under.grudge || 0) + 1;
    }
    if (T.y <= 0) {
      const hard = Math.abs(T.vy);
      T.y = 0;
      if (hard > 2.2) {
        T.firstImpact ||= hard;
        T.vy = hard * BOUNCE; T.vx *= FRICTION; T.vs *= 0.5; T.squash = Math.min(0.45, hard * 0.03);
        burst(T.x, 0.05, ['#ffffff', '#e8d9b5'], Math.min(24, 6 + hard * 1.5 | 0), 0.5 + hard * 0.04); sfx('land'); if (hard > 9) shake(Math.min(10, hard * 0.5));
      } else { T.vy = 0; T.vx *= 0.8; if (Math.abs(T.vx) < 0.6) land(f, T); }
    }
    T.squash = Math.max(0, (T.squash || 0) - dt * 2.5);
    const flail = Math.sin(t * 30);
    Object.assign(P, { armF: 2.6 + flail * 0.5, armB: 2.6 - flail * 0.5, legF: flail * 0.7, legB: -flail * 0.7, head: flail * 0.15, spin: T.spin, sq: 1 - T.squash });
  },
  splat(f, T, P) {   // flat on its face, then up again
    const u = Math.min(1, Math.max(0, (T.t - 0.9) / 0.35)), side = T.side || 1;
    Object.assign(P, { spin: side * Math.PI / 2 * (1 - u), armF: 2.9 * (1 - u), armB: 2.9 * (1 - u), legF: 0.2, legB: -0.2, sq: 1 });
    if (T.t > 1.3) react(f, T);
  },
  dizzy(f, T, P, dt) {
    const w = Math.sin(T.t * 7) * Math.max(0, 1 - T.t / T.dur);
    Object.assign(P, { spin: w * 0.35, head: w * 0.5, lean: w * 0.2, armF: 0.5 + w, armB: 0.5 - w });
    if (Math.random() < dt * 6) stars(T.x + Math.sin(T.t * 6) * 0.35, f.height + 0.15, 1);
    if (T.t > T.dur) after(f, T);
  },
  angry(f, T, P, dt) {
    const stomp = Math.abs(Math.sin(T.t * 9));
    Object.assign(P, { y: stomp * 0.18, sq: 1 - stomp * 0.12, armF: 2.4 + Math.sin(T.t * 26) * 0.5, armFx: 0.1, armB: 0.3, lean: 0.15, head: -0.1 + Math.sin(T.t * 26) * 0.06 });
    f.flash = Math.max(f.flash, 0.15 + 0.15 * Math.sin(T.t * 20));
    if (Math.random() < dt * 10) spawn({ x: T.x + (Math.random() - 0.5) * 0.4, y: f.height + 0.1, vx: (Math.random() - 0.5) * 0.6, vy: 1.4, life: 0.6, size: 0.07, color: Math.random() < 0.5 ? '#ff3b3b' : '#ffffff', glow: true });   // steam
    if (stomp > 0.97 && !T.thud) { T.thud = true; sfx('step'); } else if (stomp < 0.5) T.thud = false;
    if (T.t > T.dur) T.runOff ? storm(f, T) : after(f, T);
  },
  happy(f, T, P) {
    Object.assign(P, { y: Math.abs(Math.sin(T.t * 8)) * 0.35, armF: 2.8, armB: 2.8, head: 0.2 });
    if (T.t > T.dur) after(f, T);
  },
  laugh(f, T, P) {   // a bystander: hops and points
    Object.assign(P, { y: Math.abs(Math.sin(T.t * 14)) * 0.12, armF: 1.7 + Math.sin(T.t * 20) * 0.2, lean: -0.15 + Math.sin(T.t * 14) * 0.05, head: 0.2 });
    if (T.t > 1.3) after(f, T);
  },
  gasp(f, T, P) {
    Object.assign(P, { armF: 2.9, armB: 2.9, sq: T.t < 0.15 ? 0.85 : 1.03, y: T.t < 0.3 ? T.t * 0.6 : Math.max(0, 0.18 - (T.t - 0.3) * 0.6) });
    if (T.t > 1) after(f, T);
  },
  pet(f, T, P, dt) {   // hearts, a happy wiggle, and the grudge melts
    Object.assign(P, { y: Math.abs(Math.sin(T.t * 6)) * 0.05, sq: 1 - Math.abs(Math.sin(T.t * 6)) * 0.05, head: 0.25 + Math.sin(T.t * 4) * 0.12, lean: Math.sin(T.t * 4) * 0.08, armF: 0.9, armB: 0.9 });
    f.grudge = Math.max(0, (f.grudge || 0) - dt * 1.5);
    if (Math.random() < dt * 5) hearts(T.x, f.height * 0.95);
    if (T.t > 0.9 && !T.cooed) { T.cooed = true; say(f, 'love', 1500); sfx('star'); }
    if (!T.holding && T.t > (T.dur || 1.6)) after(f, T);
  },
  flip(f, T, P, dt) {   // a jump with a full spin; sometimes it lands on its face
    T.vy -= G * dt; T.y += T.vy * dt;
    const u = Math.min(1, T.t / T.air);
    Object.assign(P, { spin: -Math.PI * 2 * u * (T.fail ? 0.78 : 1), armF: 2.8, armB: 2.8, legF: 0.6, legB: -0.6, sq: 1 });
    if (T.y <= 0 && T.t > 0.1) {
      T.y = 0;
      if (T.fail) { burst(T.x, 0.05, ['#ffffff', '#e8d9b5'], 14, 0.6); sfx('land'); shake(4); set(f, 'splat', { side: 1, why: 'flip' }); say(f, 'splat', 1600); }
      else { stars(T.x, f.height, 8); sfx('star'); set(f, 'happy', { dur: 0.8 }); say(f, 'proud', 1500); }
    }
  },
  carry(f, T, P) {   // a Mind sitting on its head
    const top = T.rider, wob = T.t > 1.7;
    Object.assign(P, { sq: 0.86 + (wob ? Math.sin(T.t * 40) * 0.05 : 0), armF: 2.5, armB: 2.5, lean: wob ? Math.sin(T.t * 40) * 0.2 : 0 });
    if (!top || top.toy?.mode !== 'stacked') { after(f, T); return; }
    if (wob && !T.shaken) { T.shaken = true; say(f, 'heavy', 1300); }
    if (T.t > 2.1) { set(top, 'fly', { vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2), vy: 7, vs: 8, max: 7 }); sfx('whoosh'); after(f, T); }
  },
  stacked(f, T, P) {   // sitting on another Mind's head, legs swinging
    const b = T.base;
    if (!b || b.toy?.mode !== 'carry') { set(f, 'fly', { vx: 0, vy: 0, vs: 0, max: 3 }); return; }
    T.x = b.pos.x; T.y = b.pos.y + b.height * 0.86;
    Object.assign(P, { legF: 0.9 + Math.sin(T.t * 6) * 0.3, legB: 0.9 - Math.sin(T.t * 6) * 0.3, armF: 0.4, armB: 0.4, head: 0.15, sq: 0.95 });
    if (T.t > 0.5 && !T.said) { T.said = true; say(f, 'view', 1400); }
  },
  chase(f, T, P, dt) {   // got knocked over: runs at the Mind that hit it and bonks it
    const o = T.target;
    if (!o) { after(f, T); return; }
    if (['held', 'gone', 'fly'].includes(o.toy?.mode)) { Object.assign(P, { y: Math.abs(Math.sin(T.t * 9)) * 0.15, armF: 2.4, lean: 0.15 }); if (T.t > 6) after(f, T); return; }   // can't reach it right now: stomps and waits
    const d = o.pos.x - T.x;
    f.dir = d >= 0 ? 1 : -1;
    if (Math.abs(d) > 0.75 * f.scale) { T.x += Math.sign(d) * WALK * 2 * dt; Object.assign(P, { run: 1, lean: 0.2, armF: 2.3 }); f.flash = Math.max(f.flash, 0.12); if (T.t > 6) after(f, T); return; }
    if (!T.swung) {
      T.swung = true; T.t2 = 0;
      sfx('hit'); stars(o.pos.x, o.pos.y + o.height * 0.7, 6); shake(5); say(f, 'revenge', 1400, '💢 ');
      set(o, 'fly', { x: o.pos.x, y: o.pos.y, vx: f.dir * 5, vy: 6, vs: f.dir * -7, max: 6, noHit: true }); say(o, 'bonked', 1200);
    }
    T.t2 += dt;
    Object.assign(P, { armF: T.t2 < 0.15 ? 2.8 - T.t2 * 18 : 0.2, lean: 0.35 });
    if (T.t2 > 0.6) { K.say(f, 'hmph.', 1200); after(f, T); }
  },
  walk(f, T, P, dt) {
    const d = T.to - T.x, sp = T.fast ? WALK * 1.7 : WALK;
    f.dir = d >= 0 ? 1 : -1;
    T.x += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
    Object.assign(P, { run: 1, lean: 0.12 });
    if (Math.abs(T.to - T.x) < 0.02) {
      if (T.then === 'wait') { T.mode = 'gone'; T.t = 0; }
      else { f.dir = f.side ? -1 : 1; f.toy = null; }
    }
  },
  gone(f, T) {   // off screen, sulking, then back
    T.x = T.to;
    if (T.t > 2.6) { Object.assign(T, { mode: 'walk', x: T.from, to: f.home.x, then: null, fast: false, t: 0 }); K.say(f, 'hmph.', 1500); }
  },
  dodge(f, T, P, dt) {   // too cross to be picked up: hops away from your hand
    T.vy -= G * dt; T.y += T.vy * dt; T.x += T.vx * dt;
    const e = edges(); T.x = Math.max(e.l, Math.min(e.r, T.x));
    Object.assign(P, { armF: 2.5, armB: 2.5, legF: 0.7, legB: -0.7, spin: -T.vx * 0.04 });
    if (T.y <= 0 && T.t > 0.1) { T.y = 0; set(f, 'angry', { dur: 0.7 }); }
  },
  sleep(f, T, P, dt) {
    const b = Math.sin(T.t * 1.6);
    Object.assign(P, { head: 0.45 + b * 0.05, lean: 0.12, sq: 0.94 + b * 0.02, armF: 0.15, armB: 0.15 });
    if (Math.random() < dt * 0.9) spawn({ x: T.x + 0.25, y: f.height * 0.9, vx: 0.25, vy: 0.45, life: 2, size: 0.07, color: '#ffffff', glow: true });
    if (T.t > (T.zzz || 0)) { T.zzz = T.t + 4 + Math.random() * 3; K.say(f, ['z z z', 'zzz...', 'mmh... crowns...', 'five more minutes'][Math.random() * 4 | 0], 2200); }
  },
  poked(f, T, P) {
    Object.assign(P, { y: Math.sin(Math.min(1, T.t / 0.35) * Math.PI) * 0.3, sq: T.t < 0.1 ? 0.85 : 1, armF: 1.6, armB: 1.6 });
    if (T.t > 0.45) f.toy = null;
  },
};

function bonk(f, T, v) {
  if (v < 3) return;
  stars(T.x, T.y + f.height * 0.6, 5); sfx('hit'); shake(Math.min(8, v * 0.4));
  if (!T.bonked) { T.bonked = true; say(f, 'ouch', 1200); }
}
// a flying Mind that hits another one knocks it over; the victim remembers who did it
function collide(f, T) {
  const sp = Math.hypot(T.vx, T.vy);
  if (sp < 4 || T.noHit) return;   // a revenge bonk never starts a new chain of fights
  for (const o of all()) {
    if (o === f || T.hits?.has(o) || ['fly', 'held', 'gone', 'stacked'].includes(o.toy?.mode)) continue;
    const dx = o.pos.x - T.x, dy = (o.pos.y + o.height * 0.5) - (T.y + f.height * 0.5);
    if (Math.abs(dx) > 0.7 * o.scale || Math.abs(dy) > 0.6 * (o.height + f.height) / 2) continue;
    (T.hits ||= new Set()).add(o);
    const dir = Math.sign(dx || T.vx) || 1;
    set(o, 'fly', { x: o.pos.x, y: o.pos.y, vx: dir * Math.min(9, 2 + sp * 0.45), vy: 4 + sp * 0.25, vs: dir * -8, max: sp * 0.6, hits: new Set([f]), revenge: f });
    T.vx *= 0.45; T.vy = Math.abs(T.vy) * 0.3 + 2;
    stars((o.pos.x + T.x) / 2, o.pos.y + o.height * 0.6, 8); sfx('hit'); shake(6);
    say(o, 'bonked', 1200, '💢 ');
    o.grudge = (o.grudge || 0) + 1.5;
  }
}
// landed softly on a head: sits there until the one below shakes it off
function stack(f, T, base) {
  set(f, 'stacked', { base, vx: 0, vy: 0, spin: 0 });
  set(base, 'carry', { x: base.pos.x, y: 0, rider: f });
  sfx('drop'); burst(base.pos.x, base.pos.y + base.height, ['#ffffff'], 6, 0.3);
}
// it stopped moving: faceplant first if it came down hard, then react
function land(f, T) {
  T.vx = T.vy = T.vs = 0; T.spin = 0; T.t = 0;
  if ((T.firstImpact || 0) > 13) { T.mode = 'splat'; T.side = Math.random() < 0.5 ? 1 : -1; say(f, 'splat', 1500); return; }
  react(f, T);
}
function react(f, T) {
  const g = mood(f);
  T.t = 0; T.spin = 0; T.firstImpact = 0;
  if (T.revenge && T.revenge.toy?.mode !== 'gone') { Object.assign(T, { mode: 'chase', target: T.revenge, revenge: null, swung: false }); say(f, 'revenge', 1300, '💢 '); return; }
  if (g >= 4) { Object.assign(T, { mode: 'angry', dur: 1.6, runOff: Math.random() < 0.55 }); say(f, 'angry', 2000, '💢 '); sfx('roar'); shake(6); }
  else if (g >= 2.2 || T.max > 14 || T.shook) { Object.assign(T, { mode: T.shook && g < 2.2 ? 'dizzy' : 'angry', dur: T.shook ? 2.2 : 1.1 }); T.mode === 'angry' ? (say(f, 'angry', 1700, '💢 '), sfx('roar')) : say(f, 'dizzy'); }
  else if (T.max > 7) { Object.assign(T, { mode: 'dizzy', dur: 1.6 }); say(f, 'dizzy'); }
  else { Object.assign(T, { mode: 'happy', dur: 0.9 }); say(f, 'happy'); }
  T.shook = false;
}
const after = (f, T) => Object.assign(T, { mode: 'walk', to: f.home.x, t: 0, fast: false, then: null });
// storms off the nearest edge, sulks out of sight, then walks back in
function storm(f, T) {
  const e = edges(), left = T.x < (e.l + e.r) / 2, out = left ? e.l - 2.5 : e.r + 2.5;
  Object.assign(T, { mode: 'walk', to: out, from: out, then: 'wait', fast: true, t: 0 });
  say(f, 'leave', 1500);
}
// the others watch: a laugh, or a gasp
function audience(thrown) {
  for (const o of all()) {
    if (o === thrown || !free(o) || Math.random() < 0.35) continue;
    if (o.toy?.mode === 'sleep') continue;
    const laugh = Math.random() < 0.6;
    set(o, laugh ? 'laugh' : 'gasp', { x: o.pos.x, y: 0 });
    setTimeout(() => say(o, laugh ? 'laugh' : 'gasp', 1300), 150 + Math.random() * 300);
  }
}
const let_go = () => { held = null; document.body.classList.remove('plaza-grab'); };

function down(e) {
  touchedAt = performance.now();
  if (!K.active() || held || e.button > 0) return;
  if (e.target.closest('button, a, input, textarea, select, label, .panel, .mode, .topbar, .col-play, .col-board, .board-tab, .mdock, #modal, .share-row, .sharebtn')) return;
  const w = screenToWorld(e.clientX, e.clientY), f = hit(w);
  if (!f || f.toy?.mode === 'gone') return;
  e.preventDefault();
  if (f.toy?.mode === 'sleep') {   // woken up: a jump, then grumpy
    set(f, 'gasp', { y: 0 }); say(f, 'wake', 1600, '❗ '); f.grudge = (f.grudge || 0) + 0.8; sfx('select'); return;
  }
  if (mood(f) >= 5 && !['fly', 'held'].includes(f.toy?.mode)) {   // too cross: it will not be caught
    const away = Math.sign(f.pos.x - w.x) || 1;
    set(f, 'dodge', { x: f.pos.x, y: f.pos.y, vx: away * 4.5, vy: 7 }); say(f, 'dodge', 1300, '💢 '); sfx('whoosh'); return;
  }
  if (f.toy?.mode === 'stacked') { const b = f.toy.base; if (b?.toy?.mode === 'carry') after(b, b.toy); }
  if (f.toy?.mode === 'carry' && f.toy.rider) set(f.toy.rider, 'fly', { vx: 0, vy: 1, vs: 4, max: 3 });
  set(f, 'held', { x: f.pos.x, y: f.pos.y, gx: f.pos.x, gy: f.pos.y, oy: w.y - f.pos.y, ox: w.x - f.pos.x, spin: 0, max: 0, bonked: false, squeaked: false, fought: false, shook: false, shookSaid: false, flips: 0, lastDir: 0, firstImpact: 0, hits: null, revenge: null });
  held = f; last = [{ x: w.x, y: w.y, at: performance.now() }]; downAt = { x: e.clientX, y: e.clientY, at: performance.now(), f };
  document.body.classList.add('plaza-grab');
  sfx('select');
}
function move(e) {
  if (!K.active()) return;
  if (!held) {
    const over = !e.target.closest('button, a, input, .panel, .mode, .topbar, .col-play, .col-board, .mdock, #modal') && hit(screenToWorld(e.clientX, e.clientY));
    document.body.classList.toggle('plaza-hover', !!over);
    // rubbing a Mind with the mouse pets it
    if (over && free(over) && e.pointerType === 'mouse') {
      const now = performance.now();
      if (rub.f !== over || now - rub.at > 400) rub = { f: over, d: 0, at: now };
      rub.d += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); rub.at = now;
      if (rub.d > 260 && over.toy?.mode !== 'pet') { set(over, 'pet', { x: over.pos.x, y: 0, dur: 1.8, cooed: false }); rub.d = 0; touchedAt = now; }
      else if (over.toy?.mode === 'pet' && rub.d > 60) { over.toy.t = Math.min(over.toy.t, 1); rub.d = 0; }
    }
    return;
  }
  touchedAt = performance.now();
  const w = screenToWorld(e.clientX, e.clientY), T = held.toy;
  if (T.mode === 'pet') return;
  T.gx = w.x - T.ox; T.gy = Math.max(0, w.y - T.oy);
  const p = last[last.length - 1], dx = w.x - p.x;
  last.push({ x: w.x, y: w.y, at: performance.now() }); while (last.length > 6) last.shift();
  if (Math.abs(dx) > 0.12) { const d = Math.sign(dx); if (T.lastDir && d !== T.lastDir) { T.flips = (T.flips || 0) + 1; T.flipAt = performance.now(); } T.lastDir = d; }
  if (T.flips >= 6 && performance.now() - T.flipAt < 400) T.shook = true;   // shaken back and forth
  if (!T.squeaked && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) { T.squeaked = true; say(held, 'grab', 1500); }
}
function up(e) {
  if (!held) return;
  const f = held, T = f.toy, now = performance.now();
  let_go();
  if (T.mode === 'pet') { T.holding = false; T.dur = T.t + 0.6; return; }
  if (T.mode !== 'held') return;
  const still = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10;
  if (still && now - downAt.at < 250) {   // a tap: poke, or a flip on a double tap
    if (lastTap.f === f && now - lastTap.at < 380) {
      lastTap = { f: null, at: 0 };
      const fail = Math.random() < 0.3;
      set(f, 'flip', { y: 0, vy: 9.5, air: 2 * 9.5 / G, fail }); sfx('whoosh');
      return;
    }
    lastTap = { f, at: now };
    f.pokes = (now - (f.pokeAt || 0) < 4000 ? f.pokes || 0 : 0) + 1; f.pokeAt = now;
    Object.assign(T, { mode: 'poked', t: 0, y: 0 });
    if (f.pokes >= 5) { f.grudge = (f.grudge || 0) + 1; K.say(f, '💢 stop poking!', 1500); sfx('roar'); }
    else say(f, 'poke', 1200);
    return;
  }
  const a = last[0], b = last[last.length - 1], dt = Math.max(0.016, (b.at - a.at) / 1000), stale = now - b.at > 120;
  T.vx = stale ? 0 : Math.max(-MAXV, Math.min(MAXV, (b.x - a.x) / dt)); T.vy = stale ? 0 : Math.max(-MAXV, Math.min(MAXV, (b.y - a.y) / dt));
  T.vs = -T.vx * 0.9; T.max = Math.hypot(T.vx, T.vy); T.mode = 'fly'; T.t = 0; T.firstImpact = 0;
  const g = mood(f); f.grudge = g + (T.max > 7 ? 1.4 : 0.6) + (T.shook ? 1 : 0);
  if (T.max > 7) { sfx('whoosh'); say(f, 'throw', 1400); audience(f); }
}
// press and hold still = pet (checked shortly after the press)
function holdCheck() {
  if (!held || !downAt || held.toy?.mode !== 'held') return;
  const T = held.toy;
  if (!T.squeaked && performance.now() - downAt.at > 450) { set(held, 'pet', { x: held.pos.x, y: 0, holding: true, cooed: false }); }
}
// nobody played for a while: someone dozes off
function idleCheck() {
  if (!K.active() || held || performance.now() - touchedAt < 40000) return;
  const awake = all().filter(f => !f.toy);
  if (awake.length && Math.random() < 0.25) { const f = awake[Math.random() * awake.length | 0]; set(f, 'sleep', { x: f.pos.x, y: 0, zzz: 1.5 }); }
}

export function initPlaza(ctx) {
  K = ctx;
  addEventListener('pointerdown', down, { passive: false });
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  addEventListener('touchmove', e => { if (held) e.preventDefault(); }, { passive: false });   // no page scroll while holding a Mind
  setInterval(holdCheck, 100);
  setInterval(idleCheck, 3000);
}
// a new plaza (screen change): let go of everything
export function resetPlaza() { held = null; touchedAt = performance.now(); document.body.classList.remove('plaza-grab', 'plaza-hover'); }
