// Mindclash client: screens, sign-in, matchmaking, the Prize Duel table (cards, crowns, spells, reveal), leaderboard, profile.
import * as THREE from 'three';
import { loadData, tokenIds, rarityOf } from './nft.js';
import { camTo, camSnap, shake, slowmo, flash, burst, rise, ring, popText, onFrame, setQuality, setSpeed, speedSetting } from './render.js';
import { buildEnv, envUpdate } from './env.js';
import { Fighter, shoot } from './fighter.js';
import { SPELLS, SPELL_INFO, RULES, CARD_VALUES } from './duel/engine.js';
import { api, session, walletLogin, guestLogin, logout, hasWallet, watch, serverOnline, LocalMatch, setTokenIds } from './net.js';
import { initAudio, sfx, music, setVolume } from './audio.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms / speedSetting));
const thumb = id => id ? `data/thumbs/${id}.webp` : 'data/thumbs/1.webp';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RAR_COLOR = { Legendary: '#d68a00', Epic: '#9b6bff', Rare: '#2f8fd0', Uncommon: '#3a9a00', Common: '#6d6987' };
const CARD_COLOR = { 1: '#7fd6ff', 2: '#5ee08a', 3: '#c3f03a', 4: '#ffe14a', 5: '#ffb03d', 6: '#ff7a5c', 7: '#ff5fc8' };
const spellImg = k => `assets/spell_${k}.png`;
const TURN_SECONDS = 20;
const THEMES = ['meadow', 'neon', 'frost'];

// ---------- settings (per device) ----------
const SKEY = 'mindclash.settings';
const settings = { music: 0.45, sfx: 0.8, view: '3d', quality: 'high', speed: 1, picks: {} };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch { /* defaults */ }
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* private mode */ } };
function applySettings() {
  setVolume(settings.music, settings.sfx); setQuality(settings.quality); setSpeed(settings.speed);
  $('#set-music').value = settings.music; $('#set-sfx').value = settings.sfx;
  for (const [id, key] of [['set-view', 'view'], ['set-quality', 'quality'], ['set-speed', 'speed']])
    $$(`#${id} button`).forEach(b => b.classList.toggle('on', String(settings[key]) === b.dataset.v));
}

// ---------- ui helpers ----------
let current = 'boot', previous = 'hub';
function show(id) {
  if (!['settings', 'codex'].includes(id)) previous = current;
  current = id;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + id));
  if (['hub', 'prep', 'leaderboard', 'profile', 'login'].includes(id)) music('menu');
}
let toastT;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
function modal(html, buttons) {
  return new Promise(res => {
    $('#modal-body').innerHTML = html;
    const box = $('#modal-btns'); box.innerHTML = '';
    buttons.forEach(([label, value, cls]) => { const b = el('button', `btn ${cls || ''}`, label); b.onclick = () => { $('#modal').classList.remove('on'); res(value); }; box.append(b); });
    $('#modal').classList.add('on');
  });
}
function banner(html, ms = 1000) {
  const b = $('#banner'); b.innerHTML = html; b.classList.add('on');
  return wait(ms).then(() => { b.classList.remove('on'); return wait(180); });
}
// spell tooltips (hover on desktop, long-press on touch)
function tipFor(node, k) {
  const s = SPELL_INFO[k];
  const showTip = () => {
    const t = $('#tip'); t.innerHTML = `<b>${s.name}</b>${s.desc}<br><span class="muted">Use: ${s.limit}. Revealed after the cards.</span>`;
    const r = node.getBoundingClientRect();
    t.style.left = `${Math.min(innerWidth - 300, Math.max(8, r.left))}px`; t.style.top = `${Math.max(8, r.top - 100)}px`; t.classList.add('on');
  };
  node.addEventListener('mouseenter', showTip);
  node.addEventListener('mouseleave', () => $('#tip').classList.remove('on'));
  let lp; node.addEventListener('touchstart', () => { lp = setTimeout(showTip, 380); }, { passive: true });
  node.addEventListener('touchend', () => { clearTimeout(lp); setTimeout(() => $('#tip').classList.remove('on'), 1400); });
}

// ---------- the 3D stage ----------
let stage = [];
const clearStage = () => { stage.forEach(f => f.dispose()); stage = []; };
let orbit = false;
function showcase(ids, theme = 'meadow') {
  clearStage(); buildEnv(theme);
  ids.slice(0, 3).forEach((id, i, a) => {
    const f = new Fighter({ id }, new THREE.Vector3((i - (a.length - 1) / 2) * 1.9, 0, i % 2 ? -0.4 : 0.2), 0, settings.view);
    f.face = 0; f.dropIn(0.2 + i * 0.15); stage.push(f);
  });
  orbit = true;
}
const fitDist = half => { const asp = innerWidth / Math.max(1, innerHeight); const d = half / (Math.tan(THREE.MathUtils.degToRad(asp < 0.8 ? 50 : 36) / 2) * asp); return Number.isFinite(d) && d > 0 ? d : 12; };
onFrame((dt, t) => {
  envUpdate(dt, t);
  if (orbit) {
    const a = Math.sin(t * 0.15) * 0.4, wide = current === 'hub' && innerWidth > 820, r = Math.max(wide ? 10 : 8, fitDist(3.8)), side = wide ? 3 : 0;
    camTo(new THREE.Vector3(Math.sin(a) * r - side, 2.4, Math.cos(a) * r), new THREE.Vector3(-side * 0.8, 1.0, 0), 0.03);
  }
});

