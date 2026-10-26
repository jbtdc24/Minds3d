// Mind Arena 3D: app flow, screens, save data and the battle presenter.
import * as THREE from 'three';
import { loadData, tokenIds, traitsOf, rarityOf } from './nft.js';
import { camTo, camSnap, shake, slowmo, flash, burst, rise, ring, popText, toScreen, onFrame, setQuality, setSpeed, speedSetting, controls } from './render.js';
import { buildEnv, envUpdate, THEMES } from './env.js';
import { Fighter, shoot } from './fighter.js';
import { Battle, aiChoose, MAX_ENERGY } from './game/battle.js';
import { makeUnit, CLASSES, RARITY_COLOR, xpForLevel, MAX_LEVEL, classOf } from './game/data.js';
import { initAudio, sfx, music, setVolume } from './audio.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms / speedSetting));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const thumb = id => `data/thumbs/${id}.webp`;
// in-game yes/no box (native confirm() is blocked in some embeds)
function ask(text) {
  return new Promise(res => {
    const box = el('div', 'askbox', `<div class="glass"><p>${text}</p><div><button data-a="0">NO</button> <button class="go" data-a="1">YES</button></div></div>`);
    box.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) { box.remove(); res(a === '1'); } };
    document.body.append(box);
  });
}
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

// ---------- save data ----------
const SAVE_KEY = 'mindarena3d.v1';
const save = { team: null, levels: {}, stars: {}, settings: { music: 0.5, sfx: 0.8, speed: 1, quality: 'high', view: '3d' } };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); Object.assign(save, s, { settings: { ...save.settings, ...s.settings } }); } catch { /* fresh save */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked */ } };
const lvl = id => save.levels[id]?.lvl || 1;

// ---------- stage (3D fighters on the island) ----------
let onStage = [];
function clearStage() { onStage.forEach(f => f.dispose()); onStage = []; }
const SLOTS = [[-1.9, 0.8], [-3.55, -0.75], [-5.2, 0.6]];
const slotPos = (team, slot) => new THREE.Vector3(SLOTS[slot][0] * (team ? -1 : 1), 0, SLOTS[slot][1]);
let showcaseOrbit = false;
function showcase(ids, theme = 'meadow') {
  clearStage();
  buildEnv(theme);
  const n = ids.length, gap = n > 3 ? 2.0 : 1.9;
  ids.forEach((id, i) => {
    const f = new Fighter(makeUnit(id, traitsOf(id), rarityOf(id)), new THREE.Vector3((i - (n - 1) / 2) * gap, 0, i % 2 ? -0.5 : 0.2), 0, save.settings.view);
    f.face = 0;
    f.dropIn(i * 0.15);
    onStage.push(f);
  });
  showcaseOrbit = true;
}
onFrame((dt, t) => {
  envUpdate(dt, t);
  if (showcaseOrbit && !controls.enabled) {
    const a = Math.sin(t * 0.15) * 0.5, r = Math.max(8, fitDist(current === 'menu' && innerWidth > 760 ? 4.6 : 3.4));
    camTo(new THREE.Vector3(Math.sin(a) * r + (current === 'menu' && innerWidth > 760 ? -2.2 : 0), 2.6, Math.cos(a) * r), new THREE.Vector3(current === 'menu' && innerWidth > 760 ? -1.2 : 0, 1.0, 0), 0.03);
  }
});

// ---------- screens ----------
let current = 'title', previous = 'menu';
function show(id) {
  if (id !== 'settings' && id !== 'howto') previous = current;
  current = id;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + id));
  if (['menu', 'team', 'adventure'].includes(id)) music('menu');
}
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) sfx('click');
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go === 'back') { show(previous === 'settings' || previous === 'howto' ? 'menu' : previous); return; }
  if (go === 'quick') { quickBattle(); return; }
  if (go === 'team') { openTeam(); return; }
  if (go === 'adventure') { openAdventure(); return; }
  if (go === 'menu') { openMenu(); return; }
  show(go);
});

function teamIds() {
  if (!save.team || save.team.length !== 3) { save.team = randomTeam(); persist(); }
  return save.team;
}
function randomTeam() {
  const ids = tokenIds().filter(i => rarityOf(i) !== 'Legendary');
  const out = new Set();
  while (out.size < 3) out.add(ids[(Math.random() * ids.length) | 0]);
  return [...out];
}
function chipHTML(id) {
  const u = makeUnit(id, traitsOf(id), rarityOf(id), lvl(id));
  return `<img src="${thumb(id)}"><div><b>#${id}</b> <span style="color:${RARITY_COLOR[u.rarity]}">${u.rarity}</span><br>${CLASSES[u.cls].icon} ${u.cls} · Lv ${u.level}</div>`;
}
function openMenu() {
  const ids = teamIds();
  $('#menuteam').innerHTML = ids.map(id => `<div class="chip">${chipHTML(id)}</div>`).join('');
  const done = Object.values(save.stars).filter(s => s > 0).length;
  $('#advprog').textContent = `${done}/12 stages`;
  showcase(ids, 'meadow');
  show('menu');
}

