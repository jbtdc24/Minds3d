// MINDS CLASH website: shared top bar and footer, moving pixel clouds, Minds in the hero, scroll reveal,
// filmed gameplay clips, a Mind to play with in the hero, and a chat of what the game asks your AI.
const $ = (s, el = document) => el.querySelector(s);
const PLAY = '/';   // the game
const PAGES = [['/home', 'Home'], ['/arena', 'Ranked Arena'], ['/island', 'Mind Island'], ['/ai', 'AI Minds'], ['/cup', 'Siege Cup']];
const here = location.pathname.replace(/\/(index\.html)?$/, '') || '/home';
const thumb = id => `/data/thumbs/${id}.webp`;
const pick = n => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 3333));
const wait = ms => new Promise(r => setTimeout(r, ms));
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- top bar + footer ----------
document.body.insertAdjacentHTML('afterbegin', `<header class="nav"><div class="wrap">
  <a class="logo" href="/home"><img src="/assets/crown.png" alt="">MINDS <b>CLASH</b></a>
  <button class="menu" aria-label="Menu">☰</button>
  <nav>${PAGES.map(([h, n]) => `<a href="${h}" class="${here === h ? 'on' : ''}">${n}</a>`).join('')}<a class="btn small" href="${PLAY}">▶ Play now</a></nav>
</div></header>`);
$('.menu').addEventListener('click', () => $('.nav').classList.toggle('open'));
document.body.insertAdjacentHTML('beforeend', `<footer><div class="wrap">
  <div><b style="color:#fff">MINDS CLASH</b> · a minds.games game, powered by Animoca Brands</div>
  <nav>${PAGES.map(([h, n]) => `<a href="${h}">${n}</a>`).join('')}<a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a></nav>
</div></footer>`);

// ---------- hero: sparkles + a Mind to play with ----------
const clouds = $('.clouds');
if (clouds) for (let i = 0; i < 10; i++) {
  const c = document.createElement('i');
  Object.assign(c.style, { left: `${Math.random() * 100}%`, top: `${Math.random() * 60}%`, animationDuration: `${2 + Math.random() * 3}s`, animationDelay: `${-Math.random() * 5}s`, scale: String(0.4 + Math.random() * 0.6) });
  clouds.append(c);
}
// 🧠 a Mind to play with in the hero: it leans toward the pointer, hops and talks when tapped, 🎲 swaps it for another
const pal = $('#pal');
if (pal) {
  const LINES = ['Crown 15? I am saving my 7.', 'Reverse spell incoming…', 'Our island needs more carrots.', 'Raid time! Brawlers first.', 'Did you see that Trap? Mine.', 'I play while you sleep.', 'Town Hall 10 or bust.', 'Tap me again, I dare you.', 'Archers behind the giants. Trust me.', 'Siege Cup today. Three stars.'];
  let mind = pick(1)[0], said = -1;
  const img = $('img', pal), tag = $('.pal-tag', pal), bub = $('.pal-say', pal);
  const set = id => { mind = id; img.src = thumb(id); tag.textContent = `Mind #${id}`; };
  const say = t => { bub.textContent = t; bub.classList.remove('on'); void bub.offsetWidth; bub.classList.add('on'); };
  set(mind);
  setTimeout(() => say('Hi! Tap me.'), 1600);
  pal.addEventListener('pointermove', e => { const r = pal.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5; img.style.setProperty('--lean', `${x * 14}deg`); });
  pal.addEventListener('pointerleave', () => img.style.setProperty('--lean', '0deg'));
  img.addEventListener('click', () => {
    img.classList.remove('hop'); void img.offsetWidth; img.classList.add('hop');
    said = (said + 1 + Math.floor(Math.random() * (LINES.length - 1))) % LINES.length; say(LINES[said]);
    for (let i = 0; i < 10; i++) { const p = document.createElement('i'); p.className = 'pal-px'; p.style.setProperty('--a', `${i * 36}deg`); p.style.background = i % 2 ? '#c6f432' : '#ffc93c'; pal.append(p); setTimeout(() => p.remove(), 700); }
  });
  $('.pal-dice', pal).addEventListener('click', () => { pal.classList.add('swap'); setTimeout(() => { set(pick(1)[0]); pal.classList.remove('swap'); say('New Mind, who dis?'); }, 280); });
}