// ---------- account ----------
let me = null, myMinds = [], guest = false, online = false;
async function refreshMe() {
  const r = await api('me');
  me = r.player; myMinds = r.minds; guest = r.guest;
  return r;
}
const picked = () => { const p = (settings.picks.minds || []).filter(id => myMinds.includes(id)); return p.length ? p : myMinds.slice(0, 3); };
function paintHub() {
  $('#hub-pfp').src = thumb(me.pfp); $('#hub-name').textContent = me.name;
  $('#hub-sub').textContent = guest ? 'Trial account' : `Rating ${me.rating} · ${me.points} pts · ${me.wins}W ${me.losses}L`;
  $('#guest-note').style.display = guest ? 'block' : 'none';
  $('#hub-ranked-sub').textContent = guest ? 'vs other trial players · bot after 20 s' : '1v1 vs real players · bot after 20 s';
  $('#hub-ranked-minds').innerHTML = picked().map(id => `<img src="${thumb(id)}" alt="">`).join('');
}
async function enterHub() {
  paintHub();
  const p = picked();
  showcase(p.length ? p : [me.pfp || 1]);
  show('hub');
}
async function afterLogin(out) {
  me = out.player; myMinds = out.minds; guest = !!out.guest;
  if (!guest && !myMinds.length) {
    await modal(`<h3>No Minds found</h3><p class="muted">This wallet doesn't hold any minds.games NFTs on Robinhood Chain yet. You can still try the game with demo Minds.</p>`, [['Try with demo Minds', 1, 'primary']]);
    logout(); return startGuest();
  }
  if (out.isNew) return openSetup();
  enterHub();
}
async function startGuest() {
  try { afterLogin(await guestLogin()); }
  catch (e) { toast(e.message, true); }
}
$('#btn-wallet').onclick = async () => {
  initAudio();
  if (!hasWallet()) {
    await modal(`<h3>No wallet found</h3><p class="muted">Open this page inside your wallet app's browser (MetaMask, Rabby, Coinbase Wallet), or install a wallet extension on desktop.</p>`, [['OK', 1, 'primary']]);
    return;
  }
  const b = $('#btn-wallet'); b.disabled = true; b.textContent = 'Check your wallet…';
  try { await afterLogin(await walletLogin()); }
  catch (e) { toast(e.code === 4001 ? 'Signature cancelled.' : e.message, true); }
  finally { b.disabled = false; b.textContent = 'Connect wallet'; }
};
$('#btn-guest').onclick = () => { initAudio(); online ? startGuest() : offlineGuest(); };
$('#guest-connect').onclick = e => { e.preventDefault(); logout(); show('login'); };
function offlineGuest() {
  me = { name: 'Guest', pfp: 49, rating: 1000, points: 0, wins: 0, losses: 0 }; myMinds = [49, 14, 8].filter(id => tokenIds().includes(id)); guest = true;
  if (!myMinds.length) myMinds = tokenIds().slice(0, 3);
  toast('Server offline: practice vs bots only.');
  enterHub();
}

// first-time setup (name + pfp)
let setupPfp = null;
function openSetup() {
  setupPfp = myMinds[0];
  $('#setup-name').value = '';
  $('#setup-pfp').innerHTML = myMinds.map(id => `<div class="mind ${id === setupPfp ? 'on' : ''}" data-id="${id}"><img src="${thumb(id)}" alt=""><span class="tag">#${id}</span></div>`).join('');
  show('setup');
}
$('#setup-pfp').onclick = e => { const m = e.target.closest('[data-id]'); if (!m) return; setupPfp = +m.dataset.id; $$('#setup-pfp .mind').forEach(x => x.classList.toggle('on', x === m)); };
$('#setup-save').onclick = async () => {
  try { const r = await api('profile', { name: $('#setup-name').value, pfp: setupPfp }); me = r.player; enterHub(); }
  catch (e) { $('#setup-err').textContent = e.message; }
};

// ---------- navigation ----------
document.addEventListener('click', e => {
  if (e.target.closest('button')) { initAudio(); sfx('click'); }
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'back') return show(['settings', 'codex'].includes(previous) ? 'hub' : previous);
  if (go === 'hub') return enterHub();
  if (go === 'leaderboard') return openLeaderboard();
  if (go === 'codex') { renderCodex(); return show('codex'); }
  if (go === 'settings') { $('#set-account').textContent = guest ? 'Trial (guest)' : me?.address || ''; return show('settings'); }
  show(go);
});
$('#hub-ranked').onclick = () => openPrep('ranked');
$('#hub-practice').onclick = () => openPrep('practice');
$('#hub-profile').onclick = () => openProfile(me.id);
$('#hub-me').onclick = () => openProfile(me.id);
$('#hub-train').onclick = () => modal(`<img src="assets/mode_train.webp" alt="" style="width:100%" class="px"><h3>Train Your Mind</h3><p>Coming soon! Teach your Mind your own play style, then let it play duels on its own.</p>`, [['Can\'t wait', 1, 'primary']]);
$('#hub-auto').onclick = () => modal(`<img src="assets/mode_auto.webp" alt="" style="width:100%" class="px"><h3>Auto Battle</h3><p>Coming soon! Your trained Minds battle other players' Minds automatically while you watch.</p>`, [['Can\'t wait', 1, 'primary']]);

