// Mindclash client: screens, sign-in, loadout, matchmaking, the duel presentation, leaderboard, profile.
import * as THREE from 'three';
import { loadData, tokenIds, rarityOf } from './nft.js';
import { camTo, camSnap, shake, slowmo, flash, burst, rise, ring, popText, onFrame, setQuality, setSpeed, speedSetting } from './render.js';
import { buildEnv, envUpdate } from './env.js';
import { Fighter, shoot } from './fighter.js';
import { SKILLS, SKILL_IDS, RULES, MOVES } from './duel/engine.js';
import { api, session, walletLogin, guestLogin, logout, hasWallet, watch, serverOnline, LocalMatch, setTokenIds } from './net.js';
import { initAudio, sfx, music, setVolume } from './audio.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms / speedSetting));
const thumb = id => id ? `data/thumbs/${id}.webp` : 'data/thumbs/1.webp';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MOVE_UI = { strike: ['⚔️', 'Strike', 'var(--strike)'], guard: ['🛡️', 'Guard', 'var(--guard)'], trick: ['🌀', 'Trick', 'var(--trick)'] };
const RAR_COLOR = { Legendary: '#ffb020', Epic: '#c46bff', Rare: '#3fa8ff', Uncommon: '#5fd068', Common: '#a3a8b0' };

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
  return wait(ms).then(() => { b.classList.remove('on'); return wait(160); });
}
// skill tooltips (hover on desktop, long-press on touch)
function tipFor(node, k) {
  const s = SKILLS[k];
  const showTip = e => {
    const t = $('#tip'); t.innerHTML = `<b>${s.icon} ${s.name} · ${s.cost} ⚡</b>${s.desc}<br><span class="muted">${s.when === 'next' ? 'Takes effect next turn.' : 'Takes effect this turn.'} 2 uses per match.</span>`;
    const r = node.getBoundingClientRect();
    t.style.left = `${Math.min(innerWidth - 290, Math.max(8, r.left))}px`; t.style.top = `${Math.max(8, r.top - 96)}px`; t.classList.add('on');
  };
  node.addEventListener('mouseenter', showTip);
  node.addEventListener('mouseleave', () => $('#tip').classList.remove('on'));
  let lp; node.addEventListener('touchstart', e => { lp = setTimeout(() => showTip(e), 380); }, { passive: true });
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
    const a = Math.sin(t * 0.15) * 0.45, r = Math.max(7.5, fitDist(3.6)), side = current === 'hub' && innerWidth > 820 ? 1.6 : 0;
    camTo(new THREE.Vector3(Math.sin(a) * r - side, 2.5, Math.cos(a) * r), new THREE.Vector3(-side * 0.6, 1.0, 0), 0.03);
  }
});

