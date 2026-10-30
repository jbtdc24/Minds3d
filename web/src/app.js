// Mindclash client: lobby, sign-in, matchmaking, the Prize Duel table (2D stage, cards, crowns, spells, reveal),
// quick chat, friends, leaderboard, profile, interactive tutorial.
import { loadData, tokenIds, rarityOf } from './nft2d.js';
import { setStage, setLayout, setQuality, camTo, camSnap, shake, slowmo, flash, burst, rise, ring, stars, popText, toScreen, onFrame, setSpeed, speedSetting, BATTLE_STAGES, STAGES, preload, stage } from './stage2d.js';
import { Fighter, shoot } from './fighter2d.js';
import { SPELLS, SPELL_INFO, RULES, CARD_VALUES, createMatch, submit, viewFor } from './duel/engine.js';
import { DATA_VERSION } from './config.js';
import { api, session, walletLogin, guestLogin, logout, hasWallet, watch, serverOnline, LocalMatch, setTokenIds } from './net.js';
import { initAudio, sfx, music, setVolume } from './audio.js';
import { PHRASES, MATCH_CHAT, FRIEND_CHAT, BOT_REPLIES } from './chat.js';
import { initMindTalk, openMinds } from './mindtalk.js';
import { initTown, openTown, closeTown } from './town.js';
import { capOf, ENERGY_CAP } from './energy.js';
import { openIsland, closeIsland, refreshHud, cropImg, fmtTime } from './island/island.js';
import { chibi } from './island/chibi.js';
import { openRaid, closeRaid } from './island/raidview.js';
import { botVillage, armyCap, cleanArmy, armyUsed, TROOPS, DEFAULT_ARMY, raidsPerDay, raidFee, botLoot, CAMP_SPACE } from './island/raid.js';
import { troopIcon } from './island/troops.js';
import { openAdventure, closeAdventure } from './island/advview.js';
import { AREAS, POTIONS_MAX, SPOTS, SHIPS, spotLevel } from './island/adventure.js';
import { openMap, updateMap, closeMap } from './island/worldmap.js';
import { initAdmin, tryCode } from './admin.js';
import { isle, loadIsland, doAct, flush as flushIsland, resetIsland, refreshIsland, now as islandNow } from './island/store.js';
import { CROPS, RAW, growMs, permitCost, MAX_PERMITS, ripe, campLevels, campCount, SHOP, RECIPES, TROOP_MAX, troopCount, costText, canAfford, BUILD, STASH_MAX, gemPrice, ENERGY_PRICE, SHARDS_PER_ENERGY, REFILLS_PER_DAY, wellShards } from './island/rules.js';
import { buildIcon } from './island/buildings.js';
import { islandThumb } from './island/art.js';
import { hashStr } from './island/gen.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms / speedSetting));
// anything unexpected: a plain sentence for the player, the technical detail in the console for us
const oops = detail => { console.error('[mindclash]', detail); try { toast('Something went wrong. Please try that again.', true); } catch { /* toast not ready */ } };
addEventListener('unhandledrejection', e => { const m = e.reason?.message || String(e.reason || ''); if (m && !/abort|cancel/i.test(m)) oops(e.reason); });
addEventListener('error', e => { if (e.message && !/ResizeObserver|Script error/.test(e.message)) oops(`${e.message} @ ${e.filename}:${e.lineno}`); });
const thumb = id => `data/thumbs/${id || 1}.webp?v=${DATA_VERSION}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RAR_COLOR = { Legendary: '#d68a00', Epic: '#9b6bff', Rare: '#2f8fd0', Uncommon: '#3a9a00', Common: '#6d6987' };
const CARD_COLOR = { 1: '#7fd6ff', 2: '#5ee08a', 3: '#c3f03a', 4: '#ffe14a', 5: '#ffb03d', 6: '#ff7a5c', 7: '#ff5fc8' };
const spellImg = k => `assets/spell_${k}.png`;
const TURN_SECONDS = 20;
const narrow = () => innerWidth <= 900;

// ---------- settings (per device) ----------
const SKEY = 'mindclash.settings';
const settings = { music: 0.55, sfx: 0.8, quality: 'high', speed: 1, picks: {}, tutorialDone: false, seen: {} };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch { /* defaults */ }
settings.seen ||= {};
if (!settings.audioV) { settings.audioV = 2; if (!settings.music) settings.music = 0.55; }
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
  if (['hub', 'prep', 'leaderboard', 'profile'].includes(id) && base === 'hub') music('lofi');
  if (id === 'login') music('lofi');
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
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), bad ? 4500 : 3000);
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
function tipFor(node, k) {
  const s = SPELL_INFO[k];
  const showTip = () => {
    const t = $('#tip'); t.innerHTML = `<b>${s.name}</b>${s.desc}<br><span class="muted">Use: ${s.limit}. Revealed after the cards.</span>`;
    const r = node.getBoundingClientRect();
    t.style.left = `${Math.min(innerWidth - 310, Math.max(8, r.left))}px`; t.style.top = `${Math.max(8, r.top - 110)}px`; t.classList.add('on');
  };
  node.addEventListener('mouseenter', showTip);
  node.addEventListener('mouseleave', () => $('#tip').classList.remove('on'));
  let lp; node.addEventListener('touchstart', () => { lp = setTimeout(showTip, 380); }, { passive: true });
  node.addEventListener('touchend', () => { clearTimeout(lp); setTimeout(() => $('#tip').classList.remove('on'), 1400); });
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
const lossRisk = ids => 5 * ids.length;   // must match lib/rating.js lossPoints
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
    const r = await modal(`<img class="wide" src="assets/stage_meadow.webp" alt=""><h3>New here?</h3><p>Learn MINDS CLASH in 2 minutes with a guided duel.</p>`, [['Start tutorial', 1, 'primary'], ['Skip', 0]]);
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
$('#hub-town').onclick = () => { closeIsland(); stage.paused = true; show('town'); openTown(); };
$('#town-back').onclick = () => { closeTown(); enterHub(); };
$('#hub-cup').onclick = () => openCup();
// ---------- Daily Siege Cup: same village, same army for everyone; all entry Gems go to the winners ----------
async function openCup() {
  if (!online) return toast('The cup needs the game server.', true);
  sfx('click');
  let c;
  try { c = await api('cup'); } catch (e) { return toast(e.message, true); }
  const left = c.me ? c.tries - c.me.tries : c.tries, hours = Math.max(1, Math.ceil((c.endsAt - Date.now()) / 3600e3));
  const rows = c.top.map((e, i) => `<div class="cup-row"><b>${i + 1}</b><span>${esc(e.name)}</span><em>${'★'.repeat(e.stars)}${'☆'.repeat(3 - e.stars)} ${e.pct}%</em></div>`).join('') || '<p class="muted">No scores yet. Be first!</p>';
  const go = await modal(`<h3>🏆 Daily Siege Cup</h3><p>Everyone attacks the same village with the same army. Your Minds give no edge, so only skill counts. ${c.tries} tries, best score counts.</p>
    <div class="army-facts"><span>💎 Prize pool: <b>${c.pool}</b></span><span>👥 Players: <b>${c.players}</b></span><span>🎟️ Entry: <b>${c.entry} 💎</b></span><span>⏳ Ends in: <b>${hours} h</b></span></div>
    <p class="muted">Top 3 share every Gem: 60 / 30 / 10%. Real players only. If nobody else joins, your entry comes back.</p>${rows}${c.last?.winners.length ? `<p class="muted">Last winner: <b>${esc(c.last.winners[0].name)}</b> · ${c.last.winners[0].gems} 💎</p>` : ''}`,
    c.me ? (left > 0 ? [[`Play (${left} left)`, 'play', 'primary'], ['Close', 0]] : [['Close', 0, 'primary']]) : [[`Enter for ${c.entry} 💎`, 'join', 'primary'], ['Close', 0]]);
  if (!go) return;
  try {
    if (go === 'join') { await api('cup', { op: 'join' }); sfx('coins'); resetIsland(); toast('You are in! Good luck.'); }
    const s = await api('cup', { op: 'start' });
    closeIsland(); show('raid');
    await banner('<div class="bt">SIEGE CUP</div><small>Same village for everyone</small>', 1100);
    openRaid({ snap: s.snap, minds: [49], army: s.army, name: '🏆 Daily Siege Cup', loot: 0, toast: (m, bad) => toast(m, bad),
      onEnd: async (inputs, res0) => {
        let msg = '';
        try { const r = await api('cup', { op: 'score', inputs, claim: res0.stars }); msg = `<div class="raid-stars big">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div><p>${Math.round(r.pct * 100)}% destroyed · score ${r.score.toLocaleString()}</p><p>Your best: <b>${r.best.toLocaleString()}</b></p>`; }
        catch (e) { msg = `<p>${esc(e.message)}</p>`; }
        await modal(`<h3>🏆 Try finished</h3>${msg}`, [['OK', 0, 'primary']]);
        closeRaid(); enterHub(); openCup();
      } });
  } catch (e) { toast(e.message, true); enterHub(); }
}
// ---------- connect an AI: private keys for the Mind Player API (docs/MIND_API.md) ----------
async function openAI(fresh = null, list = null) {
  if (!online || guest) return toast('Connect a wallet to connect an AI.', true);
  let keys = list;
  try { keys ||= (await api('agent/keys', { op: 'list' })).keys; } catch (e) { return toast(e.message, true); }
  $('#modal-body').innerHTML = `<h3>🤖 Connect an AI</h3><p>Give this key to an AI and it can farm, raid, explore and duel for you. It follows the same limits as you. It cannot buy Gems or chat.</p>
    ${fresh ? `<p class="ai-key"><b>Copy your key now. It is shown only once:</b><code>${esc(fresh)}</code></p>` : ''}
    ${keys.map(k => `<div class="ai-row"><b>${esc(k.name)}</b><small>${k.log[0] ? `Last: ${esc(k.log[0].op)} · ${new Date(k.log[0].at).toLocaleString()}` : 'Not used yet'}</small><label><input type="checkbox" data-gems="${k.id}" ${k.gems ? 'checked' : ''}> May spend Gems</label><button class="btn small red" data-off="${k.id}">Turn off</button></div>`).join('') || '<p class="muted">No keys yet.</p>'}`;
  const box = $('#modal-btns'); box.innerHTML = '';
  const add = el('button', 'btn primary', 'Make a key'), close = el('button', 'btn', 'Close');
  add.onclick = async () => { try { const r = await api('agent/keys', { op: 'new' }); openAI(r.key, r.keys); } catch (e) { toast(e.message, true); } };
  close.onclick = () => { $('#modal').classList.remove('on'); $('#modal-body').onclick = null; };
  box.append(close, add);
  $('#modal-body').onclick = async e => {
    const off = e.target.closest('[data-off]'), gem = e.target.closest('[data-gems]');
    try {
      if (off) openAI(null, (await api('agent/keys', { op: 'off', id: off.dataset.off })).keys);
      else if (gem) await api('agent/keys', { op: 'gems', id: gem.dataset.gems, on: gem.checked });
    } catch (err) { toast(err.message, true); }
  };
  $('#modal').classList.add('on');
}
$('#set-ai').onclick = () => openAI();
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
  cells.splice(1, 0, cell('<i>💎</i>', 'Gems', isle.state.gems || 0));
  for (const [k, name, icon] of [['shard', 'Energy Shard', '⚡'], ['potion', 'Health Potion', '🧪'], ['fuel', 'Sky Fuel', '⛽'], ['herb', 'Glow Herb', '🌿'], ['raid_ticket', 'Raid Ticket', '🎟️'], ['adv_ticket', 'Adventure Ticket', '🧭']]) if (inv[k]) cells.push(cell(`<i>${icon}</i>`, name, inv[k]));
  const troops = Object.keys(TROOPS).filter(t => inv['troop_' + t]).map(t => cell(`<img src="${troopIcon(t)}" alt="">`, TROOPS[t].name, inv['troop_' + t]));
  const stash = Object.entries(isle.state.stash || {}).filter(([, n]) => n > 0).map(([t, n]) => cell(`<img src="${buildIcon(t)}" alt="">`, BUILD[t]?.name || t, n));
  const stashN = Object.values(isle.state.stash || {}).reduce((s, n) => s + n, 0);
  return `<div class="items-grid">${cells.join('')}</div>`
    + `<h4 class="items-h">⚔️ Army camp <span class="muted">${troopCount(isle.state)}/${TROOP_MAX}</span></h4><div class="items-grid">${troops.join('') || '<p class="muted">No troops. Train them in Shop → Army.</p>'}</div>`
    + `<p class="muted items-note">📦 ${stashN} stored building${stashN === 1 ? '' : 's'} · open 📦 on your island to place them.</p>`
    + `<div class="items-foot"><button class="btn small" id="inv-go-island">🏝️ Go to my island</button><button class="btn small" id="inv-go-shop">🛒 Shop</button></div>`;
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
  if (isle.loaded && isle.offline === !online) { if (online && Date.now() - (isle.at || 0) > 8000) await refreshIsland(); return true; }
  try { await loadIsland({ online, guestSeed: me?.id || me?.name, minds: guest ? 0 : myMinds.length }); return true; }
  catch (e) { toast(e.message, true); return false; }
}
async function goIsland() {
  if (!(await ensureIsland())) return;
  show('island'); stage.paused = true; music('cozy');
  openIsland({ minds: myMinds, toast: (m, bad) => toast(m, bad), shop: tab => openShop(tab), bag: () => { invTab = 'items'; openInventory(); }, mind: id => openMinds(id) });
  const worked = (isle.state?.jobLog || []).filter(e => e.at > (settings.jobSeen || 0)).slice(0, 6);
  if (worked.length) { settings.jobSeen = worked[0].at; saveSettings(); }
  // raided while you were away?
  const log = (isle.state?.raidLog || []).filter(e => e.at > (settings.raidSeen || 0));
  if (log.length) {
    settings.raidSeen = log[0].at; saveSettings();
    const lost = log.reduce((s, e) => s + e.loot, 0), sh = isle.state.shield > Date.now() ? `<p>🛡 Your island is shielded for ${fmtTime(isle.state.shield - Date.now())}.</p>` : '';
    const canRev = log.find(e => (e.pid || e.npc) && !e.avenged);
    modal(`<h3>⚔️ Your island was raided</h3>${log.map(e => `<p><b>${esc(e.by)}</b> · ${e.beaten ? `your defences beat them! +${e.beaten} ✨` : `${'★'.repeat(e.stars)}${'☆'.repeat(3 - e.stars)} · ${e.pct}% · −${e.loot.toLocaleString()} ✨`}</p>`).join('')}<p>Total lost: <b>${lost.toLocaleString()} ✨</b>. Build walls, towers and traps (🔨 Build), and barns keep Dust safe.</p>${sh}`,
      canRev ? [[`⚔️ Revenge on ${esc(canRev.by)}`, canRev.at, 'primary'], ['Later', 0]] : [['Got it', 0, 'primary']]).then(at => { if (at) startRaid(at); });
  } else if (worked.length) modal(`<h3>🧠 While you were away</h3>${worked.map(e => `<p><b>${e.id ? 'Mind #' + e.id : 'Captain'}</b> ${esc(e.text)}.</p>`).join('')}`, [['Nice!', 0, 'primary']]);
}
$('#hub-island').onclick = goIsland;
setInterval(() => { if (online && ['island', 'shop', 'inventory'].includes(current)) refreshIsland().then(() => { refreshHud(); if (current === 'shop') paintShop(); if (current === 'inventory') paintInventory(); }); }, 20000);
$('#shop-go-island').onclick = goIsland;
$('#isl-back').onclick = () => enterHub();
// ---------- raids: attack another island (or a bot village when there is nobody / you are on a trial account) ----------
// pick your army (camp size grows a little with the Minds you own; your Mind leads as the hero)
function pickArmy(cap, hero, lead) {
  const owned = k => isle.state?.inv?.['troop_' + k] || 0;
  const army = cleanArmy(settings.army || DEFAULT_ARMY, cap);
  for (const k of Object.keys(TROOPS)) army[k] = Math.min(army[k], owned(k));
  return new Promise(done => {
    const draw = () => {
      const used = armyUsed(army);
      const st = isle.state || { inv: {} }, day = new Date().toISOString().slice(0, 10), done = st.rd?.day === day ? st.rd.n : 0, left = Math.max(0, raidsPerDay(guest ? 0 : myMinds.length, campCount(st)) - done);
      $('#modal-body').innerHTML = `<h3>⚔️ Your army</h3>
        <div class="army-facts"><span>🎟️ Raids left today: <b>${left}</b>${st.inv.raid_ticket ? ` (+${st.inv.raid_ticket} ticket${st.inv.raid_ticket > 1 ? 's' : ''})` : ''}</span><span>✨ Supplies: <b>${raidFee(army)}</b> Dust (you have ${(st.dust || 0).toLocaleString()})</span></div>
        <div class="army-cap"><b>${used}/${cap}</b> camp space <span class="muted">${campCount(st) ? `(+${cap - armyCap(guest ? 0 : myMinds.length)} from Army Camps)` : `Build an ⛺ Army Camp for +${CAMP_SPACE} space and +1 raid a day`}</span></div>
        <div class="army-list">${Object.entries(TROOPS).map(([k, d]) => `<div class="army-row"><img src="${troopIcon(k)}" alt=""><div><b>${d.name}</b> <span class="muted">· ${d.cost} space · you have ${owned(k)}</span><small>${d.desc}</small></div><button class="btn small" data-a="${k}" data-d="-1">−</button><em>${army[k]}</em><button class="btn small" data-a="${k}" data-d="1">+</button></div>`).join('')}</div>
        <div class="army-hero">${hero === 'hero' ? `<img src="${chibi(lead).full.cv.toDataURL()}" alt=""><span><b>Hero: Mind #${lead}</b><small>Stronger leader + 📯 Battle Cry</small></span>` : `<img src="${troopIcon('captain')}" alt=""><span><b>Captain</b><small>Own a Mind to lead with it (stronger + Battle Cry)</small></span>`}</div>`;
    };
    draw();
    const box = $('#modal-btns'); box.innerHTML = '';
    const go = el('button', 'btn primary', '⚔️ Attack!'), back = el('button', 'btn', 'Cancel'), train = el('button', 'btn', '🏹 Train troops');
    train.onclick = () => { $('#modal').classList.remove('on'); $('#modal-body').onclick = null; done(null); openShop('army'); };
    go.onclick = () => { if (!armyUsed(army)) { sfx('denied'); return toast('Bring at least one troop. Train them in the Shop with Dust.', true); } $('#modal').classList.remove('on'); $('#modal-body').onclick = null; settings.army = { ...army }; saveSettings(); done(army); };
    back.onclick = () => { $('#modal').classList.remove('on'); $('#modal-body').onclick = null; done(null); };
    const none = !Object.keys(TROOPS).some(k => owned(k) > 0);
    if (none) { train.className = 'btn primary'; go.className = 'btn'; $('#modal-body').insertAdjacentHTML('afterbegin', '<p class="army-none">You have no troops yet. Train some with Dust first!</p>'); }
    box.append(back, train, go);
    $('#modal-body').onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const k = b.dataset.a, d = +b.dataset.d;
      if (d > 0 && armyUsed(army) + TROOPS[k].cost > cap) { sfx('denied'); return; }
      if (d > 0 && army[k] >= owned(k)) { sfx('denied'); return toast(`You have ${owned(k)} ${TROOPS[k].name}${owned(k) === 1 ? '' : 's'}. Train more in the Shop.`, true); }
      army[k] = Math.max(0, army[k] + d); sfx(d > 0 ? 'select' : 'deselect'); draw();
    };
    $('#modal').classList.add('on');
  });
}
async function startRaid(revenge = 0) {
  sfx('click');
  const lead = (picked()[0] ?? myMinds[0]) || 49, holder = online && !guest && myMinds.length;
  if (!(await ensureIsland())) return;
  const cap = armyCap(guest ? 0 : myMinds.length, campLevels(isle.state));
  const troops = await pickArmy(cap, holder ? 'hero' : 'captain', lead);
  if (!troops) return;
  let target = null;
  if (online) {
    toast('Looking for an island to raid…');
    try { target = await api('raid', { op: 'find', minds: [lead], army: troops, ...(revenge ? { revenge } : {}) }); resetIsland(); }
    catch (e) {   // never fail silently: say exactly why (out of raids → tickets in the Gem shop)
      sfx('denied'); toast(e.message || 'The raid could not start. Try again.', true);
      if (/raids today/.test(e.message || '') && (await modal(`<h3>🎟️ Out of raids for today</h3><p>${esc(e.message)}</p>`, [['Get a Raid Ticket', 1, 'primary'], ['OK', 0]]))) openShop('gems');
      return;
    }
  }
  // no server: an island to raid made on this device (nothing is saved)
  const local = !target?.snap;
  const snap = local ? botVillage((Math.random() * 2 ** 31) | 0, Math.min(3, 1 + Math.floor((settings.raidWins || 0) / 3))) : target.snap;
  const army = { troops: target?.army ?? cleanArmy(troops, cap), hero: target?.hero ?? (holder ? 'hero' : 'captain') };
  closeIsland(); show('raid');
  await banner(`<div class="bt">RAID!</div><small>${esc(local ? snap.name : target.name)}'s island</small>`, 1100);
  openRaid({
    snap, minds: [lead], army, name: `⚔️ ${local ? snap.name : target.name}`, loot: local ? botLoot(snap.level || 1) : target.loot,
    toast: (m, bad) => toast(m, bad),
    onEnd: async (inputs, res0) => {
      let res = { ...res0, loot: 0 };
      if (!local) {
        try { res = await api('raid', { op: 'attack', id: target.id, inputs, army: army.troops, claim: res0.stars }); resetIsland(); }
        catch (e) { toast(e.message, true); }
      } else if (res0.stars >= 2) { settings.raidWins = (settings.raidWins || 0) + 1; saveSettings(); }
      const stars = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
      if (res.stars) sfx('victory');
      await modal(`<h3 class="raid-result">${res.stars ? 'Raid won!' : 'Raid failed'}</h3><div class="raid-stars big">${stars}</div><p>${Math.round(res.pct * 100)}% destroyed${res.home ? ' · house down' : ''}</p>${local ? '<p class="muted">Offline raid: loot is not saved.</p>' : `<p class="raid-loot-won"><b>+${(res.loot || 0).toLocaleString()} ✨</b> loot</p>${target.raidsLeft != null ? `<p class="muted">${target.raidsLeft} raid${target.raidsLeft === 1 ? '' : 's'} left today</p>` : ''}`}`, [['Back to my island', true, 'primary']]);
      closeRaid(); goIsland();
    },
  });
}
$('#isl-raid').onclick = () => startRaid();
$('#isl-minds').onclick = () => openMinds();
$('#isl-raid').addEventListener('contextmenu', e => e.preventDefault());
// ---------- adventure: explore a wild island ----------
// the world map screen: pick an island your airship can reach, bring potions, fly
async function startAdventure() {
  sfx('click');
  if (!(await ensureIsland())) return;
  const st = isle.state;
  closeIsland(); show('map');
  openMap({
    ship: online ? st.ship || 0 : settings.ship || 0, fuel: st.inv.fuel || 0, potions: st.inv.potion || 0, sel: settings.advSpot || 0,
    onBack: () => { closeMap(); goIsland(); },
    onUpgrade: () => upgradeShip(),
    onFly: (spot, potions) => { settings.advSpot = spot; saveSettings(); launchAdventure({ area: spot, potions }); },
  });
}
async function upgradeShip() {
  const st = isle.state, t = (st.ship || 0) + 1, sh = SHIPS[t];
  if (!sh) return;
  const r = await modal(`<h3>${sh.icon} ${sh.name}</h3><p>${sh.desc}</p><p class="muted">Pay with Dust and materials, or with Gems.</p>`,
    [[`Build · ${costText(sh.cost)}`, 1, 'primary'], [`${sh.gems} 💎`, 2, 'gem'], ['Not now', 0]]);
  if (!r) return;
  const res = doAct({ type: 'ship', gems: r === 2 });
  if (res.error) { sfx('denied'); return toast(res.error, true); }
  sfx('levelup'); toast(`Your ${sh.name} is ready! New islands are in reach.`);
  if (!online) { settings.ship = t; saveSettings(); }
  flushIsland(); updateMap({ ship: isle.state.ship || t, fuel: isle.state.inv.fuel || 0 });
}
async function launchAdventure(pick) {
  const lead = (picked()[0] ?? myMinds[0]) || 49, holder = online && !guest && myMinds.length;
  let start = null;
  if (online) {
    try { await flushIsland(); start = await api('adventure', { op: 'start', mind: lead, spot: pick.area, potions: pick.potions }); resetIsland(); }
    catch (e) { if (e.status === 403) { toast(e.message, true); closeMap(); return startAdventure(); } }
  }
  const local = !start;
  const seed = local ? (Math.random() * 2 ** 31) | 0 : start.seed, level = local ? spotLevel(pick.area) : start.level;
  closeMap(); show('adv');
  await banner(`<div class="bt">${SPOTS[pick.area].icon} ${SPOTS[pick.area].name}</div><small>Level ${level}</small>`, 1000);
  openAdventure({
    seed, level, area: pick.area, potions: start?.potions ?? pick.potions, gatherLeft: start?.gatherLeft ?? 40, heroKind: start?.heroKind ?? (holder ? 'hero' : 'captain'), mind: lead,
    onEnd: async A => {
      let loot = A.bag;
      if (!local) {
        try { loot = (await api('adventure', { op: 'end', got: A.got, beat: A.beat, ko: A.ko, cover: A.cover, potionsLeft: A.potions })).loot; resetIsland(); }
        catch (e) { toast(e.message, true); loot = {}; }
      } else {
        if (A.ko) loot = Object.fromEntries(Object.entries(loot).map(([k, n]) => [k, Math.floor(n / 2)]));
      }
      const NAMES = { dust: '✨ Dust', wood: '🪵 Wood', stone: '🪨 Stone', seed_carrot: '🥕 Carrot seed', seed_melon: '🍈 Melon seed', seed_star: '⭐ Star Fruit seed', herb: '🌿 Glow herb', gems: '💎 Gems' };
      const list = Object.entries(loot).filter(([, n]) => n > 0).map(([k, n]) => `<li><b>+${n}</b> ${NAMES[k] || k}</li>`).join('') || '<li class="muted">Nothing this time</li>';
      sfx(A.ko ? 'defeat' : 'victory');
      await modal(`<h3>${A.ko ? '😵 Knocked out!' : '🧭 Back home!'}</h3>${A.ko ? '<p class="muted">You kept half of what you found.</p>' : ''}<ul class="adv-loot">${list}</ul>${local ? '<p class="muted">Offline: loot is not saved.</p>' : start.left != null ? `<p class="muted">${start.left} adventure${start.left === 1 ? '' : 's'} left today</p>` : ''}`, [['Back to my island', true, 'primary']]);
      closeAdventure(); goIsland();
    },
  });
}
$('#isl-adv').onclick = () => startAdventure();
// codes in Settings (the admin screen opens only for the owner's wallet; checked on the server)
initAdmin({ api, toast: (m, bad) => toast(m, bad), show, modal, esc, onGive: pid => { if (pid === me?.id) refreshIsland(); } });
$('#set-code-go').onclick = async () => {
  const code = $('#set-code').value.trim(); $('#set-code').value = '';
  if (!code) return;
  if (online && session.token && await tryCode(code)) return sfx('levelup');
  sfx('denied'); toast('That code does not work.', true);
};
$('#hub-shop').onclick = () => openShop();
// the lobby tile shows a picture of your own island (made once, after the lobby has settled)
let thumbFor = null;
let islandPeek = false;
function islandTile() {
  const id = me?.id || me?.name || 'guest';
  if (thumbFor !== id) {
    thumbFor = id;
    setTimeout(() => { try { $('#hub-island').style.setProperty('--bg', `url(${islandThumb(isle.loaded ? isle.seed : hashStr(id))})`); } catch { /* fine without a picture */ } }, 900);
  }
  // live status on the lobby tile, so you can see what is waiting for you
  const st = isle.state, ready = st ? Object.values(st.tiles).filter(t => ripe(t, islandNow(), isle.minds)).length : 0, shards = st ? wellShards(st, islandNow()) : 0;
  const sites = st ? (st.b || []).filter(b => b.done && b.done > islandNow()).length : 0;
  const chips = [ready && `🌾 ${ready} ready`, shards && `⚡ ${shards} shard${shards > 1 ? 's' : ''}`, sites && `🔨 ${sites} building`, st && `✨ ${st.dust.toLocaleString()}`].filter(Boolean);
  $('#hub-island-chips').innerHTML = chips.map(c => `<span>${c}</span>`).join('');
  $('#hub-island').classList.toggle('wants', !!(ready || shards));
  $('#hub-island-ready').textContent = ''; $('#hub-island-ready').style.display = '';
  if (!isle.loaded && !islandPeek && me) { islandPeek = true; ensureIsland().then(() => { islandPeek = false; islandTile(); }); }
}