// ---------- prep: pick minds ----------
let prep = { mode: 'ranked', minds: [], level: 'normal' };
function openPrep(mode) {
  prep.mode = mode;
  prep.minds = picked().slice(0, 3);
  prep.level = settings.picks.level || 'normal';
  $('#prep-title').textContent = mode === 'ranked' ? 'Ranked Duel' : 'Practice vs bot';
  $('#prep-go').textContent = mode === 'ranked' ? 'Find match' : 'Start practice';
  $('#prep-level').style.display = mode === 'practice' ? 'inline-flex' : 'none';
  $$('#prep-level button').forEach(b => b.classList.toggle('on', b.dataset.v === prep.level));
  $('#prep-minds').innerHTML = myMinds.map(id => `<div class="mind" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag" style="color:#fff;background:${RAR_COLOR[rarityOf(id)]}">#${id}</span><span class="order"></span></div>`).join('');
  paintPrep();
  show('prep');
}
function paintPrep() {
  $$('#prep-minds .mind').forEach(m => { const i = prep.minds.indexOf(+m.dataset.id); m.classList.toggle('on', i >= 0); m.querySelector('.order').textContent = i + 1; });
  $('#prep-mind-count').textContent = `${prep.minds.length}/3`;
  $('#prep-go').disabled = !prep.minds.length;
  $('#prep-err').textContent = prep.minds.length ? '' : 'Pick at least 1 Mind.';
}
$('#prep-minds').onclick = e => {
  const m = e.target.closest('[data-id]'); if (!m) return;
  const id = +m.dataset.id, i = prep.minds.indexOf(id);
  if (i >= 0) prep.minds.splice(i, 1); else if (prep.minds.length < 3) prep.minds.push(id); else return toast('Max 3 Minds. Tap one to remove it first.');
  sfx('select'); paintPrep();
};
$('#prep-level').onclick = e => { const v = e.target.dataset.v; if (!v) return; prep.level = v; $$('#prep-level button').forEach(b => b.classList.toggle('on', b === e.target)); };
$('#prep-go').onclick = async () => {
  settings.picks = { minds: prep.minds, level: prep.level }; saveSettings();
  if (!online) return startDuel(new LocalMatch({ name: me.name, minds: prep.minds, level: prep.mode === 'practice' ? prep.level : 'normal' }));
  try {
    const r = await api('queue/join', { minds: prep.minds, ...(prep.mode === 'practice' ? { bot: prep.level } : {}) });
    if (r.match) return openMatch(r.match);
    queueLoop();
  } catch (e) { toast(e.message, true); }
};

// ---------- matchmaking ----------
let queueTimer = null;
function queueLoop() {
  $('#queue-pfp').src = thumb(prep.minds[0]);
  $('#queue-msg').textContent = 'Searching players near your rating';
  show('queue');
  const tick = async () => {
    try {
      const r = await api('queue/poll', {});
      if (r.match) { stopQueue(); if (r.bot) toast('No player found in time: you are playing a BOT.'); return openMatch(r.match); }
      if (r.idle) { stopQueue(); return enterHub(); }
      $('#queue-msg').textContent = r.botIn > 0 ? `Searching players… a bot joins in ${r.botIn}s if nobody is found` : 'Starting a bot match…';
    } catch (e) { toast(e.message, true); }
  };
  stopQueue(); tick(); queueTimer = setInterval(tick, 2000);
}
const stopQueue = () => { clearInterval(queueTimer); queueTimer = null; };
$('#queue-cancel').onclick = async () => { stopQueue(); try { await api('queue/leave', {}); } catch { /* ignore */ } enterHub(); };

// ---------- the duel ----------
let D = null;
const keyOf = ev => ev ? `${ev.round}:${ev.turn}` : '';
async function openMatch(id) {
  try { startDuel(null, await api(`match/view?id=${id}`)); }
  catch (e) { toast(e.message, true); enterHub(); }
}
function startDuel(local, first = local.view()) {
  orbit = false;
  D = { local, id: first.id, v: first, seen: keyOf(first.view.lastEvent), busy: false, sel: { card: null, spell: null }, F: [null, null], mind: [-1, -1], lastCrown: null };
  clearStage();
  buildEnv(THEMES[(Math.random() * THEMES.length) | 0]);
  placeFighters(first.view, true);
  camSnap(new THREE.Vector3(0, 5, 14), new THREE.Vector3(0, 1, 0));
  duelCam();
  buildTable();
  show('duel'); music('battle');
  paintDuel();
  if (!local) {
    watch(`match:${D.id}`, () => refresh()).then(un => { if (D) D.unwatch = un; });
    D.poll = setInterval(() => { if (D && !D.busy) refresh(); }, 2500);
  }
  D.clock = setInterval(paintTimer, 250);
  D.busy = true;
  banner(`<div class="bt">DUEL!</div><small>${esc(first.view.me.name)} vs ${esc(first.view.rival.name)}${first.ranked ? ' · RANKED' : ''}</small>`, 1300)
    .then(() => { sfx('fight'); if (D) D.busy = false; });
}
// frame the fighters in the band between the crown display (top) and the hand of cards (bottom)
const duelCam = () => { const d = Math.max(10, fitDist(innerWidth < 820 ? 2.8 : 4.2)); camTo(new THREE.Vector3(0, 2.2 + d * 0.1, d), new THREE.Vector3(0, 0.3, 0), 0.05); };
addEventListener('resize', () => { if (D && current === 'duel') duelCam(); });
function placeFighters(v, drop) {
  [v.me, v.rival].forEach((p, i) => {
    if (D.mind[i] === p.mind && D.F[i]) return;
    D.F[i]?.dispose();
    const f = new Fighter({ id: p.minds[p.mind] }, new THREE.Vector3(i ? 1.6 : -1.6, 0, 0), i, settings.view);
    if (drop) f.dropIn(0.25 + i * 0.2);
    D.F[i] = f; D.mind[i] = p.mind;
  });
  stage = D.F.filter(Boolean);
}
async function refresh() {
  if (!D || D.local) return;
  try { const v = await api(`match/view?id=${D.id}`); await handle(v); } catch (e) { if (e.status === 403 || e.status === 404) { toast(e.message, true); leaveDuel(); } }
}
async function handle(v) {
  if (!D) return;
  const ev = v.view.lastEvent;
  if (ev && keyOf(ev) !== D.seen && !D.busy) {
    D.busy = true; D.seen = keyOf(ev);
    try { await reveal(ev, v); } finally { if (D) D.busy = false; }
  }
  if (!D) return;
  D.v = v;
  if (v.status !== 'live') return finish(v);
  paintDuel();
}