// ---------- scroll reveal ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 }) : null;
document.querySelectorAll('.reveal').forEach(el => (io ? io.observe(el) : el.classList.add('in')));
// a demo only runs while it is on screen
const whenSeen = (el, fn) => {
  if (!el) return;
  let on = false;
  const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting && !on) { on = true; fn(el, () => e.target.isConnected); } });
  ob.observe(el);
};

// ---------- ⚔️ Minds parade ----------
document.querySelectorAll('.parade .row').forEach(row => {
  const ids = pick(18);
  row.innerHTML = [...ids, ...ids].map(id => `<img src="${thumb(id)}" alt="" loading="lazy">`).join('');
});

// ---------- 🧠 AI demo: what the game asks your AI and what it answers (the real question format) ----------
whenSeen($('#ai-demo'), async el => {
  const [id] = pick(1), name = `Clash-${id}`;
  el.innerHTML = `<div class="head"><img class="px-img" src="${thumb(id)}" alt=""><div><b>${name}</b><small>your own AI on Hello Minds · plays Mind #${id}</small></div><span class="badge" style="margin-left:auto">🔍 verified</span></div><div id="ai-log" style="display:grid;gap:10px"></div>`;
  const log = $('#ai-log', el);
  const script = [
    ['game', 'RAID JOB. Pick the army to send from your troops (brawler 12, archer 8, giant 2).\nReply "ARMY: …" and a WHY line.'],
    ['ai', 'ARMY: brawler 8, archer 6, giant 2\nWHY: giants soak the tower while archers clear the farms.'],
    ['act', '⚔️ raided Mossy Hollow: ★★☆ · +860 ✨'],
    ['game', 'DUEL TURN. Crown 13 is up (next: LOW). Your cards: 2, 5, 6, 7. Spells: Double.'],
    ['ai', 'CARD: 7 SPELL: double\nWHY: 13 is the biggest crown left, so I go all in.'],
    ['act', '🃏 won crown 13 ×2: +26 points'],
    ['game', 'Nothing more to raid today: on to the next job of your plan → 🧭 Adventure.'],
    ['ai', 'SPOT: 2 POTIONS: 2\nWHY: Bandit Perch drops stone, and we need stone for the Town Hall.'],
    ['act', '🧭 Bandit Perch: +126 ✨, +15 stone'],
  ];
  for (;;) {
    log.innerHTML = '';
    for (const [who, text] of script) {
      if (who === 'ai') { const t = document.createElement('div'); t.className = 'msg ai typing'; t.textContent = `${name} is thinking`; log.append(t); await wait(calm ? 300 : 1600); t.remove(); }
      const m = document.createElement('div'); m.className = `msg ${who}`; m.textContent = text; log.append(m);
      while (log.children.length > 6) log.firstChild.remove();
      await wait(calm ? 400 : who === 'act' ? 1500 : 1100);
    }
    await wait(2500);
  }
});

