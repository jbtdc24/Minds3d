// 2D stage: one canvas for the lobby and every arena. Painted backdrop anchored to the ground line,
// a light camera (pan / zoom punches / shake), pixel particles, ambient FX per stage and screen flashes.
// World units: x right, y up, 0 = ground under the middle of the stage. ~2.3 units = one Mind's height.

export const STAGES = {
  meadow: { name: 'Sunny Meadow', img: 'assets/stage_meadow.webp', ground: 0.668, ambient: 'leaves', rays: true, tint: '#fff6c8' },
  crystal: { name: 'Crystal Peaks', img: 'assets/stage_crystal.webp', ground: 0.742, ambient: 'snow', rays: true, tint: '#e8f6ff' },
  night: { name: 'Night Market', img: 'assets/stage_night.webp', ground: 0.645, ambient: 'fireflies', rays: false, tint: '#ffd8f2' },
  beach: { name: 'Sunset Beach', img: 'assets/stage_beach.webp', ground: 0.652, ambient: 'sparkle', rays: true, tint: '#ffe0c0' },
  sky: { name: 'Sky Arena', img: 'assets/arena_day.webp', ground: 0.64, ambient: 'sparkle', rays: true, tint: '#fff0c8' },
  moon: { name: 'Moonlit Arena', img: 'assets/arena_night.webp', ground: 0.68, ambient: 'fireflies', rays: false, tint: '#dcd8ff' },
  blossom: { name: 'Blossom Arena', img: 'assets/arena_crystal.webp', ground: 0.69, ambient: 'petals', rays: true, tint: '#ffe8f4' },
  lobby: { name: 'Mind Plaza', img: 'assets/lobby.webp', ground: 0.80, ambient: 'lime', rays: true, tint: '#fff6c8', focusX: 0.035 },
};
export const BATTLE_STAGES = ['meadow', 'crystal', 'night', 'beach', 'sky', 'moon', 'blossom'];

const canvas = document.createElement('canvas');
document.getElementById('view').append(canvas);
const ctx = canvas.getContext('2d');
let W = 1, H = 1, DPR = 1;
const images = {};
const loadImg = src => images[src] ||= Object.assign(new Image(), { src });

export const stage = {
  name: 'lobby', def: STAGES.lobby, groundAt: 0.66, K: 100,
  cam: { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1, k: 4 },
  actors: new Set(), quality: 'high',
};
export function setStage(name) {
  stage.name = name; stage.def = STAGES[name] || STAGES.meadow;
  loadImg(stage.def.img);
  particles.length = 0;
}
export function setLayout({ groundAt }) { stage.groundAt = groundAt; resize(); }
export function setQuality(q) { stage.quality = q; resize(); }
export const preload = names => names.forEach(n => loadImg(STAGES[n].img));

export function resize() {
  DPR = Math.min(devicePixelRatio || 1, stage.quality === 'low' ? 1 : 2);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  // a Mind is ~27% of the screen height, but two of them always fit side by side on narrow phones
  stage.K = Math.min(0.27 * H / 2.3, W / 6.6);
}
addEventListener('resize', resize);

// ---------- camera ----------
export function camTo(x = 0, zoom = 1, y = 0, k = 4) { Object.assign(stage.cam, { tx: x, tzoom: zoom, ty: y, k }); }
export function camSnap(x = 0, zoom = 1, y = 0) { Object.assign(stage.cam, { x, zoom, y, tx: x, tzoom: zoom, ty: y }); }
let shakeAmt = 0, slowUntil = 0, flashA = 0, flashC = '#fff';
export let timeScale = 1;
export const shake = a => { shakeAmt = Math.max(shakeAmt, a); };
export function slowmo(s, scale = 0.3) { slowUntil = performance.now() + s * 1000; timeScale = scale; }
export function flash(a = 0.6, color = '#fff') { flashA = a; flashC = color; }
const S = () => stage.K * stage.cam.zoom;
const gyScreen = () => H * stage.groundAt;
export function toScreen(x, y) {
  const s = S();
  return { x: W / 2 + (x - stage.cam.x) * s, y: gyScreen() - (y - stage.cam.y) * s };
}