// table: the hand of cards 1-7 and the 4 spell buttons (built once, painted every update)
function buildTable() {
  $('#d-hand').innerHTML = CARD_VALUES.map(n => `<button class="card" data-card="${n}" data-v="${n}" style="--c:${CARD_COLOR[n]}"><b>${n}</b></button>`).join('');
  $('#d-spells').innerHTML = SPELLS.map(k => `<button class="sp px" data-spell="${k}"><img src="${spellImg(k)}" alt=""><div><b>${SPELL_INFO[k].name}</b><em>${SPELL_INFO[k].short}</em></div>${k === 'reverse' ? '<i class="lim">1 / MATCH</i>' : ''}</button>`).join('');
  $$('#d-spells .sp').forEach(n => tipFor(n, n.dataset.spell));
}
const stars = n => Array.from({ length: RULES.roundsToWin }, (_, i) => `<img src="assets/crown.png" class="${i < n ? '' : 'off'}" alt="">`).join('');
function paintPlates(v, scores) {
  [[v.me, 0], [v.rival, 1]].forEach(([p, i]) => {
    $(`#d-pfp${i}`).src = thumb(p.minds[p.mind]);
    $(`#d-name${i}`).textContent = p.name;
    $(`#d-rounds${i}`).innerHTML = stars(p.rounds);
    $(`#d-score${i}`).textContent = scores ? scores[i] : p.score;
  });
}
function paintDuel() {
  const V = D.v, v = V.view, mine = v.me, rv = v.rival;
  paintPlates(v);
  $('#d-round').textContent = `ROUND ${v.round}`;
  // the crown up for grabs (+ carried pot), and the crowns still to come
  const cb = $('#d-crownbox');
  if (D.lastCrown !== `${v.round}:${v.turn}`) { D.lastCrown = `${v.round}:${v.turn}`; cb.classList.remove('new'); void cb.offsetWidth; cb.classList.add('new'); }
  $('#d-crown').textContent = v.pot;
  const carried = v.pot > v.crown;
  $('#d-pot').classList.toggle('on', carried);
  $('#d-pot').textContent = carried ? `${v.crown} + ${v.pot - v.crown} carried from the tie` : '';
  let shown = false;
  $('#d-left').innerHTML = v.crownsLeft.map(c => { const now = c === v.crown && !shown; if (now) shown = true; return `<i class="${now ? 'now' : ''}">${c}</i>`; }).join('');
  // rival: remaining cards and spells are public (card counting is part of the game)
  $('#d-rcards').innerHTML = CARD_VALUES.map(n => `<i class="${rv.cards.includes(n) ? '' : 'used'}">${n}</i>`).join('');
  $('#d-rspells').innerHTML = SPELLS.map(k => `<img src="${spellImg(k)}" title="${SPELL_INFO[k].name}" class="${(k === 'reverse' ? rv.reverse : rv.spells.includes(k)) ? '' : 'used'}" alt="">`).join('');
  $('#d-rivalinfo').classList.toggle('locked', !!rv.locked);
  // my hand + spells
  const locked = mine.locked || V.status !== 'live';
  $('#s-duel').classList.toggle('locked', locked);
  if (locked && mine.play) D.sel = { card: mine.play.card, spell: mine.play.spell };
  if (!locked && D.sel.card != null && !mine.cards.includes(D.sel.card)) D.sel.card = null;
  const canSpell = k => k === 'reverse' ? mine.reverse : mine.spells.includes(k);
  if (D.sel.spell && !canSpell(D.sel.spell)) D.sel.spell = null;
  $$('#d-hand .card').forEach(b => { const n = +b.dataset.card; b.classList.toggle('gone', !mine.cards.includes(n)); b.classList.toggle('on', D.sel.card === n); });
  $$('#d-spells .sp').forEach(b => { const k = b.dataset.spell; b.classList.toggle('used', !canSpell(k)); b.classList.toggle('on', D.sel.spell === k); });
  const lock = $('#d-lock');
  lock.disabled = D.sel.card == null;
  lock.textContent = D.sel.card == null ? 'Pick a card' : `Play ${D.sel.card}${D.sel.spell ? ` + ${SPELL_INFO[D.sel.spell].name}` : ''}`;
  $('#d-wait').textContent = 'Locked in · waiting for your rival';
  paintHint();
  paintTimer();
}
function paintHint(timeLow) {
  if (!D) return;
  const v = D.v.view, h = $('#d-hint');
  let text = '', cls = '';
  if (timeLow && !v.me.locked) { text = '⏰ Hurry! No pick in time = you lose this round.'; cls = 'warn'; }
  else if (D.sel.spell) text = `${SPELL_INFO[D.sel.spell].name}: ${SPELL_INFO[D.sel.spell].desc}`;
  else if (v.me.locked) text = '';
  else if (v.round === 1 && v.turn === 1) text = 'Play a secret card. Higher card takes the crown 👑 Every card is used once per round.';
  else if (v.pot > v.crown) text = `Last turn was a tie: this crown is worth ${v.pot}!`;
  else if (v.turn === 7) text = 'Last card of the round. Unused spells are lost, use them now!';
  h.textContent = text; h.className = `duel-hint px ${text ? 'on' : ''} ${cls}`;
}
function paintTimer() {
  if (!D) return;
  const t = $('#d-timer');
  if (D.local || !D.v.deadline || D.v.status !== 'live') { t.style.visibility = 'hidden'; return; }
  const skew = Date.parse(D.v.serverTime) - (D.v.gotAt || (D.v.gotAt = Date.now()));
  const left = Math.max(0, (Date.parse(D.v.deadline) - (Date.now() + skew)) / 1000);
  t.style.visibility = D.busy ? 'hidden' : 'visible';
  const shown = Math.min(TURN_SECONDS, left);
  $('#d-timer-t').textContent = Math.ceil(shown);
  $('#d-timer-ring').style.strokeDashoffset = 107 * (1 - shown / TURN_SECONDS);
  const low = shown < 6 && !D.v.view.me.locked;
  t.classList.toggle('low', low);
  if (low !== D.low) { D.low = low; paintHint(low); if (low) sfx('denied'); }
  if (left <= 0 && !D.busy && !D.expiredAt) { D.expiredAt = Date.now(); refresh(); }
  if (left > 0) D.expiredAt = 0;
  if (left <= 0 && D.expiredAt && Date.now() - D.expiredAt > 3000) D.expiredAt = 0;       // retry
}
$('#d-hand').onclick = e => {
  const b = e.target.closest('[data-card]'); if (!b || D.busy || D.v.view.me.locked) return;
  const n = +b.dataset.card;
  D.sel.card = D.sel.card === n ? null : n; sfx(D.sel.card ? 'select' : 'deselect'); paintDuel();
};
$('#d-spells').onclick = e => {
  const b = e.target.closest('[data-spell]'); if (!b || D.v.view.me.locked) return;
  if (b.classList.contains('used')) return sfx('denied');
  const k = b.dataset.spell;
  D.sel.spell = D.sel.spell === k ? null : k; sfx(D.sel.spell ? 'select' : 'deselect'); paintDuel();
};
async function lockIn() {
  if (!D || D.sel.card == null || D.busy || D.v.view.me.locked) return;
  const action = { id: D.id, card: D.sel.card, spell: D.sel.spell };
  $('#d-lock').disabled = true; sfx('energy');
  try {
    const v = D.local ? await D.local.act(action) : await api('match/act', action);
    await handle(v);
  } catch (e) { toast(e.message, true); if (D) paintDuel(); }
}
$('#d-lock').onclick = lockIn;
addEventListener('keydown', e => {
  if (current !== 'duel' || !D || e.repeat) return;
  if (e.key >= '1' && e.key <= '7') $(`#d-hand [data-card="${e.key}"]`)?.click();
  else if (e.key === 'Enter') lockIn();
});
$('#d-menu').onclick = async () => {
  const r = await modal('<h3>Match menu</h3><p class="muted">Leaving counts as a loss.</p>', [['Keep playing', 0, 'primary'], ['How to play', 2], ['Forfeit', 1]]);
  if (r === 2) { renderCodex(); show('codex'); }
  if (r === 1) {
    try { const v = D.local ? await D.local.forfeit() : await api('match/forfeit', { id: D.id }); await handle(v); } catch (e) { toast(e.message, true); }
  }
};