// ---------- v2 effects ----------
// the page appears through a grid of dissolving pixels
if (!calm) {
  const cols = Math.ceil(innerWidth / 48), rows = Math.ceil(innerHeight / 48), g = document.createElement('div');
  g.id = 'pxin'; g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`; g.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  const cells = Array.from({ length: cols * rows }, () => document.createElement('i'));
  g.append(...cells); document.body.append(g);
  cells.forEach((c, i) => { const x = i % cols, y = (i / cols) | 0; setTimeout(() => c.classList.add('go'), 60 + (x + y) * 18 + Math.random() * 160); });
  setTimeout(() => g.remove(), 1600 + (cols + rows) * 18);
}
// the top bar turns solid once you scroll
addEventListener('scroll', () => $('.nav')?.classList.toggle('solid', scrollY > 40), { passive: true });
// staggered reveals
document.querySelectorAll('.stagger').forEach(el => (io ? io.observe(el) : el.classList.add('in')));
// typewriter lines under the logo
const typer = $('.typer');
if (typer) (async () => {
  const lines = JSON.parse(typer.dataset.lines || '[]');
  for (let i = 0; ; i = (i + 1) % lines.length) {
    for (let n = 1; n <= lines[i].length; n++) { typer.textContent = lines[i].slice(0, n); await wait(calm ? 0 : 45); }
    await wait(1800);
    for (let n = lines[i].length; n >= 0; n--) { typer.textContent = lines[i].slice(0, n); await wait(calm ? 0 : 18); }
    await wait(250);
  }
})();
// pixel embers rising through the hero (square sparks, gold and lime)
const fx = $('#fx');
if (fx && !calm) {
  const g = fx.getContext('2d'), P = [];
  const size = () => { fx.width = fx.clientWidth; fx.height = fx.clientHeight; };
  size(); addEventListener('resize', size);
  for (let i = 0; i < 40; i++) P.push({ x: Math.random(), y: Math.random(), v: 0.0006 + Math.random() * 0.0016, s: [3, 4, 6][i % 3], c: ['#ffc93c', '#c6f432', '#fff3c4', '#9b6bff'][i % 4], p: Math.random() * 6 });
  let mx = 0.5;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth; }, { passive: true });
  let seen = true; new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) requestAnimationFrame(tick); }).observe(fx);
  const tick = t => {
    if (!seen) return;
    g.clearRect(0, 0, fx.width, fx.height);
    for (const p of P) {
      p.y -= p.v; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      const x = (p.x + Math.sin(t / 1400 + p.p) * 0.01 + (mx - 0.5) * 0.02 * p.s) * fx.width, y = p.y * fx.height;
      g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 600 + p.p)); g.fillStyle = p.c;
      g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, p.s, p.s);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// videos load and play only when on screen (saves data on phones)
const vio = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (v.dataset.src && !v.src) v.src = v.dataset.src; if (v.dataset.auto !== 'hover') v.play().catch(() => {}); } else v.pause(); }), { rootMargin: '200px' });
document.querySelectorAll('video[data-src], video.bgvid').forEach(v => vio.observe(v));
// scroll story: the chapter in the middle of the screen picks the video in the sticky frame
const chapters = [...document.querySelectorAll('.chapter')];
if (chapters.length) {
  const v = $('.frame .vids video'), dots = [...document.querySelectorAll('.frame .dots i')], label = $('.frame .label'), wipe = $('.frame .wipe');
  let cur = -1;
  const pickCh = i => {
    if (i === cur) return; cur = i;
    chapters.forEach((c, k) => c.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i));
    if (label) label.textContent = chapters[i].dataset.label || 'LIVE';
    if (!v || !chapters[i].dataset.clip) return;
    wipe?.classList.remove('go'); void wipe?.offsetWidth; wipe?.classList.add('go');
    setTimeout(() => { v.src = chapters[i].dataset.clip; v.poster = chapters[i].dataset.clip.replace('.mp4', '.jpg'); v.play().catch(() => {}); }, 220);
  };
  const cio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) pickCh(chapters.indexOf(e.target)); }), { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach(c => cio.observe(c)); pickCh(0);
}
// cards tilt toward the pointer, with a gloss that follows it; a card's video plays while hovered
document.querySelectorAll('.tilt').forEach(c => {
  c.insertAdjacentHTML('beforeend', '<span class="gloss"></span>');
  const v = $('video', c);
  c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.transform = `perspective(800px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 8}deg) translateY(-4px)`; c.style.setProperty('--gx', `${x * 100}%`); c.style.setProperty('--gy', `${y * 100}%`); });
  c.addEventListener('pointerenter', () => { if (v) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } });
  c.addEventListener('pointerleave', () => { c.style.transform = ''; v?.pause(); });
});
// the trailer, full size with controls
document.querySelectorAll('[data-reel]').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  let m = $('.reel');
  if (!m) { document.body.insertAdjacentHTML('beforeend', `<div class="reel"><video controls playsinline loop src="${b.dataset.reel}"></video><button class="btn small x">✕ Close</button></div>`); m = $('.reel'); m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('.x')) { m.classList.remove('on'); $('video', m).pause(); } }); }
  m.classList.add('on'); $('video', m).currentTime = 0; $('video', m).play().catch(() => {});
}));
// pixel sparkles behind the pointer (mouse only)
if (!calm && matchMedia('(pointer: fine)').matches) {
  let last = 0;
  addEventListener('pointermove', e => {
    if (e.timeStamp - last < 40) return; last = e.timeStamp;
    const s = document.createElement('i'); s.className = 'spark';
    Object.assign(s.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, background: Math.random() < 0.5 ? '#ffc93c' : '#c6f432' });
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}px`); s.style.setProperty('--dy', `${10 + Math.random() * 20}px`);
    document.body.append(s); setTimeout(() => s.remove(), 700);
  }, { passive: true });
}