// ---------- account ----------
let me = null, myMinds = [], guest = false, online = false;
async function refreshMe() {
  const r = await api('me');
  me = r.player; myMinds = r.minds; guest = r.guest;
  return r;
}
function paintHub() {
  $('#hub-pfp').src = thumb(me.pfp); $('#hub-name').textContent = me.name;
  $('#hub-sub').textContent = guest ? 'Trial account' : `Rating ${me.rating} · ${me.points} pts · ${me.wins}W ${me.losses}L`;
  $('#guest-note').style.display = guest ? 'block' : 'none';
  $('#hub-ranked-sub').textContent = guest ? 'vs other trial players · bot after 20 s' : '1v1 vs real players · bot after 20 s';
}
async function enterHub() {
  paintHub();
  const picks = (settings.picks.minds || []).filter(id => myMinds.includes(id));
  showcase(picks.length ? picks : myMinds.slice(0, 3).length ? myMinds.slice(0, 3) : [me.pfp || 1]);
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
  finally { b.disabled = false; b.innerHTML = '<span class="ico">◈</span> Connect wallet'; }
};
$('#btn-guest').onclick = () => { initAudio(); online ? startGuest() : offlineGuest(); };
$('#guest-connect').onclick = e => { e.preventDefault(); logout(); show('login'); };
function offlineGuest() {
  me = { name: 'Guest', pfp: 1, rating: 1000, points: 0, wins: 0, losses: 0 }; myMinds = tokenIds().slice(0, 3); guest = true;
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

// ---------- prep: minds + loadout ----------
let prep = { mode: 'ranked', minds: [], loadout: [], level: 'normal' };
function openPrep(mode) {
  prep.mode = mode;
  prep.minds = (settings.picks.minds || []).filter(id => myMinds.includes(id)).slice(0, 3);
  if (!prep.minds.length) prep.minds = myMinds.slice(0, Math.min(3, myMinds.length));
  prep.loadout = (settings.picks.loadout || ['peek', 'heal', 'freeze', 'overcharge']).filter(k => SKILLS[k]).slice(0, 4);
  prep.level = settings.picks.level || 'normal';
  $('#prep-title').textContent = mode === 'ranked' ? 'Ranked match' : 'Practice vs bot';
  $('#prep-go').textContent = mode === 'ranked' ? 'Find match' : 'Start practice';
  $('#prep-level').style.display = mode === 'practice' ? 'inline-flex' : 'none';
  $$('#prep-level button').forEach(b => b.classList.toggle('on', b.dataset.v === prep.level));
  $('#prep-skills').innerHTML = SKILL_IDS.map(k => { const s = SKILLS[k]; return `<button class="skill" data-k="${k}"><span class="si">${s.icon}</span><b>${s.name}<em>${s.cost} ⚡</em></b><p>${s.desc}</p></button>`; }).join('');
  $('#prep-minds').innerHTML = myMinds.map(id => `<div class="mind" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag" style="color:${RAR_COLOR[rarityOf(id)]}">#${id}</span><span class="order"></span></div>`).join('');
  paintPrep();
  show('prep');
}
function paintPrep() {
  $$('#prep-minds .mind').forEach(m => { const i = prep.minds.indexOf(+m.dataset.id); m.classList.toggle('on', i >= 0); m.querySelector('.order').textContent = i + 1; });
  $$('#prep-skills .skill').forEach(s => s.classList.toggle('on', prep.loadout.includes(s.dataset.k)));
  $('#prep-mind-count').textContent = `${prep.minds.length}/3`;
  $('#prep-skill-count').textContent = `${prep.loadout.length}/4`;
  const ok = prep.minds.length >= 1 && prep.loadout.length === 4;
  $('#prep-go').disabled = !ok;
  $('#prep-err').textContent = !prep.minds.length ? 'Pick at least 1 Mind.' : prep.loadout.length !== 4 ? 'Pick exactly 4 skills.' : '';
}
$('#prep-minds').onclick = e => {
  const m = e.target.closest('[data-id]'); if (!m) return;
  const id = +m.dataset.id, i = prep.minds.indexOf(id);
  if (i >= 0) prep.minds.splice(i, 1); else if (prep.minds.length < 3) prep.minds.push(id); else return toast('Max 3 Minds.');
  sfx('select'); paintPrep();
};
$('#prep-skills').onclick = e => {
  const s = e.target.closest('[data-k]'); if (!s) return;
  const k = s.dataset.k, i = prep.loadout.indexOf(k);
  if (i >= 0) prep.loadout.splice(i, 1); else if (prep.loadout.length < 4) prep.loadout.push(k); else return toast('Max 4 skills. Tap one to remove it first.');
  sfx('select'); paintPrep();
};
$('#prep-level').onclick = e => { const v = e.target.dataset.v; if (!v) return; prep.level = v; $$('#prep-level button').forEach(b => b.classList.toggle('on', b === e.target)); };
$('#prep-go').onclick = async () => {
  settings.picks = { minds: prep.minds, loadout: prep.loadout, level: prep.level }; saveSettings();
  if (!online) return startDuel(new LocalMatch({ name: me.name, minds: prep.minds, loadout: prep.loadout, level: prep.level }));
  try {
    const r = await api('queue/join', { minds: prep.minds, loadout: prep.loadout, ...(prep.mode === 'practice' ? { bot: prep.level, practice: true } : {}) });
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
  D = { local, id: first.id, v: first, seen: keyOf(first.view.lastEvent), busy: false, sel: { move: null, skill: null, target: null }, F: [null, null], mind: [-1, -1] };
  clearStage();
  buildEnv(['meadow', 'neon', 'frost'][(Math.random() * 3) | 0]);
  placeFighters(first.view, true);
  camSnap(new THREE.Vector3(0, 5, 14), new THREE.Vector3(0, 1, 0));
  duelCam();
  show('duel'); music('battle');
  paintDuel();
  if (!local) {
    watch(`match:${D.id}`, () => refresh()).then(un => { if (D) D.unwatch = un; });
    D.poll = setInterval(() => { if (D && !D.busy) refresh(); }, 2500);
  }
  D.clock = setInterval(paintTimer, 250);
  banner(`<div class="bt">${first.vsBot ? 'VS BOT' : 'DUEL'}</div><small>${esc(first.view.me.name)} vs ${esc(first.view.rival.name)}${first.ranked ? ' · RANKED' : ''}</small>`, 1300).then(() => sfx('fight'));
}
const duelCam = () => { const d = Math.max(7.5, fitDist(3.4)); camTo(new THREE.Vector3(0, 1.8 + d * 0.14, d), new THREE.Vector3(0, 0.95, 0), 0.05); };
function placeFighters(v, drop) {
  const sides = [v.me, v.rival];
  sides.forEach((p, i) => {
    if (D.mind[i] === p.mind && D.F[i]) return;
    D.F[i]?.dispose();
    const f = new Fighter({ id: p.minds[p.mind] }, new THREE.Vector3(i ? 1.55 : -1.55, 0, 0), i, settings.view);
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
    try { await reveal(ev, v); } finally { D.busy = false; }
  }
  D.v = v;
  if (v.status !== 'live') return finish(v);
  paintDuel();
}

function pips(n, max, on = '●', off = '○') { return Array.from({ length: max }, (_, i) => i < n ? on : `<span class="off">${off}</span>`).join(''); }
function paintDuel() {
  const v = D.v.view, me_ = v.me, rv = v.rival;
  [[me_, 0], [rv, 1]].forEach(([p, i]) => {
    $(`#d-pfp${i}`).src = thumb(p.minds[p.mind]);
    $(`#d-name${i}`).textContent = p.name;
    $(`#d-hp${i}`).style.transform = `scaleX(${p.hp / RULES.hp})`;
    $(`#d-hpt${i}`).textContent = `${p.hp} / ${RULES.hp}`;
    $(`#d-focus${i}`).innerHTML = '⚡' + pips(p.focus, RULES.maxFocus, '▮', '▯');
    $(`#d-rounds${i}`).innerHTML = pips(p.rounds, RULES.roundsToWin, '★', '☆');
  });
  $('#d-round').textContent = `ROUND ${v.round}`;
  $('#d-turn').textContent = `Turn ${v.turn}`;
  // hints
  const hints = [];
  if (v.forced) hints.push(['warn', `🔒 Mind Lock: you must play ${MOVE_UI[v.forced][1]} this turn.`]);
  if (v.forbid) hints.push(['warn', `🧊 Frozen: you can't play ${MOVE_UI[v.forbid][1]} this turn.`]);
  if (v.rivalForced) hints.push(['good', `🔒 Your rival must play ${MOVE_UI[v.rivalForced][1]}.`]);
  if (v.rivalForbid) hints.push(['good', `🧊 Your rival can't play ${MOVE_UI[v.rivalForbid][1]}.`]);
  if (v.tell) hints.push(['', `🎭 Your rival looks like they're going for ${MOVE_UI[v.tell][1]}… could be a bluff.`]);
  if (v.peekInfo) hints.push(['good', `👁️ Peek: your rival did NOT pick ${MOVE_UI[v.peekInfo][1]}.`]);
  if (v.lockFirst && !me_.locked) hints.push(['warn', '👁️ Your rival used Peek: you lock in first.']);
  if (v.mustWait) hints.push(['', '👁️ Waiting for your rival to lock in first (your Peek)…']);
  $('#d-hints').innerHTML = hints.map(([c, t]) => `<div class="hint ${c}">${t}</div>`).join('');
  // controls
  const locked = me_.locked || D.v.status !== 'live';
  $('#s-duel').classList.toggle('locked', locked);
  $('#d-wait').textContent = v.mustWait ? 'Waiting for your rival to lock in first…' : 'Locked in · waiting for your rival…';
  if (v.mustWait) { $('#s-duel').classList.add('locked'); }
  if (D.sel.move && !v.allowed.includes(D.sel.move)) D.sel.move = null;
  $$('#d-moves .move').forEach(b => { b.disabled = !v.allowed.includes(b.dataset.move); b.classList.toggle('on', D.sel.move === b.dataset.move); });
  const sk = $('#d-skills');
  if (sk.dataset.built !== me_.loadout.join()) {
    sk.innerHTML = me_.loadout.map(k => `<button class="sk" data-k="${k}"><i>${SKILLS[k].icon}</i><div>${SKILLS[k].name}<em><span class="cost">${SKILLS[k].cost} ⚡</span> · <span class="uses"></span></em></div></button>`).join('');
    sk.dataset.built = me_.loadout.join();
    $$('#d-skills .sk').forEach(n => tipFor(n, n.dataset.k));
  }
  $$('#d-skills .sk').forEach(n => {
    const k = n.dataset.k, s = SKILLS[k], uses = me_.uses[k];
    n.querySelector('.uses').textContent = `${uses} left`;
    const can = uses > 0 && me_.focus >= s.cost;
    if (!can && D.sel.skill === k) { D.sel.skill = null; D.sel.target = null; }
    n.classList.toggle('na', !can); n.classList.toggle('on', D.sel.skill === k);
  });
  const needs = D.sel.skill && SKILLS[D.sel.skill].needs === 'move';
  $('#d-target').classList.toggle('show', !!needs);
  if (needs) { $('#d-target-skill').textContent = SKILLS[D.sel.skill].name; $$('#d-target button').forEach(b => b.classList.toggle('on', b.dataset.t === D.sel.target)); }
  $('#d-lock').disabled = !D.sel.move || (needs && !D.sel.target);
  $('#d-lock').textContent = D.sel.move ? `Lock in ${MOVE_UI[D.sel.move][1]}${D.sel.skill ? ` + ${SKILLS[D.sel.skill].name}` : ''}` : 'Pick a move';
  paintTimer();
}
function paintTimer() {
  if (!D) return;
  const t = $('#d-timer');
  if (D.local || !D.v.deadline) { t.style.visibility = 'hidden'; return; }
  t.style.visibility = 'visible';
  const skew = Date.parse(D.v.serverTime) - Date.now();
  const left = Math.max(0, (Date.parse(D.v.deadline) - (Date.now() + skew)) / 1000);
  $('#d-timer-t').textContent = Math.ceil(left);
  $('#d-timer-ring').style.strokeDashoffset = 107 * (1 - left / 25);
  t.classList.toggle('low', left < 6);
  if (left <= 0 && !D.busy && !D.expiredAt) { D.expiredAt = Date.now(); refresh(); }
  if (left > 0) D.expiredAt = 0;
}
$('#d-moves').onclick = e => { const b = e.target.closest('[data-move]'); if (!b || b.disabled) return; D.sel.move = b.dataset.move; sfx('select'); paintDuel(); };
$('#d-skills').onclick = e => {
  const b = e.target.closest('[data-k]'); if (!b) return;
  if (b.classList.contains('na')) return sfx('denied');
  const k = b.dataset.k;
  if (D.sel.skill === k) { D.sel.skill = null; D.sel.target = null; sfx('deselect'); }
  else { D.sel.skill = k; D.sel.target = null; sfx('select'); }
  paintDuel();
};
$('#d-target').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; D.sel.target = b.dataset.t; paintDuel(); };
$('#d-lock').onclick = async () => {
  if (!D?.sel.move) return;
  const action = { id: D.id, move: D.sel.move, skill: D.sel.skill, target: D.sel.target };
  $('#d-lock').disabled = true; sfx('energy');
  try {
    const v = D.local ? await D.local.act(action) : await api('match/act', action);
    D.sel = { move: null, skill: null, target: null };
    await handle(v);
  } catch (e) { toast(e.message, true); $('#d-lock').disabled = false; }
};
$('#d-menu').onclick = async () => {
  const r = await modal('<h3>Match menu</h3><p class="muted">Leaving counts as a loss.</p>', [['Keep playing', 0, 'primary'], ['How to play', 2, 'ghost'], ['Forfeit', 1, 'ghost']]);
  if (r === 2) { renderCodex(); show('codex'); }
  if (r === 1) {
    try { const v = D.local ? await D.local.forfeit() : await api('match/forfeit', { id: D.id }); await handle(v); } catch (e) { toast(e.message, true); }
  }
};

// reveal: VS card, then the 3D clash
const up = (f, y) => f.root.position.clone().add(new THREE.Vector3(0, y * f.root.scale.y, 0));
const NOTE = {
  mirror: '🪞 MIRROR', quickdraw: '⚡ QUICK DRAW', overcharge: '🔥 OVERCHARGE x2', ironmind: '🛡️ IRON MIND', chaos: '🎲 CHAOS',
};
async function reveal(ev, v) {
  $('#s-duel').classList.add('reveal');
  const seat = v.seat, mine = ev.moves[seat], theirs = ev.moves[1 - seat];
  const w = ev.win === null ? null : ev.win === seat ? 0 : 1;          // 0 = me, 1 = rival
  if (ev.notes.some(n => n.k === 'chaos')) await banner('<div class="bt">CHAOS!</div><small>BOTH MOVES ARE RANDOM</small>', 900);
  const card = (m, cls) => `<div class="mv ${m} ${cls}"><i>${MOVE_UI[m][0]}</i><b>${MOVE_UI[m][1]}</b></div>`;
  sfx('cast');
  const pickNames = ev.picks.map(p => p.skill ? `${SKILLS[p.skill].icon} ${SKILLS[p.skill].name}` : '');
  await banner(`<div class="vs">${card(mine, w === 0 ? 'win' : w === 1 ? 'lose' : '')}<div class="x">VS</div>${card(theirs, w === 1 ? 'win' : w === 0 ? 'lose' : '')}</div>
    <small>${w === null ? 'TIE' : w === 0 ? 'YOU WIN THE CLASH' : 'RIVAL WINS THE CLASH'}${pickNames[seat] || pickNames[1 - seat] ? ` · ${[pickNames[seat] && 'you: ' + pickNames[seat], pickNames[1 - seat] && 'rival: ' + pickNames[1 - seat]].filter(Boolean).join(' · ')}` : ''}</small>`, 1250);
  await clash(ev, seat, w);
  // skill callouts + numbers
  for (const n of ev.notes) {
    const f = D.F[n.i === undefined ? 0 : n.i === seat ? 0 : 1];
    if (n.k === 'heal') { rise(f.root.position, '#7dff9a'); popText(`+${n.hp}`, up(f, 2.3), 'heal'); sfx('heal'); }
    else if (n.k === 'drain') { popText(`🌀 -${n.focus} ⚡`, up(D.F[n.i === seat ? 1 : 0], 2.6), 'status'); sfx('debuff'); }
    else if (n.k === 'counter') popText(n.hit ? '💥 COUNTER!' : '💥 counter missed', up(f, 2.9), n.hit ? 'crit' : 'miss');
    else if (NOTE[n.k]) popText(NOTE[n.k], up(f, 2.9), 'status');
  }
  for (const p of ev.picks.map((p, i) => [p, i])) {
    const [pk, i] = p, k = pk.skill, f = D.F[i === seat ? 0 : 1];
    if (k && SKILLS[k].when === 'next') { popText(`${SKILLS[k].icon} ${SKILLS[k].name.toUpperCase()}`, up(f, 3.1), 'status'); sfx('buff'); }
  }
  D.v = { ...D.v, view: { ...D.v.view, me: { ...D.v.view.me, hp: ev.hp[seat], focus: ev.focus[seat] }, rival: { ...D.v.view.rival, hp: ev.hp[1 - seat], focus: ev.focus[1 - seat] } } };
  paintDuel();
  await wait(650);
  if (ev.roundOver) {
    const rw = ev.roundOver.winner, rwMe = rw === null ? null : rw === seat;
    const loser = rw === null ? null : D.F[rwMe ? 1 : 0];
    if (loser) { loser.ko = true; loser.play('ko'); sfx('ko'); shake(0.4); slowmo(0.6, 0.3); burst(loser.chest, loser.colors, 70, 1.5); }
    await wait(800);
    await banner(`<div class="bt">${rw === null ? 'DRAW' : rwMe ? 'ROUND WON' : 'ROUND LOST'}</div><small>${ev.roundOver.rounds[seat]} – ${ev.roundOver.rounds[1 - seat]}</small>`, 1300);
    if (!ev.matchOver) {
      D.F.forEach(f => { if (f) { f.ko = false; f.act = null; } });
      placeFighters(v.view, true);
      D.F.forEach(f => { f.ko = false; f.act = null; });
      await wait(400);
      sfx('round');
    }
  }
  $('#s-duel').classList.remove('reveal');
}
async function clash(ev, seat, w) {
  const [A, B] = D.F, mine = ev.moves[seat], theirs = ev.moves[1 - seat];
  const dmgMe = ev.dmg[seat], dmgRv = ev.dmg[1 - seat];
  const hit = (f, d, big) => {
    if (d <= 0) { popText('0', up(f, 2.2), 'shield'); sfx('block'); return; }
    f.flash = 1; f.play(big ? 'hitBig' : 'hit');
    burst(f.chest, f.colors, big ? 40 : 18, big ? 1.3 : 0.9);
    popText(String(d), up(f, 2.2), big ? 'crit' : '');
    sfx(big ? 'crit' : 'hit'); shake(big ? 0.3 : 0.12);
    if (big) { slowmo(0.35, 0.3); flash(0.25); }
  };
  const meleeOf = f => f.p.item ? 'slash' : 'punch';
  if (w === null) {                                       // tie: both meet in the middle
    let met = 0;
    const meet = () => { if (++met === 2) { burst(new THREE.Vector3(0, 1.1, 0), ['#ffffff', '#d4ff1f'], 30, 1, true); sfx('block'); shake(0.15); } };
    // aim each at a spot just short of the centre so they collide mid-stage
    const spot = f => ({ home: new THREE.Vector3(-f.dir * 0.42 + f.dir * 1.45 * f.root.scale.x, 0, 0) });
    await Promise.all([A.perform(meleeOf(A), spot(A), meet), B.perform(meleeOf(B), spot(B), meet)]);
    hit(A, dmgMe); hit(B, dmgRv);
    await wait(350);
    return;
  }
  const [W, L] = w === 0 ? [A, B] : [B, A], mw = w === 0 ? mine : theirs, dmgL = w === 0 ? dmgRv : dmgMe;
  const big = dmgL > RULES.dmg;
  const counter = ev.notes.some(n => n.k === 'counter' && n.hit);
  if (counter) { await W.perform('smash', L, () => hit(L, dmgL, true)); return; }
  if (mw === 'strike') {                                  // strike beats trick: catch them mid-feint
    L.play('cast');
    await W.perform(meleeOf(W), L, () => hit(L, dmgL, big));
  } else if (mw === 'guard') {                            // guard beats strike: block, then punish
    W.play('guard');
    await L.perform(meleeOf(L), W, () => { ring(W.root.position, '#7fdcff'); sfx('shield'); burst(W.chest, ['#7fdcff', '#ffffff'], 20, 0.8, true); setTimeout(() => hit(L, dmgL, big), 120); });
  } else {                                                // trick beats guard: go around the guard
    L.play('guard');
    await W.perform('cast', null, async () => { await shoot(up(W, 1.0), L.chest, '#c37dff'); hit(L, dmgL, big); });
  }
}

async function finish(v) {
  if (!D || D.finished) return;
  D.finished = true;
  clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.();
  const seat = v.seat, won = v.winner === seat, draw = v.winner === null;
  const winF = draw ? null : D.F[won ? 0 : 1];
  winF?.play('win');
  if (winF) camTo(winF.home.clone().add(new THREE.Vector3(winF.dir * 1.5, 2.2, 6.5)), up(winF, 1.0), 0.04);
  sfx(won ? 'victory' : draw ? 'round' : 'defeat'); music(null);
  await banner(`<div class="bt" style="color:${won ? 'var(--lime)' : draw ? '#fff' : 'var(--red)'}">${won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT'}</div>`, 1500);
  $('#r-title').textContent = won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT';
  $('#r-title').style.color = won ? 'var(--lime)' : draw ? '#fff' : 'var(--red)';
  $('#r-score').textContent = `${v.view.me.rounds} – ${v.view.rival.rounds}${v.status === 'abandoned' ? ' · forfeit' : ''}`;
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
      $('#pf-pfps').innerHTML = myMinds.map(id => `<div class="mind ${id === pfPick ? 'on' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag">#${id}</span></div>`).join('');
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
  <h3>The idea</h3>
  <p>Mindclash is a 1v1 duel of <b>reading minds</b>. Every turn you and your rival secretly pick a move, then both reveal at the same time. Every Mind has the same stats: only your choices decide who wins.</p>
  <div class="rps"><div>⚔️ <b>Strike</b><br>beats 🌀 Trick</div><div>🛡️ <b>Guard</b><br>beats ⚔️ Strike</div><div>🌀 <b>Trick</b><br>beats 🛡️ Guard</div></div>
  <h3>Turns, HP and rounds</h3>
  <ul><li>Both Minds start each round with <b>${RULES.hp} HP</b>. The winner of a clash deals <b>${RULES.dmg} damage</b>. A tie hurts both for <b>${RULES.tieDmg}</b>.</li>
  <li>A round ends when a Mind hits 0 HP (or after ${RULES.maxTurns} turns: most HP wins). <b>Win ${RULES.roundsToWin} rounds</b> to win the match.</li>
  <li>Bring <b>1 to 3 Minds</b>: they take turns, one per round. A single Mind fights every round with no disadvantage.</li>
  <li>Ranked turns have a <b>25 second</b> timer. If it runs out, a random move is picked for you. 3 timeouts in a row is a forfeit.</li></ul>
  <h3>Focus ⚡</h3>
  <p>You start each round with 0 Focus and gain <b>+1 every turn</b>, plus <b>+1 extra when you lose a clash</b> (comeback). Max ${RULES.maxFocus}. Skills cost Focus, so early turns are pure mind games and big plays come later.</p>
  <h3>Skills</h3>
  <p>Before each match you pick <b>4 of the 12 skills</b> below. Everyone chooses from the same 12. Each skill can be used <b>2 times per match</b>, and you can use <b>one skill per turn</b> together with your move. Hover or long-press a skill in battle to see this again.</p>
  <table>${SKILL_IDS.map(k => { const s = SKILLS[k]; return `<tr><td>${s.icon} ${s.name}</td><td>${s.cost} ⚡</td><td>${s.desc} <span class="muted">(${s.when === 'next' ? 'next turn' : 'this turn'})</span></td></tr>`; }).join('')}</table>
  <h3>Ranking and fairness</h3>
  <ul><li>Ranked wins and losses change your <b>rating</b> (Elo). Games vs bots count half.</li>
  <li><b>Points</b>: 10 per ranked win, plus a rarity bonus for the Minds you brought (Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%). Rarity never changes how a Mind plays.</li>
  <li>If no player is found in 20 seconds you play a <b>bot</b>, always labelled BOT.</li>
  <li>Every turn runs on the game server, and your rival's pick is never sent to your device, so nobody can peek or cheat.</li></ul>`;
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
  if (await modal('<h3>Sign out?</h3>', [['Cancel', 0, 'ghost'], ['Sign out', 1, 'primary']])) { logout(); me = null; show('login'); }
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
  if (!online) $('#btn-wallet').disabled = true, $('#btn-guest').textContent = 'Practice offline vs bots';
  show('login');
})();