// ---------- particles (world space) ----------
const particles = [];
export function spawn(p) {
  if (particles.length > 900) particles.shift();
  particles.push({ vx: 0, vy: 0, g: 0, life: 1, size: 0.05, glow: false, drag: 0, bounce: false, spin: 0, ...p, max: p.life || 1 });
}
const R = (a, b) => a + Math.random() * (b - a);
export function burst(x, y, colors, n = 20, power = 1, glow = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = R(1, 4) * power;
    spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1.5 * power, g: 9, life: R(0.5, 1.1), size: R(0.04, 0.09), color: colors[(Math.random() * colors.length) | 0], glow, bounce: true });
  }
}
export function rise(x, y, color, n = 20, spread = 0.6) {
  for (let i = 0; i < n; i++) spawn({ x: x + R(-spread, spread) / 2, y: y + R(0, 0.4), vy: R(0.8, 2), life: R(0.6, 1.3), size: R(0.03, 0.07), color, glow: true });
}
export function ring(x, y, color, n = 32, r = 0.9) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    spawn({ x, y, vx: Math.cos(a) * r * 3, vy: Math.sin(a) * r * 3, drag: 4, life: 0.7, size: 0.05, color, glow: true });
  }
}
export function stars(x, y, n = 12) {
  for (let i = 0; i < n; i++) spawn({ x, y, vx: R(-2.5, 2.5), vy: R(1, 4.5), g: 6, life: R(0.8, 1.4), size: R(0.06, 0.11), color: ['#ffe14a', '#ffffff', '#d4ff1f'][i % 3], glow: true, star: true, spin: R(-8, 8) });
}

// ambient FX spawned around the visible area
function ambient(dt) {
  const a = stage.def.ambient, s = S(), halfW = W / 2 / s, top = gyScreen() / s;
  const rate = { leaves: 5, petals: 7, snow: 16, fireflies: 6, sparkle: 7, lime: 6 }[a] || 0;
  stage.acc = (stage.acc || 0) + dt * rate * (stage.quality === 'low' ? 0.4 : 1);
  while (stage.acc > 1) {
    stage.acc--;
    const x = stage.cam.x + R(-halfW, halfW);
    if (a === 'leaves') spawn({ x: stage.cam.x - halfW - 0.2, y: R(0.5, top), vx: R(0.8, 1.6), vy: R(-0.3, 0.1), life: 8, size: R(0.05, 0.08), color: ['#ff9ec4', '#ffffff', '#b8f07a', '#ffe28a'][(Math.random() * 4) | 0], spin: R(-4, 4), sway: R(1, 2.5), leaf: true });
    else if (a === 'petals') spawn({ x: stage.cam.x - halfW - 0.2, y: R(0.8, top), vx: R(0.6, 1.3), vy: R(-0.45, -0.1), life: 9, size: R(0.05, 0.08), color: ['#ffb3d1', '#ff8fbd', '#ffe3ef', '#c9f7d8'][(Math.random() * 4) | 0], spin: R(-5, 5), sway: R(1.5, 3), leaf: true });
    else if (a === 'snow') spawn({ x, y: top + 0.2, vx: R(-0.2, 0.2), vy: R(-0.7, -0.35), life: 9, size: R(0.03, 0.06), color: '#ffffff', sway: R(0.5, 1.5) });
    else if (a === 'fireflies') spawn({ x, y: R(0.2, top * 0.8), vx: R(-0.2, 0.2), vy: R(-0.1, 0.25), life: R(3, 6), size: R(0.03, 0.05), color: Math.random() < 0.5 ? '#d4ff1f' : '#ffd36b', glow: true, twinkle: true, sway: R(0.5, 1.2) });
    else if (a === 'sparkle') spawn({ x, y: R(top * 0.25, top * 0.6), life: R(0.6, 1.2), size: R(0.03, 0.06), color: '#ffffff', glow: true, star: true });
    else if (a === 'lime') spawn({ x, y: R(0, top * 0.7), vy: R(0.2, 0.6), life: R(2, 4), size: R(0.03, 0.06), color: Math.random() < 0.6 ? '#d4ff1f' : '#ffffff', glow: true, twinkle: true, star: Math.random() < 0.3 });
  }
}

// ---------- loop ----------
const hooks = new Set();
export const onFrame = fn => { hooks.add(fn); return () => hooks.delete(fn); };
export let speedSetting = 1;
export const setSpeed = s => { speedSetting = s; };
let last = performance.now(), simTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (performance.now() > slowUntil) timeScale += (1 - timeScale) * 0.15;
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = raw * timeScale * speedSetting;
  simTime += dt;
  for (const h of hooks) h(dt, simTime, raw);
  const c = stage.cam, k = 1 - Math.exp(-c.k * raw);
  c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.zoom += (c.tzoom - c.zoom) * k;
  ambient(dt);
  draw(dt, simTime);
}