// ---------- reveal: cards flip, spells resolve one by one, the crown flies to the winner ----------
const up = (f, y) => f.root.position.clone().add(new THREE.Vector3(0, y * f.root.scale.y, 0));
function rvSet(side, value) {
  const b = $(`#rv${side} .rc-face b`);
  b.textContent = value; b.parentElement.style.setProperty('--c', CARD_COLOR[Math.min(7, value)] || '#ffe14a');
}
function rvMsg(text, cls = '') { const m = $('#rv-msg'); m.className = 'rv-msg'; void m.offsetWidth; m.textContent = text; m.className = `rv-msg on ${cls}`; }
function flyCrown(toSide) {
  const from = $('#d-crownbox').getBoundingClientRect(), to = $(`#d-score${toSide}`).getBoundingClientRect();
  const c = el('img', 'flycrown'); c.src = 'assets/crown.png';
  c.style.left = `${from.left + 20}px`; c.style.top = `${from.top + 6}px`;
  document.body.append(c);
  requestAnimationFrame(() => requestAnimationFrame(() => { c.style.left = `${to.left - 10}px`; c.style.top = `${to.top - 10}px`; c.style.transform = 'scale(.5) rotate(20deg)'; c.style.opacity = '0'; }));
  setTimeout(() => c.remove(), 900);
}
async function reveal(ev, v) {
  const seat = v.seat, side = i => i === seat ? 0 : 1;
  const S = $('#s-duel');
  S.classList.add('revealing'); $('#d-timer').style.visibility = 'hidden';
  if (ev.forfeit !== undefined) { S.classList.remove('revealing'); return; }
  if (ev.timeout) {
    const meLate = ev.timeout.includes(seat), both = ev.timeout.length === 2;
    sfx(meLate ? 'defeat' : 'round');
    await banner(`<div class="bt ${both ? 'white' : meLate ? 'red' : ''}">TIME'S UP!</div><small>${both ? 'Nobody picked: draw round' : meLate ? 'You did not pick in time: round lost' : 'Your rival did not pick in time: round won'}</small>`, 1900);
  } else await revealTurn(ev, seat, side);
  if (ev.roundOver) await roundEnd(ev, v, seat);
  S.classList.remove('revealing');
}
async function revealTurn(ev, seat, side) {
  const R = $('#reveal'), cols = [$('#rv0'), $('#rv1')];
  const cards = [ev.cards[seat], ev.cards[1 - seat]], spells = [ev.spells[seat], ev.spells[1 - seat]];
  // 1. both cards slide in face down, then flip
  cols.forEach((c, i) => {
    c.className = 'rv-col';
    const rc = c.querySelector('.rcard'); rc.classList.remove('flip'); rc.style.animation = 'none'; void rc.offsetWidth; rc.style.animation = '';
    c.querySelector('.rv-spell').innerHTML = '';
    rvSet(i, cards[i]);
  });
  $('#rv-msg').className = 'rv-msg';
  R.classList.add('on'); sfx('whoosh');
  await wait(520);
  cols.forEach(c => c.querySelector('.rcard').classList.add('flip')); sfx('block');
  await wait(700);
  // 2. spells are revealed after the numbers
  if (spells.some(Boolean)) {
    spells.forEach((k, i) => { if (k) cols[i].querySelector('.rv-spell').innerHTML = `<div class="chip px"><img src="${spellImg(k)}" alt="">${SPELL_INFO[k].name}</div>`; });
    sfx('cast'); await wait(750);
  }
  // 3. resolve step by step
  for (const st of ev.steps) {
    const s = st.i === undefined ? null : side(st.i);
    if (st.k === 'cancel') {
      if (st.triple) { rvMsg('Double + Double: crown x3!', 'magic'); sfx('levelup'); }
      else { cols.forEach(c => c.querySelector('.chip')?.classList.add('x')); rvMsg(`Both used ${SPELL_INFO[st.spell].name}: cancelled!`, 'magic'); sfx('debuff'); }
    } else if (st.k === 'boost') {
      rvSet(s, st.value); const b = $(`#rv${s} .rc-face b`); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
      rvMsg(`${s === 0 ? 'Your' : 'Rival'} Boost: +${RULES.boost}!`, 'magic'); sfx('buff');
    } else if (st.k === 'reverse') { rvMsg('REVERSE! The lower card wins!', 'magic'); sfx('cast'); shake(0.15); }
    else if (st.k === 'trap') { rvMsg(`TRAP! ${s === 0 ? 'You steal' : 'Rival steals'} the crown from the 7!`, s === 0 ? 'good' : 'bad'); sfx('crit'); shake(0.3); flash(0.3, '#c9a6ff'); }
    else if (st.k === 'trapMiss') { rvMsg(`${s === 0 ? 'Your' : 'Rival'} Trap missed (no 7 won)`, ''); sfx('miss'); cols[s].querySelector('.chip')?.classList.add('x'); }
    else if (st.k === 'doubleTie') { rvMsg(`Tie, but ${s === 0 ? 'your' : 'rival'} Double wins it!`, 'magic'); sfx('buff'); }
    else if (st.k === 'double') { rvMsg(`DOUBLE! Crown x${st.mult}`, 'magic'); sfx('levelup'); }
    await wait(1000);
  }
  // 4. who takes the crown
  const w = ev.win === null ? null : side(ev.win);
  const scores = [ev.scores[seat], ev.scores[1 - seat]];
  if (w === null) { rvMsg(`Tie! The crown carries to the next turn`, ''); sfx('block'); }
  else {
    cols[w].classList.add('win'); cols[1 - w].classList.add('lose');
    rvMsg(`${w === 0 ? 'You take' : 'Rival takes'} ${ev.points} 👑`, w === 0 ? 'good' : 'bad');
    flyCrown(w); sfx(w === 0 ? 'star' : 'hit');
  }
  // the fighters' animation runs on requestAnimationFrame, which stops in hidden tabs: never let it block the game
  await Promise.race([clash(w, ev), new Promise(r => setTimeout(r, 2600))]);
  paintPlates(D.v.view, scores);
  await wait(450);
  R.classList.remove('on');
}
async function clash(w, ev) {
  const [A, B] = D.F;
  const meleeOf = f => f.p.item ? 'slash' : 'punch';
  if (w === null) {                                       // tie: both meet in the middle
    let met = 0;
    const meet = () => { if (++met === 2) { burst(new THREE.Vector3(0, 1.1, 0), ['#ffffff', '#d4ff1f'], 30, 1, true); sfx('block'); shake(0.15); } };
    const spot = f => ({ home: new THREE.Vector3(-f.dir * 0.42 + f.dir * 1.45 * f.root.scale.x, 0, 0) });
    await Promise.all([A.perform(meleeOf(A), spot(A)), B.perform(meleeOf(B), spot(B))].map(p => p.then(meet)));
    return;
  }
  const [W, L] = w === 0 ? [A, B] : [B, A];
  const big = ev.points >= 7 || ev.mult > 1;
  const hit = () => {
    L.flash = 1; L.play(big ? 'hitBig' : 'hit');
    burst(L.chest, L.colors, big ? 40 : 18, big ? 1.3 : 0.9);
    rise(W.root.position, '#ffd84a', 18);
    popText(`+${ev.points} 👑`, up(W, 2.4), big ? 'gold' : 'status');
    sfx(big ? 'crit' : 'hit'); shake(big ? 0.3 : 0.12);
    if (big) { slowmo(0.35, 0.3); flash(0.2); }
  };
  if (ev.steps.some(s => s.k === 'trap' || s.k === 'reverse')) {   // tricks: a magic shot instead of a punch
    await W.perform('cast', null, async () => { await shoot(up(W, 1.0), L.chest, '#c37dff'); hit(); });
  } else await W.perform(meleeOf(W), L, hit);
}
async function roundEnd(ev, v, seat) {
  const ro = ev.roundOver, rw = ro.winner === null ? null : ro.winner === seat ? 0 : 1;
  const loser = rw === null ? null : D.F[1 - rw];
  if (loser && !ev.matchOver) { loser.ko = true; loser.play('ko'); sfx('ko'); shake(0.4); slowmo(0.6, 0.3); burst(loser.chest, loser.colors, 70, 1.5); ring(loser.root.position, '#ffd84a'); }
  await wait(700);
  const pts = ro.reason === 'timeout' ? '' : `${ro.scores[seat]} vs ${ro.scores[1 - seat]} points · `;
  if (!ev.matchOver) {
    await banner(`<div class="bt ${rw === null ? 'white' : rw === 0 ? '' : 'red'}">${rw === null ? 'DRAW ROUND' : rw === 0 ? 'ROUND WON!' : 'ROUND LOST'}</div><small>${pts}rounds ${ro.rounds[seat]} – ${ro.rounds[1 - seat]}</small>`, 1700);
    D.F.forEach(f => { if (f) { f.ko = false; f.act = null; } });
    placeFighters(v.view, true);
    D.F.forEach(f => { f.ko = false; f.act = null; });
    sfx('round');
    await banner(`<div class="bt white">ROUND ${v.view.round}</div><small>Fresh hand: cards 1–7 and your spells are back</small>`, 1300);
  }
}

