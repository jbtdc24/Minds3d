// Cinematic screen-space light, shared by the island, raid and adventure scenes:
// soft god-rays drifting across, warm key light from the top-left + cool shade bottom-right,
// floating dust / pollen motes in the wind, and a vignette. Drawn after the world, before the HUD text.
let vig = null, grade = null, motes = [];

function cached(W, H) {
  if (!vig || vig.w !== W || vig.h !== H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), r = x.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.32, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(12,8,30,.42)');
    x.fillStyle = r; x.fillRect(0, 0, W, H);
    vig = { cv: c, w: W, h: H };
    const d = document.createElement('canvas'); d.width = W; d.height = H;
    const y = d.getContext('2d'), l = y.createLinearGradient(0, 0, W, H);
    l.addColorStop(0, 'rgba(255,214,140,.16)'); l.addColorStop(0.5, 'rgba(255,255,255,0)'); l.addColorStop(1, 'rgba(60,70,150,.14)');
    y.fillStyle = l; y.fillRect(0, 0, W, H);
    grade = { cv: d };
  }
}
// opts: { night: 0..1, warm: true, motes: 'dust' | 'pollen' | 'none', rays: true }
export function drawCinema(g, W, H, t, dt, opts = {}) {
  const night = opts.night || 0;
  cached(W, H);
  // colour grade: warm light from the sun side, cool shade on the other
  g.globalAlpha = 1 - night * 0.7; g.drawImage(grade.cv, 0, 0); g.globalAlpha = 1;
  // god rays: wide soft beams slowly sweeping, added on top (lighter)
  if (opts.rays !== false && night < 0.6) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 0.27 + t * 0.012 * (1 + i * 0.3)) % 1.4 - 0.2) * W, w2 = W * (0.08 + 0.05 * Math.sin(t * 0.3 + i));
      const a = (0.05 + 0.03 * Math.sin(t * 0.5 + i * 2)) * (1 - night);
      g.save(); g.translate(x, -20); g.rotate(-0.42);
      const lg = g.createLinearGradient(-w2, 0, w2, 0);
      lg.addColorStop(0, 'rgba(255,240,200,0)'); lg.addColorStop(0.5, `rgba(255,240,200,${a})`); lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg; g.fillRect(-w2, 0, w2 * 2, H * 1.6);
      g.restore();
    }
    g.restore();
  }
  // motes: dust / pollen drifting in the wind (fireflies at night)
  const kind = opts.motes || 'pollen';
  if (kind !== 'none') {
    const want = Math.round((W * H) / 26000);
    while (motes.length < want) motes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 1.6, ph: Math.random() * 6.28, v: 6 + Math.random() * 14 });
    motes.length = Math.min(motes.length, want);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.x += (m.v + Math.sin(t * 0.7 + m.ph) * 8) * dt; m.y += (Math.sin(t * 1.3 + m.ph) * 6 - 2) * dt;
      if (m.x > W + 10) m.x = -10; if (m.y < -10) m.y = H + 10; if (m.y > H + 10) m.y = -10;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + m.ph);
      g.fillStyle = night > 0.4 ? `rgba(212,255,120,${0.5 * tw})` : `rgba(255,248,220,${0.28 * tw})`;
      const r = m.s * (night > 0.4 ? 1.6 : 1);
      g.fillRect(m.x, m.y, r, r);
    }
    g.restore();
  }
  g.drawImage(vig.cv, 0, 0, W, H);
}
// a soft drop shadow for a building / big sprite, cast away from the sun (down-right)
export function dropShadow(g, x, y, w, h = 4) {
  g.fillStyle = 'rgba(30,24,50,.22)';
  g.beginPath(); g.ellipse(x + w * 0.12, y, w * 0.55, h, 0, 0, Math.PI * 2); g.fill();
}
