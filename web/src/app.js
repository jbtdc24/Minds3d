// Mindclash client: lobby, sign-in, matchmaking, the Mind Summoners duel (2D stage, lanes, creature cards, reveal),
// quick chat, friends, leaderboard, profile, interactive tutorial.
import { loadData, tokenIds, rarityOf } from './nft2d.js';
import { setStage, setLayout, setQuality, camTo, camSnap, shake, slowmo, flash, burst, rise, ring, stars, popText, toScreen, onFrame, setSpeed, speedSetting, BATTLE_STAGES, STAGES, preload, stage } from './stage2d.js';
import { Fighter, shoot } from './fighter2d.js';
import { createMatch as createSummonMatch, submit as submitSummon, viewFor as viewSummon, forfeitMatch as forfeitSummon, heroOf, DECK_IDS } from './summon/match.js';
import { CARD, CREATURES, STARTER_DECKS, HERO_SKILLS, ELEMENT_INFO, abilitiesOf, RULES as SUMMON_RULES } from './summon/cards.js';
import { SKILL_TARGET } from './summon/engine.js';
import { botAct } from './summon/bot.js';
import { creatureImg } from './summon/art.js';
import { DATA_VERSION } from './config.js';
import { api, session, walletLogin, guestLogin, logout, hasWallet, watch, serverOnline, LocalMatch, setTokenIds } from './net.js';
import { initAudio, sfx, music, setVolume } from './audio.js';
import { PHRASES, MATCH_CHAT, FRIEND_CHAT, BOT_REPLIES } from './chat.js';
import { capOf, ENERGY_CAP } from './energy.js';
import { openIsland, closeIsland, refreshHud, cropImg, fmtTime } from './island/island.js';
import { isle, loadIsland, doAct, flush as flushIsland, resetIsland, now as islandNow } from './island/store.js';
import { CROPS, RAW, growMs, permitCost, MAX_PERMITS, ripe } from './island/rules.js';
import { islandThumb } from './island/art.js';
import { hashStr } from './island/gen.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms / speedSetting));
const thumb = id => `data/thumbs/${id || 1}.webp?v=${DATA_VERSION}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RAR_COLOR = { Legendary: '#d68a00', Epic: '#9b6bff', Rare: '#2f8fd0', Uncommon: '#3a9a00', Common: '#6d6987' };
const TURN_SECONDS = 30;
const narrow = () => innerWidth <= 900;

// ---------- settings (per device) ----------
const SKEY = 'mindclash.settings';
const settings = { music: 0.45, sfx: 0.8, quality: 'high', speed: 1, picks: {}, tutorialDone: false, seen: {} };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch { /* defaults */ }
settings.seen ||= {};
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* private mode */ } };
function applySettings() {
  setVolume(settings.music, settings.sfx); setQuality(settings.quality); setSpeed(settings.speed);
  $('#set-music').value = settings.music; $('#set-sfx').value = settings.sfx;
  for (const [id, key] of [['set-quality', 'quality'], ['set-speed', 'speed']])
    $$(`#${id} button`).forEach(b => b.classList.toggle('on', String(settings[key]) === b.dataset.v));
}