async function finish(v) {
  if (!D || D.finished) return;
  D.finished = true;
  clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.();
  $('#reveal').classList.remove('on');
  const seat = v.seat, won = v.winner === seat, draw = v.winner === null;
  const winF = draw ? null : D.F[won ? 0 : 1], loseF = draw ? null : D.F[won ? 1 : 0];
  loseF?.play('ko');
  winF?.play('win');
  if (winF) camTo(winF.home.clone().add(new THREE.Vector3(winF.dir * 1.5, 2.2, 6.5)), up(winF, 1.0), 0.04);
  sfx(won ? 'victory' : draw ? 'round' : 'defeat'); music(null);
  const title = won ? 'VICTORY!' : draw ? 'DRAW' : 'DEFEAT';
  await banner(`<div class="bt ${won ? '' : draw ? 'white' : 'red'}">${title}</div>`, 1600);
  $('#r-title').textContent = title;
  $('#r-title').style.color = won ? 'var(--lime)' : draw ? '#fff' : 'var(--red)';
  $('.result').classList.toggle('lost', !won);
  $('#r-score').textContent = `Rounds ${v.view.me.rounds} – ${v.view.rival.rounds}${v.status === 'abandoned' ? ' · forfeit' : ''}`;
  const d = v.delta || 0;
  $('#r-stats').innerHTML = [
    [v.ranked ? `${d > 0 ? '+' : ''}${d}` : '—', 'Rating', d > 0 ? 'up' : d < 0 ? 'down' : ''],
    [v.vsBot ? `BOT · ${v.botLevel}` : 'Player', 'Rival', ''],
    [v.ranked ? 'Ranked' : 'Practice', 'Mode', ''],
  ].map(([b, s, c]) => `<div><b class="${c}">${esc(b)}</b><span>${s}</span></div>`).join('');
  $('#r-again').onclick = () => openPrep(D?.local || !v.ranked ? 'practice' : 'ranked');
  show('result');
  if (online && session.token) refreshMe().catch(() => {});
}
function leaveDuel() { if (D) { clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.(); } D = null; enterHub(); }