// ---------- team builder ----------
const tb = { draft: [], active: 0, page: 0, rar: null, cls: null, search: '' };
function openTeam() {
  tb.draft = [...teamIds()]; tb.active = 0; tb.page = 0;
  $('#t-rar').innerHTML = ['All', ...RARITIES].map(r => `<button data-r="${r}" class="${(tb.rar || 'All') === r ? 'on' : ''}">${r === 'All' ? 'ALL' : r.slice(0, 4).toUpperCase()}</button>`).join(' ');
  $('#t-cls').innerHTML = ['All', 'Blaze', 'Bloom', 'Tide', 'Mythic'].map(c => `<button data-c="${c}" class="${(tb.cls || 'All') === c ? 'on' : ''}">${c === 'All' ? 'ANY' : CLASSES[c].icon}</button>`).join(' ');
  renderTeam();
  show('team');
}
function renderTeam() {
  const pos = ['FRONT', 'MIDDLE', 'BACK'];
  $('#slots').innerHTML = tb.draft.map((id, i) => {
    const u = makeUnit(id, traitsOf(id), rarityOf(id), lvl(id));
    return `<div class="slot ${i === tb.active ? 'active' : ''}" data-slot="${i}"><img src="${thumb(id)}"><div class="info">
      <div class="pos">${pos[i]} ${i === tb.active ? '· tap a fighter to swap' : ''}</div>
      <div class="nm">MDG #${id} <span style="font-size:12px;color:${RARITY_COLOR[u.rarity]}">${u.rarity}</span></div>
      <div>${CLASSES[u.cls].icon} ${u.cls} · Lv ${u.level} · ❤ ${u.maxHp} · ⚔ ${Math.round(u.atk)} · ⚡ ${u.spd}</div>
      <div class="tagrow">${u.deck.map(c => `<span class="tag" title="${c.desc}">${c.cost}⚡ ${c.name}</span>`).join('')}${u.passive ? `<span class="tag">✦ ${u.passive}</span>` : ''}</div>
      <div style="margin-top:4px;display:flex;gap:4px"><button data-mv="${i},-1" style="padding:3px 8px;font-size:10px" ${i ? '' : 'disabled'}>▲</button><button data-mv="${i},1" style="padding:3px 8px;font-size:10px" ${i < 2 ? '' : 'disabled'}>▼</button></div>
    </div></div>`;
  }).join('');
  let ids = tokenIds();
  if (tb.rar) ids = ids.filter(i => rarityOf(i) === tb.rar);
  if (tb.cls) ids = ids.filter(i => classOf(traitsOf(i)) === tb.cls);
  if (tb.search) ids = ids.filter(i => String(i).startsWith(tb.search));
  const per = 60, pages = Math.max(1, Math.ceil(ids.length / per));
  tb.page = Math.min(tb.page, pages - 1);
  $('#t-grid').innerHTML = ids.slice(tb.page * per, tb.page * per + per).map(id =>
    `<div class="nft ${tb.draft.includes(id) ? 'picked' : ''}" data-id="${id}"><img loading="lazy" src="${thumb(id)}"><div class="lb"><span>#${id}</span><span>${CLASSES[classOf(traitsOf(id))].icon}<span class="rar" style="background:${RARITY_COLOR[rarityOf(id)]}"></span></span></div></div>`).join('');
  $('#t-page').textContent = `${tb.page + 1} / ${pages} · ${ids.length} MDGs`;
  showcaseTeam();
}
let teamShown = '';
function showcaseTeam() {
  const key = tb.draft.join(',');
  if (key === teamShown && onStage.length) return;
  teamShown = key;
  showcase(tb.draft, 'meadow');
}
$('#slots').addEventListener('click', e => {
  const mv = e.target.closest('[data-mv]')?.dataset.mv;
  if (mv) { const [i, d] = mv.split(',').map(Number); [tb.draft[i], tb.draft[i + d]] = [tb.draft[i + d], tb.draft[i]]; tb.active = i + d; renderTeam(); return; }
  const s = e.target.closest('[data-slot]');
  if (s) { tb.active = +s.dataset.slot; renderTeam(); }
});
$('#t-grid').addEventListener('click', e => {
  const n = e.target.closest('[data-id]');
  if (!n) return;
  const id = +n.dataset.id, at = tb.draft.indexOf(id);
  if (at >= 0) [tb.draft[at], tb.draft[tb.active]] = [tb.draft[tb.active], tb.draft[at]];
  else tb.draft[tb.active] = id;
  tb.active = (tb.active + 1) % 3;
  sfx('select');
  renderTeam();
});
$('.filters').addEventListener('click', e => {
  const r = e.target.closest('[data-r]')?.dataset.r, c = e.target.closest('[data-c]')?.dataset.c;
  if (r) { tb.rar = r === 'All' ? null : r; $$('[data-r]').forEach(b => b.classList.toggle('on', b.dataset.r === r)); }
  if (c) { tb.cls = c === 'All' ? null : c; $$('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === c)); }
  if (r || c) { tb.page = 0; renderTeam(); }
});
$('#t-search').addEventListener('input', e => { tb.search = e.target.value.trim(); tb.page = 0; renderTeam(); });
$('#t-prev').onclick = () => { tb.page = Math.max(0, tb.page - 1); renderTeam(); };
$('#t-next').onclick = () => { tb.page++; renderTeam(); };
$('#t-random').onclick = () => { tb.draft = randomTeam(); renderTeam(); };
$('#t-done').onclick = () => { save.team = [...tb.draft]; persist(); openMenu(); };

// ---------- adventure ----------
const WORLDS = [
  { theme: 'meadow', name: 'Sunny Isles', stages: [[['Common', 'Common', 'Common'], 1], [['Common', 'Uncommon', 'Common'], 1], [['Uncommon', 'Common', 'Uncommon'], 2], [['Epic', 'Uncommon', 'Uncommon'], 3]] },
  { theme: 'neon', name: 'Neon Night', stages: [[['Uncommon', 'Rare', 'Uncommon'], 3], [['Rare', 'Rare', 'Uncommon'], 4], [['Rare', 'Epic', 'Rare'], 5], [['Legendary', 'Rare', 'Epic'], 6]] },
  { theme: 'frost', name: 'Frost Peaks', stages: [[['Epic', 'Rare', 'Epic'], 6], [['Epic', 'Epic', 'Rare'], 7], [['Epic', 'Legendary', 'Epic'], 8], [['Legendary', 'Legendary', 'Epic'], 10]] },
];
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function stageInfo(n) {
  const w = WORLDS[Math.floor(n / 4)], [rars, level] = w.stages[n % 4], R = mulberry(4242 + n * 97);
  const all = tokenIds();
  const ids = rars.map(r => { const pool = all.filter(i => rarityOf(i) === r); return pool[(R() * pool.length) | 0]; });
  return { n, theme: w.theme, world: w.name, ids, levels: rars.map(() => level), boss: n % 4 === 3, smart: 0.55 + n / 11 * 0.45 };
}
function openAdventure() {
  $('#worlds').innerHTML = WORLDS.map((w, wi) => `<div class="world glass"><h3>${wi + 1}. ${w.name.toUpperCase()}</h3><div class="muted" style="font-size:11px">${['Easy rivals to learn the ropes.', 'Rare fighters and the first Legendary.', 'The strongest MDGs in the land.'][wi]}</div>
    <div class="stages">${w.stages.map((_, si) => {
      const n = wi * 4 + si, stars = save.stars[n] || 0, open = n === 0 || (save.stars[n - 1] || 0) > 0;
      return `<div class="stage ${si === 3 ? 'boss' : ''} ${open ? '' : 'locked'}" data-stage="${open ? n : ''}">${si === 3 ? '👑' : n + 1}<span class="st">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div>`;
    }).join('')}</div></div>`).join('');
  show('adventure');
}
$('#worlds').addEventListener('click', e => {
  const s = e.target.closest('[data-stage]')?.dataset.stage;
  if (s === undefined || s === '' || current !== 'adventure') return;
  const info = stageInfo(+s);
  startBattle({ ...info, mode: 'adventure' });
});
function quickBattle() {
  const mine = teamIds(), all = tokenIds();
  const ids = mine.map(id => { const pool = all.filter(i => rarityOf(i) === rarityOf(id)); return pool[(Math.random() * pool.length) | 0]; }).sort(() => Math.random() - 0.5);
  const avg = Math.round(mine.reduce((s, id) => s + lvl(id), 0) / 3);
  const themes = Object.keys(THEMES);
  startBattle({ mode: 'quick', ids, levels: ids.map(() => avg), theme: themes[(Math.random() * themes.length) | 0], smart: 0.9 });
}

// ---------- battle ----------
let F = {}, battle = null, quitFlag = false, bars = {};
const banner = (html, ms = 900) => { const b = $('#banner'); b.innerHTML = html; b.classList.add('on'); return wait(ms).then(() => b.classList.remove('on')); };
// distance that fits `half` world units left/right of centre on this screen
const fitDist = half => {
  const asp = innerWidth / Math.max(1, innerHeight), d = half / (Math.tan(THREE.MathUtils.degToRad(asp < 0.8 ? 50 : 36) / 2) * asp);
  return Number.isFinite(d) && d > 0 ? d : 12;          // hidden / zero-size window
};
const battleCam = () => { const d = Math.max(10, fitDist(6.9)); camTo(new THREE.Vector3(0, 2.2 + d * 0.13, d), new THREE.Vector3(0, 0.95, -0.2), 0.05); };

let inBattle = false;
async function startBattle(opts) {
  if (inBattle) return;
  inBattle = true;
  quitFlag = false;
  showcaseOrbit = false;
  clearStage();
  $('#bars').innerHTML = ''; bars = {};
  buildEnv(opts.theme);
  const teamA = teamIds().map(id => makeUnit(id, traitsOf(id), rarityOf(id), lvl(id)));
  const teamB = opts.ids.map((id, i) => makeUnit(id, traitsOf(id), rarityOf(id), opts.levels[i]));
  battle = new Battle(teamA, teamB);
  F = {};
  for (const u of battle.units) {
    const f = new Fighter(u, slotPos(u.team, u.slot), u.team, save.settings.view);
    f.dropIn(0.25 + u.slot * 0.18 + u.team * 0.08);
    F[u.uid] = f; onStage.push(f);
    const b = el('div', `fbar t${u.team}`, '<div class="st"></div><div class="hp"><i></i><b></b></div>');
    $('#bars').append(b); bars[u.uid] = b;
  }
  camSnap(new THREE.Vector3(0, 6, 18), new THREE.Vector3(0, 1, 0));
  battleCam();
  buildPanels();
  updateHUD(battle.snapshot());
  $('#b-hand').innerHTML = '';
  $('#b-speed').textContent = `${save.settings.speed}x`;
  show('battle');
  music('battle');
  await wait(1100);
  await banner(opts.mode === 'adventure' ? `${opts.boss ? 'BOSS' : 'STAGE'} ${opts.n + 1}<small>${opts.world.toUpperCase()}</small>` : `QUICK BATTLE<small>${THEMES[opts.theme].name.toUpperCase()}</small>`, 1200);
  sfx('fight');
  await banner('FIGHT!', 700);
  while (battle.winner() === null && !quitFlag) {
    battle.startRound();
    $('#b-round').textContent = `ROUND ${battle.round}`;
    sfx('round');
    updateHUD(battle.snapshot());
    const sel = await playerTurn();
    if (quitFlag) break;
    $('#b-hand').innerHTML = '';
    const events = battle.resolve({ ...sel, ...aiChoose(battle, 1, opts.smart) });
    for (const ev of events) { if (quitFlag) break; await present(ev); }
    if (battle.winner() === null && !quitFlag) await presentTick(battle.endRound());
  }
  inBattle = false;
  if (quitFlag) { cleanupBattle(); openMenu(); return; }
  await finish(opts);
}
function cleanupBattle() { $('#bars').innerHTML = ''; bars = {}; $$('.fbar').forEach(b => b.remove()); }

function buildPanels() {
  for (const t of [0, 1]) {
    $(`#p${t}`).innerHTML = battle.team(t).map(u => `<div class="unit" id="u-${u.uid}"><img src="${thumb(u.id)}"><div class="mid">
      <div class="nm"><span>#${u.id} <span style="color:${RARITY_COLOR[u.rarity]}">●</span></span><span>${CLASSES[u.cls].icon} Lv${u.level}</span></div>
      <div class="hp"><i></i><b></b></div><div class="sts" style="height:13px;margin-top:2px"></div></div></div>`).join('');
  }
}
const ICON = { stun: '💫', burn: '🔥', atkUp: '⚔▲', atkDown: '⚔▼', defUp: '🛡▲', speedUp: '⚡', dodge: '👻', taunt: '🎯', focus: '🎯' };
function statusIcons(st) { return Object.keys(st || {}).map(k => ICON[k] || '').join(' '); }
function updateHUD(snap) {
  for (const u of battle.units) {
    const s = snap.units[u.uid], k = Math.max(0, s.hp / u.maxHp), sh = Math.min(1, s.shield / u.maxHp);
    const row = $(`#u-${u.uid}`);
    if (row) {
      row.classList.toggle('dead', !s.alive);
      row.querySelector('i').style.transform = `scaleX(${k})`;
      row.querySelector('b').style.transform = `scaleX(${sh})`;
      row.querySelector('.sts').textContent = `${s.hp}/${u.maxHp}${s.shield ? ` +${s.shield}🛡` : ''} ${statusIcons(s.status)}`;
    }
    const b = bars[u.uid];
    if (b) {
      b.querySelector('i').style.transform = `scaleX(${k})`;
      b.querySelector('b').style.transform = `scaleX(${sh})`;
      b.querySelector('.st').textContent = statusIcons(s.status);
      b.style.opacity = s.alive ? 1 : 0;
    }
    F[u.uid]?.setStatus(s.status, s.shield);
  }
  setEnergy(snap.energy[0]);
}
onFrame(() => {
  for (const [uid, b] of Object.entries(bars)) {
    const f = F[uid];
    if (!f) continue;
    const p = toScreen(f.root.position.clone().add(new THREE.Vector3(0, 2.45 * f.root.scale.y, 0)));
    b.style.left = `${p.x}px`; b.style.top = `${p.y}px`;
  }
});
let shownEnergy = 0;
function setEnergy(v, preview = null) {
  shownEnergy = v;
  $('#b-energy').innerHTML = `${preview ?? v}<small>/ ${MAX_ENERGY} ⚡</small>`;
}

const MOVE_ICON = { punch: '👊', kick: '🦶', slash: '⚔️', smash: '💥', cast: '✨', skill: '🛡️' };
function playerTurn() {
  return new Promise(resolve => {
    const picks = [];
    const hand = $('#b-hand');
    hand.innerHTML = '';
    const cost = () => picks.reduce((s, p) => s + battle.unit(p.uid).hand[p.i].cost, 0);
    const refresh = () => {
      const left = battle.energy[0] - cost();
      setEnergy(battle.energy[0], left);
      $$('#b-hand .card').forEach(c => {
        const u = battle.unit(c.dataset.uid), card = u.hand[+c.dataset.i], idx = picks.findIndex(p => p.uid === u.uid && p.i === +c.dataset.i);
        c.classList.toggle('sel', idx >= 0);
        c.querySelector('.order').textContent = idx + 1;
        c.classList.toggle('na', idx < 0 && card.cost > left);
      });
    };
    for (const u of battle.alive(0)) {
      const col = el('div', `fcol ${u.status.stun ? 'stunned' : ''}`);
      col.append(el('div', 'who', `<img src="${thumb(u.id)}">#${u.id} ${CLASSES[u.cls].icon}`));
      const cards = el('div', 'cards');
      u.hand.forEach((c, i) => {
        const card = el('div', 'card', `<div class="cost">${c.cost}</div><div class="order"></div>
          <div class="ico" style="background:${c.color ? c.color + '33' : 'rgba(255,255,255,.06)'}">${MOVE_ICON[c.move] || '✨'}</div>
          <div class="cn">${c.name}</div><div class="cd">${c.desc}</div><div class="src">${c.from || (u.traits.Legendary ? 'Legendary' : 'Basic')}</div>`);
        card.dataset.uid = u.uid; card.dataset.i = i;
        card.onmouseenter = () => { F[u.uid].setSelected(true); sfx('hover'); };
        card.onmouseleave = () => { if (!picks.some(p => p.uid === u.uid)) F[u.uid].setSelected(false); };
        card.onclick = () => {
          const at = picks.findIndex(p => p.uid === u.uid && p.i === i);
          if (at >= 0) { picks.splice(at, 1); sfx('deselect'); }
          else if (c.cost <= battle.energy[0] - cost()) { picks.push({ uid: u.uid, i }); sfx('select'); }
          else { sfx('denied'); $('#b-energy').classList.remove('low'); void $('#b-energy').offsetWidth; $('#b-energy').classList.add('low'); return; }
          F[u.uid].setSelected(picks.some(p => p.uid === u.uid));
          refresh();
        };
        cards.append(card);
      });
      col.append(cards);
      hand.append(col);
    }
    refresh();
    $('#b-end').disabled = false;
    $('#b-end').onclick = () => {
      $('#b-end').disabled = true;
      Object.values(F).forEach(f => f.setSelected(false));
      const sel = {};
      for (const p of picks) (sel[p.uid] ||= []).push(p.i);
      resolve(sel);
    };
    quitResolve = () => resolve({});
  });
}
let quitResolve = null;
$('#b-quit').onclick = async () => { if (await ask('Quit this battle?')) { quitFlag = true; quitResolve?.(); } };
// 2D / 3D switch: rebuilds every fighter on stage in place
function setView(v) {
  save.settings.view = v; persist();
  onStage.forEach(f => f.rebuild(v));
  $('#b-view').textContent = v === '2d' ? '2D' : '3D';
  $$('#set-view button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
$('#b-view').onclick = () => setView(save.settings.view === '2d' ? '3d' : '2d');
$('#m-view').onclick = () => { setView(save.settings.view === '2d' ? '3d' : '2d'); $('#m-view-v').textContent = save.settings.view.toUpperCase(); };
$('#set-view').onclick = e => { const v = e.target.dataset.v; if (v) setView(v); };
$('#b-speed').onclick = () => {
  const order = [1, 1.5, 2], s = order[(order.indexOf(save.settings.speed) + 1) % 3];
  save.settings.speed = s; setSpeed(s); persist();
  $('#b-speed').textContent = `${s}x`;
};

const log = t => { $('#b-log').textContent = t; };
const FX_LABEL = { stun: ['💫 STUN', 'stun'], burn: ['🔥 BURN', 'debuff'], atkDown: ['ATK ▼', 'debuff'], atkUp: ['ATK ▲', 'buff'], defUp: ['DEF ▲', 'buff'], speedUp: ['SPD ▲', 'buff'], dodge: ['👻 DODGE', 'buff'], taunt: ['🎯 TAUNT', 'buff'], focus: ['🎯 FOCUS', 'buff'] };
const up = (v, y) => v.clone().add(new THREE.Vector3(0, y, 0));

async function applyResult(r, card, att) {
  const tf = F[r.uid];
  if (!tf) return;
  if (r.miss) { tf.play('dodge'); popText('MISS', up(tf.root.position, 2.2), 'miss'); sfx('miss'); return; }
  if (r.dmg != null) {
    tf.flash = 1;
    tf.play(r.crit ? 'hitBig' : 'hit');
    burst(tf.chest, tf.colors, r.crit ? 44 : 20, r.crit ? 1.3 : 0.9);
    if (card.color) burst(tf.chest, [card.color], 14, 0.8, true);
    popText(r.crit ? `CRIT ${r.dmg}` : `${r.dmg}`, up(tf.root.position, 2.1), r.crit ? 'crit' : '');
    if (r.adv > 1) popText('ADVANTAGE', up(tf.root.position, 2.7), 'adv');
    if (r.adv < 1) popText('RESIST', up(tf.root.position, 2.7), 'weak');
    if (r.blocked) { popText(`🛡 -${r.blocked}`, up(tf.root.position, 1.6), 'shield'); sfx('block'); }
    sfx(r.crit ? 'crit' : 'hit');
    shake(r.crit ? 0.3 : 0.12);
    if (r.crit) { slowmo(0.35, 0.3); flash(0.3); }
  }
  if (r.heal) { rise(tf.root.position, '#7dff9a'); popText(`+${r.heal}`, up(tf.root.position, 2.2), 'heal'); sfx('heal'); }
  if (r.shield) { ring(tf.root.position, '#7fdcff'); popText(`+${r.shield} 🛡`, up(tf.root.position, 2.5), 'shield'); sfx('shield'); }
  (r.fx || []).forEach((k, i) => {
    const [label, s] = FX_LABEL[k] || [k, 'buff'];
    setTimeout(() => { popText(label, up(tf.root.position, 2.9 + i * 0.3), 'status'); sfx(s); }, 120 + i * 140);
  });
  if (r.ko) {
    await wait(220);
    tf.ko = true; tf.play('ko');
    sfx('ko'); shake(0.4); slowmo(0.5, 0.25);
    burst(tf.chest, tf.colors, 70, 1.6);
    popText('K.O.', up(tf.root.position, 2.4), 'crit');
  }
}
async function present(ev) {
  const af = F[ev.uid], att = battle.unit(ev.uid);
  if (ev.type === 'stunned') {
    log(`#${att.id} is stunned!`);
    popText('💫 STUNNED', up(af.root.position, 2.6), 'status'); sfx('stun');
    await af.play('stunned');
    updateHUD(ev);
    return;
  }
  const card = ev.card, results = ev.results;
  const enemyFirst = results.find(r => F[r.uid]?.team !== af.team);
  log(`#${att.id} ${ev.combo ? 'COMBO → ' : 'uses '}${card.name}`);
  popText(card.name.toUpperCase(), up(af.root.position, 3.0), 'status');
  // camera leans toward the action
  const focus = enemyFirst ? af.home.clone().lerp(F[enemyFirst.uid].home, 0.5) : af.home.clone();
  const d = Math.max(9, fitDist(5.6));
  camTo(new THREE.Vector3(focus.x * 0.5, 2.0 + d * 0.12, d), new THREE.Vector3(focus.x * 0.7, 1.0, focus.z * 0.3), 0.06);
  const prevEnergy = shownEnergy;
  let move = card.move;
  if (['punch', 'kick', 'slash', 'smash'].includes(move) && !enemyFirst) move = 'skill';
  const apply = async () => { await Promise.all(results.map(r => applyResult(r, card, af))); updateHUD(ev); };
  if (['punch', 'kick', 'slash', 'smash'].includes(move)) {
    await af.perform(move, F[enemyFirst.uid], apply);
  } else if (move === 'cast') {
    await af.perform('cast', null, async () => {
      const from = af.root.position.clone().add(new THREE.Vector3(af.dir * 0.55, 1.0, 0.3));
      if (card.target === 'random') {
        for (const r of results) { await shoot(from, F[r.uid].chest, card.color || '#ffffff', 0.25); await applyResult(r, card, af); }
        updateHUD(ev);
      } else {
        await Promise.all(results.map(r => r.uid === ev.uid ? null : shoot(from, F[r.uid].chest, card.color || '#ffffff')));
        await apply();
      }
    });
  } else {
    await af.perform('skill', null, async () => { rise(af.root.position, card.color || '#d4ff1f', 30, 0.9); sfx('buff'); await apply(); });
  }
  if (ev.energy[0] !== prevEnergy) {
    const d = ev.energy[0] - prevEnergy;
    if (d > 0) { popText(`+${d} ⚡`, up(af.root.position, 3.3), 'heal'); sfx('energy'); }
  }
  updateHUD(ev);
  await wait(140);
  battleCam();
}
async function presentTick(tick) {
  if (tick.suddenDeath && battle.round === 10) await banner('SUDDEN DEATH<small>EVERYONE TAKES DAMAGE</small>', 1100);
  for (const r of tick.results) {
    const tf = F[r.uid];
    tf.flash = 0.6; tf.play('hit');
    popText(`${r.burn ? '🔥 ' : '☠ '}${r.dmg}`, up(tf.root.position, 2.1), r.burn ? 'status' : '');
    sfx(r.burn ? 'burn' : 'hit');
    if (r.ko) { tf.ko = true; tf.play('ko'); sfx('ko'); burst(tf.chest, tf.colors, 60, 1.4); }
  }
  updateHUD(tick);
  if (tick.results.length) await wait(650);
}

async function finish(opts) {
  const win = battle.winner() === 0;
  for (const f of Object.values(F)) if (!f.ko && f.team === (win ? 0 : 1)) f.play('win');
  const champ = Object.values(F).find(f => !f.ko && f.team === (win ? 0 : 1));
  if (champ) camTo(champ.home.clone().add(new THREE.Vector3(champ.dir * 2.5, 2.6, 8.5)), up(champ.home, 1.1), 0.04);
  sfx(win ? 'victory' : 'defeat');
  music(null);
  await banner(win ? 'VICTORY!' : 'DEFEAT', 1600);
  // stars + xp
  let stars = 0;
  if (win) stars = 1 + (battle.alive(0).length === 3 ? 1 : 0) + (battle.round <= 6 ? 1 : 0);
  if (opts.mode === 'adventure' && stars > (save.stars[opts.n] || 0)) save.stars[opts.n] = stars;
  const gain = win ? (opts.mode === 'adventure' ? 50 + opts.n * 12 : 60) : 18;
  const rows = [];
  for (const id of teamIds()) {
    const s = save.levels[id] ||= { lvl: 1, xp: 0 };
    const before = s.lvl;
    s.xp += gain;
    while (s.lvl < MAX_LEVEL && s.xp >= xpForLevel(s.lvl)) { s.xp -= xpForLevel(s.lvl); s.lvl++; }
    if (s.lvl === MAX_LEVEL) s.xp = 0;
    rows.push({ id, s, up: s.lvl > before });
  }
  persist();
  $('#r-title').textContent = win ? 'VICTORY' : 'DEFEAT';
  $('#r-title').style.color = win ? 'var(--lime)' : 'var(--red)';
  $('#r-stars').innerHTML = opts.mode === 'adventure' ? [0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('') : '';
  $('#r-xp').innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px">+${gain} XP each · ${battle.round} rounds${opts.mode === 'adventure' ? ' · ★ win · ★ no K.O. · ★ ≤6 rounds' : ''}</div>` + rows.map(r =>
    `<div class="xprow"><img src="${thumb(r.id)}"><div style="flex:1"><b>MDG #${r.id}</b> · Lv ${r.s.lvl} ${r.up ? '<span class="lvup">LEVEL UP!</span>' : ''}<div class="xpbar"><i style="width:0"></i></div></div></div>`).join('');
  const btns = $('#r-btns');
  btns.innerHTML = '';
  const add = (label, fn, go) => { const b = el('button', go ? 'go' : '', label); b.onclick = fn; btns.append(b); };
  const leave = () => { cleanupBattle(); };
  if (opts.mode === 'adventure' && win && opts.n < 11) add('NEXT STAGE ▶', () => { leave(); startBattle({ ...stageInfo(opts.n + 1), mode: 'adventure' }); }, true);
  add(win ? 'PLAY AGAIN' : 'RETRY', () => { leave(); opts.mode === 'adventure' ? startBattle({ ...stageInfo(opts.n), mode: 'adventure' }) : quickBattle(); }, !win || opts.mode !== 'adventure' || opts.n >= 11);
  if (opts.mode === 'adventure') add('STAGES', () => { leave(); openAdventure(); showcase(teamIds(), opts.theme); });
  add('MENU', () => { leave(); openMenu(); });
  show('result');
  stars && [...Array(stars)].forEach((_, i) => sfx('star', 0.3 + i * 0.25));
  if (rows.some(r => r.up)) sfx('levelup', 1.2);
  requestAnimationFrame(() => $$('#r-xp .xpbar i').forEach((b, i) => { const s = rows[i].s; b.style.width = `${s.lvl >= MAX_LEVEL ? 100 : s.xp / xpForLevel(s.lvl) * 100}%`; }));
}

// ---------- settings ----------
function applySettings() {
  const s = save.settings;
  setVolume(s.music, s.sfx);
  setSpeed(s.speed);
  setQuality(s.quality);
  $('#set-music').value = s.music; $('#set-sfx').value = s.sfx;
  $$('#set-speed button').forEach(b => b.classList.toggle('on', +b.dataset.v === s.speed));
  $$('#set-quality button').forEach(b => b.classList.toggle('on', b.dataset.v === s.quality));
  $$('#set-view button').forEach(b => b.classList.toggle('on', b.dataset.v === s.view));
  $('#b-view').textContent = s.view === '2d' ? '2D' : '3D';
  $('#m-view-v').textContent = s.view.toUpperCase();
}
$('#set-music').oninput = e => { save.settings.music = +e.target.value; applySettings(); persist(); };
$('#set-sfx').oninput = e => { save.settings.sfx = +e.target.value; applySettings(); persist(); sfx('select'); };
$('#set-speed').onclick = e => { const v = e.target.dataset.v; if (v) { save.settings.speed = +v; applySettings(); persist(); } };
$('#set-quality').onclick = e => { const v = e.target.dataset.v; if (v) { save.settings.quality = v; applySettings(); persist(); } };
$('#set-reset').onclick = async () => { if (await ask('Reset all levels and stars?')) { save.levels = {}; save.stars = {}; persist(); } };

// ---------- boot ----------
await loadData();
applySettings();
camSnap(new THREE.Vector3(0, 4, 16), new THREE.Vector3(0, 1, 0));
const q = new URLSearchParams(location.search);
$('#loading').remove();
if (q.get('gallery')) {                       // trait check: ?gallery=1,2,3
  showcase(q.get('gallery').split(',').map(Number).filter(Boolean), q.get('theme') || 'meadow');
  camSnap(new THREE.Vector3(0, 3, 10), new THREE.Vector3(0, 1, 0));
  controls.target.set(0, 1, 0);
  controls.enabled = true;
} else {
  const legends = tokenIds().filter(i => rarityOf(i) === 'Legendary').sort(() => Math.random() - 0.5).slice(0, 3);
  showcase(legends, 'meadow');
  show('title');
  const start = () => {
    initAudio(); applySettings(); music('menu'); sfx('fight');
    openMenu();
  };
  $('#s-title').addEventListener('click', start, { once: true });
}