function draw(dt, t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  let ox = 0, oy = 0;
  if (shakeAmt > 0.2) { ox = R(-1, 1) * shakeAmt; oy = R(-1, 1) * shakeAmt; shakeAmt *= Math.pow(0.02, dt); } else shakeAmt = 0;
  ctx.translate(ox, oy);
  // backdrop: image ground line on world y = 0, a little parallax with the camera
  const img = images[stage.def.img], s = S(), gy = gyScreen() + stage.cam.y * s;
  ctx.fillStyle = '#9fdcff'; ctx.fillRect(-20, -20, W + 40, H + 40);
  if (img?.complete && img.naturalWidth) {
    const iw = img.naturalWidth, ih = img.naturalHeight, gf = stage.def.ground;
    // cover the width and everything above the ground; if the image ends above the screen bottom
    // (tall phone screens), continue it with a mirrored copy instead of zooming in a lot
    const sc = Math.max(W / iw, gy / (gf * ih)) * 1.06 * (0.86 + 0.14 * stage.cam.zoom);
    const fx = (stage.def.focusX || 0) * iw * sc;
    const x = W / 2 - iw * sc / 2 - fx - stage.cam.x * s * 0.35, y = gy - gf * ih * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, iw * sc, ih * sc);
    if (y + ih * sc < H) {
      ctx.save(); ctx.translate(0, 2 * (y + ih * sc)); ctx.scale(1, -1);
      ctx.drawImage(img, x, y, iw * sc, ih * sc);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = false;
  }
  // soft god rays
  if (stage.def.rays && stage.quality !== 'low') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = 0.05 + 0.03 * Math.sin(t * 0.5 + i * 2), x0 = W * (0.15 + i * 0.3) + Math.sin(t * 0.2 + i) * 40;
      const g = ctx.createLinearGradient(x0, 0, x0 - W * 0.15, H * 0.8);
      g.addColorStop(0, `rgba(255,250,220,${a})`); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - 30, -10); ctx.lineTo(x0 + 50, -10); ctx.lineTo(x0 - W * 0.12, H * 0.85); ctx.lineTo(x0 - W * 0.3, H * 0.85); ctx.fill();
    }
    ctx.restore();
  }
  // world
  ctx.save();
  ctx.translate(W / 2, gy); ctx.scale(s, s); ctx.translate(-stage.cam.x, 0);
  const actors = [...stage.actors].sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const a of actors) a.drawShadow?.(ctx);
  for (const a of actors) a.draw(ctx, t);
  drawParticles(dt, t, s);
  ctx.restore();
  // vignette + flash
  if (stage.quality !== 'low') {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(29,27,47,0)'); v.addColorStop(1, 'rgba(29,27,47,.28)');
    ctx.fillStyle = v; ctx.fillRect(-20, -20, W + 40, H + 40);
  }
  if (flashA > 0.01) { ctx.globalAlpha = flashA; ctx.fillStyle = flashC; ctx.fillRect(-20, -20, W + 40, H + 40); ctx.globalAlpha = 1; flashA *= Math.pow(0.002, dt); }
}
function drawParticles(dt, t, s) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy -= p.g * dt;
    if (p.drag) { p.vx *= 1 - Math.min(1, p.drag * dt); p.vy *= 1 - Math.min(1, p.drag * dt); }
    p.x += p.vx * dt + (p.sway ? Math.sin(t * p.sway + p.max * 7) * 0.4 * dt : 0); p.y += p.vy * dt;
    if (p.bounce && p.y < 0) { p.y = 0; p.vy *= -0.4; p.vx *= 0.7; }
  }
  for (const glow of [false, true]) {
    if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; }
    for (const p of particles) {
      if (p.glow !== glow) continue;
      const k = Math.min(1, p.life / 0.3, (p.max - p.life) / 0.08 + 0.3);
      let a = k;
      if (p.twinkle) a *= 0.5 + 0.5 * Math.sin(t * 6 + p.max * 13);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      const z = p.size * (p.star ? 1 : k), px = 1 / s;
      const x = Math.round(p.x / px) * px, y = Math.round(-p.y / px) * px;
      if (p.star) { ctx.fillRect(x - z, y - z / 3, z * 2, z * 2 / 3); ctx.fillRect(x - z / 3, y - z, z * 2 / 3, z * 2); }
      else if (p.leaf) { ctx.save(); ctx.translate(x, y); ctx.rotate(t * p.spin); ctx.fillRect(-z, -z / 2, z * 2, z); ctx.restore(); }
      else ctx.fillRect(x - z / 2, y - z / 2, z, z);
    }
    if (glow) ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// floating text (DOM, sharper than canvas text)
export function popText(text, x, y, cls = '') {
  const p = toScreen(x, y), el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  document.getElementById('pops').append(el);
  setTimeout(() => el.remove(), 1300);
}

resize();
requestAnimationFrame(frame);