// ---------- leaderboard ----------
let lbBy = 'rating', lbUnwatch = null, lbTimer = null;
async function openLeaderboard() {
  show('leaderboard');
  await loadLeaderboard();
  lbUnwatch?.(); lbUnwatch = await watch('leaderboard', loadLeaderboard);
  clearInterval(lbTimer); lbTimer = setInterval(() => { if (current === 'leaderboard') loadLeaderboard(); else clearInterval(lbTimer); }, 15000);
}
async function loadLeaderboard() {
  if (!online) { $('#lb-rows').innerHTML = '<tr><td colspan="7" class="muted">The leaderboard needs the game server.</td></tr>'; return; }
  try {
    const r = await api(`leaderboard?by=${lbBy}`);
    $('#lb-col').textContent = lbBy === 'points' ? 'Points' : 'Rating';
    $('#lb-rows').innerHTML = r.players.length ? r.players.map((p, i) => `<tr class="${p.id === me?.id ? 'me' : ''}"><td class="rank">${i + 1}</td>
      <td><div class="pl" data-pid="${p.id}"><img src="${thumb(p.pfp)}" alt="">${esc(p.name)}</div></td><td><b>${lbBy === 'points' ? p.points : p.rating}</b></td>
      <td>${p.wins}</td><td>${p.losses}</td><td>${p.winRate ?? '—'}${p.winRate != null ? '%' : ''}</td><td>${p.streak ? '🔥' + p.streak : '—'}</td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">No ranked games yet. Be the first!</td></tr>';
  } catch (e) { toast(e.message, true); }
}
$('#lb-by').onclick = e => { const v = e.target.dataset.v; if (!v) return; lbBy = v; $$('#lb-by button').forEach(b => b.classList.toggle('on', b === e.target)); loadLeaderboard(); };
$('#lb-rows').onclick = e => { const p = e.target.closest('[data-pid]'); if (p) openProfile(p.dataset.pid); };

// ---------- profile ----------
let pfPick = null;
async function openProfile(pid) {
  if (!online || !pid) return toast('Profiles need the game server.');
  try {
    const r = await api(`player?id=${pid}`), p = r.player, mine = pid === me?.id;
    $('#pf-pfp').src = thumb(p.pfp); $('#pf-name').textContent = p.name;
    $('#pf-addr').textContent = p.guest ? 'Trial account' : p.address || '';
    $('#pf-stats').innerHTML = [[p.rating, 'Rating'], [p.points, 'Points'], [p.winRate != null ? p.winRate + '%' : '—', 'Win rate'], [p.wins, 'Wins'], [p.losses, 'Losses'], [p.bestStreak, 'Best streak']]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    $('#pf-edit').style.display = mine && !guest ? 'block' : 'none';
    if (mine && !guest) {
      pfPick = p.pfp; $('#pf-name-in').value = p.name; $('#pf-err').textContent = '';
      $('#pf-pfps').innerHTML = myMinds.map(id => `<div class="mind ${id === pfPick ? 'on' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag" style="color:#fff">#${id}</span></div>`).join('');
    }
    $('#pf-history').innerHTML = r.history.length ? r.history.map(h => `<div class="hrow"><span class="res ${h.result}">${h.result.toUpperCase()}</span>
      <span>${h.vsPfp ? `<img src="${thumb(h.vsPfp)}" alt="">` : '🤖 '}${esc(h.vs)}</span><span class="${h.delta > 0 ? 'up' : h.delta < 0 ? 'down' : 'muted'}">${h.delta ? (h.delta > 0 ? '+' : '') + h.delta : '—'}</span>
      <span class="muted small">${h.at ? new Date(h.at).toLocaleDateString() : ''}</span></div>`).join('') : '<div class="muted">No matches yet.</div>';
    show('profile');
  } catch (e) { toast(e.message, true); }
}
$('#pf-pfps').onclick = e => { const m = e.target.closest('[data-id]'); if (!m) return; pfPick = +m.dataset.id; $$('#pf-pfps .mind').forEach(x => x.classList.toggle('on', x === m)); };
$('#pf-save').onclick = async () => {
  try { const r = await api('profile', { name: $('#pf-name-in').value, pfp: pfPick }); me = r.player; toast('Saved.'); openProfile(me.id); paintHub(); }
  catch (e) { $('#pf-err').textContent = e.message; }
};

