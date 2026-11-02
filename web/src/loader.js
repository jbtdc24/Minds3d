// The loading screen for anything that waits on the server (raids, adventures…): your airship flies through pixel
// clouds while tips rotate. If the wait gets long (many players online) it says so, so the game never looks frozen.
import { shipSprite } from './island/worldmap.js';

const BW = 200, BH = 112;   // pixel buffer, scaled up
let L = null;
const skyImg = new Image(); skyImg.src = 'assets/sky_adventure.webp';
const box = () => {
  let el = document.getElementById('loader');
  if (el) return el;
  el = document.createElement('div'); el.id = 'loader';
  el.innerHTML = '<canvas width="200" height="112"></canvas><div class="ld-card px"><b class="ld-title"></b><span class="ld-sub"></span><div class="ld-bar"><i></i></div><p class="ld-tip"></p></div>';
  document.body.append(el);
  return el;
};
function frame(t) {
  if (!L) return;
  L.raf = requestAnimationFrame(frame);
  const g = L.g, s = (t - L.t0) / 1000;
  if (skyImg.complete && skyImg.naturalWidth) {   // the painted sky, slowly sliding (falls back to a gradient)
    const w = BH * skyImg.naturalWidth / skyImg.naturalHeight * 1.1, x = -((s * 4) % (w - BW));
    g.drawImage(skyImg, x, 0, w, BH);
  } else {
    const sky = g.createLinearGradient(0, 0, 0, BH);
    sky.addColorStop(0, '#2b3f8f'); sky.addColorStop(0.6, '#6aa8e8'); sky.addColorStop(1, '#bfe6ff');
    g.fillStyle = sky; g.fillRect(0, 0, BW, BH);
  }
  for (const c of L.clouds) {   // three layers of blocky clouds, the near ones faster and brighter
    const x = ((c.x - s * c.v) % (BW + 80) + BW + 80) % (BW + 80) - 40;
    g.fillStyle = c.shade; for (const [dx, dy, r] of c.puffs) g.fillRect(Math.round(x + dx - r), Math.round(c.y + dy - r / 2), r * 2, r);
    g.fillStyle = c.light; for (const [dx, dy, r] of c.puffs) g.fillRect(Math.round(x + dx - r + 1), Math.round(c.y + dy - r / 2), r * 2 - 2, 2);
  }
  g.fillStyle = 'rgba(255,255,255,.7)';   // wind lines
  for (let i = 0; i < 6; i++) { const y = (i * 19 + 7) % BH, x = BW - ((s * 90 + i * 53) % (BW + 30)); g.fillRect(Math.round(x), y, 10 + (i % 3) * 4, 1); }
  const spr = L.ship, bob = Math.round(Math.sin(s * 3) * 2);
  g.drawImage(spr.cv, Math.round(BW / 2 - spr.w / 2), Math.round(BH * 0.36 - spr.h / 2) + bob);
  if (Math.floor(s * 8) % 2) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(BW / 2 - spr.w / 2) - 4, Math.round(BH * 0.36) + 4 + bob, 3, 2); }   // engine puff
}
// show it; returns done() to hide it. Shows at least minMs so it never just flickers.
export function loading({ title = 'Loading', sub = '', tips = [], tier = 1, minMs = 900 } = {}) {
  stopNow();
  const el = box(), cv = el.querySelector('canvas'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const r = (i => () => (i = (i * 16807) % 2147483647) / 2147483647)(Date.now() % 2147483646 + 1);
  const clouds = [0, 1, 2].flatMap(layer => Array.from({ length: 4 }, () => ({
    x: r() * (BW + 80), y: 10 + r() * (BH - 20), v: 8 + layer * 14, shade: ['#c98aa6', '#efb6c0', '#ffd9d6'][layer], light: '#fff3ec',
    puffs: Array.from({ length: 3 }, () => [(r() - 0.5) * 24, (r() - 0.5) * 4, 4 + layer * 2 + Math.round(r() * 4)]),
  })));
  L = { g, t0: performance.now(), clouds, ship: shipSprite(Math.max(0, Math.min(3, tier))), shown: Date.now() };
  el.querySelector('.ld-title').textContent = title;
  el.querySelector('.ld-sub').textContent = sub;
  const tip = el.querySelector('.ld-tip');
  let n = 0;
  const showTip = () => { if (tips.length) tip.textContent = '💡 ' + tips[n++ % tips.length]; };
  showTip();
  L.timers = [setInterval(showTip, 3200),
    setTimeout(() => { el.querySelector('.ld-sub').textContent = 'Lots of players online right now. Still on it…'; }, 6000),
    setTimeout(() => { el.querySelector('.ld-sub').textContent = 'Taking longer than usual. Hang tight, it will get there.'; }, 15000)];
  el.classList.add('on');
  L.raf = requestAnimationFrame(frame);
  const mine = L;
  return () => new Promise(res => setTimeout(() => { if (L === mine) stopNow(); res(); }, Math.max(0, minMs - (Date.now() - mine.shown))));
}
function stopNow() {
  if (!L) return;
  cancelAnimationFrame(L.raf); L.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
  L = null; document.getElementById('loader')?.classList.remove('on');
}
