// MINDS CLASH website: shared top bar and footer, moving pixel clouds, Minds in the hero, scroll reveal,
// and small live "gameplay" demos drawn in code (a duel, an island, an AI deciding, a boss fortress).
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

// ---------- hero: clouds + a squad of random Minds ----------
const clouds = $('.clouds');
if (clouds) for (let i = 0; i < 18; i++) {
  const c = document.createElement('i');
  Object.assign(c.style, { left: `${Math.random() * 100}%`, top: `${Math.random() * 60}%`, animationDuration: `${2 + Math.random() * 3}s`, animationDelay: `${-Math.random() * 5}s`, scale: String(0.4 + Math.random() * 0.6) });
  clouds.append(c);
}
const squad = $('.squad');
if (squad) squad.innerHTML = pick(5).map(id => `<img class="px-img" src="${thumb(id)}" alt="">`).join('');

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

// ---------- 🃏 duel demo: the real rules (cards 1-7, crowns 1-15, higher card wins, ties roll over) ----------
whenSeen($('#duel-demo'), async el => {
  const [a, b] = pick(2);
  el.innerHTML = `<div class="score"><span>YOU<b id="d-me">0</b></span><span style="text-align:right">RIVAL<b id="d-them">0</b></span></div>
    <div class="crown"><b id="d-crown">?</b></div><div class="hint" id="d-hint">NEXT: …</div>
    <div class="table"><div class="side"><div class="pcard" id="d-c1"><div class="f"><div class="a"></div><div class="b"></div></div></div><img class="px-img" src="${thumb(a)}" alt=""><span class="name">Your Mind</span></div>
    <div class="side r"><div class="pcard" id="d-c2"><div class="f"><div class="a"></div><div class="b"></div></div></div><img class="px-img" src="${thumb(b)}" alt=""><span class="name">Rival</span></div></div>
    <div class="say" id="d-say">A new round: 7 crowns, 7 cards each.</div><div class="spell" id="d-spell"></div>`;
  const tier = c => (c <= 5 ? 'LOW' : c <= 10 ? 'MID' : 'HIGH');
  for (;;) {
    const crowns = Array.from({ length: 15 }, (_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, 7), mine = [1, 2, 3, 4, 5, 6, 7], theirs = [1, 2, 3, 4, 5, 6, 7];
    let me = 0, them = 0, pot = 0, trap = true;
    $('#d-me').textContent = '0'; $('#d-them').textContent = '0';
    for (let t = 0; t < 7; t++) {
      const crown = crowns[t]; pot += crown;
      $('#d-crown').textContent = pot; $('#d-hint').textContent = t < 6 ? `NEXT: ${tier(crowns[t + 1])}` : 'LAST CROWN';
      const c1 = $('#d-c1'), c2 = $('#d-c2'); c1.className = c2.className = 'pcard';
      $('#d-say').textContent = `Crown worth ${pot}. Both pick a secret card…`;
      await wait(calm ? 400 : 1400);
      // simple sensible players: big crowns get big cards
      const want = arr => { const s = [...arr].sort((x, y) => x - y), i = Math.min(s.length - 1, Math.round(((pot - 1) / 15) * (s.length - 1) + (Math.random() - 0.5) * 2)); return s[Math.max(0, i)]; };
      const x = want(mine), y = want(theirs);
      mine.splice(mine.indexOf(x), 1); theirs.splice(theirs.indexOf(y), 1);
      $('.b', c1).textContent = x; $('.b', c2).textContent = y;
      c1.classList.add('show'); c2.classList.add('show');
      await wait(calm ? 300 : 700);
      let win = x > y ? 1 : y > x ? 2 : 0;
      if (trap && win === 2 && y === 7) {   // the Trap spell steals a crown won with a 7
        trap = false; const sp = $('#d-spell'); sp.textContent = '🪤 TRAP!'; sp.classList.add('on'); await wait(900); sp.classList.remove('on'); win = 1;
      }
      if (!win) { $('#d-say').textContent = `${x} vs ${y}: a tie! The crown rolls into the next one.`; c1.classList.add('lose'); c2.classList.add('lose'); await wait(calm ? 400 : 1300); continue; }
      (win === 1 ? c1 : c2).classList.add('win'); (win === 1 ? c2 : c1).classList.add('lose');
      if (win === 1) me += pot; else them += pot;
      $('#d-say').textContent = win === 1 ? `${x} beats ${y}: you take ${pot} points!` : `${y} beats ${x}: the rival takes ${pot}.`;
      $('#d-me').textContent = me; $('#d-them').textContent = them; pot = 0;
      await wait(calm ? 500 : 1500);
    }
    $('#d-say').textContent = me === them ? 'Round tied!' : me > them ? `🏆 You win the round ${me}–${them}!` : `The rival wins the round ${them}–${me}. Next round!`;
    await wait(2600);
  }
});

// ---------- 🏝️ island demo: Minds clear, plant, harvest and build ----------
whenSeen($('#isle-demo'), async el => {
  el.innerHTML = '<div class="hud"><span id="i-dust">✨ 1,200</span><span id="i-wood">🪵 40</span><span id="i-gems">💎 5</span></div><div class="land" id="i-land"></div>';
  const land = $('#i-land'), W = 8, H = 5, tiles = [];
  const start = ['🌿', '🌿', '🪨', '🌳', '🌿', '🌳', '🌿', '🪨'];
  for (let k = 0; k < W * H; k++) { const t = document.createElement('div'); t.className = 't'; t.textContent = Math.random() < 0.45 ? start[k % 8] : ''; land.append(t); tiles.push(t); }
  Object.assign(tiles[11], { className: 't b', textContent: '🏰' }); Object.assign(tiles[28], { className: 't b', textContent: '🏠' });
  let dust = 1200, wood = 40;
  const walkers = pick(3).map(id => { const w = document.createElement('img'); w.src = thumb(id); w.className = 'walker px-img'; el.append(w); return w; });
  const at = (w, k) => { const r = tiles[k].getBoundingClientRect(), o = el.getBoundingClientRect(); w.style.left = `${r.left - o.left + r.width / 2 - 22}px`; w.style.top = `${r.top - o.top - 26}px`; };
  const say = (w, txt) => { const b = document.createElement('div'); b.className = 'bub'; b.textContent = txt; b.style.left = w.style.left; b.style.top = w.style.top; el.append(b); setTimeout(() => b.remove(), 1200); };
  walkers.forEach((w, i) => at(w, 9 + i * 8));
  const job = async (w, i) => {
    for (;;) {
      const k = Math.floor(Math.random() * tiles.length), t = tiles[k];
      if (t.classList.contains('b')) continue;
      at(w, k); await wait(1300);
      if (['🌿', '🪨', '🌳'].includes(t.textContent)) { const was = t.textContent; t.textContent = ''; if (was === '🌳') wood += 6; else dust += 15; say(w, was === '🌳' ? '+6 🪵' : '+15 ✨'); }
      else if (!t.textContent && !t.classList.contains('soil')) { t.classList.add('soil'); say(w, 'tilled!'); }
      else if (t.classList.contains('soil') && !t.textContent) { t.innerHTML = '<span class="grow">🌱</span>'; say(w, 'planted'); setTimeout(() => { if (t.textContent === '🌱') t.innerHTML = '<span class="grow">🥕</span>'; }, 4000 + i * 900); }
      else if (t.textContent === '🥕') { t.textContent = ''; dust += 40; say(w, '+40 ✨'); }
      $('#i-dust').textContent = `✨ ${dust.toLocaleString()}`; $('#i-wood').textContent = `🪵 ${wood}`;
      await wait(500 + Math.random() * 600);
    }
  };
  walkers.forEach((w, i) => setTimeout(() => job(w, i), i * 450));
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

// ---------- 🏆 boss fortress embers ----------
const boss = $('.boss');
if (boss) for (let i = 0; i < 22; i++) {
  const e = document.createElement('i'); e.className = 'ember';
  Object.assign(e.style, { left: `${Math.random() * 100}%`, animationDuration: `${4 + Math.random() * 6}s`, animationDelay: `${-Math.random() * 8}s` });
  boss.append(e);
}