// ---------- codex ----------
function renderCodex() {
  $('#codex').innerHTML = `
  <h3><img src="assets/crown.png" alt="">The goal</h3>
  <p>Collect more crown points than your rival. Each round has <b>7 crowns</b> worth <b>1 to 7</b> points. They come up one at a time in a random order. Win <b>2 rounds</b> to win the match (best of 3).</p>
  <h3>A turn</h3>
  <ol><li>You see the crown up for grabs (and the crowns still to come).</li>
  <li>Both players secretly play <b>one card</b> from 1 to 7, plus <b>one spell</b> if you want.</li>
  <li>Cards are shown first. <b>The higher card takes the crown.</b></li>
  <li>Then the spells are revealed and can change the result!</li>
  <li><b>Tie?</b> Nobody gets it and the crown carries over: the next crown is worth both.</li></ol>
  <div class="example">Example: crown <b>6</b> is up. You play <b>5</b>, your rival plays <b>3</b> → you get 6 points. Each card can be used <b>once per round</b>, so spend your 7 wisely!</div>
  <h3>Spells</h3>
  <p>Spells are revealed <b>after</b> the cards, in this order: Boost → Reverse → Trap → Double. If both players use the <b>same spell</b>, they cancel out (except Double + Double = crown x3).</p>
  ${SPELLS.map(k => `<div class="spellrow"><img src="${spellImg(k)}" alt=""><div><b>${SPELL_INFO[k].name}</b><em>${SPELL_INFO[k].limit.toUpperCase()}</em><br>${SPELL_INFO[k].desc}</div></div>`).join('')}
  <div class="example">Your rival plays a <b>7</b> to win a big crown. You play your <b>1</b> with <b>Trap</b>. The cards show 7 vs 1, it looks like they win… then your Trap is revealed and you steal it!</div>
  <h3>Rounds and the timer</h3>
  <ul><li>Every round you get all 7 cards and your Boost, Double and Trap back. <b>Reverse</b> can only be used <b>once per match</b>.</li>
  <li>Most points wins the round. Same points? More crowns won, then the biggest crown, decides.</li>
  <li>Bring <b>1 to 3 Minds</b>: they take turns, one per round. Every Mind plays exactly the same.</li>
  <li>Each turn has a <b>${TURN_SECONDS} second</b> timer. <b>If you don't pick in time, you lose that round.</b></li>
  <li>You can always see which cards and spells your rival has left. Use it!</li></ul>
  <h3>Ranking and fairness</h3>
  <ul><li>Ranked wins and losses change your <b>rating</b>. Games vs bots count half.</li>
  <li><b>Points</b>: 10 per ranked win, plus a rarity bonus for the Minds you brought (Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%). Rarity never changes how a Mind plays.</li>
  <li>If no player is found in 20 seconds you play a <b>bot</b>, always labelled BOT.</li>
  <li>Every turn runs on the game server and your rival's card is never sent to your device, so nobody can peek or cheat.</li></ul>
  <p class="muted small">Tip: press 1–7 to pick a card and Enter to lock in.</p>`;
}

// ---------- settings ----------
$('#set-music').oninput = e => { settings.music = +e.target.value; saveSettings(); applySettings(); };
$('#set-sfx').oninput = e => { settings.sfx = +e.target.value; saveSettings(); applySettings(); sfx('select'); };
for (const [id, key] of [['set-view', 'view'], ['set-quality', 'quality'], ['set-speed', 'speed']])
  $(`#${id}`).onclick = e => {
    const v = e.target.dataset.v; if (!v) return;
    settings[key] = key === 'speed' ? +v : v; saveSettings(); applySettings();
    if (key === 'view') stage.forEach(f => f.rebuild(v));
  };
$('#set-logout').onclick = async () => {
  if (await modal('<h3>Sign out?</h3>', [['Cancel', 0], ['Sign out', 1, 'primary']])) { logout(); me = null; show('login'); }
};

// ---------- boot ----------
const bootBar = p => { $('#boot-bar').style.width = `${p}%`; };
(async () => {
  bootBar(10);
  const [, isOnline] = await Promise.all([loadData(), serverOnline()]);
  online = isOnline;
  setTokenIds(tokenIds());
  bootBar(70);
  applySettings();
  const legends = tokenIds().filter(i => rarityOf(i) === 'Legendary').sort(() => Math.random() - 0.5).slice(0, 3);
  showcase(legends.length ? legends : tokenIds().slice(0, 3));
  camSnap(new THREE.Vector3(0, 4, 16), new THREE.Vector3(0, 1, 0));
  bootBar(100);
  if (online && session.token) {
    try {
      const r = await refreshMe();
      if (r.liveMatch) { await enterHub(); return openMatch(r.liveMatch); }
      return enterHub();
    } catch { logout(); }
  }
  if (!online) { $('#btn-wallet').disabled = true; $('#btn-guest').textContent = 'Practice offline vs bots'; }
  show('login');
})();