let shopTab = 'seeds';
async function openShop(tab) {
  if (tab) shopTab = tab;
  if (!(await ensureIsland())) return;
  paintShop(); show('shop');
}
const shopCard = (img, name, desc, have, btns, cls = '') => `<div class="shop-card px ${cls}"><div class="shop-img">${img}</div><div class="shop-txt"><b>${name}</b><span>${desc}</span>${have !== null ? `<em>You have ${have}</em>` : ''}</div><div class="shop-btns">${btns}</div></div>`;
// +1 ranked energy on a Mind: island shards, Dust or Gems
async function refillEnergy(id) {
  await ensureIsland();
  const inv = isle.state?.inv || {}, shards = inv.shard || 0;
  const pay = await modal(`<h3>⚡ Refill Mind #${id}</h3><p>This Mind has <b>${energyOf(id)}/${capFor(id)}</b> energy. It refills by itself in ${resetText()}.</p><p>Your ⚡ shards: <b>${shards}</b> <span class="muted">(the Energy Well on your island makes 1 every 4 hours)</span></p><p class="muted">Max ${REFILLS_PER_DAY} refills per Mind per day.</p>`,
    [[`${SHARDS_PER_ENERGY} ⚡ shards`, 'shard', shards >= SHARDS_PER_ENERGY ? 'primary' : ''], [`${ENERGY_PRICE.dust} ✨`, 'dust'], [`${ENERGY_PRICE.gems} 💎`, 'gems', 'gem'], ['Not now', 0]]);
  if (!pay) return;
  try { const r = await api('energy', { mind: id, pay }); energy[id] = r.energy; sfx('levelup'); toast(`Mind #${id} now has ${r.energy} ⚡`); resetIsland(); await ensureIsland(); refreshEnergy(); if (current === 'prep') renderPrepGrid(); if (current === 'inventory') paintInventory(); }
  catch (e) { sfx('denied'); toast(e.message, true); }
}
const RAW_ICON = { wood: '🪵', stone: '🪨' };
function paintShop() {
  const st = isle.state, inv = st.inv;
  $$('#shop-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === shopTab));
  $('#shop-dust').textContent = st.dust.toLocaleString();
  $('#shop-gems').textContent = (st.gems || 0).toLocaleString();
  $('#shop-note').textContent = guest ? 'Trial island: selling gives no leaderboard points.' : 'Selling crops: +1 leaderboard point per 100 ✨ (max 20 a day)';
  let html = '';
  if (shopTab === 'seeds') html = Object.entries(CROPS).map(([c, d]) => shopCard(`<img src="${cropImg(c)}" alt="">`, `${d.name} seeds`, `Grows in ${fmtTime(growMs(c, isle.minds))} · sells for ${d.sell} ✨`, inv['seed_' + c] || 0,
    `<button class="btn small primary" data-act="buy" data-item="seed_${c}" data-n="1" ${st.dust < d.seed ? 'disabled' : ''}>Buy 1 · ${d.seed} ✨</button><button class="btn small" data-act="buy" data-item="seed_${c}" data-n="10" ${st.dust < d.seed * 10 ? 'disabled' : ''}>Buy 10 · ${d.seed * 10} ✨</button><button class="btn small gem" data-act="buy" data-gems="1" data-item="seed_${c}" data-n="10" ${(st.gems || 0) < gemPrice({ dust: d.seed * 10 }) ? 'disabled' : ''}>10 · ${gemPrice({ dust: d.seed * 10 })} 💎</button>`)).join('');
  else if (shopTab === 'sell') {
    const items = [...Object.keys(CROPS).map(c => ['crop_' + c, CROPS[c].name, CROPS[c].sell, `<img src="${cropImg(c)}" alt="">`]), ...Object.entries(RAW).map(([k, d]) => [k, d.name, d.sell, `<i>${RAW_ICON[k]}</i>`])].filter(([k]) => inv[k] > 0);
    html = items.length ? items.map(([k, name, price, img]) => shopCard(img, name, `${price} ✨ each`, inv[k], `<button class="btn small primary" data-act="sell" data-item="${k}" data-n="${inv[k]}">Sell all · ${price * inv[k]} ✨</button><button class="btn small" data-act="sell" data-item="${k}" data-n="1">Sell 1</button>`)).join('')
      : '<div class="inv-empty"><div class="inv-chest">🧺</div><b>Nothing to sell yet</b><span>Harvest crops on your island, or clear trees and rocks for wood and stone.</span></div>';
  } else if (shopTab === 'land') {
    const have = inv.permit || 0, cost = permitCost(have), max = have >= MAX_PERMITS;
    html = shopCard('<i>📜</i>', 'Land Permit', `+1 farm plot forever. Plots: 12 free, +1 per Mind you own (up to 8), +2 or more per Cottage, +1 per permit (up to ${MAX_PERMITS}).`, `${have}/${MAX_PERMITS}`,
      max ? '<button class="btn small" disabled>All bought</button>' : `<button class="btn small primary" data-act="buy" data-item="permit" data-n="1" ${st.dust < cost ? 'disabled' : ''}>Buy · ${cost.toLocaleString()} ✨</button><button class="btn small gem" data-act="buy" data-gems="1" data-item="permit" data-n="1" ${(st.gems || 0) < gemPrice({ dust: cost }) ? 'disabled' : ''}>${gemPrice({ dust: cost })} 💎</button>`);
  } else if (shopTab === 'army' || shopTab === 'items' || shopTab === 'gems') {
    const keys = Object.keys(SHOP).filter(k => shopTab === 'army' ? k.startsWith('troop_') : shopTab === 'gems' ? SHOP[k].gem : !k.startsWith('troop_') && !SHOP[k].gem);
    const have = k => { const g = Object.keys(SHOP[k].gives)[0]; return g === 'dust' ? null : inv[g] || 0; };
    const head = shopTab === 'army' ? `<div class="shop-info px">⚔️ Troops you train wait in your camp (${troopCount(st)}/${TROOP_MAX}). In a raid you only lose the ones you send in; the rest come home. Earn Dust by farming, adventures and raids.</div>`
      : shopTab === 'gems' ? `<div class="shop-info px gemsinfo">💎 <b>Gems</b> buy exclusive things and save time. You find a few by beating Ogres on adventures. <button class="btn small primary" id="buy-gems">Get more Gems</button></div>`
      : `<div class="shop-info px">🧪 Bring potions on adventures (your hero does not heal by itself). Craft them from herbs found on adventures, or buy them.</div>`;
    const icon = k => k.startsWith('troop_') ? `<img src="${troopIcon(k.slice(6))}" alt="">` : `<i>${SHOP[k].icon}</i>`;
    html = head + keys.map(k => { const it = SHOP[k], ok = canAfford(st, it.price), h = have(k);
      return shopCard(icon(k), it.name, it.desc, h, `<button class="btn small ${it.gem ? 'gem' : 'primary'}" data-act="shop" data-item="${k}" data-n="1" ${ok ? '' : 'disabled'}>${costText(it.price)}</button>${it.gem ? '' : `<button class="btn small" data-act="shop" data-item="${k}" data-n="5" ${canAfford(st, Object.fromEntries(Object.entries(it.price).map(([a, n]) => [a, n * 5]))) ? '' : 'disabled'}>×5</button><button class="btn small gem" data-act="shop" data-gems="1" data-item="${k}" data-n="1" ${(st.gems || 0) < gemPrice(it.price) ? 'disabled' : ''}>${gemPrice(it.price)} 💎</button>`}`, it.gem ? 'gemcard' : ''); }).join('')
      + (shopTab === 'items' && SHIPS[(st.ship || 0) + 1] ? shopCard(`<i>${SHIPS[(st.ship || 0) + 1].icon}</i>`, `Airship: ${SHIPS[(st.ship || 0) + 1].name}`, `${SHIPS[(st.ship || 0) + 1].desc} You have the ${SHIPS[st.ship || 0].name}.`, null, `<button class="btn small primary" data-ship="1">${costText(SHIPS[(st.ship || 0) + 1].cost)}</button><button class="btn small gem" data-ship="2">${SHIPS[(st.ship || 0) + 1].gems} 💎</button>`) : '')
      + (shopTab === 'items' ? Object.entries(RECIPES).map(([k, r]) => shopCard('<i>⚗️</i>', `Craft: ${r.name}`, `Uses ${costText(r.needs)}`, inv.herb || 0, `<button class="btn small primary" data-act="craft" data-item="${k}" data-n="1" ${canAfford(st, r.needs) ? '' : 'disabled'}>Craft</button>`)).join('') : '');
  } else {
    html = [['🌳', 'Decorations', 'Trees, statues, paths and lights for your island'], ['🃏', 'Card backs', 'Show off in every duel · 3,000 ✨'], ['🖼️', 'Profile frames', 'A frame around your profile picture · 5,000 ✨'],
      ['⚡', 'Energy shard', '+1 ranked energy for one Mind · 800 ✨ (1 a day)'], ['🛡️', 'Raid defenses', 'Walls, traps and guards for when raids arrive']]
      .map(([i, n, d]) => shopCard(`<i>${i}</i>`, n, d, null, '<button class="btn small" disabled>Soon</button>', 'soon')).join('');
  }
  $('#shop-grid').innerHTML = html;
}
// Gems for ETH on Robinhood Chain: the player's wallet pays the treasury, the server checks the transaction, then adds Gems
const ethToWei = eth => { const [i, f = ''] = String(eth).split('.'); return BigInt(i || 0) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18)); };
async function buyGems() {
  sfx('click');
  if (guest || !online) return toast('Connect a wallet to buy Gems.', true);
  let info;
  try { info = await api('gems', { op: 'info' }); } catch (e) { return toast(e.message, true); }
  if (!info.enabled) return modal(`<h3>💎 Gems</h3><p>Gem packs are coming very soon.</p><p class="muted">Until then you find Gems by beating bosses on adventures.</p>`, [['OK', true, 'primary']]);
  const pick = await modal(`<h3>💎 Get Gems</h3><p class="muted">Paid in ETH on Robinhood Chain, from your connected wallet.</p>
    <div class="gem-packs">${info.packs.map(pk => `<div class="gem-pack"><b>${pk.icon}</b><span>${pk.name}</span><em>${pk.gems} 💎</em>${pk.tag ? `<small>${pk.tag}</small>` : ''}<strong>${pk.eth} ETH</strong></div>`).join('')}</div>`,
    [...info.packs.map(pk => [`${pk.gems} 💎 · ${pk.eth} ETH`, pk.id, 'primary']), ['Cancel', 0]]);
  if (!pick) return;
  const pack = info.packs.find(x => x.id === pick);
  if (!window.ethereum) return toast('No wallet found in this browser.', true);
  try {
    const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const chainHex = '0x' + info.chainId.toString(16);
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] }); }
    catch (e) { if (e.code === 4902) await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: chainHex, chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'] }] }); else throw e; }
    toast('Confirm the payment in your wallet…');
    const tx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: info.treasury, value: '0x' + ethToWei(pack.eth).toString(16) }] });
    toast('Payment sent! Checking it on the chain…');
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await api('gems', { op: 'claim', tx, pack: pack.id }).catch(e => ({ error: e.message, status: e.status }));
      if (r.ok) { sfx('levelup'); resetIsland(); await ensureIsland(); refreshHud(); if (current === 'shop') paintShop(); return toast(`+${r.added} 💎 added! You have ${r.gems} Gems.`); }
      if (r.error) return toast(`${r.error} (tx ${tx.slice(0, 10)}…)`, true);
    }
    toast(`Still confirming. Your payment is safe: open Get Gems later (tx ${tx.slice(0, 10)}…).`, true);
  } catch (e) { toast(e.code === 4001 ? 'Payment cancelled.' : e.message || 'Payment failed.', true); }
}
$('#shop-grid').addEventListener('click', e => {
  if (e.target.closest('#buy-gems')) return buyGems();
  const sb = e.target.closest('[data-ship]'); if (!sb) return;
  const res = doAct({ type: 'ship', gems: sb.dataset.ship === '2' });
  if (res.error) { sfx('denied'); return toast(res.error, true); }
  sfx('levelup'); toast('New airship ready! Fly further on the world map.'); flushIsland(); paintShop();
});
$('#shop-tabs').onclick = e => { const v = e.target.closest('button')?.dataset.v; if (!v) return; shopTab = v; paintShop(); };
$('#shop-grid').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  const res = doAct({ type: b.dataset.act, item: b.dataset.item, n: +b.dataset.n, gems: !!b.dataset.gems });
  if (res.error) { sfx('denied'); return toast(res.error, true); }
  sfx('coin');
  const g = res.gain || {};
  toast(b.dataset.act === 'sell' ? `Sold for ${g.dust} ✨` : b.dataset.act === 'craft' ? 'Crafted!' : g.gems < 0 ? `Bought! ${-g.gems} 💎 spent` : `Bought! ${-(g.dust || 0)} ✨ spent`);
  flushIsland(); paintShop(); refreshHud();
};
$('#inv-tabs').onclick = e => { const v = e.target.dataset.v; if (!v) return; invTab = v; paintInventory(); };
$('#inv-minds').onclick = async e => {
  const m = e.target.closest('[data-id]'); if (!m || guest || !online) return;
  const id = +m.dataset.id, n = energyOf(id), c = capFor(id), inShow = (me.showcase || []).includes(id);
  const r = await modal(`<img class="inv-big" src="${thumb(id)}" alt=""><h3>Mind #${id}</h3><p><b style="color:${RAR_COLOR[rarityOf(id)]}">${rarityOf(id)}</b> · ⚡${n}/${c} ranked energy today${n ? '' : ` · refills in ${resetText()}`}</p>`,
    [['Set as profile picture', 1, 'primary'], [inShow ? 'Remove from showcase' : 'Add to lobby showcase', 2], ...(n < c ? [['⚡ Refill energy', 3]] : []), ['Close', 0]]);
  if (r === 3) return refillEnergy(id);
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

// ---------- prep: pick minds ----------
let prep = { mode: 'ranked', minds: [], level: 'normal' };
function openPrep(mode) {
  prep.mode = mode;
  prep.minds = picked().filter(id => mode !== 'ranked' || energyOf(id) > 0).slice(0, 3);
  prep.level = settings.picks.level || 'normal';
  $('#prep-title').textContent = { ranked: 'Ranked Duel', classic: 'Classic Duel', practice: 'Practice vs bot' }[mode];
  $('#prep-go').textContent = mode === 'practice' ? 'Start practice' : 'Find match';
  $('#prep-note').textContent = mode === 'classic' ? 'Classic: play anyone, with or without Minds. Just for fun: no rating or points.'
    : mode === 'ranked' ? 'Ranked: rating and points count.' : '';
  $('#prep-level').style.display = mode === 'practice' ? 'inline-flex' : 'none';
  $$('#prep-level button').forEach(b => b.classList.toggle('on', b.dataset.v === prep.level));
  renderPrepGrid();
  show('prep');
}
function renderPrepGrid() {
  const ranked = prep.mode === 'ranked';
  // ranked: Minds with energy first, empty ones last (they can't be picked until the refill)
  const list = ranked ? [...myMinds].sort((a, b) => (energyOf(b) > 0) - (energyOf(a) > 0)) : myMinds;
  $('#prep-minds').innerHTML = list.map(id => `<div class="mind ${ranked && !energyOf(id) ? 'tired' : ''}" data-id="${id}"><img src="${thumb(id)}" alt="" loading="lazy"><span class="tag" style="background:${RAR_COLOR[rarityOf(id)]}">#${id}</span>${ranked ? energyTag(id) : ''}<span class="order"></span></div>`).join('');
  paintPrep();
}
function paintPrep() {
  $$('#prep-minds .mind').forEach(m => { const i = prep.minds.indexOf(+m.dataset.id); m.classList.toggle('on', i >= 0); m.querySelector('.order').textContent = i + 1; });
  $('#prep-mind-count').textContent = `${prep.minds.length}/3`;
  if (prep.mode === 'ranked') {
    const n = prep.minds.length;
    $('#prep-note').innerHTML = n ? `<span class="stake"><b class="sx">STAKE x${n}</b><b class="sw">WIN +${winReward(prep.minds)}</b><b class="sl">LOSE −${lossRisk(prep.minds)}</b><b class="se">⚡ −1 × ${n} Mind${n > 1 ? 's' : ''}</b></span>
      <small>Every Mind you stake multiplies the win and the loss, and each one spends 1 ⚡ (refills in ${resetText()}).</small>` : 'Pick 1 to 3 Minds to stake.';
  }
  $('#prep-go').disabled = !prep.minds.length;
  $('#prep-err').textContent = prep.minds.length ? '' : 'Pick at least 1 Mind.';
}
$('#prep-minds').onclick = e => {
  const m = e.target.closest('[data-id]'); if (!m) return;
  const id = +m.dataset.id, i = prep.minds.indexOf(id);
  if (i < 0 && m.classList.contains('tired')) return refillEnergy(id);
  if (i >= 0) prep.minds.splice(i, 1); else if (prep.minds.length < 3) prep.minds.push(id); else return toast('Max 3 Minds. Tap one to remove it first.');
  sfx('select'); paintPrep();
};
$('#prep-level').onclick = e => { const v = e.target.dataset.v; if (!v) return; prep.level = v; $$('#prep-level button').forEach(b => b.classList.toggle('on', b === e.target)); };
$('#prep-go').onclick = async () => {
  settings.picks = { minds: prep.minds, level: prep.level }; saveSettings();
  if (!online) return startDuel(new LocalMatch({ name: me.name, minds: prep.minds, level: prep.mode === 'practice' ? prep.level : 'normal' }));
  const b = $('#prep-go'); b.disabled = true;
  try {
    const r = await api('queue/join', { minds: prep.minds, ...(prep.mode === 'practice' ? { bot: prep.level } : prep.mode === 'classic' ? { mode: 'classic' } : {}) });
    if (r.match) return openMatch(r.match);
    queueLoop();
  } catch (e) { toast(e.message, true); }
  finally { b.disabled = false; }
};

// ---------- matchmaking ----------
let queueTimer = null;
function queueLoop() {
  $('#queue-pfp').src = thumb(prep.minds[0]);
  $('#queue-msg').textContent = prep.mode === 'classic' ? 'Searching for any player' : 'Searching players near your rating';
  show('queue');
  const tick = async () => {
    try {
      const r = await api('queue/poll', {});
      if (r.match) { stopQueue(); return openMatch(r.match); }
      if (r.idle) { stopQueue(); return enterHub(); }
      $('#queue-msg').textContent = r.waited > 10 ? 'Looking a bit wider for a rival…' : 'Searching players near your rating…';
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
// the arena floor sits right above the card tray, so the Minds are never hidden behind the cards
function duelLayout() {
  const H = innerHeight, r = $('#d-controls').getBoundingClientRect(), top = r.height ? r.top : H * 0.6;
  $('#s-duel').style.setProperty('--tray', `${Math.round(H - top)}px`);
  setLayout({ groundAt: Math.min(0.76, Math.max(0.5, (top - 4) / H)) });
}
function startDuel(local, first = local.view(), opts = {}) {
  D = { local, id: first.id, v: first, seen: keyOf(first.view.lastEvent), busy: false, sel: { card: null, spell: null }, F: [null, null], mind: [-1, -1], lastCrown: null,
    chatAt: (first.chat || []).reduce((m, c) => Math.max(m, Date.parse(c.at)), 0), tutorial: opts.tutorial || null };
  D.v.gotAt = Date.now();
  clearStage(); clearTags();
  const forced = new URLSearchParams(location.search).get('stage');   // ?stage=moon to preview one arena
  setStage(opts.stage || (BATTLE_STAGES.includes(forced) ? forced : BATTLE_STAGES[(Math.random() * BATTLE_STAGES.length) | 0]));
  placeFighters(first.view, true);
  buildTable();
  $('#d-chat').style.display = D.tutorial ? 'none' : '';
  $('#d-chatpick').classList.remove('on');
  show('duel'); music('duel');
  paintDuel();
  duelLayout(); camSnap(0, 1.25, 0.6); camTo(0, 1, 0, 2.5);
  if (!local) {
    watch(`match:${D.id}`, () => refresh()).then(un => { if (D) D.unwatch = un; });
    D.poll = setInterval(() => { if (D && !D.busy) refresh(); }, 2500);
  }
  D.clock = setInterval(paintTimer, 250);
  D.busy = true;
  $('#s-duel').classList.add('intro');
  banner(`<div class="bt">${D.tutorial ? 'TUTORIAL' : 'DUEL!'}</div><small>${esc(first.view.me.name)} vs ${esc(first.view.rival.name)}${first.ranked ? ' · RANKED' : ''} · ${STAGES[stage.name].name}</small>`, 1400)
    .then(() => { sfx('fight'); $('#s-duel').classList.remove('intro'); if (D) { D.busy = false; D.tutorial?.start(); } });
}
function placeFighters(v, drop) {
  [v.me, v.rival].forEach((p, i) => {
    if (D.mind[i] === p.mind && D.F[i]) return;
    D.F[i]?.dispose();
    const f = new Fighter(p.minds[p.mind], i ? 1.9 : -1.9, i);
    if (drop) f.dropIn(0.25 + i * 0.2);
    D.F[i] = f; D.mind[i] = p.mind;
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

function buildTable() {
  $('#d-hand').innerHTML = CARD_VALUES.map(n => `<button class="card" data-card="${n}" data-v="${n}" style="--c:${CARD_COLOR[n]}"><b>${n}</b></button>`).join('');
  $('#d-spells').innerHTML = SPELLS.map(k => `<button class="sp px" data-spell="${k}"><img src="${spellImg(k)}" alt=""><div><b>${SPELL_INFO[k].name}</b><em>${SPELL_INFO[k].short}</em></div>${k === 'reverse' ? '<i class="lim">1 / MATCH</i>' : ''}</button>`).join('');
  $$('#d-spells .sp').forEach(n => tipFor(n, n.dataset.spell));
}
const starsHtml = n => Array.from({ length: RULES.roundsToWin }, (_, i) => `<img src="assets/crown.png" class="${i < n ? '' : 'off'}" alt="">`).join('');
function paintPlates(v, scores) {
  [[v.me, 0], [v.rival, 1]].forEach(([p, i]) => {
    $(`#d-pfp${i}`).src = thumb(p.minds[p.mind]);
    $(`#d-name${i}`).textContent = p.name;
    $(`#d-rounds${i}`).innerHTML = starsHtml(p.rounds);
    $(`#d-score${i}`).textContent = scores ? scores[i] : p.score;
  });
}
function paintDuel() {
  const V = D.v, v = V.view, mine = v.me, rv = v.rival;
  paintPlates(v);
  $('#d-round').textContent = `ROUND ${v.round}`;
  const cb = $('#d-crownbox');
  if (D.lastCrown !== `${v.round}:${v.turn}`) { D.lastCrown = `${v.round}:${v.turn}`; cb.classList.remove('new'); void cb.offsetWidth; cb.classList.add('new'); sfx('coin'); }
  $('#d-crown').textContent = v.pot;
  const carried = v.pot > v.crown;
  $('#d-pot').classList.toggle('on', carried);
  $('#d-pot').textContent = carried ? `${v.crown} + ${v.pot - v.crown} from the tie` : '';
  // the prize grows with its value; the round's 7 prizes: played ones show their value, the rest stay hidden
  cb.dataset.tier = v.pot >= 11 ? 'high' : v.pot >= 6 ? 'mid' : 'low';
  const TIER = { low: 'LOW', mid: 'MID', high: 'HIGH' };
  $('#d-left').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const t = i + 1;
    if (t < v.turn) return `<i class="done">${v.seen[i]}</i>`;
    if (t === v.turn) return `<i class="now">${v.crown}</i>`;
    if (t === v.turn + 1 && v.next) return `<i class="upnext t-${v.next}" title="Next prize: ${TIER[v.next].toLowerCase()} (${v.next === 'low' ? '1-5' : v.next === 'mid' ? '6-10' : '11-15'})">?<em>${TIER[v.next]}</em></i>`;
    return '<i class="hid">?</i>';
  }).join('');
  $('#d-rcards').innerHTML = CARD_VALUES.map(n => `<i class="${rv.cards.includes(n) ? '' : 'used'}">${n}</i>`).join('');
  $('#d-rspells').innerHTML = SPELLS.map(k => `<img src="${spellImg(k)}" title="${SPELL_INFO[k].name}" class="${(k === 'reverse' ? rv.reverse : rv.spells.includes(k)) ? '' : 'used'}" alt="">`).join('');
  $('#d-rivalinfo').classList.toggle('locked', !!rv.locked && !D.tutorial);
  const locked = mine.locked || V.status !== 'live';
  $('#s-duel').classList.toggle('locked', locked);
  if (locked && mine.play) D.sel = { card: mine.play.card, spell: mine.play.spell };
  if (!locked && D.sel.card != null && !mine.cards.includes(D.sel.card)) D.sel.card = null;
  const canSpell = k => k === 'reverse' ? mine.reverse : mine.spells.includes(k);
  if (D.sel.spell && !canSpell(D.sel.spell)) D.sel.spell = null;
  const T = D.tutorial?.want;
  $$('#d-hand .card').forEach(b => {
    const n = +b.dataset.card;
    b.classList.toggle('gone', !mine.cards.includes(n)); b.classList.toggle('on', D.sel.card === n);
    b.classList.toggle('lockout', !!D.tutorial && (!T || T.card !== n)); b.classList.toggle('pulse', !!T && T.card === n && D.sel.card !== n);
  });
  $$('#d-spells .sp').forEach(b => {
    const k = b.dataset.spell;
    b.classList.toggle('used', !canSpell(k)); b.classList.toggle('on', D.sel.spell === k);
    b.classList.toggle('lockout', !!D.tutorial && (!T || T.spell !== k)); b.classList.toggle('pulse', !!T && T.spell === k && D.sel.spell !== k);
  });
  const lock = $('#d-lock');
  lock.disabled = D.sel.card == null || (!!D.tutorial && (!T || D.sel.card !== T.card || (D.sel.spell || null) !== (T.spell || null)));
  lock.textContent = D.sel.card == null ? 'Pick a card' : `Play ${D.sel.card}${D.sel.spell ? ` + ${SPELL_INFO[D.sel.spell].name}` : ''}`;
  paintHint();
  paintTimer();
}
function paintHint(timeLow) {
  if (!D) return;
  const v = D.v.view, h = $('#d-hint');
  let text = '', cls = '';
  if (D.tutorial) text = '';
  else if (timeLow && !v.me.locked) { text = '⏰ Hurry! No pick in time = you lose this round.'; cls = 'warn'; }
  else if (D.sel.spell) text = `${SPELL_INFO[D.sel.spell].name}: ${SPELL_INFO[D.sel.spell].desc}`;
  else if (v.me.locked) text = '';
  else if (v.round === 1 && v.turn === 1) text = 'Play a secret card. Higher card wins the prize 👑 (prizes are 1 to 15, hidden until they come up)';
  else if (v.pot >= 11) text = `💰 Big prize: ${v.pot} points!${v.next === 'high' ? ' Another big one is coming next…' : ''}`;
  else if (v.pot > v.crown) text = `Last turn was a tie: this crown is worth ${v.pot}!`;
  else if (v.turn === 7) text = 'Last card of the round. Unused spells are lost!';
  else if (v.next === 'high') text = 'A HIGH prize (11-15) comes next. Save a big card?';
  h.textContent = text; h.className = `duel-hint px ${text ? 'on' : ''} ${cls}`;
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
  const low = shown < 6 && !D.v.view.me.locked && !D.busy;
  t.classList.toggle('low', low);
  if (low !== D.low) { D.low = low; paintHint(low); }
  if (low && Math.ceil(shown) !== D.lastTick) { D.lastTick = Math.ceil(shown); sfx('tick'); }
  if (left <= 0 && !D.busy && !D.expiredAt) { D.expiredAt = Date.now(); refresh(); }
  if (left > 0) D.expiredAt = 0;
  if (left <= 0 && D.expiredAt && Date.now() - D.expiredAt > 3000) D.expiredAt = 0;
}
$('#d-hand').onclick = e => {
  const b = e.target.closest('[data-card]'); if (!b || !D || D.busy || D.v.view.me.locked || b.classList.contains('lockout')) return;
  const n = +b.dataset.card;
  D.sel.card = D.sel.card === n ? null : n; sfx(D.sel.card ? 'select' : 'deselect'); paintDuel();
};
$('#d-spells').onclick = e => {
  const b = e.target.closest('[data-spell]'); if (!b || !D || D.v.view.me.locked) return;
  if (b.classList.contains('used') || b.classList.contains('lockout')) return sfx('denied');
  const k = b.dataset.spell;
  D.sel.spell = D.sel.spell === k ? null : k; sfx(D.sel.spell ? 'select' : 'deselect'); paintDuel();
};
async function lockIn() {
  if (!D || D.sel.card == null || D.busy || D.v.view.me.locked || $('#d-lock').disabled) return;
  const action = { id: D.id, card: D.sel.card, spell: D.sel.spell };
  $('#d-lock').disabled = true; sfx('energy');
  D.tutorial?.hide();
  try {
    const v = D.local ? await D.local.act(action) : await api('match/act', action);
    await handle(v);
  } catch (e) { toast(e.message, true); if (D) paintDuel(); }
}
$('#d-lock').onclick = lockIn;
addEventListener('keydown', e => { if (e.key === 'Escape' && WINDOWS.has(current) && !$('#modal.on')) closeWindow(); });
addEventListener('keydown', e => {
  if (current !== 'duel' || !D || e.repeat || e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '7') $(`#d-hand [data-card="${e.key}"]`)?.click();
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

// ---------- reveal: cards flip, spells resolve one by one, the crown flies to the winner ----------
function rvSet(side, value) {
  const b = $(`#rv${side} .rc-face b`);
  b.textContent = value; b.parentElement.style.setProperty('--c', CARD_COLOR[Math.min(7, value)] || '#ffe14a');
}
function rvMsg(text, cls = '') { const m = $('#rv-msg'); m.className = 'rv-msg px'; void m.offsetWidth; m.textContent = text; m.className = `rv-msg px on ${cls}`; }
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
  cols.forEach((c, i) => {
    c.className = 'rv-col';
    const rc = c.querySelector('.rcard'); rc.classList.remove('flip'); rc.style.animation = 'none'; void rc.offsetWidth; rc.style.animation = '';
    c.querySelector('.rv-spell').innerHTML = '';
    rvSet(i, cards[i]);
  });
  $('#rv-msg').className = 'rv-msg px';
  R.classList.add('on'); sfx('whoosh');
  D.F.forEach(f => f?.play('think'));
  await wait(520);
  cols.forEach(c => c.querySelector('.rcard').classList.add('flip')); sfx('flip');
  await wait(700);
  if (spells.some(Boolean)) {
    spells.forEach((k, i) => { if (k) { cols[i].querySelector('.rv-spell').innerHTML = `<div class="chip"><img src="${spellImg(k)}" alt="">${SPELL_INFO[k].name}</div>`; rise(D.F[i].pos.x, 0.2, '#c9a6ff', 24); } });
    sfx('magic'); await wait(750);
  }
  for (const st of ev.steps) {
    const s = st.i === undefined ? null : side(st.i), f = s === null ? null : D.F[s];
    if (st.k === 'cancel') {
      if (st.triple) { rvMsg('Double + Double: crown x3!', 'magic'); sfx('levelup'); stars(0, 1.6, 20); }
      else { cols.forEach(c => c.querySelector('.chip')?.classList.add('x')); rvMsg(`Both used ${SPELL_INFO[st.spell].name}: cancelled!`, 'magic'); sfx('debuff'); }
    } else if (st.k === 'boost') {
      rvSet(s, st.value); const b = $(`#rv${s} .rc-face b`); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
      rvMsg(`${s === 0 ? 'Your' : 'Rival'} Boost: +${RULES.boost}!`, 'magic'); sfx('buff'); rise(f.pos.x, 0, '#d4ff1f', 40, 1); f.play('hop');
    } else if (st.k === 'reverse') { rvMsg('REVERSE! The lower card wins!', 'magic'); sfx('reverse'); flash(0.35, '#7fd6ff'); camTo(0, 1.08, 0, 6); shake(8); }
    else if (st.k === 'trap') { rvMsg(`TRAP! ${s === 0 ? 'You steal' : 'Rival steals'} the crown from the 7!`, s === 0 ? 'good' : 'bad'); sfx('trap'); shake(16); flash(0.35, '#c9a6ff'); ring(D.F[1 - s].pos.x, 0.2, '#9b6bff', 40, 1.2); }
    else if (st.k === 'trapMiss') { rvMsg(`${s === 0 ? 'Your' : 'Rival'} Trap missed (no 7 won)`, ''); sfx('miss'); cols[s].querySelector('.chip')?.classList.add('x'); }
    else if (st.k === 'doubleTie') { rvMsg(`Tie, but ${s === 0 ? 'your' : 'rival'} Double wins it!`, 'magic'); sfx('buff'); }
    else if (st.k === 'double') { rvMsg(`DOUBLE! Crown x${st.mult}`, 'magic'); sfx('levelup'); stars(f.pos.x, 2.2, 14); }
    await wait(1000);
  }
  const w = ev.win === null ? null : side(ev.win);
  const scores = [ev.scores[seat], ev.scores[1 - seat]];
  if (w === null) { rvMsg('Tie! The crown carries to the next turn', ''); sfx('block'); }
  else {
    cols[w].classList.add('win'); cols[1 - w].classList.add('lose');
    rvMsg(`${w === 0 ? 'You take' : 'Rival takes'} ${ev.points} 👑`, w === 0 ? 'good' : 'bad');
    flyCrown(w); sfx(w === 0 ? 'coin' : 'hit');
  }
  // fighter animation runs on requestAnimationFrame (paused in hidden tabs): never let it block the game
  await Promise.race([clash(w, ev), new Promise(r => setTimeout(r, 2600))]);
  camTo(0, 1, 0, 4);
  paintPlates(D.v.view, scores);
  await wait(450);
  R.classList.remove('on'); $('#rv-msg').className = 'rv-msg px';
}
async function clash(w, ev) {
  const [A, B] = D.F;
  const meleeOf = f => f.rig.parts.item ? 'slash' : Math.random() < 0.5 ? 'punch' : 'kick';
  if (w === null) {
    let met = 0;
    const meet = () => { if (++met === 2) { burst(0, 1.1, ['#ffffff', '#d4ff1f'], 30, 1, true); sfx('block'); shake(8); } };
    const spot = f => ({ home: { x: -f.dir * 0.45 + f.dir * 1.25 * f.scale } });
    await Promise.all([A.perform(meleeOf(A), spot(A)), B.perform(meleeOf(B), spot(B))].map(p => p.then(meet)));
    return;
  }
  const [W, L] = w === 0 ? [A, B] : [B, A];
  const big = ev.points >= 7 || ev.mult > 1;
  const hit = () => {
    L.flash = 1; L.play(big ? 'hitBig' : 'hit');
    burst(L.chest.x, L.chest.y, L.colors, big ? 40 : 20, big ? 1.3 : 0.9);
    stars(L.chest.x, L.chest.y, big ? 14 : 6);
    popText(`+${ev.points} 👑`, W.head.x, W.head.y + 0.4, big ? 'gold' : 'status');
    sfx(big ? 'crit' : 'hit'); shake(big ? 16 : 7);
    camTo(L.home.x * 0.35, big ? 1.18 : 1.08, 0.2, 8);
    if (big) { slowmo(0.35, 0.3); flash(0.25); }
  };
  if (ev.steps.some(s => s.k === 'trap' || s.k === 'reverse')) {
    await W.perform('cast', null, async () => { await shoot(W.chest, L.chest, '#c37dff'); hit(); });
  } else await W.perform(meleeOf(W), L, hit);
}
async function roundEnd(ev, v, seat) {
  const ro = ev.roundOver, rw = ro.winner === null ? null : ro.winner === seat ? 0 : 1;
  const loser = rw === null ? null : D.F[1 - rw], winner = rw === null ? null : D.F[rw];
  if (loser && !ev.matchOver) { loser.ko = true; loser.play('ko'); sfx('ko'); shake(18); slowmo(0.6, 0.3); burst(loser.chest.x, loser.chest.y, loser.colors, 60, 1.4); ring(loser.pos.x, 0.1, '#ffd84a'); winner?.play('win'); }
  await wait(800);
  const pts = ro.reason === 'timeout' ? '' : `${ro.scores[seat]} vs ${ro.scores[1 - seat]} points · `;
  if (!ev.matchOver) {
    await banner(`<div class="bt ${rw === null ? 'white' : rw === 0 ? '' : 'red'}">${rw === null ? 'DRAW ROUND' : rw === 0 ? 'ROUND WON!' : 'ROUND LOST'}</div><small>${pts}rounds ${ro.rounds[seat]} – ${ro.rounds[1 - seat]}</small>`, 1700);
    if (D.tutorial) return;
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
  if (loseF) { loseF.ko = true; loseF.play('ko'); }
  winF?.play('win');
  if (winF) { camTo(winF.home.x * 0.6, 1.3, 0.4, 2); const fx = setInterval(() => { if (current !== 'duel' && current !== 'result') return clearInterval(fx); stars(winF.pos.x, winF.height, 6); }, 400); setTimeout(() => clearInterval(fx), 4000); }
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
    ...(v.ranked && v.pts != null ? [[`${v.pts > 0 ? '+' : v.pts < 0 ? '−' : ''}${Math.abs(v.pts)}`, `Points · stake x${v.view.me.minds.length}`, v.pts > 0 ? 'up' : v.pts < 0 ? 'down' : '']] : []),
    ...(v.dustWon ? [[`+${v.dustWon} ✨`, 'Sent to your island', 'up']] : []),
    [v.vsBot ? 'BOT' : esc(v.view.rival.name), v.vsBot ? `Rival · ${v.botLevel}` : 'Rival', ''],
    [v.ranked ? 'Ranked' : v.vsBot ? 'Practice' : 'Classic', 'Mode', ''],
  ].map(([b, s, c]) => `<div><b class="${c}">${esc(b)}</b><span>${s}</span></div>`).join('');
  const again = v.ranked ? 'ranked' : prep.mode === 'classic' && !D?.local ? 'classic' : 'practice';
  $('#r-again').onclick = () => openPrep(again);
  show('result');
  if (online && session.token) refreshMe().catch(() => {});
}
function leaveDuel() { if (D) { clearInterval(D.poll); clearInterval(D.clock); D.unwatch?.(); D.tutorial?.hide(); } D = null; enterHub(); }

// ---------- interactive tutorial: a scripted duel with a coach ----------
// crowns come in this order: 5 3 6 7 2 4 1; the coach's rival plays the cards below
const TUT = [
  { say: "Hi! I'm your coach. Each round, 7 prizes come up one by one. Their values (1 to 15) stay hidden until they show up. Win more prize points than your rival!", next: true },
  { say: 'Both players play a secret card from 1 to 7. The higher card takes the crown. This crown is worth 5: play your 5!', card: 5, rival: 3 },
  { say: 'Same card = tie: nobody wins and the crown carries over to the next turn. Play your 4 and see.', card: 4, rival: 4 },
  { say: 'This crown is now worth 9! Spells are revealed AFTER the cards. Boost adds +2 to your card. Play 3 + Boost.', card: 3, spell: 'boost', rival: 2 },
  { say: 'Your rival still has a 7 and this crown is a 7… Trap steals any crown won with a 7. Play your 1 + Trap!', card: 1, spell: 'trap', rival: 7 },
  { say: 'Reverse makes the LOWER card win (only once per match). Play your 2 + Reverse.', card: 2, spell: 'reverse', rival: 6 },
  { say: 'Double makes the crown worth x2 if you win. Play 7 + Double!', card: 7, spell: 'double', rival: 5 },
  { say: 'Every card is used once per round, so plan ahead. Last card: play your 6.', card: 6, rival: 1 },
];
function startTutorial() {
  const minds = picked().length ? picked() : [me?.pfp || 49];
  const state = createMatch({ seed: 7, players: [{ name: me?.name || 'You', minds: minds.slice(0, 1) }, { name: 'Coach Bot', minds: [1848] }] });
  state.crowns = [5, 3, 6, 7, 2, 4, 1]; state.pot = 5;
  let i = 0;
  const view = () => ({ id: 'tutorial', seat: 0, status: state.over ? 'done' : 'live', ranked: false, vsBot: true, botLevel: 'coach', local: true, deadline: null, winner: state.winner, view: viewFor(state, 0), delta: 0 });
  const match = {
    view,
    async act(a) {
      const t = TUT[i];
      const r = submit(state, 0, { card: a.card, spell: a.spell ?? null });
      if (r.error) throw new Error(r.error);
      submit(state, 1, { card: t.rival, spell: null });
      i++;
      return view();
    },
  };
  const coach = $('#coach');
  const say = (text, next) => { $('#coach-text').textContent = text; coach.classList.toggle('wait', !next); coach.classList.toggle('low', !next); coach.classList.add('on'); sfx('notify'); };
  const tut = {
    want: null,
    start() { $('#coach-pfp').src = thumb(1848); tut.step(); },
    step() {
      if (!D || D.tutorial !== tut) return;
      const t = TUT[i];
      if (!t) return done();
      if (t.next) { tut.want = null; say(t.say, true); paintDuel(); return; }
      tut.want = { card: t.card, spell: t.spell || null };
      say(t.say, false);
      paintDuel();
    },
    hide() { coach.classList.remove('on'); },
  };
  $('#coach-next').onclick = () => { i++; tut.step(); };
  async function done() {
    tut.hide(); tut.want = null;
    settings.tutorialDone = true; saveSettings();
    D.F[0]?.play('win'); stars(D.F[0].pos.x, 2.4, 20); sfx('victory');
    const r = await modal(`<h3>You're ready! 🎉</h3><p>You know every rule now: cards, ties, Boost, Trap, Reverse and Double. A real match is best of 3 rounds, with a ${TURN_SECONDS}s timer per turn.</p>`, [['Practice vs bot', 1, 'primary'], ['Lobby', 0]]);
    leaveDuel();
    if (r) openPrep('practice');
  }
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

initMindTalk({ minds: () => (guest ? [] : myMinds), esc });
initTown({ minds: () => (guest ? [] : myMinds), api, esc, toast, online: () => online });

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
  const fr = friendsList.find(f => f.player.id === id);
  if (fr && row.dataset.st === 'accepted') openChat(fr);
};
async function openChat(f) {
  chatWith = f; $('#fr-title').textContent = f.player.name;
  $('#fr-list-view').classList.add('off'); $('#fr-chat-view').classList.add('on');
  $('#fr-phrases').innerHTML = FRIEND_CHAT.map(i => `<button data-p="${i}">${esc(PHRASES[i])}</button>`).join('');
  await loadChat();
}
async function loadChat() {
  if (!chatWith) return;
  const pid = chatWith.player.id;
  try {
    const r = await api(`messages?with=${pid}`);
    if (chatWith?.player.id !== pid) return;   // closed or switched while loading
    $('#fr-msgs').innerHTML = r.messages.length ? r.messages.map(m => `<div class="msg ${m.mine ? 'mine' : ''}">${esc(m.text || PHRASES[m.phrase] || '')}<time>${new Date(m.at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</time></div>`).join('') : '<div class="board-empty">Say hi! 👋</div>';
    $('#fr-msgs').scrollTop = 1e9;
    settings.seen[pid] = Date.now(); saveSettings();
    renderFriends();
  } catch (e) { toast(e.message, true); }
}
$('#fr-back').onclick = () => { chatWith = null; openFriends(); };
async function sendChat() {
  const box = $('#fr-text'), text = box.value.trim();
  if (!text || !chatWith) return;
  box.value = '';
  try { await api('messages', { to: chatWith.player.id, text }); sfx('pop'); loadChat(); } catch (err) { box.value = text; toast(err.message, true); }
}
$('#fr-send').onclick = sendChat;
$('#fr-text').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
$('#fr-unfriend').onclick = async () => {
  const f = chatWith; if (!f) return;
  if (!(await modal(`<h3>Unfriend ${esc(f.player.name)}?</h3><p>You will stop seeing each other's chat.</p>`, [['Unfriend', 1, 'primary'], ['Cancel', 0]]))) return;
  try { await api('friend', { op: 'remove', id: f.player.id }); chatWith = null; toast(`${f.player.name} removed.`); openFriends(); } catch (e) { toast(e.message, true); }
};
$('#fr-report').onclick = () => { if (chatWith) reportBox('player', chatWith.player); };
// report a bug, or a player; the owner reads these in Admin → Reports
async function reportBox(kind, who) {
  if (!online || !session.token) return toast('Sign in to send a report.', true);
  const go = await modal(`<h3>${who ? `Report ${esc(who.name)}` : 'Report a problem'}</h3><p class="muted">Tell us what happened.</p><textarea id="rep-text" class="rep-text" maxlength="1000" rows="5"></textarea>`, [['Send', 1, 'primary'], ['Cancel', 0]]);
  const text = go && document.getElementById('rep-text')?.value;
  if (!go) return;
  try { await api('report', { kind, text, target: who?.id, place: current }); toast('Thanks! We got your report.'); } catch (e) { toast(e.message, true); }
}
$('#set-report').onclick = () => reportBox('bug');
// ---------- mail: announcements, updates, gifts ----------
let mailBox = [];
const mailSeen = () => settings.mailSeen || 0;
function paintMail() {
  const fresh = mailBox.filter(m => Date.parse(m.at) > mailSeen() || (m.gift && !m.taken)).length, b = $('#mail-badge');
  b.textContent = fresh; b.classList.toggle('on', fresh > 0);
  $('#mail-list').innerHTML = mailBox.length ? mailBox.map(m => `<article class="letter"><h4>${esc(m.title)}</h4><time>${new Date(m.at).toLocaleDateString()}</time><p>${esc(m.body)}</p>${m.gift ? `<button class="btn small ${m.taken ? '' : 'primary'}" data-mail="${m.id}" ${m.taken ? 'disabled' : ''}>${m.taken ? 'Taken' : `Take ${m.gift.dust ? m.gift.dust + ' ✨ ' : ''}${m.gift.gems ? m.gift.gems + ' 💎' : ''}`}</button>` : ''}</article>`).join('') : '<div class="board-empty">No mail yet.</div>';
}
async function loadMail() {
  if (!online || !session.token) return;
  try { mailBox = (await api('mail')).mail; paintMail(); } catch { /* mail is set up by supabase/007_community.sql */ }
}
$('#hub-mail').onclick = async () => { $('#maild').classList.add('on'); await loadMail(); settings.mailSeen = Date.now(); saveSettings(); };
$('#mail-close').onclick = () => { $('#maild').classList.remove('on'); paintMail(); };
$('#mail-list').onclick = async e => {
  const b = e.target.closest('[data-mail]'); if (!b) return;
  try { await api('mail', { op: 'claim', id: +b.dataset.mail }); sfx('coins'); resetIsland(); toast('Gift added to your island!'); loadMail(); } catch (err) { toast(err.message, true); }
};
$('#fr-phrases').onclick = async e => {
  const p = e.target.closest('[data-p]'); if (!p || !chatWith) return;
  try { await api('messages', { to: chatWith.player.id, phrase: +p.dataset.p }); sfx('pop'); loadChat(); } catch (err) { toast(err.message, true); }
};
async function friendsPoll() {
  if (!online || guest || !me) { renderFriends(); return; }
  loadFriends(); loadMail();
  if (!frUnwatch) frUnwatch = await watch(`player:${me.id}`, () => { loadFriends(); if (chatWith) loadChat(); sfx('notify'); });
  clearInterval(frTimer); frTimer = setInterval(() => { if (current === 'hub') { loadFriends(); if (chatWith) loadChat(); } }, 25000);
}

// ---------- rules ----------
function renderCodex() {
  $('#codex').innerHTML = `
  <h3>🏝️ Why your island matters</h3>
  <p>Ranked uses ⚡ energy. Your island's <b>Energy Well</b> makes shards: <b>3 shards = +1 energy</b>. Ranked wins send <b>Dust</b> back to your island. Dust grows your farm, trains troops for <b>raids</b> and buys airships for <b>adventures</b>. The island never changes who wins a duel: it gives you more games, not more power.</p>
  <h3><img src="assets/crown.png" alt="">The goal</h3>
  <p>Get more crown points than your rival. Each round has <b>7 prizes</b> drawn at random from <b>1 to 15</b> points, so some values never come up. You only see the prize up for grabs now, plus a hint for the next one (<b>LOW</b> 1-5, <b>MID</b> 6-10, <b>HIGH</b> 11-15). Win <b>2 rounds</b> to win the match.</p>
  <h3><img src="assets/icon_swords.png" alt="">A turn</h3>
  <ol><li>You see the prize up for grabs and a hint for the next one.</li>
  <li>Both players secretly play <b>one card</b> from 1 to 7, plus <b>one spell</b> if you want.</li>
  <li>Cards are shown first. <b>The higher card takes the crown.</b></li>
  <li>Then the spells are revealed and can change the result!</li>
  <li><b>Tie?</b> Nobody gets it and the crown carries over: the next crown is worth both.</li></ol>
  <div class="example">Crown <b>6</b> is up. You play <b>5</b>, your rival plays <b>3</b> → you get 6 points. Each card can be used <b>once per round</b>.</div>
  <h3><img src="assets/spell_boost.png" alt="">Spells</h3>
  <p>Spells are revealed <b>after</b> the cards, in this order: Boost → Reverse → Trap → Double. The <b>same spell</b> on both sides cancels out (except Double + Double = crown x3).</p>
  ${SPELLS.map(k => `<div class="spellrow"><img src="${spellImg(k)}" alt=""><div><b>${SPELL_INFO[k].name}</b><em>${SPELL_INFO[k].limit.toUpperCase()}</em><br>${SPELL_INFO[k].desc}</div></div>`).join('')}
  <div class="example">Your rival plays a <b>7</b> for a big crown. You play your <b>1</b> with <b>Trap</b>. It looks like they win… then your Trap is revealed and you steal it!</div>
  <h3><img src="assets/icon_bolt.png" alt="">Rounds and the timer</h3>
  <ul><li>Every round you get all 7 cards and your Boost, Double and Trap back. <b>Reverse</b> is <b>once per match</b>.</li>
  <li>Most points wins the round. Same points? More crowns won, then the biggest crown, decides.</li>
  <li>Bring <b>1 to 3 Minds</b>: they take turns, one per round. Every Mind plays the same.</li>
  <li>Each turn has a <b>${TURN_SECONDS} second</b> timer. <b>No pick in time = you lose that round.</b></li>
  <li>You can always see which cards and spells your rival has left.</li></ul>
  <h3>⚡ Mind Energy</h3>
  <ul><li>Every Mind has daily energy for <b>ranked</b>: ${Object.entries(ENERGY_CAP).map(([r, n]) => `${r} ${n}`).join(', ')}. It refills every day at 00:00 UTC.</li>
  <li><b>Stake:</b> every Mind you bring is staked. A ranked match uses <b>1 ⚡ from each</b>. A win pays <b>10 points per Mind</b> (+ rarity bonus), a loss costs <b>5 points per Mind</b>.</li>
  <li>More Minds = more ranked games every day. Energy belongs to the Mind, so it follows the NFT if it changes wallet.</li>
  <li><b>Classic, Practice and the Tutorial are free</b> and unlimited.</li></ul>
  <h3><img src="assets/icon_trophy.png" alt="">Ranking and fairness</h3>
  <ul><li>Ranked wins and losses change your <b>rating</b>.</li>
  <li><b>Points</b>: +10 per Mind staked on a ranked win, −5 per Mind on a loss, + rarity bonus on wins (Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%). Rarity never changes how a Mind plays.</li>
  <li>Every turn runs on the game server and your rival's card is never sent to your device, so nobody can cheat.</li></ul>
  <p class="muted">Tip: press 1–7 to pick a card and Enter to lock in.</p>`;
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
  music('lofi');
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