// ---------- ui helpers ----------
// full screens (lobby, duel, ...) vs windows that pop up over the current screen (profile, settings, ...)
const WINDOWS = new Set(['prep', 'leaderboard', 'profile', 'settings', 'codex', 'inventory', 'shop']);
let current = 'boot', previous = 'hub', base = 'boot';
function show(id) {
  if (!['settings', 'codex'].includes(id)) previous = current;
  current = id;
  if (!WINDOWS.has(id)) base = id;
  if (base !== 'island') { closeIsland(); stage.paused = false; }
  document.body.classList.toggle('in-island', base === 'island');
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + id || (WINDOWS.has(id) && s.id === 's-' + base)));
  if (['hub', 'prep', 'leaderboard', 'profile'].includes(id) && base === 'hub') music('menu');
  if (id === 'login') music('title');
  if (base !== 'hub' && base !== 'duel') clearTags();
  $('#tags').classList.toggle('dim', WINDOWS.has(id));
}
// close a window: back to the screen underneath (the lobby keeps its Minds, no reload)
function closeWindow() {
  if (base === 'hub') { show('hub'); paintHub(); loadBoard(); return; }
  if (base === 'island') { show('island'); refreshHud(); return; }
  if (base === 'duel' && D) return show('duel');
  enterHub();
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
// ---------- the stage: lobby showcase + name tags / chat bubbles over the Minds ----------
let stageFighters = [];
const clearStage = () => { stageFighters.forEach(f => f.dispose()); stageFighters = []; };
let tags = [];
function clearTags() { tags.forEach(t => t.el.remove()); tags = []; }
function tag(fighter, html, cls = 'nametag', ttl = 0) {
  const e = el('div', cls, html); $('#tags').append(e);
  const t = { el: e, f: fighter, until: ttl ? performance.now() + ttl : 0, lift: cls === 'bubble' ? 0.7 : 0.35 };
  tags.push(t);
  return t;
}
onFrame(() => {
  const now = performance.now();
  tags = tags.filter(t => {
    if (t.until && now > t.until) { t.el.remove(); return false; }
    const h = t.f.head, p = toScreen(h.x, h.y + t.lift);
    t.el.style.left = `${p.x}px`; t.el.style.top = `${p.y}px`;
    return true;
  });
});
function lobbyLayout() {
  if (narrow()) { setLayout({ groundAt: current === 'hub' ? 0.3 : 0.6 }); camSnap(0, 0.85); return; }
  setLayout({ groundAt: 0.7 });
  // centre the plaza (and the Minds on it) in the free space between the play column and the leaderboard
  const l = $('.col-play').getBoundingClientRect(), open = !$('#s-hub').classList.contains('board-closed');
  const r = open ? $('#board').getBoundingClientRect() : $('#board-tab').getBoundingClientRect();
  const free = l.width && current === 'hub' ? (l.right + (r.width ? r.left : innerWidth)) / 2 : innerWidth / 2;
  camSnap(-(free - innerWidth / 2) / stage.K, 1);
}
// collapsible leaderboard: open by default on wide screens, a slim tab otherwise
const boardOpen = () => settings.boardOpen ?? innerWidth >= 1500;
function paintBoardOpen() { $('#s-hub').classList.toggle('board-closed', !boardOpen()); if (current === 'hub') lobbyLayout(); }
$('#board-hide').onclick = e => { e.stopPropagation(); settings.boardOpen = false; saveSettings(); paintBoardOpen(); };
$('#board-tab').onclick = () => { settings.boardOpen = true; saveSettings(); paintBoardOpen(); };
function lobbyScene(ids) {
  clearStage(); clearTags();
  setStage('lobby');
  const list = ids.slice(0, 3), xs = list.length === 1 ? [0] : list.length === 2 ? [-0.75, 0.75] : [-1.4, 0, 1.4];
  list.forEach((id, i) => {
    const f = new Fighter(id, xs[i], 0, { scale: 0.72 });
    f.dropIn(0.2 + i * 0.18);
    stageFighters.push(f);
    if (current === 'hub') tag(f, `#${id} <i>${rarityOf(id)}</i>${!guest && myMinds.includes(id) ? ` <span class="ten">⚡${energyOf(id)}/${capFor(id)}</span>` : ''}`);
  });
  lobbyLayout();
}
addEventListener('resize', () => { if (current === 'hub') paintBoardOpen(); if (current === 'duel') duelLayout(); });

// ---------- account ----------
let me = null, myMinds = [], guest = false, online = false, energy = {}, energyResetAt = 0;
// the account is remembered on this device so the game opens instantly; the server copy refreshes in the background
const ACC_KEY = 'mindclash.account';
const saveAccount = () => { try { localStorage.setItem(ACC_KEY, JSON.stringify({ token: session.token, me, myMinds, guest, energy, energyResetAt })); } catch { /* private mode */ } };
function loadAccount() {
  try { const a = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); if (a && a.token === session.token && a.me) return a; } catch { /* ignore */ }
  return null;
}
async function refreshMe() {
  // send the Minds we saw last time: the server verifies them on-chain in one quick call instead of a full scan
  const r = await api(`me${!guest && myMinds.length ? `?known=${myMinds.join(',')}` : ''}`);
  me = r.player; myMinds = r.minds; guest = r.guest;
  energy = r.energy || {}; energyResetAt = Date.now() + (r.energyResetIn || 0);
  saveAccount();
  return r;
}
// ---------- Mind Energy: ranked matches use 1 ⚡ per Mind; refills at 00:00 UTC ----------
const capFor = id => capOf(rarityOf(id));
const energyOf = id => energy[id] ?? capFor(id);
const totalEnergy = () => myMinds.reduce((s, id) => s + energyOf(id), 0);
const resetText = () => { const m = Math.max(0, Math.round((energyResetAt - Date.now()) / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const BONUS = { Common: 0, Uncommon: 0.05, Rare: 0.10, Epic: 0.15, Legendary: 0.20 };
const winReward = ids => Math.round(ids.reduce((s, id) => s + 10 * (1 + BONUS[rarityOf(id)]), 0));
// refresh energy in the background (never block a tap on the server); repaint whatever is open
function refreshEnergy() {
  return refreshMe().then(() => {
    paintHub();
    if (current === 'inventory') paintInventory();
    if (current === 'prep' && prep.mode === 'ranked') { prep.minds = prep.minds.filter(id => energyOf(id) > 0); renderPrepGrid(); }   // keeps your picks
  }).catch(() => {});
}
const energyTag = id => { const n = energyOf(id), c = capFor(id); return `<span class="en ${n ? '' : 'none'}" title="Ranked energy left today">⚡${n}/${c}</span>`; };
const picked = () => { const p = (settings.picks.minds || []).filter(id => myMinds.includes(id)); return p.length ? p : myMinds.slice(0, 3); };
const showcaseIds = () => { const s = (me?.showcase || []).filter(id => myMinds.includes(id)); return s.length ? s : picked().length ? picked() : [me?.pfp || 49]; };
function paintHub() {
  $('#hub-pfp').src = thumb(me.pfp); $('#hub-name').textContent = me.name;
  $('#hub-sub').innerHTML = guest ? 'Trial account' : `${valIcon('rating')}${me.rating} &nbsp;${valIcon('points')}${me.points}`;
  $('#inv-badge').textContent = guest ? '' : `⚡${totalEnergy()}`;
  $('#inv-badge').classList.toggle('on', !guest);
  $('#guest-note').style.display = guest ? 'block' : 'none';
  islandTile();
  $('#hub-ranked-sub').textContent = guest ? 'Connect a wallet to play ranked' : `⚡ ${totalEnergy()} energy left today · refills in ${resetText()}`;
  $('#hub-ranked-tag').textContent = guest ? '🔒 WALLET' : 'PLAY';
  $('#hub-ranked').classList.toggle('locked', guest);
}
async function enterHub() {
  paintHub();
  show('hub');
  paintBoardOpen();
  lobbyScene(showcaseIds());
  loadBoard();
  friendsPoll();
  if (!settings.tutorialDone && !settings.tutorialAsked) {
    settings.tutorialAsked = true; saveSettings();
    const r = await modal(`<img class="wide" src="assets/stage_meadow.webp" alt=""><h3>New here?</h3><p>Learn Mindclash in 2 minutes with a guided duel.</p>`, [['Start tutorial', 1, 'primary'], ['Skip', 0]]);
    if (r) startTutorial();
  }
}
async function afterLogin(out) {
  me = out.player; myMinds = out.minds; guest = !!out.guest;
  resetIsland();
  saveAccount();
  if (!guest && !myMinds.length) {
    await modal(`<h3>No Minds found</h3><p class="muted">This wallet doesn't hold any minds.games NFTs on Robinhood Chain yet. You can still try the game with demo Minds.</p>`, [['Try with demo Minds', 1, 'primary']]);
    logout(); return startGuest();
  }
  if (out.isNew && !guest) return openSetup();
  enterHub();
  if (!guest && online) refreshEnergy();
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
  resetIsland();
  me = { name: 'Guest', pfp: 49, rating: 1000, points: 0, wins: 0, losses: 0, showcase: [] }; myMinds = [49, 14, 8].filter(id => tokenIds().includes(id)); guest = true;
  if (!myMinds.length) myMinds = tokenIds().slice(0, 3);
  toast('Server offline: practice vs bots only.');
  enterHub();
}

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
  if (go === 'back') return WINDOWS.has(previous) && previous !== current ? show(previous) : closeWindow();
  if (go === 'hub') return WINDOWS.has(current) ? closeWindow() : enterHub();
  if (go === 'leaderboard') return openLeaderboard();
  if (go === 'codex') { renderCodex(); return show('codex'); }
  if (go === 'settings') { $('#set-account').textContent = guest ? 'Trial (guest)' : me?.address || ''; return show('settings'); }
  show(go);
});
$('#hub-ranked').onclick = async () => {
  if (!guest) { openPrep('ranked'); if (online) refreshEnergy(); return; }
  const r = await modal(`<img class="wide" src="assets/mode_ranked.webp" alt=""><h3>Ranked is for Mind holders</h3><p>Trial accounts can practice vs bots. Connect a wallet that holds a Mind to play ranked, climb the leaderboard and earn points.</p>`, [['Connect wallet', 1, 'primary'], ['Practice instead', 2], ['Close', 0]]);
  if (r === 1) { logout(); show('login'); } else if (r === 2) openPrep('practice');
};
$('#hub-practice').onclick = () => openPrep('practice');
$('#hub-classic').onclick = () => openPrep('classic');
$('#hub-learn').onclick = () => startTutorial();
$('#hub-tutorial').onclick = () => startTutorial();
$('#hub-me').onclick = () => openProfile(me.id);

// ---------- inventory: every Mind you own with its own energy, and your island items ----------
function invItems() {
  if (!isle.state) return '<div class="inv-empty"><div class="inv-chest">🎁</div><b>Loading your items…</b></div>';
  const inv = isle.state.inv, cell = (img, name, n) => `<div class="item px"><div class="item-img">${img}</div><b>${name}</b><em>×${n.toLocaleString()}</em></div>`;
  const cells = [cell('<i>✨</i>', 'Dust', isle.state.dust)];
  for (const c of Object.keys(CROPS)) { if (inv['crop_' + c]) cells.push(cell(`<img src="${cropImg(c)}" alt="">`, CROPS[c].name, inv['crop_' + c])); }
  for (const c of Object.keys(CROPS)) { if (inv['seed_' + c]) cells.push(cell(`<img class="seedimg" src="${cropImg(c)}" alt="">`, CROPS[c].name + ' seeds', inv['seed_' + c])); }
  if (inv.wood) cells.push(cell('<i>🪵</i>', 'Wood', inv.wood));
  if (inv.stone) cells.push(cell('<i>🪨</i>', 'Stone', inv.stone));
  if (inv.permit) cells.push(cell('<i>📜</i>', 'Land Permit', inv.permit));
  return `<div class="items-grid">${cells.join('')}</div><div class="items-foot"><button class="btn small" id="inv-go-island">🏝️ Go to my island</button><button class="btn small" id="inv-go-shop">🛒 Shop</button></div>`;
}
document.addEventListener('click', e => {
  if (e.target.closest('#inv-go-island')) goIsland();
  if (e.target.closest('#inv-go-shop')) openShop();
});
let invTab = 'minds';
function openInventory() {
  paintInventory(); show('inventory');
  if (online && !guest) refreshEnergy();
}
function paintInventory() {
  const max = myMinds.reduce((s, id) => s + capFor(id), 0), shown = new Set(me?.showcase || []);
  $$('#inv-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === invTab));
  $('#inv-sum').innerHTML = guest
    ? '<b>Trial account</b><span>These are free demo Minds. Connect a wallet to see your own Minds and their ranked energy.</span>'
    : `<div class="inv-total"><i>⚡</i><div><b>${totalEnergy()}<small>/${max}</small></b><span>ranked energy today</span></div></div>
       <div class="inv-facts"><span><b>${myMinds.length}</b> Minds</span><span>Refills in <b>${resetText()}</b> (00:00 UTC)</span><span>1 ⚡ per Mind per ranked match · Classic &amp; Practice are free</span></div>`;
  const order = [...myMinds].sort((a, b) => energyOf(b) - energyOf(a) || a - b);
  $('#inv-minds').innerHTML = order.map(id => {
    const n = energyOf(id), c = capFor(id), r = rarityOf(id);
    const flags = (shown.has(id) ? '<em class="inv-flag">SHOWCASE</em>' : '') + (me?.pfp === id ? '<em class="inv-flag is-pfp">PROFILE</em>' : '');
    const bar = guest ? '<div class="inv-free">Demo · Classic &amp; Practice</div>'
      : `<div class="inv-en"><div class="enbar">${Array.from({ length: c }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div><span>⚡${n}/${c}</span></div>`;
    return `<div class="inv-mind ${!guest && !n ? 'tired' : ''}" data-id="${id}" style="--rar:${RAR_COLOR[r]}">
      <div class="inv-img"><img src="${thumb(id)}" alt="" loading="lazy">${flags}</div>
      <div class="inv-name"><b>#${id}</b><span>${r}</span></div>${bar}</div>`;
  }).join('');
  $('#inv-items').innerHTML = invItems();
  if (invTab === 'items' && !isle.loaded) ensureIsland().then(ok => { if (ok && current === 'inventory') paintInventory(); });
  $('#inv-minds').style.display = invTab === 'minds' ? '' : 'none';
  $('#inv-items').style.display = invTab === 'items' ? '' : 'none';
}
$('#hub-inv').onclick = openInventory;

// ---------- Mind Island: farm, Shop, and island items in the inventory ----------
async function ensureIsland() {
  if (isle.loaded && isle.offline === !online) return true;
  try { await loadIsland({ online, guestSeed: me?.id || me?.name, minds: guest ? 0 : myMinds.length }); return true; }
  catch (e) { toast(e.message, true); return false; }
}
async function goIsland() {
  if (!(await ensureIsland())) return;
  show('island'); stage.paused = true;
  openIsland({ minds: myMinds, toast: (m, bad) => toast(m, bad), shop: tab => openShop(tab), bag: () => { invTab = 'items'; openInventory(); } });
}
$('#hub-island').onclick = goIsland;
$('#shop-go-island').onclick = goIsland;
$('#isl-back').onclick = () => enterHub();
$('#hub-shop').onclick = () => openShop();
// the lobby tile shows a picture of your own island (made once, after the lobby has settled)
let thumbFor = null;
function islandTile() {
  const id = me?.id || me?.name || 'guest';
  if (thumbFor !== id) {
    thumbFor = id;
    setTimeout(() => { try { $('#hub-island').style.setProperty('--bg', `url(${islandThumb(isle.loaded ? isle.seed : hashStr(id))})`); } catch { /* fine without a picture */ } }, 900);
  }
  const ready = isle.state ? Object.values(isle.state.tiles).filter(t => ripe(t, islandNow(), isle.minds)).length : 0;
  $('#hub-island-ready').textContent = ready ? `${ready} ready` : '';
  $('#hub-island-ready').style.display = ready ? 'block' : '';
}

let shopTab = 'seeds';
async function openShop(tab) {
  if (tab) shopTab = tab;
  if (!(await ensureIsland())) return;
  paintShop(); show('shop');
}
const shopCard = (img, name, desc, have, btns, cls = '') => `<div class="shop-card px ${cls}"><div class="shop-img">${img}</div><div class="shop-txt"><b>${name}</b><span>${desc}</span>${have !== null ? `<em>You have ${have}</em>` : ''}</div><div class="shop-btns">${btns}</div></div>`;
const RAW_ICON = { wood: '🪵', stone: '🪨' };
function paintShop() {
  const st = isle.state, inv = st.inv;
  $$('#shop-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === shopTab));
  $('#shop-dust').textContent = st.dust.toLocaleString();
  $('#shop-note').textContent = guest ? 'Trial island: selling gives no leaderboard points.' : 'Selling crops: +1 leaderboard point per 100 ✨ (max 20 a day)';
  let html = '';
  if (shopTab === 'seeds') html = Object.entries(CROPS).map(([c, d]) => shopCard(`<img src="${cropImg(c)}" alt="">`, `${d.name} seeds`, `Grows in ${fmtTime(growMs(c, isle.minds))} · sells for ${d.sell} ✨`, inv['seed_' + c] || 0,
    `<button class="btn small primary" data-act="buy" data-item="seed_${c}" data-n="1" ${st.dust < d.seed ? 'disabled' : ''}>Buy 1 · ${d.seed} ✨</button><button class="btn small" data-act="buy" data-item="seed_${c}" data-n="10" ${st.dust < d.seed * 10 ? 'disabled' : ''}>Buy 10 · ${d.seed * 10} ✨</button>`)).join('');
  else if (shopTab === 'sell') {
    const items = [...Object.keys(CROPS).map(c => ['crop_' + c, CROPS[c].name, CROPS[c].sell, `<img src="${cropImg(c)}" alt="">`]), ...Object.entries(RAW).map(([k, d]) => [k, d.name, d.sell, `<i>${RAW_ICON[k]}</i>`])].filter(([k]) => inv[k] > 0);
    html = items.length ? items.map(([k, name, price, img]) => shopCard(img, name, `${price} ✨ each`, inv[k], `<button class="btn small primary" data-act="sell" data-item="${k}" data-n="${inv[k]}">Sell all · ${price * inv[k]} ✨</button><button class="btn small" data-act="sell" data-item="${k}" data-n="1">Sell 1</button>`)).join('')
      : '<div class="inv-empty"><div class="inv-chest">🧺</div><b>Nothing to sell yet</b><span>Harvest crops on your island, or clear trees and rocks for wood and stone.</span></div>';
  } else if (shopTab === 'land') {
    const have = inv.permit || 0, cost = permitCost(have), max = have >= MAX_PERMITS;
    html = shopCard('<i>📜</i>', 'Land Permit', `+1 farm plot forever. Plots: 6 free, +1 per Mind you own (up to 6), +1 per permit (up to ${MAX_PERMITS}).`, `${have}/${MAX_PERMITS}`,
      max ? '<button class="btn small" disabled>All bought</button>' : `<button class="btn small primary" data-act="buy" data-item="permit" data-n="1" ${st.dust < cost ? 'disabled' : ''}>Buy · ${cost.toLocaleString()} ✨</button>`);
  } else {
    html = [['🌳', 'Decorations', 'Trees, statues, paths and lights for your island'], ['🃏', 'Card backs', 'Show off in every duel · 3,000 ✨'], ['🖼️', 'Profile frames', 'A frame around your profile picture · 5,000 ✨'],
      ['⚡', 'Energy shard', '+1 ranked energy for one Mind · 800 ✨ (1 a day)'], ['🛡️', 'Raid defenses', 'Walls, traps and guards for when raids arrive']]
      .map(([i, n, d]) => shopCard(`<i>${i}</i>`, n, d, null, '<button class="btn small" disabled>Soon</button>', 'soon')).join('');
  }
  $('#shop-grid').innerHTML = html;
}
$('#shop-tabs').onclick = e => { const v = e.target.closest('button')?.dataset.v; if (!v) return; shopTab = v; paintShop(); };
$('#shop-grid').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  const res = doAct({ type: b.dataset.act, item: b.dataset.item, n: +b.dataset.n });
  if (res.error) { sfx('denied'); return toast(res.error, true); }
  sfx('coin');
  const g = res.gain || {};
  toast(b.dataset.act === 'sell' ? `Sold for ${g.dust} ✨` : `Bought! ${-g.dust} ✨ spent`);
  flushIsland(); paintShop(); refreshHud();
};
$('#inv-tabs').onclick = e => { const v = e.target.dataset.v; if (!v) return; invTab = v; paintInventory(); };
$('#inv-minds').onclick = async e => {
  const m = e.target.closest('[data-id]'); if (!m || guest || !online) return;
  const id = +m.dataset.id, n = energyOf(id), c = capFor(id), inShow = (me.showcase || []).includes(id);
  const r = await modal(`<img class="inv-big" src="${thumb(id)}" alt=""><h3>Mind #${id}</h3><p><b style="color:${RAR_COLOR[rarityOf(id)]}">${rarityOf(id)}</b> · ⚡${n}/${c} ranked energy today${n ? '' : ` · refills in ${resetText()}`}</p>`,
    [['Set as profile picture', 1, 'primary'], [inShow ? 'Remove from showcase' : 'Add to lobby showcase', 2], ['Close', 0]]);
  try {
    if (r === 1) { me = (await api('profile', { pfp: id })).player; toast('Profile picture updated!'); }
    if (r === 2) {
      const sc = [...(me.showcase || [])], i = sc.indexOf(id);
      if (i >= 0) sc.splice(i, 1); else { if (sc.length >= 3) return toast('Showcase holds 3 Minds. Remove one first.', true); sc.push(id); }
      me = (await api('profile', { showcase: sc })).player; toast('Showcase updated!');
    }
    if (r) { sfx('coin'); paintHub(); paintInventory(); }
  } catch (err) { toast(err.message, true); }
};
$('#set-rules').onclick = () => { renderCodex(); show('codex'); };
$('#hub-train').onclick = () => modal(`<img class="wide" src="assets/mode_train.webp" alt=""><h3>Train Your Mind</h3><p>Coming soon! Teach your Mind your own play style, then let it play duels on its own.</p>`, [["Can't wait", 1, 'primary']]);
$('#hub-auto').onclick = () => modal(`<img class="wide" src="assets/mode_auto.webp" alt=""><h3>Auto Battle</h3><p>Coming soon! Your trained Minds battle other players' Minds automatically while you watch.</p>`, [["Can't wait", 1, 'primary']]);

// ---------- lobby leaderboard (always visible) ----------
let boardBy = 'rating', boardUnwatch = null;
const valIcon = by => `<img class="vi" src="assets/${by === 'points' ? 'icon_coin' : 'icon_trophy'}.png" alt="">`;
// top 3 on a podium (2nd, 1st, 3rd); empty seats stay visible so the board always looks alive
function podium(players, by) {
  return `<div class="podium">${[1, 0, 2].map(i => {
    const p = players[i];
    return `<div class="pod p${i + 1} ${p ? '' : 'open'} ${p && p.id === me?.id ? 'mine-row' : ''}" ${p ? `data-pid="${p.id}"` : ''}>
      ${i === 0 ? '<img class="pod-crown" src="assets/crown.png" alt="">' : ''}
      <div class="pod-pfp">${p ? `<img src="${thumb(p.pfp)}" alt="">` : '?'}</div>
      <div class="pod-nm">${p ? esc(p.name) : 'Open seat'}</div>
      <div class="pod-vl">${p ? valIcon(by) + (by === 'points' ? p.points : p.rating) : '—'}</div>
      <div class="pod-base">${i + 1}</div></div>`;
  }).join('')}</div>`;
}
async function loadBoard() {
  const list = $('#board-list'), mine = $('#board-me'), top = $('#board-podium');
  if (!online) { top.innerHTML = podium([], boardBy); list.innerHTML = '<li class="board-empty">Live rankings show here when you play online.</li>'; mine.innerHTML = ''; return; }
  try {
    const r = await api(`leaderboard?by=${boardBy}`);
    const row = (p, i) => `<li class="brow ${p.id === me?.id ? 'mine-row' : ''}" data-pid="${p.id}"><span class="rk">${i + 1}</span><img src="${thumb(p.pfp)}" alt=""><span class="nm">${esc(p.name)}</span><span class="vl">${valIcon(boardBy)}${boardBy === 'points' ? p.points : p.rating}</span></li>`;
    top.innerHTML = podium(r.players, boardBy);
    $('#board-tab-pfps').innerHTML = r.players.slice(0, 3).map(p => `<img src="${thumb(p.pfp)}" alt="">`).join('');
    list.innerHTML = r.players.length > 3 ? r.players.slice(3, 12).map((p, i) => row(p, i + 3)).join('')
      : `<li class="board-empty">${r.players.length ? 'More seats open: win a ranked duel to climb!' : 'No ranked games yet. Win one and take the throne!'}</li>`;
    const myRank = r.players.findIndex(p => p.id === me?.id);
    mine.innerHTML = guest ? '<div class="board-empty">Trial players are not ranked.</div>'
      : myRank >= 12 ? `<ol class="board-list">${row(r.players[myRank], myRank)}</ol>` : myRank < 0 ? '<div class="board-empty">Play a ranked duel to join!</div>' : '';
    if (!boardUnwatch) boardUnwatch = await watch('leaderboard', () => { if (current === 'hub') loadBoard(); });
  } catch (e) { list.innerHTML = `<li class="board-empty">${esc(e.message)}</li>`; }
}
$('#board-by').onclick = e => { const v = e.target.dataset.v; if (!v) return; boardBy = v; $$('#board-by button').forEach(b => b.classList.toggle('on', b === e.target)); loadBoard(); };
$('#board').onclick = e => { const p = e.target.closest('[data-pid]'); if (p) openProfile(p.dataset.pid); };

// ---------- prep: pick your Mind (the summoner) and a deck ----------
let prep = { mode: 'ranked', mind: null, deck: null, level: 'normal' };
const heroLine = id => { const h = heroOf(id); return `${ELEMENT_INFO[h.el].icon} ${ELEMENT_INFO[h.el].name} · ${HERO_SKILLS[h.skill].name}`; };
const bestDeck = id => { if (!id) return DECK_IDS[0]; const el = heroOf(id).el; return DECK_IDS.find(d => STARTER_DECKS[d].els.includes(el)) || DECK_IDS[0]; };
function openPrep(mode) {
  prep.mode = mode;
  const usable = id => mode !== 'ranked' || energyOf(id) > 0;
  const last = settings.picks.mind;
  prep.mind = myMinds.includes(last) && usable(last) ? last : myMinds.find(usable) ?? null;
  prep.deck = STARTER_DECKS[settings.picks.deck] ? settings.picks.deck : bestDeck(prep.mind);
  prep.level = settings.picks.level || 'normal';
  $('#prep-title').textContent = { ranked: 'Ranked Duel', classic: 'Classic Duel', practice: 'Practice vs bot' }[mode];
  $('#prep-go').textContent = mode === 'practice' ? 'Start practice' : 'Find match';
  $('#prep-level').style.display = mode === 'practice' ? 'inline-flex' : 'none';
  $$('#prep-level button').forEach(b => b.classList.toggle('on', b.dataset.v === prep.level));
  renderPrepGrid(); renderDecks(); paintPrep();
  show('prep');
}
function renderPrepGrid() {
  const ranked = prep.mode === 'ranked';
  const list = ranked ? [...myMinds].sort((a, b) => (energyOf(b) > 0) - (energyOf(a) > 0)) : myMinds;
  $('#prep-minds').innerHTML = list.map(id => `<div class="mind ${ranked && !energyOf(id) ? 'tired' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag" style="background:${RAR_COLOR[rarityOf(id)]}">#${id}</span>${ranked ? energyTag(id) : ''}<span class="hero-el">${ELEMENT_INFO[heroOf(id).el].icon}</span></div>`).join('');
}
function renderDecks() {
  $('#prep-decks').innerHTML = DECK_IDS.map(d => {
    const dk = STARTER_DECKS[d], show = [...new Set(dk.cards)].filter(id => CARD[id].stage === 3).concat([...new Set(dk.cards)].filter(id => CARD[id].stage === 1).slice(0, 1));
    return `<button class="deck px" data-deck="${d}"><div class="deck-art">${show.map(id => `<img src="${creatureImg(id)}" alt="">`).join('')}</div><b>${dk.name}</b><span>${dk.els.map(e => `${ELEMENT_INFO[e].icon} ${ELEMENT_INFO[e].name}`).join(' + ')}</span><em class="fits">★ fits your Mind</em></button>`;
  }).join('');
}
function paintPrep() {
  $$('#prep-minds .mind').forEach(m => m.classList.toggle('on', +m.dataset.id === prep.mind));
  const el = prep.mind ? heroOf(prep.mind).el : null;
  $$('#prep-decks .deck').forEach(b => { b.classList.toggle('on', b.dataset.deck === prep.deck); b.classList.toggle('fit', !!el && STARTER_DECKS[b.dataset.deck].els.includes(el)); });
  if (prep.mind) {
    const h = heroOf(prep.mind);
    $('#prep-hero').innerHTML = `<img src="${thumb(prep.mind)}" alt=""><div><b>#${prep.mind} · ${heroLine(prep.mind)}</b><span><b>${HERO_SKILLS[h.skill].name}</b> (once per match): ${HERO_SKILLS[h.skill].desc} · <b>${ELEMENT_INFO[h.el].name}</b> creatures counter for +3 instead of +2.</span></div>`;
  } else $('#prep-hero').innerHTML = '<div><span>Pick the Mind who will summon for you.</span></div>';
  $('#prep-note').innerHTML = prep.mode === 'ranked' ? `Uses <b>1 ⚡</b> from your Mind. Win: <b>+${prep.mind ? winReward([prep.mind]) : 10} points</b> and rating. Energy refills in ${resetText()}. No player in 20 s? A Hard bot (counts half).`
    : prep.mode === 'classic' ? 'Classic: real players, with or without Minds. Just for fun: no rating or points. No player in 20 s? You play a bot.' : 'Practice: free, no rating. Pick how strong the bot is.';
  $('#prep-go').disabled = !prep.mind;
  $('#prep-err').textContent = prep.mind ? '' : 'Pick a Mind first.';
}
$('#prep-minds').onclick = e => {
  const m = e.target.closest('[data-id]'); if (!m) return;
  const id = +m.dataset.id;
  if (m.classList.contains('tired')) return toast(`#${id} is out of energy. It refills in ${resetText()}.`, true);
  prep.mind = id; sfx('select'); paintPrep();
};
$('#prep-decks').onclick = e => { const b = e.target.closest('[data-deck]'); if (!b) return; prep.deck = b.dataset.deck; sfx('select'); paintPrep(); };
$('#prep-level').onclick = e => { const v = e.target.dataset.v; if (!v) return; prep.level = v; $$('#prep-level button').forEach(b => b.classList.toggle('on', b === e.target)); };
$('#prep-go').onclick = async () => {
  if (!prep.mind) return;
  settings.picks = { mind: prep.mind, deck: prep.deck, level: prep.level }; saveSettings();
  if (!online) return startDuel(new LocalMatch({ name: me.name, mind: prep.mind, deck: prep.deck, level: prep.mode === 'practice' ? prep.level : 'normal' }));
  const b = $('#prep-go'); b.disabled = true;
  try {
    const r = await api('queue/join', { minds: [prep.mind], deck: prep.deck, ...(prep.mode === 'practice' ? { bot: prep.level } : prep.mode === 'classic' ? { mode: 'classic' } : {}) });
    if (r.match) return openMatch(r.match);
    queueLoop();
  } catch (e) { toast(e.message, true); }
  finally { b.disabled = false; }
};

// ---------- matchmaking ----------
let queueTimer = null;
function queueLoop() {
  $('#queue-pfp').src = thumb(prep.mind);
  $('#queue-msg').textContent = prep.mode === 'classic' ? 'Searching for any player' : 'Searching players near your rating';
  show('queue');
  const tick = async () => {
    try {
      const r = await api('queue/poll', {});
      if (r.match) { stopQueue(); if (r.bot) toast('No player found in time: you are playing a BOT.'); return openMatch(r.match); }
      if (r.idle) { stopQueue(); return enterHub(); }
      $('#queue-msg').textContent = r.botIn > 0 ? `Searching players… a bot joins in ${r.botIn}s` : 'Starting a bot match…';
    } catch (e) { toast(e.message, true); }
  };
  stopQueue(); tick(); queueTimer = setInterval(tick, 2000);
}
const stopQueue = () => { clearInterval(queueTimer); queueTimer = null; };
$('#queue-cancel').onclick = async () => { stopQueue(); try { await api('queue/leave', {}); } catch { /* ignore */ } enterHub(); };

// ---------- the duel: Mind Summoners ----------
let D = null;
const keyOf = ev => ev ? `${ev.turn}:${ev.forfeit ?? ''}:${(ev.timeout || []).join('')}:${ev.events?.length ?? ''}` : '';
const cardInfo = id => { const c = CARD[id], ab = abilitiesOf(c); return `<b>${c.name}</b> · ${ELEMENT_INFO[c.el].icon} ${ELEMENT_INFO[c.el].name} · ${c.cost} Focus · ${c.power} power${ab.length ? ' · ' + ab.map(a => a.text).join(' · ') : ''}`; };
const abShort = c => abilitiesOf(c).map(a => a.n ? `${a.k[0].toUpperCase()}${a.k.slice(1)} ${a.n}` : a.k[0].toUpperCase() + a.k.slice(1)).join(' · ');
async function openMatch(id) {
  try { startDuel(null, await api(`match/view?id=${id}`)); }
  catch (e) { toast(e.message, true); enterHub(); }
}
function duelLayout() {
  const H = innerHeight, r = $('#d-controls').getBoundingClientRect(), top = r.height ? r.top : H * 0.62;
  $('#s-duel').style.setProperty('--tray', `${Math.round(H - top)}px`);
  setLayout({ groundAt: Math.min(0.8, Math.max(0.55, (top - 4) / H)) });
}
function startDuel(local, first = local.view(), opts = {}) {
  D = { local, id: first.id, v: first, seen: keyOf(first.view.lastEvent), busy: false, sel: null, plan: [], skill: null, targeting: false, F: [null, null],
    chatAt: (first.chat || []).reduce((m, c) => Math.max(m, Date.parse(c.at)), 0), tutorial: opts.tutorial || null };
  D.v.gotAt = Date.now();
  clearStage(); clearTags();
  const forced = new URLSearchParams(location.search).get('stage');
  setStage(opts.stage || (BATTLE_STAGES.includes(forced) ? forced : BATTLE_STAGES[(Math.random() * BATTLE_STAGES.length) | 0]));
  placeFighters(first.view, true);
  $('#d-chat').style.display = D.tutorial ? 'none' : '';
  $('#d-chatpick').classList.remove('on');
  show('duel'); music('battle');
  paintDuel();
  duelLayout(); camSnap(0, 1.2, 0.5); camTo(0, 1, 0, 2.5);
  if (!local) {
    watch(`match:${D.id}`, () => refresh()).then(un => { if (D) D.unwatch = un; });
    D.poll = setInterval(() => { if (D && !D.busy) refresh(); }, 2500);
  }
  D.clock = setInterval(paintTimer, 250);
  D.busy = true;
  $('#s-duel').classList.add('intro');
  banner(`<div class="bt">${D.tutorial ? 'TUTORIAL' : 'DUEL!'}</div><small>${esc(first.view.me.name)} vs ${esc(first.view.rival.name)}${first.ranked ? ' · RANKED' : ''}</small>`, 1300)
    .then(() => { sfx('fight'); $('#s-duel').classList.remove('intro'); if (D) { D.busy = false; D.tutorial?.start(); } });
}
// the two summoners stand at the sides; the creatures fight on the board between them
function placeFighters(v, drop) {
  [v.me, v.rival].forEach((p, i) => {
    if (D.F[i]) return;
    const narrow = innerWidth < 760;
    const f = new Fighter(p.mind, (i ? 1 : -1) * (narrow ? 2.15 : 2.75), i, { scale: narrow ? 0.55 : 0.8 });
    if (drop) f.dropIn(0.25 + i * 0.2);
    D.F[i] = f;
  });
  stageFighters = D.F.filter(Boolean);
}
async function refresh() {
  if (!D || D.local) return;
  try { const v = await api(`match/view?id=${D.id}`); await handle(v); } catch (e) { if ([403, 404, 410].includes(e.status)) { toast(e.message, true); leaveDuel(); } }
}
async function handle(v) {
  if (!D) return;
  showChat(v.chat, v.seat, v.serverTime);
  const ev = v.view.lastEvent;
  if (ev && keyOf(ev) !== D.seen && !D.busy) {
    D.busy = true; D.seen = keyOf(ev);
    try { await reveal(ev, v); } finally { if (D) D.busy = false; }
  }
  if (!D) return;
  D.v = v; D.v.gotAt = Date.now();
  if (v.status !== 'live') return finish(v);
  paintDuel();
  D.tutorial?.step();
}

// --- drawing the table ---
const slotHtml = (c, opts = {}) => {
  if (!c) return opts.drop ? '<div class="drop">+</div>' : '';
  const d = CARD[c.id], pw = (c.power ?? d.power) + (c.temp || 0);
  return `<div class="bc ${opts.ghost ? 'ghost' : ''} ${opts.cls || ''}" style="--el:${ELEMENT_INFO[d.el].color}"><img src="${creatureImg(c.id)}" alt="${d.name}"><b class="pw ${c.temp > 0 ? 'up' : c.temp < 0 ? 'down' : ''}">${pw}</b><i class="eld">${ELEMENT_INFO[d.el].icon}</i>${opts.ghost ? '<em>READY</em>' : ''}</div>`;
};
function paintBoard(boards, planned = []) {
  for (let l = 0; l < 3; l++) {
    const lane = $(`#d-board [data-lane="${l}"]`), plan = planned.find(p => p.lane === l);
    lane.querySelector('.slot.rv').innerHTML = slotHtml(boards[1][l]);
    const mine = boards[0][l];
    lane.querySelector('.slot.me').innerHTML = mine ? slotHtml(mine) : plan ? slotHtml({ id: plan.id }, { ghost: true }) : slotHtml(null, { drop: D?.sel != null && !D.v.view.me.locked });
  }
}
function paintPlates(v, hp) {
  [[v.me, 0], [v.rival, 1]].forEach(([p, i]) => {
    const h = hp ? hp[i] : { hp: p.hp, shield: p.shield };
    $(`#d-pfp${i}`).src = thumb(p.mind);
    $(`#d-name${i}`).textContent = p.name;
    $(`#d-hpbar${i}`).style.width = `${Math.max(0, h.hp) / p.maxHp * 100}%`;
    $(`#d-hp${i}`).textContent = Math.max(0, h.hp);
    $(`#d-sh${i}`).textContent = h.shield ? `🛡 ${h.shield}` : '';
    $(`#d-sh${i}`).classList.toggle('on', !!h.shield);
    $(`#d-skill${i}`).innerHTML = `${ELEMENT_INFO[p.el].icon} <b>${HERO_SKILLS[p.skill].name}</b>`;
    $(`#d-skill${i}`).classList.toggle('used', p.skillUsed);
    $(`#d-skill${i}`).title = `${HERO_SKILLS[p.skill].name}: ${HERO_SKILLS[p.skill].desc}${p.skillUsed ? ' (used)' : ''}`;
    $(`#d-deck${i}`).textContent = i ? `🂠 ${p.handCount} in hand · ${p.deckLeft} in deck` : `${p.deckLeft} in deck`;
  });
}
const planCost = () => D.plan.reduce((s, p) => s + CARD[p.id].cost, 0);
const focusTotal = () => D.v.view.me.focus + (D.skill?.id === 'focus' ? 2 : 0);
function paintDuel() {
  const V = D.v, v = V.view, mine = v.me;
  paintPlates(v);
  $('#d-turn').textContent = `TURN ${v.turn}/${v.maxTurns}`;
  const locked = mine.locked || V.status !== 'live';
  $('#s-duel').classList.toggle('locked', locked);
  if (locked) { D.sel = null; D.targeting = false; }
  // what you've lined up this turn (or locked in)
  const planned = locked && mine.play ? mine.play.play.map(m => ({ id: mine.hand[m.card], lane: m.lane })).filter(p => p.id) : D.plan;
  paintBoard([mine.board, v.rival.board], planned);
  $$('#d-board .lane').forEach(l => {
    const i = +l.dataset.lane;
    l.querySelector('.slot.me').classList.toggle('target', D.targeting && SKILL_TARGET[mine.skill] === 'mine' && !!(mine.board[i] || D.plan.some(p => p.lane === i)));
    l.querySelector('.slot.rv').classList.toggle('target', D.targeting && SKILL_TARGET[mine.skill] === 'enemy' && !!v.rival.board[i]);
    l.querySelector('.slot.me').classList.toggle('open', !locked && D.sel != null && !mine.board[i] && !D.plan.some(p => p.lane === i));
    l.classList.toggle('skillmark', !!D.skill && D.skill.lane === i);
  });
  // hand
  const left = focusTotal() - planCost(), T = D.tutorial?.want;
  $('#d-hand').innerHTML = mine.hand.map((id, i) => {
    const c = CARD[id], used = D.plan.some(p => p.card === i) || (locked && mine.play?.play.some(m => m.card === i));
    const cls = [used ? 'placed' : '', D.sel === i ? 'on' : '', !used && c.cost > left ? 'poor' : '', T && T.card === id && !used ? 'pulse' : '', T && (T.card !== id) ? 'lockout' : ''].join(' ');
    return `<button class="ccard ${cls}" data-i="${i}" style="--el:${ELEMENT_INFO[c.el].color}"><i class="cost">${c.cost}</i><img src="${creatureImg(id)}" alt=""><b>${c.name}</b><span>${abShort(c) || ELEMENT_INFO[c.el].name}</span><i class="pwr">${c.power}</i></button>`;
  }).join('');
  // focus pips
  const tot = focusTotal(), spent = Math.min(tot, planCost());
  $('#d-focus').innerHTML = `<span>FOCUS</span><div>${Array.from({ length: tot }, (_, i) => `<i class="${i < tot - spent ? 'on' : ''}"></i>`).join('')}</div><b>${tot - spent}</b>`;
  // hero skill
  const sk = $('#d-skillbtn'), S = HERO_SKILLS[mine.skill];
  sk.innerHTML = `<b>${S.name}</b><em>${mine.skillUsed ? 'used' : D.skill ? (D.targeting ? 'pick a lane' : 'ready ✔') : 'once per match'}</em>`;
  sk.classList.toggle('used', mine.skillUsed); sk.classList.toggle('on', !!D.skill);
  sk.classList.toggle('pulse', !!T?.skill && !D.skill); sk.classList.toggle('lockout', !!T && !T.skill);
  const lock = $('#d-lock');
  const tutOk = !T || (T.skill ? !!D.skill && !D.targeting : D.plan.some(p => p.id === T.card && (T.lane == null || p.lane === T.lane)));
  lock.disabled = locked || D.targeting || !tutOk || !!(T && !T.skill && D.plan.length !== 1);
  lock.textContent = D.plan.length ? `Summon ${D.plan.length}${D.skill ? ' + skill' : ''}` : D.skill ? 'Use skill' : 'End turn';
  paintHint();
  paintTimer();
}
function paintHint(timeLow) {
  if (!D) return;
  const v = D.v.view, h = $('#d-hint');
  let text = '', cls = '';
  if (D.tutorial) text = '';
  else if (timeLow && !v.me.locked) { text = '⏰ Hurry! No move in time = you summon nothing (twice = forfeit).'; cls = 'warn'; }
  else if (v.me.locked) text = '';
  else if (D.targeting) text = `${HERO_SKILLS[v.me.skill].name}: tap a lane with ${SKILL_TARGET[v.me.skill] === 'mine' ? 'your' : 'an enemy'} creature`;
  else if (D.sel != null) text = `${cardInfo(v.me.hand[D.sel])} → tap an empty lane on your side`;
  else if (D.info) text = D.info;
  else if (v.turn === 1) text = 'Tap a creature, then tap a lane on your side to summon it. Empty lane = it hits the enemy Mind!';
  h.innerHTML = text; h.className = `duel-hint px ${text ? 'on' : ''} ${cls}`;
}
function paintTimer() {
  if (!D) return;
  const t = $('#d-timer');
  if (D.local || !D.v.deadline || D.v.status !== 'live') { t.style.visibility = 'hidden'; return; }
  const skew = Date.parse(D.v.serverTime) - (D.v.gotAt || Date.now());
  const left = Math.max(0, (Date.parse(D.v.deadline) - (Date.now() + skew)) / 1000);
  t.style.visibility = D.busy ? 'hidden' : 'visible';
  const shown = Math.min(TURN_SECONDS, left);
  $('#d-timer-t').textContent = Math.ceil(shown);
  $('#d-timer-ring').style.strokeDashoffset = 107 * (1 - shown / TURN_SECONDS);
  const low = shown < 8 && !D.v.view.me.locked && !D.busy;
  t.classList.toggle('low', low);
  if (low !== D.low) { D.low = low; paintHint(low); }
  if (low && Math.ceil(shown) !== D.lastTick) { D.lastTick = Math.ceil(shown); sfx('tick'); }
  if (left <= 0 && !D.busy && !D.expiredAt) { D.expiredAt = Date.now(); refresh(); }
  if (left > 0) D.expiredAt = 0;
  if (left <= 0 && D.expiredAt && Date.now() - D.expiredAt > 3000) D.expiredAt = 0;
}

// --- your move: pick cards, put them in lanes, maybe the Hero Skill, then lock in ---
const canAct = () => D && !D.busy && D.v.status === 'live' && !D.v.view.me.locked;
$('#d-hand').onclick = e => {
  const b = e.target.closest('[data-i]'); if (!b || !canAct() || b.classList.contains('lockout')) return;
  const i = +b.dataset.i, id = D.v.view.me.hand[i];
  const at = D.plan.findIndex(p => p.card === i);
  if (at >= 0) { D.plan.splice(at, 1); D.sel = null; sfx('deselect'); return paintDuel(); }
  if (D.sel === i) { D.sel = null; sfx('deselect'); return paintDuel(); }
  if (CARD[id].cost > focusTotal() - planCost()) { sfx('denied'); D.info = `Not enough Focus for ${CARD[id].name} (${CARD[id].cost}). You get +1 Focus every turn (max 6).`; D.sel = null; return paintDuel(); }
  D.sel = i; D.targeting = false; D.info = null; sfx('select');
  // only one free lane? put it there right away
  const free = [0, 1, 2].filter(l => !D.v.view.me.board[l] && !D.plan.some(p => p.lane === l));
  if (free.length === 1 && !D.tutorial) { D.plan.push({ card: i, id, lane: free[0] }); D.sel = null; }
  paintDuel();
};
$('#d-board').onclick = e => {
  const slot = e.target.closest('.slot'); if (!slot || !D) return;
  const lane = +slot.closest('[data-lane]').dataset.lane, mine = slot.classList.contains('me'), v = D.v.view;
  const c = mine ? v.me.board[lane] : v.rival.board[lane];
  if (canAct() && D.targeting) {
    const want = SKILL_TARGET[v.me.skill];
    const ok = want === 'mine' ? mine && (c || D.plan.some(p => p.lane === lane)) : !mine && c;
    if (!ok) return sfx('denied');
    D.skill = { id: v.me.skill, lane }; D.targeting = false; sfx('buff'); return paintDuel();
  }
  if (canAct() && mine) {
    const at = D.plan.findIndex(p => p.lane === lane);
    if (at >= 0) { D.plan.splice(at, 1); sfx('deselect'); return paintDuel(); }
    if (D.sel != null && !c) {
      const T = D.tutorial?.want;
      if (T && T.lane != null && T.lane !== lane) { sfx('denied'); return; }
      D.plan.push({ card: D.sel, id: v.me.hand[D.sel], lane }); D.sel = null; sfx('flip'); return paintDuel();
    }
  }
  if (c) { D.info = cardInfo(c.id) + (c.power !== CARD[c.id].power ? ` · now ${c.power} power` : ''); paintHint(); }
};
$('#d-skillbtn').onclick = () => {
  if (!canAct()) return;
  const v = D.v.view, id = v.me.skill;
  if (v.me.skillUsed) return toast(`${HERO_SKILLS[id].name} was already used this match.`);
  if (D.tutorial?.want && !D.tutorial.want.skill) return sfx('denied');
  if (D.skill || D.targeting) { D.skill = null; D.targeting = false; sfx('deselect'); return paintDuel(); }
  D.sel = null;
  if (SKILL_TARGET[id]) D.targeting = true; else D.skill = { id };
  sfx('select'); paintDuel();
};
async function lockIn() {
  if (!canAct() || $('#d-lock').disabled) return;
  const action = { id: D.id, play: D.plan.map(p => ({ card: p.card, lane: p.lane })), skill: D.skill };
  $('#d-lock').disabled = true; sfx('energy');
  D.tutorial?.hide();
  try {
    const v = D.local ? await D.local.act(action) : await api('match/act', action);
    D.plan = []; D.skill = null; D.sel = null; D.info = null;
    await handle(v);
  } catch (e) { toast(e.message, true); if (D) paintDuel(); }
}
$('#d-lock').onclick = lockIn;
addEventListener('keydown', e => { if (e.key === 'Escape' && WINDOWS.has(current) && !$('#modal.on')) closeWindow(); });
addEventListener('keydown', e => {
  if (current !== 'duel' || !D || e.repeat || e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '9') $(`#d-hand [data-i="${+e.key - 1}"]`)?.click();
  else if (e.key === 'Enter') lockIn();
});
$('#d-menu').onclick = async () => {
  const r = await modal(`<h3>Match menu</h3><p class="muted">${D?.tutorial ? 'Leave the tutorial?' : 'Leaving counts as a loss.'}</p>`, [['Keep playing', 0, 'primary'], ['Rules', 2], [D?.tutorial ? 'Leave' : 'Forfeit', 1]]);
  if (r === 2) { renderCodex(); show('codex'); }
  if (r === 1) {
    if (D?.tutorial) { leaveDuel(); return; }
    try { const v = D.local ? await D.local.forfeit() : await api('match/forfeit', { id: D.id }); await handle(v); } catch (e) { toast(e.message, true); }
  }
};

// ---------- quick chat (preset lines only) ----------
let chatTab = 0, chatCool = 0;
function paintChatPick() {
  $('#d-chattabs').innerHTML = MATCH_CHAT.map((g, i) => `<button data-t="${i}" class="${i === chatTab ? 'on' : ''}">${g.name}</button>`).join('');
  $('#d-phrases').innerHTML = MATCH_CHAT[chatTab].ids.map(i => `<button data-p="${i}">${esc(PHRASES[i])}</button>`).join('');
}
$('#d-chat').onclick = () => { paintChatPick(); $('#d-chatpick').classList.toggle('on'); };
$('#d-chattabs').onclick = e => { const t = e.target.dataset.t; if (t == null) return; chatTab = +t; paintChatPick(); };
$('#d-phrases').onclick = async e => {
  const p = e.target.closest('[data-p]'); if (!p || !D) return;
  $('#d-chatpick').classList.remove('on');
  if (Date.now() < chatCool) return toast('Easy on the chat 🙂');
  chatCool = Date.now() + 1500;
  const phrase = +p.dataset.p;
  if (D.local) {
    const now = Date.now(), lines = [{ seat: 0, phrase, at: new Date(now).toISOString() }];
    if (Math.random() < 0.6) { const pool = BOT_REPLIES[phrase <= 3 ? 'greet' : phrase >= 10 && phrase <= 17 ? 'tease' : 'nice']; lines.push({ seat: 1, phrase: pool[(Math.random() * pool.length) | 0], at: new Date(now + 1400).toISOString() }); }
    return showChat(lines, 0, new Date(now).toISOString());
  }
  try { const r = await api('match/chat', { id: D.id, phrase }); showChat(r.chat, D.v.seat, r.serverTime); }
  catch (err) { toast(err.message, true); }
};
function showChat(lines, seat, serverTime) {
  if (!D || !lines?.length) return;
  const skew = serverTime ? Date.parse(serverTime) - Date.now() : 0;
  for (const c of lines) {
    const at = Date.parse(c.at);
    if (at <= D.chatAt) continue;
    D.chatAt = Math.max(D.chatAt, at);
    const side = c.seat === seat ? 0 : 1, delay = Math.max(0, at - (Date.now() + skew));
    setTimeout(() => { if (D?.F[side]) { tag(D.F[side], esc(PHRASES[c.phrase] || ''), 'bubble', 2600); sfx('pop'); } }, delay);
  }
}

// ---------- reveal: the turn replays step by step ----------
const slotEl = (side, lane) => $(`#d-board [data-lane="${lane}"] .slot.${side ? 'rv' : 'me'}`);
function floatAt(node, text, cls = '') {
  if (!node) return;
  const r = node.getBoundingClientRect(), f = el('div', `floater ${cls}`, text);
  f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top + r.height * 0.3}px`;
  document.body.append(f); setTimeout(() => f.remove(), 1300);
}
const plate = side => $(`#d-plate${side}`);
function bump(node, cls) { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
async function reveal(ev, v) {
  const seat = v.seat, side = i => i === seat ? 0 : 1, S = $('#s-duel');
  if (ev.forfeit !== undefined || !ev.before) return;
  S.classList.add('revealing'); $('#d-timer').style.visibility = 'hidden';
  const M = [ev.before[seat], ev.before[1 - seat]].map(b => b.board.map(c => c && { ...c, temp: 0 }));
  let hp = [ev.before[seat], ev.before[1 - seat]].map(b => ({ hp: b.hp, shield: b.shield }));
  const draw = () => { paintBoard(M); paintPlates(D.v.view, hp); };
  const setHp = e => { if (e.hp) hp = [0, 1].map(k => ({ hp: e.hp[k === 0 ? seat : 1 - seat], shield: e.sh[k === 0 ? seat : 1 - seat] })); };
  const pause = ms => wait(ms);
  if (ev.timeout?.includes(seat)) toast('Time ran out: you summoned nothing this turn.', true);
  // 1. both sides' summons appear (the rival's flip in)
  const sumLanes = [[], []];
  ev.acts.forEach((a, i) => a.play.forEach(p => { M[side(i)][p.lane] = { id: p.id, power: CARD[p.id].power, temp: 0 }; sumLanes[side(i)].push(p.lane); }));
  draw();
  sumLanes.forEach((ls, s) => ls.forEach(l => bump(slotEl(s, l).firstElementChild, s ? 'flipin' : 'popin')));
  if (sumLanes[0].length + sumLanes[1].length) { sfx('flip'); await pause(650); }
  for (const e of ev.events) {
    if (e.t === 'summon') continue;
    const me = side(e.p ?? 0), foe = 1 - me;
    setHp(e);
    if (e.t === 'spark') { const c = M[foe][e.lane]; if (c) c.power -= e.n; draw(); floatAt(slotEl(foe, e.lane), `−${e.n}`, 'bad'); sfx('debuff'); }
    else if (e.t === 'splash') { M[foe].forEach(c => { if (c) c.power -= 1; }); draw(); M[foe].forEach((c, l) => c && floatAt(slotEl(foe, l), '−1', 'bad')); sfx('debuff'); flash(0.15, '#86d8f7'); }
    else if (e.t === 'burn') { draw(); floatAt(plate(foe), `−${e.n} 🔥`, 'bad'); D.F[foe]?.play('hit'); sfx('burn'); }
    else if (e.t === 'heal') { draw(); floatAt(plate(me), `+${e.n} ❤`, 'good'); sfx('heal'); }
    else if (e.t === 'shield') { draw(); floatAt(plate(me), `+${e.n} 🛡`, 'good'); sfx('shield'); }
    else if (e.t === 'draw') { if (me === 0) floatAt(plate(0), '+1 card', 'good'); sfx('flip'); }
    else if (e.t === 'rally') { M[me].forEach((c, l) => { if (c && l !== e.lane) { c.power += 1; } }); draw(); M[me].forEach((c, l) => c && l !== e.lane && floatAt(slotEl(me, l), '+1', 'good')); sfx('buff'); }
    else if (e.t === 'skill') {
      const id = e.id, F = D.F[me];
      F?.play('cast'); sfx('cast');
      if (id === 'cry') M[me].forEach(c => { if (c) c.temp += 1; });
      else if (id === 'rage' && M[me][e.lane]) M[me][e.lane].temp += 3;
      else if (id === 'hex' && M[foe][e.lane]) M[foe][e.lane].temp -= 3;
      else if (id === 'curse' && M[foe][e.lane]) { M[foe][e.lane].power -= 1; M[foe][e.lane].temp -= 1; }
      draw();
      await banner(`<div class="bt ${me ? 'red' : ''}">${HERO_SKILLS[id].name.toUpperCase()}!</div><small>${me ? 'Rival' : 'You'}: ${HERO_SKILLS[id].desc}</small>`, 1100);
      if (id === 'bolt') { D.F[foe]?.play('hitBig'); shake(12); floatAt(plate(foe), '−6 ⚡', 'bad'); }
      continue;
    }
    else if (e.t === 'fade') { bump(slotEl(me, e.lane).firstElementChild, 'die'); sfx('miss'); await pause(380); M[me][e.lane] = null; draw(); }
    else if (e.t === 'tie') {
      [0, 1].forEach(s => bump(slotEl(s, e.lane).firstElementChild, s ? 'lunge-dn' : 'lunge-up'));
      floatAt($(`#d-board [data-lane="${e.lane}"] .vs`), `${e.pw[seat]} = ${e.pw[1 - seat]}`, '');
      sfx('block'); shake(5); await pause(420);
      const keep = [e.keep[seat], e.keep[1 - seat]];
      [0, 1].forEach(s => { if (!keep[s]) bump(slotEl(s, e.lane).firstElementChild, 'die'); });
      await pause(330);
      [0, 1].forEach(s => { if (!keep[s]) M[s][e.lane] = null; });
      draw();
    } else if (e.t === 'win') {
      const w = side(e.p), l = 1 - w;
      bump(slotEl(w, e.lane).firstElementChild, w ? 'lunge-dn' : 'lunge-up');
      floatAt($(`#d-board [data-lane="${e.lane}"] .vs`), `${e.pw[e.p]} vs ${e.pw[1 - e.p]}`, w ? 'bad' : 'good');
      await pause(260);
      bump(slotEl(l, e.lane).firstElementChild, 'die'); sfx('hit'); shake(6);
      await pause(380);
      M[l][e.lane] = null; if (M[w][e.lane]) M[w][e.lane].power = e.left;
      draw();
      if (e.pierce) { floatAt(plate(l), `−${e.pierce}`, 'bad'); D.F[l]?.play('hit'); }
      if (e.leech) floatAt(plate(w), '+1 ❤', 'good');
    } else if (e.t === 'hit') {
      const w = side(e.p), l = 1 - w;
      bump(slotEl(w, e.lane).firstElementChild, w ? 'lunge-dn' : 'lunge-up');
      await pause(220);
      draw();
      if (e.n > 0) { floatAt(plate(l), `−${e.n}`, 'bad'); D.F[l]?.play(e.n >= 5 ? 'hitBig' : 'hit'); burst(D.F[l]?.chest.x || 0, D.F[l]?.chest.y || 1, D.F[l]?.colors || ['#fff'], 14, 0.8); sfx(e.n >= 5 ? 'crit' : 'hit'); shake(e.n >= 5 ? 12 : 6); bump(plate(l), 'ouch'); }
      else { floatAt(plate(l), '🛡 blocked', ''); sfx('block'); }
      if (e.leech) floatAt(plate(w), '+1 ❤', 'good');
    } else if (e.t === 'grow') { const c = M[me][e.lane]; if (c) c.power += 1; draw(); floatAt(slotEl(me, e.lane), '+1 🌱', 'good'); }
    else if (e.t === 'fatigue') { draw(); floatAt(plate(me), `−${e.n} tired`, 'bad'); sfx('debuff'); }
    await pause(e.t === 'grow' ? 260 : 520);
  }
  M.forEach(b => b.forEach(c => { if (c) c.temp = 0; }));
  S.classList.remove('revealing');
}

async function finish(v) {
  if (!D || D.finished) return;
  D.finished = true;
  clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.();
  const seat = v.seat, won = v.winner === seat, draw = v.winner === null;
  if (D.tutorial) { D.F[won ? 1 : 0]?.play('ko'); D.F[won ? 0 : 1]?.play('win'); sfx(won ? 'victory' : 'defeat'); await banner(`<div class="bt ${won ? '' : 'red'}">${won ? 'VICTORY!' : 'DEFEAT'}</div>`, 1400); return D?.tutorial.done(won); }
  const winF = draw ? null : D.F[won ? 0 : 1], loseF = draw ? null : D.F[won ? 1 : 0];
  if (loseF) { loseF.ko = true; loseF.play('ko'); sfx('ko'); shake(14); }
  winF?.play('win');
  if (winF) { camTo(winF.home.x * 0.5, 1.25, 0.4, 2); const fx = setInterval(() => { if (current !== 'duel' && current !== 'result') return clearInterval(fx); stars(winF.pos.x, winF.height, 6); }, 400); setTimeout(() => clearInterval(fx), 4000); }
  sfx(won ? 'victory' : draw ? 'round' : 'defeat'); music(null);
  const title = won ? 'VICTORY!' : draw ? 'DRAW' : 'DEFEAT';
  await banner(`<div class="bt ${won ? '' : draw ? 'white' : 'red'}">${title}</div>`, 1600);
  $('#r-title').textContent = title;
  $('#r-title').style.color = won ? 'var(--lime)' : draw ? '#fff' : 'var(--red)';
  $('.result').classList.toggle('lost', !won);
  $('#r-score').textContent = `Mind HP ${Math.max(0, v.view.me.hp)} – ${Math.max(0, v.view.rival.hp)}${v.status === 'abandoned' ? ' · forfeit' : ''}`;
  const d = v.delta || 0;
  $('#r-stats').innerHTML = [
    [v.ranked ? `${d > 0 ? '+' : ''}${d}` : '—', 'Rating', d > 0 ? 'up' : d < 0 ? 'down' : ''],
    [v.vsBot ? 'BOT' : 'Player', v.vsBot ? `Rival · ${v.botLevel}` : 'Rival', ''],
    [v.ranked ? 'Ranked' : !v.vsBot || prep.mode === 'classic' ? 'Classic' : 'Practice', 'Mode', ''],
  ].map(([b, s, c]) => `<div><b class="${c}">${esc(b)}</b><span>${s}</span></div>`).join('');
  const again = v.ranked ? 'ranked' : prep.mode === 'classic' && !D?.local ? 'classic' : 'practice';
  $('#r-again').onclick = () => openPrep(again);
  show('result');
  if (online && session.token) refreshMe().catch(() => {});
}
function leaveDuel() { if (D) { clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.(); D.tutorial?.hide(); } D = null; enterHub(); }

// ---------- interactive tutorial: a scripted match with a coach ----------
// your hand and the coach's moves are fixed so every lesson happens on cue; after the script, the coach plays freely
const TUT = [
  { say: "Hi! I'm your coach. Your Mind is a summoner: you bring the rival Mind from 20 HP to 0. Creatures fight in 3 lanes.", next: true },
  { say: 'Turn 1: you have 1 Focus. Tap Emberpup (it costs 1), then tap the MIDDLE lane on your side, then Summon. An empty lane means it hits the rival Mind!', card: 'emberpup', lane: 1, rival: [['sproutling', 0]] },
  { say: 'The rival put Sproutling (🌿 Nature) in the left lane. 🔥 Fire beats 🌿 Nature: +2 power! Summon your other Emberpup in the LEFT lane to beat it.', card: 'emberpup', lane: 0, rival: [] },
  { say: 'Cinderhound has Burn 1: it hits the rival Mind the moment it lands. Summon it in the RIGHT lane.', card: 'cinderhound', lane: 2, rival: [['bubblin', 1]] },
  { say: "Ouch: 💧 Water beats 🔥 Fire, so Bubblin beat your Emberpup. Every element has a weakness. Now use your Hero Skill! Tap the BOLT button: 6 damage, once per match.", skill: 'bolt', rival: [] },
  { say: 'You know the basics! Finish the match: summon what you like each turn. Creatures stay until they lose a fight.', free: true },
];
function startTutorial() {
  const mind = picked()[0] || me?.pfp || 49;
  const s = createSummonMatch({ seed: 7, players: [{ name: me?.name || 'You', minds: [mind], deck: 'ember_sprout' }, { name: 'Coach Bot', minds: [1848], deck: 'bubble_bloom', hp: 16 }] });
  // fixed hands for the lessons: you get Emberpup x2, Cinderhound, Sproutling; the coach gets its script
  const g = s.g, P = g.p[0], R = g.p[1];
  P.skill = 'bolt'; P.el = 'fire';
  const take = (p, ids) => { for (const id of ids) { const k = p.deck.indexOf(id); if (k >= 0) p.deck.splice(k, 1); } p.hand = [...ids]; };
  take(P, ['emberpup', 'emberpup', 'cinderhound', 'sproutling']);
  R.deck.push(...R.hand); R.hand = []; take(R, ['sproutling', 'bubblin', 'pollenix', 'tidefin']); R.deck = R.deck.filter(id => id !== 'sproutling');
  let i = 0;
  const view = () => ({ id: 'tutorial', seat: 0, status: s.over ? 'done' : 'live', ranked: false, vsBot: true, botLevel: 'coach', local: true, deadline: null, winner: s.winner, view: viewSummon(s, 0), delta: 0 });
  const coachMove = () => {
    const t = TUT[i];
    if (!t || t.free) return botAct(g, 1, { noise: 3 });
    return { play: (t.rival || []).map(([id, lane]) => ({ card: R.hand.indexOf(id), lane })).filter(m => m.card >= 0 && !R.board[m.lane]), skill: null };
  };
  const match = {
    view,
    async act(a) {
      const r = submitSummon(s, 0, a);
      if (r.error) throw new Error(r.error);
      const res = submitSummon(s, 1, coachMove());
      if (res.error) submitSummon(s, 1, { play: [] });
      if (TUT[i] && !TUT[i].free) i++;
      return view();
    },
    async forfeit() { forfeitSummon(s, 0); return view(); },
  };
  const coach = $('#coach');
  const say = (text, next) => { $('#coach-text').textContent = text; coach.classList.toggle('wait', !next); coach.classList.toggle('low', !next); coach.classList.add('on'); sfx('notify'); };
  const tut = {
    want: null,
    start() { $('#coach-pfp').src = thumb(1848); tut.step(); },
    step() {
      if (!D || D.tutorial !== tut) return;
      const t = TUT[i];
      if (!t) return;
      if (t.next) { tut.want = null; say(t.say, true); paintDuel(); return; }
      if (t.free) { if (!tut.freeShown) { tut.freeShown = true; tut.want = null; say(t.say, true); $('#coach-next').textContent = 'Got it'; } paintDuel(); return; }
      tut.want = t.skill ? { skill: t.skill } : { card: t.card, lane: t.lane };
      say(t.say, false);
      paintDuel();
    },
    hide() { coach.classList.remove('on'); },
    async done(won) {
      tut.hide(); tut.want = null;
      settings.tutorialDone = true; saveSettings();
      const r = await modal(`<h3>${won ? "You're ready! 🎉" : 'Nice try!'}</h3><p>You know the basics: lanes, Focus, elements, abilities and your Hero Skill. Real matches have a ${TURN_SECONDS}s timer per turn and every Mind has its own skill and element.</p>`, [['Practice vs bot', 1, 'primary'], ['Lobby', 0]]);
      leaveDuel();
      if (r) openPrep('practice');
    },
  };
  $('#coach-next').textContent = 'Next';
  $('#coach-next').onclick = () => { if (TUT[i]?.next) i++; tut.hide(); tut.step(); if (TUT[i]?.free) tut.hide(); };
  startDuel(match, view(), { tutorial: tut, stage: 'meadow' });
}

// ---------- leaderboard page ----------
let lbBy = 'rating', lbTimer = null;
async function openLeaderboard() {
  show('leaderboard');
  await loadLeaderboard();
  clearInterval(lbTimer); lbTimer = setInterval(() => { if (current === 'leaderboard') loadLeaderboard(); else clearInterval(lbTimer); }, 15000);
}
// wins / losses on the leaderboard include ranked games vs bots (they move rating too)
function wl(p) {
  const w = p.wins + (p.botWins || 0), l = p.losses + (p.botLosses || 0), rate = w + l ? Math.round(w / (w + l) * 100) : null;
  return `<td>${w}</td><td>${l}</td><td class="hide-s">${rate ?? '—'}${rate != null ? '%' : ''}</td>`;
}
async function loadLeaderboard() {
  if (!online) { $('#lb-rows').innerHTML = '<tr><td colspan="7" class="muted">The leaderboard needs the game server.</td></tr>'; return; }
  try {
    const r = await api(`leaderboard?by=${lbBy}`);
    $('#lb-col').textContent = lbBy === 'points' ? 'Points' : 'Rating';
    $('#lb-rows').innerHTML = r.players.length ? r.players.map((p, i) => `<tr class="${p.id === me?.id ? 'mine-row' : ''}"><td class="rank">${i + 1}</td>
      <td><div class="pl" data-pid="${p.id}"><img src="${thumb(p.pfp)}" alt=""><span>${esc(p.name)}</span></div></td><td class="lbv">${valIcon(lbBy)}${lbBy === 'points' ? p.points : p.rating}</td>
      ${wl(p)}<td class="hide-s">${p.streak ? '🔥' + p.streak : '—'}</td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">No ranked games yet. Be the first!</td></tr>';
  } catch (e) { toast(e.message, true); }
}
$('#lb-by').onclick = e => { const v = e.target.dataset.v; if (!v) return; lbBy = v; $$('#lb-by button').forEach(b => b.classList.toggle('on', b === e.target)); loadLeaderboard(); };
$('#lb-rows').onclick = e => { const p = e.target.closest('[data-pid]'); if (p) openProfile(p.dataset.pid); };

// ---------- profile ----------
let pfPick = null, pfShow = [];
async function openProfile(pid) {
  if (!online || !pid) return toast('Profiles need the game server.');
  try {
    const r = await api(`player?id=${pid}`), p = r.player, mine = pid === me?.id;
    $('#pf-pfp').src = thumb(p.pfp); $('#pf-name').textContent = p.name;
    $('#pf-addr').textContent = p.guest ? 'Trial account' : p.address || '';
    const W = p.wins + (p.botWins || 0), L = p.losses + (p.botLosses || 0);
    $('#pf-stats').innerHTML = [[valIcon('rating') + p.rating, 'Rating'], [valIcon('points') + p.points, 'Points'], [W + L ? Math.round(W / (W + L) * 100) + '%' : '—', 'Win rate'], [W, 'Ranked wins'], [L, 'Ranked losses'], [p.bestStreak, 'Best streak']]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    const sc = p.showcase?.length ? p.showcase : [p.pfp];
    $('#pf-show').innerHTML = [0, 1, 2].map(i => sc[i] ? `<img src="${thumb(sc[i])}" alt="#${sc[i]}" title="#${sc[i]}">` : '<div class="empty">empty</div>').join('');
    $('#pf-actions').innerHTML = !mine && !guest && !p.guest ? '<button class="btn small primary" id="pf-friend">Add friend</button>' : '';
    $('#pf-friend')?.addEventListener('click', () => addFriend({ id: p.id }));
    $('#pf-edit').style.display = mine && !guest ? 'flex' : 'none';
    if (mine && !guest) {
      pfPick = p.pfp; pfShow = [...(p.showcase || [])].filter(id => myMinds.includes(id));
      $('#pf-name-in').value = p.name; $('#pf-err').textContent = '';
      paintProfileEdit();
    }
    $('#pf-history').innerHTML = r.history.length ? r.history.map(h => `<div class="hrow"><span class="res ${h.result}">${h.result.toUpperCase()}</span>
      <span>${h.vsPfp ? `<img src="${thumb(h.vsPfp)}" alt="">` : '🤖 '}${esc(h.vs)}</span><span class="${h.delta > 0 ? 'up' : h.delta < 0 ? 'down' : 'muted'}">${h.delta ? (h.delta > 0 ? '+' : '') + h.delta : '—'}</span>
      <span class="muted small">${h.at ? new Date(h.at).toLocaleDateString() : ''}</span></div>`).join('') : '<div class="muted">No matches yet.</div>';
    show('profile');
  } catch (e) { toast(e.message, true); }
}
function paintProfileEdit() {
  $('#pf-pfps').innerHTML = myMinds.map(id => `<div class="mind ${id === pfPick ? 'on' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag">#${id}</span></div>`).join('');
  $('#pf-shows').innerHTML = myMinds.map(id => { const i = pfShow.indexOf(id); return `<div class="mind ${i >= 0 ? 'on' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag">#${id}</span><span class="order">${i + 1}</span></div>`; }).join('');
  $('#pf-show-count').textContent = `${pfShow.length}/3 · shown in your lobby and profile`;
}
$('#pf-pfps').onclick = e => { const m = e.target.closest('[data-id]'); if (!m) return; pfPick = +m.dataset.id; sfx('select'); paintProfileEdit(); };
$('#pf-shows').onclick = e => {
  const m = e.target.closest('[data-id]'); if (!m) return;
  const id = +m.dataset.id, i = pfShow.indexOf(id);
  if (i >= 0) pfShow.splice(i, 1); else if (pfShow.length < 3) pfShow.push(id); else return toast('Up to 3. Tap one to remove it first.');
  sfx('select'); paintProfileEdit();
};
$('#pf-save').onclick = async () => {
  try { const r = await api('profile', { name: $('#pf-name-in').value, pfp: pfPick, showcase: pfShow }); me = r.player; toast('Saved!'); sfx('coin'); openProfile(me.id); paintHub(); }
  catch (e) { $('#pf-err').textContent = e.message; }
};

// ---------- friends + friend chat (preset lines) ----------
let friendsList = [], chatWith = null, frUnwatch = null, frTimer = null;
const seenAt = id => settings.seen[id] || 0;
async function loadFriends() {
  if (!online || guest) { friendsList = []; renderFriends(); return; }
  try { friendsList = (await api('friends')).friends; $('#fr-err').textContent = ''; renderFriends(); }
  catch (e) { $('#fr-err').textContent = e.status === 500 ? 'Friends are being set up. Try again soon.' : e.message; }
}
const unread = () => friendsList.filter(f => f.incoming || (f.status === 'accepted' && f.lastMsgAt && Date.parse(f.lastMsgAt) > seenAt(f.player.id))).length;
function renderFriends() {
  const n = unread(), b = $('#friends-badge'); b.textContent = n; b.classList.toggle('on', n > 0);
  if (guest || !online) { $('#fr-list').innerHTML = `<div class="board-empty">${!online ? 'Friends need the game server.' : 'Connect a wallet to add friends and chat.'}</div>`; return; }
  const row = (f, acts) => `<div class="frow" data-fid="${f.player.id}" data-st="${f.status}"><img src="${thumb(f.player.pfp)}" alt=""><div><div class="fn">${esc(f.player.name)}</div>
    <div class="fs"><i class="dot ${f.player.online ? 'on' : ''}"></i>${f.player.online ? 'online' : 'offline'} · ${f.player.rating}${f.lastMsgAt && Date.parse(f.lastMsgAt) > seenAt(f.player.id) ? ' <span class="new">NEW</span>' : ''}</div></div><div class="acts">${acts}</div></div>`;
  const inc = friendsList.filter(f => f.incoming), acc = friendsList.filter(f => f.status === 'accepted'), out = friendsList.filter(f => f.status === 'pending' && !f.incoming);
  $('#fr-list').innerHTML = (inc.length ? `<div class="fr-section">Requests</div>${inc.map(f => row(f, '<button class="btn small primary" data-op="accept">✔</button><button class="btn small" data-op="remove">✕</button>')).join('')}` : '')
    + `<div class="fr-section">Friends (${acc.length})</div>${acc.length ? acc.sort((a, b) => b.player.online - a.player.online).map(f => row(f, '<button class="btn small" data-op="chat">Chat</button>')).join('') : '<div class="board-empty">No friends yet. Add someone by name, or from the leaderboard.</div>'}`
    + (out.length ? `<div class="fr-section">Sent</div>${out.map(f => row(f, '<span class="muted small">pending</span>')).join('')}` : '');
}
async function addFriend(target) {
  try { const r = await api('friend', { op: 'add', ...target }); toast(r.status === 'accepted' ? 'You are now friends! 🎉' : 'Friend request sent!'); sfx('notify'); loadFriends(); }
  catch (e) { toast(e.message, true); }
}
function openFriends() { $('#friends').classList.add('on'); $('#fr-chat-view').classList.remove('on'); $('#fr-list-view').classList.remove('off'); $('#fr-title').textContent = 'Friends'; loadFriends(); }
$('#hub-friends').onclick = openFriends;
$('#fr-close').onclick = () => { $('#friends').classList.remove('on'); chatWith = null; };
$('#fr-add').onclick = () => { const n = $('#fr-name').value.trim(); if (!n) return; if (guest) return toast('Connect a wallet to add friends.', true); addFriend({ name: n }); $('#fr-name').value = ''; };
$('#fr-list').onclick = async e => {
  const row = e.target.closest('[data-fid]'); if (!row) return;
  const op = e.target.closest('[data-op]')?.dataset.op, id = row.dataset.fid;
  if (op === 'accept' || op === 'remove') { try { await api('friend', { op, id }); sfx(op === 'accept' ? 'coin' : 'deselect'); loadFriends(); } catch (err) { toast(err.message, true); } return; }
  if (row.dataset.st === 'accepted') openChat(friendsList.find(f => f.player.id === id));
};
async function openChat(f) {
  chatWith = f; $('#fr-title').textContent = f.player.name;
  $('#fr-list-view').classList.add('off'); $('#fr-chat-view').classList.add('on');
  $('#fr-phrases').innerHTML = FRIEND_CHAT.map(i => `<button data-p="${i}">${esc(PHRASES[i])}</button>`).join('');
  await loadChat();
}
async function loadChat() {
  if (!chatWith) return;
  try {
    const r = await api(`messages?with=${chatWith.player.id}`);
    $('#fr-msgs').innerHTML = r.messages.length ? r.messages.map(m => `<div class="msg ${m.mine ? 'mine' : ''}">${esc(PHRASES[m.phrase] || '')}<time>${new Date(m.at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</time></div>`).join('') : '<div class="board-empty">Say hi! 👋</div>';
    $('#fr-msgs').scrollTop = 1e9;
    settings.seen[chatWith.player.id] = Date.now(); saveSettings();
    renderFriends();
  } catch (e) { toast(e.message, true); }
}
$('#fr-back').onclick = () => { chatWith = null; openFriends(); };
$('#fr-phrases').onclick = async e => {
  const p = e.target.closest('[data-p]'); if (!p || !chatWith) return;
  try { await api('messages', { to: chatWith.player.id, phrase: +p.dataset.p }); sfx('pop'); loadChat(); } catch (err) { toast(err.message, true); }
};
async function friendsPoll() {
  if (!online || guest || !me) { renderFriends(); return; }
  loadFriends();
  if (!frUnwatch) frUnwatch = await watch(`player:${me.id}`, () => { loadFriends(); if (chatWith) loadChat(); sfx('notify'); });
  clearInterval(frTimer); frTimer = setInterval(() => { if (current === 'hub') { loadFriends(); if (chatWith) loadChat(); } }, 25000);
}

// ---------- rules ----------
function renderCodex() {
  const famRows = [...new Set(CREATURES.map(c => c.fam))].map(f => {
    const cs = CREATURES.filter(c => c.fam === f);
    return `<div class="famrow">${cs.map(c => `<div class="cx" style="--el:${ELEMENT_INFO[c.el].color}"><img src="${creatureImg(c.id)}" alt=""><b>${c.name}</b><span>${c.cost} Focus · ${c.power} power</span><em>${abilitiesOf(c).map(a => a.text).join('<br>') || 'No ability: just strong for its cost'}</em></div>`).join('')}</div>`;
  }).join('');
  $('#codex').innerHTML = `
  <h3><img src="assets/crown.png" alt="">The goal</h3>
  <p>Your Mind is a <b>summoner</b>. Bring the rival Mind from <b>${SUMMON_RULES.hp} HP to 0</b>. After ${SUMMON_RULES.maxTurns} turns, the higher HP wins.</p>
  <h3><img src="assets/icon_swords.png" alt="">A turn</h3>
  <ol><li>You get <b>Focus</b> = the turn number (max ${SUMMON_RULES.maxFocus}) and draw 1 card.</li>
  <li>Both players <b>secretly</b> summon creatures into their <b>empty lanes</b> (3 lanes), paying their Focus cost. You can also use your <b>Hero Skill</b> once per match.</li>
  <li>Everything is revealed at once: summon effects, then Hero Skills, then <b>every lane fights</b>.</li></ol>
  <div class="example">Two creatures in a lane: the <b>higher power wins</b>. The loser is gone; the winner loses power equal to the loser's power (never below 1). Same power: both are gone. A creature with <b>nothing in front</b> hits the rival Mind for its power. Creatures stay until they lose.</div>
  <h3>🔥 Elements</h3>
  <p><b>🔥 Fire beats 🌿 Nature · 🌿 Nature beats 💧 Water · 💧 Water beats 🔥 Fire · ✨ Light and 🌑 Shadow beat each other.</b> Countering gives <b>+2 power</b>, or <b>+3</b> if the creature shares your Mind's element.</p>
  <h3>🧠 Your Mind</h3>
  <ul><li><b>Element</b> comes from its Skin; <b>Hero Skill</b> from its Face. Every Mind summons a little differently.</li>
  ${Object.values(HERO_SKILLS).map(k => `<li><b>${k.name}</b>: ${k.desc}</li>`).join('')}</ul>
  <h3>🃏 Decks</h3>
  <p>Everyone gets 4 complete starter decks: ${DECK_IDS.map(d => `<b>${STARTER_DECKS[d].name}</b> (${STARTER_DECKS[d].els.map(e => ELEMENT_INFO[e].icon).join('')})`).join(', ')}. A deck has 12 cards. Catching your own creatures comes soon.</p>
  <h3>The creatures</h3>
  ${famRows}
  <h3><img src="assets/icon_bolt.png" alt="">Timer, energy and fairness</h3>
  <ul><li>Each turn has a <b>${TURN_SECONDS} second</b> timer. No move in time = you summon nothing; <b>2 missed turns in a row = forfeit</b>.</li>
  <li>Ranked uses <b>1 ⚡</b> from your Mind (daily energy by rarity: ${Object.entries(ENERGY_CAP).map(([r, n]) => `${r} ${n}`).join(', ')}, refills 00:00 UTC). Classic, Practice and the Tutorial are free.</li>
  <li>Ranked wins change your <b>rating</b> and give <b>points</b> (10 + your Mind's rarity bonus). Games vs bots count half. No player in 20 s? You play a <b>bot</b>, always labelled BOT.</li>
  <li>Every turn runs on the game server and your rival's hand and move are never sent to your device, so nobody can cheat.</li></ul>`;
}

// ---------- settings ----------
$('#set-music').oninput = e => { settings.music = +e.target.value; saveSettings(); applySettings(); };
$('#set-sfx').oninput = e => { settings.sfx = +e.target.value; saveSettings(); applySettings(); sfx('select'); };
for (const [id, key] of [['set-quality', 'quality'], ['set-speed', 'speed']])
  $(`#${id}`).onclick = e => { const v = e.target.dataset.v; if (!v) return; settings[key] = key === 'speed' ? +v : v; saveSettings(); applySettings(); };
$('#set-logout').onclick = async () => {
  if (await modal('<h3>Sign out?</h3>', [['Cancel', 0], ['Sign out', 1, 'primary']])) { logout(); me = null; frUnwatch?.(); frUnwatch = null; show('login'); lobbyScene(legendIds()); }
};

// ---------- boot ----------
const legendIds = () => { const l = tokenIds().filter(i => rarityOf(i) === 'Legendary').sort(() => Math.random() - 0.5).slice(0, 3); return l.length ? l : tokenIds().slice(0, 3); };
const bootBar = p => { $('#boot-bar').style.width = `${p}%`; };
// unlock sound on the very first tap / key anywhere (browsers block audio before that)
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => initAudio(), { capture: true, passive: true });
// start screen: one tap that also turns the sound on, like a console game's "press start"
function tapToStart() {
  $('#boot-msg').textContent = 'Ready!'; $('.boot .bar').style.display = 'none';
  $('#boot-start').classList.add('on');
  return new Promise(res => {
    const go = () => { removeEventListener('keydown', go); initAudio(); sfx('levelup'); res(); };
    $('#boot-start').onclick = go; $('#s-boot').onclick = go; addEventListener('keydown', go);
  });
}
(async () => {
  bootBar(10);
  preload(['lobby', ...BATTLE_STAGES]);
  const [, isOnline] = await Promise.all([loadData(), serverOnline()]);
  online = isOnline;
  setTokenIds(tokenIds());
  bootBar(70);
  applySettings();
  lobbyScene(legendIds());
  bootBar(100);
  music('title');
  await tapToStart();
  if (online && session.token) {
    const cached = loadAccount();
    if (cached) {
      // straight into the lobby with what we knew last time, then refresh from the server
      ({ me, myMinds, guest, energy, energyResetAt } = cached);
      enterHub();
      const shownBefore = showcaseIds().join();
      refreshMe().then(r => {
        if (current === 'hub') { paintHub(); if (showcaseIds().join() !== shownBefore) lobbyScene(showcaseIds()); }
        if (r.liveMatch && current === 'hub') openMatch(r.liveMatch);
      }).catch(e => { if (e.status === 401) { logout(); localStorage.removeItem(ACC_KEY); show('login'); } });
      return;
    }
    try {
      const r = await refreshMe();
      if (r.liveMatch) { await enterHub(); return openMatch(r.liveMatch); }
      return enterHub();
    } catch { logout(); }
  }
  if (!online) { $('#btn-wallet').disabled = true; $('#btn-guest').textContent = 'Practice offline vs bots'; }
  show('login');
})();
