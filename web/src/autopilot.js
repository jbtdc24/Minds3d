// 🧠 AI Minds dock: floats on every screen (drag it by its title bar, make it big, or fold it into a bubble).
// Each Mind NFT the player holds gets its own AI: a fresh Mind on the player's own Hello Minds account, made for that
// Mind only (hellominds.js). The AI really plays: before every step it is asked what to do next, and in a duel it picks
// every card and spell itself, using the player's own cognition. Its training (island/training.js) goes into every
// question, and is the move when the AI is too slow to answer in time (the log says so).
// Plans open a preview first. 👁 Follow shows the Mind playing live (its duel board and its thoughts); 📜 History has it all.
// It plays through /api/autopilot, so every rule a human has applies, while the lobby is open (it waits while you play).
// Gems: OFF by default; turning them on takes a warning, a daily amount the player types, and typing CONFIRM.
import { PRESETS, STEPS, parsePlan, planText, cleanPlan } from './island/autoplay.js';
import { TRAINING, cleanTraining } from './island/training.js';
import * as HM from './hellominds.js';

let K = null, ap = null, sel = null, busy = false, looping = false, wake = null, follow = null;
const $ = s => document.querySelector(s);
const RUN_KEY = 'mc_ai_run', MIN_KEY = 'mc_ai_min', SEEN_KEY = 'mc_ai_seen', POS_KEY = 'mc_ai_pos', BIG_KEY = 'mc_ai_big';
// per Mind slot: step index, what it does now, where it is, Mind Town / rest clocks, chat, last thought, duel board
const live = {};
const L = slot => (live[slot] ||= { at: 0, now: '', kind: 'rest', town: 0, rest: 0, beat: 0, chat: null, think: '', duel: null, acts: [], cog: null, cogAt: 0 });
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
let running = new Set(load(RUN_KEY, []));
const keepRunning = () => save(RUN_KEY, [...running]);
const sleep = ms => new Promise(res => { const t = setTimeout(res, ms); wake = () => { clearTimeout(t); res(); }; });
const SCENE = { island: 'assets/sky_island.webp', adventure: 'assets/sky_adventure.webp', duel: 'assets/stage_meadow.webp', town: 'assets/stage_castle.webp', raid: 'assets/sky_storm.webp', rest: 'assets/sky_aurora.webp' };
const KIND = { build: 'island', farm: 'island', sell: 'island', well: 'island', train: 'island', decorate: 'island', raid: 'raid', adventure: 'adventure', duel: 'duel', town: 'town', wait: 'rest' };
// cognition: the AI only plays while its Mind has cognition. Low = a warning; empty = it stops (no thinking, no playing)
const LOW_COG = 100, TOPUP_URL = 'https://hellominds.ai/pricing', COG_EVERY = 45e3;
const noCog = msg => /cognition|credit|insufficient|balance|quota|402/i.test(String(msg || ''));
const ACT_ICON = { build: ['🏗️', '🔨', '⬆️'], farm: ['🌱', '🧺', '🥕'], sell: ['💰', '✨'], well: ['⚡'], train: ['🏹', '🪓'], decorate: ['🌷', '🏮'], raid: ['⚔️', '💥', '⭐'], adventure: ['🧭', '🌿', '🪵'], duel: ['🃏', '👑'], town: ['🏘️', '💬'], wait: ['💤'] };

// the Minds that can have an AI: every NFT held, or one Rank Pass slot ('0') for a wallet without Minds
const slots = () => (K.myMinds().length ? K.myMinds().map(String) : ['0']);
const slotName = s => (s === '0' ? 'Rank Pass Mind' : `Mind #${s}`);
const slotPic = s => K.thumb(s === '0' ? 49 : +s);
const aiOf = s => ap?.ai?.[s] || null;
// a Mind its AI is playing right now (the Ranked screen warns before you take it): the AI's name, or null
export const aiPlaying = id => (running.has(String(id)) ? aiOf(String(id))?.name || 'its AI' : null);
export const stopAi = id => stop(String(id), 'Stopped: you are playing me yourself now.');
// open the dock on one Mind (tapping a Mind on the island, or the 🧠 button there)
export function openDock(id) { if (id != null && slots().includes(String(id))) sel = String(id); setMin(false); paint(); loadChat(sel); }

export function initAutopilot(ctx) {
  K = ctx;
  // the big cognition warning: on every screen, above everything but the dialogs
  const w = document.createElement('div'); w.id = 'mcog'; w.className = 'mcog px'; document.body.append(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-cog="add"]')) topUp(); else if (e.target.closest('[data-cog="x"]')) { w.classList.remove('on'); w.dataset.hide = w.dataset.key || ''; } });
  const d = document.createElement('div');
  d.id = 'mdock'; d.className = 'mdock px hide';
  d.innerHTML = `<button class="md-bubble" id="md-bubble"><b>🧠</b><span><strong>AI Minds</strong><small>let your AI play for you</small></span><i id="md-count"></i></button>
    <div class="md-win"><div class="md-head" id="md-head" title="Drag to move"><b>🧠 Your AI Minds</b><small>real Hello Minds AIs playing for you</small><button class="iconbtn px small" id="md-big" title="Bigger / smaller">⤢</button><button class="iconbtn px small" id="md-min" title="Minimize">—</button></div>
    <div class="md-tabs" id="md-tabs"></div><div class="md-body" id="md-body"></div></div>`;
  document.body.append(d);
  d.addEventListener('click', onClick);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'md-in') talk(); });
  dragBy($('#md-head'), d); dragBy($('#md-bubble'), d);
  setMin(load(MIN_KEY, false)); d.classList.toggle('big', !!load(BIG_KEY, false)); place(load(POS_KEY, null));
}
function setMin(v) { $('#mdock').classList.toggle('min', v); save(MIN_KEY, v); }
// move the dock anywhere (remembered on this device); a short tap is still a tap
function place(p) {
  const d = $('#mdock'); if (!d) return;
  if (!p) { d.style.left = d.style.top = ''; d.classList.remove('moved'); return; }
  const w = d.offsetWidth || 340, h = Math.min(d.offsetHeight || 200, innerHeight);
  const x = Math.max(0, Math.min(innerWidth - w - 4, p.x)), y = Math.max(0, Math.min(innerHeight - Math.min(h, 120), p.y));
  Object.assign(d.style, { left: `${x}px`, top: `${y}px` }); d.classList.add('moved');
}
function dragBy(handle, d) {
  let start = null;
  handle.addEventListener('pointerdown', e => { if (e.target.closest('#md-min, #md-big')) return; const r = d.getBoundingClientRect(); start = { x: e.clientX, y: e.clientY, ox: r.left, oy: r.top, moved: false }; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => { if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; if (!start.moved && Math.hypot(dx, dy) < 6) return; start.moved = true; place({ x: start.ox + dx, y: start.oy + dy }); });
  handle.addEventListener('pointerup', () => { if (start?.moved) { const r = d.getBoundingClientRect(); save(POS_KEY, { x: r.left, y: r.top }); d.dataset.dragged = '1'; setTimeout(() => delete d.dataset.dragged, 50); } start = null; });
}
addEventListener('resize', () => place(load(POS_KEY, null)));
// the screen changed: show the dock (folded in fights, so it never covers the controls)
export function dockScreen(id, inWindow = false) {
  const d = $('#mdock'); if (!d || !K) return;
  d.classList.toggle('win', inWindow);   // a window (shop, profile…) is open: just the bubble, in its corner
  d.classList.toggle('hide', !K.online() || ['login', 'boot', 'setup'].includes(id));   // trial players see it too (it invites them to connect)
  d.classList.toggle('fight', ['duel', 'raid', 'adventure'].includes(id));
  d.classList.toggle('isl', id === 'island');
}
// the lobby opened: load the AIs and carry on with the ones that were playing
export async function openAutopilot() {
  dockScreen('hub');
  if (K.online() && K.guest()) { if (!load(SEEN_KEY, false)) { save(SEEN_KEY, true); setMin(false); } return paint(); }
  if (!K.online()) return;
  if (!load(SEEN_KEY, false)) { save(SEEN_KEY, true); setMin(false); }   // first time: open, so nobody misses it
  try { ap = await K.api('autopilot', { op: 'get' }); } catch { ap = ap || null; }
  if (!sel || !slots().includes(sel)) sel = slots().find(s => aiOf(s)) || slots()[0];
  running = new Set([...running].filter(s => aiOf(s)?.steps.length && HM.connected()));
  keepRunning(); paint(); loadChat(sel);
  if (running.size) loop();
}
// the chat comes from Hello Minds itself, so it is the real conversation with that AI
async function loadChat(slot) {
  const ai = aiOf(slot), l = L(slot);
  if (!ai?.hm || l.chat || !HM.connected()) return;
  l.chat = [];
  const h = await HM.history(ai.hm).catch(() => []);
  l.chat = [...h.map(x => ({ who: x.who, text: x.text })), ...l.chat];
  if (slot === sel) paint();
}

// ---------- cognition ----------
const topUp = () => { K.sfx('click'); window.open(TOPUP_URL, '_blank', 'noopener'); K.toast('Top up your Mind on Hello Minds, then come back: tap ▶ Start again.'); };
async function checkCog(slot, force) {
  const ai = aiOf(slot), l = L(slot);
  if (!ai?.hm || (!force && Date.now() - l.cogAt < COG_EVERY)) return l.cog;
  l.cogAt = Date.now();
  const c = await HM.balance(ai.hm);
  if (c != null) l.cog = c;
  if (l.cog != null && l.cog <= 0) outOfCog(slot); else paintCog();
  return l.cog;
}
// an AI that stops answering is not thinking: after 3 misses check its cognition; after 4 it stops, whatever the reason
async function missed(slot, ok) {
  const l = L(slot);
  if (ok) { l.miss = 0; return; }
  l.miss = (l.miss || 0) + 1;   // a slow answer is not a reason to stop (Hello Minds can be slow): say so once, keep going
  if (l.miss >= 3) await checkCog(slot, true);
  if (l.miss === 3 && running.has(slot)) say(slot, '⏳ Hello Minds is slow right now, so some of my answers come late. I keep playing my plan and my duel strategy meanwhile.');
}
function outOfCog(slot) {
  const l = L(slot); l.cog = Math.min(0, l.cog ?? 0);
  if (running.has(slot)) { stop(slot, '⚠️ I ran out of cognition, so I stopped. Add cognition on Hello Minds and I can play again.'); log(slot, '⚠️ out of cognition: stopped playing'); K.sfx('denied'); }
  paintCog(); paint();
}
// the warning for the Mind that needs it most: empty first, then low
function paintCog() {
  const w = $('#mcog'); if (!w || !ap) return;
  const list = slots().filter(s => aiOf(s) && L(s).cog != null).map(s => ({ s, c: L(s).cog })).sort((a, b) => a.c - b.c), worst = list[0];
  const bad = worst && worst.c < LOW_COG ? worst : null, key = bad ? `${bad.s}:${bad.c <= 0 ? 'out' : 'low'}` : '';
  w.dataset.key = key;
  if (!bad || w.dataset.hide === key) { w.classList.remove('on'); return; }
  const name = K.esc(aiOf(bad.s).name || 'Your AI'), out = bad.c <= 0;
  w.classList.toggle('out', out); w.classList.add('on');
  w.innerHTML = `<b>${out ? '⛔' : '⚠️'}</b><div><strong>${out ? `${name} is OUT of cognition` : `${name} is almost out of cognition`}</strong><span>${out ? `It stopped playing ${slotName(bad.s)}. Add cognition on Hello Minds to wake it up.` : `Only ${Math.round(bad.c).toLocaleString()} cognition left. When it runs out, the AI stops playing.`}</span></div><button class="btn ${out ? 'primary' : 'gem'}" data-cog="add">➕ Add cognition</button><button class="iconbtn px small" data-cog="x" title="Hide">✕</button>`;
}

// ---------- drawing ----------
function paint() {
  const tabs = $('#md-tabs'), body = $('#md-body'); if (!tabs) return;
  $('#md-count').textContent = running.size ? `${running.size} playing` : '';
  $('#mdock').classList.toggle('on', running.size > 0);
  if (K.guest()) {   // trial account: show what it is and how to get it
    tabs.innerHTML = '';
    body.innerHTML = `<div class="md-hero"><img src="${K.thumb(49)}" alt=""><p><b>Your Minds can play for you.</b> Every Mind NFT gets its own real AI (on Hello Minds) that farms, upgrades, raids, duels and explores, thinking every move itself.</p></div>
      <ol class="md-steps"><li><i>👛</i><b>Connect your wallet</b><span>the one with your Minds</span></li><li><i>🧠</i><b>Connect Hello Minds</b><span>your AI account (free to make)</span></li><li><i>✨</i><b>Awaken an AI for each Mind</b><span>train it, give it a plan, watch it play</span></li></ol>
      <button class="btn primary wide" data-a="wallet">👛 Connect a wallet</button>`;
    return;
  }
  if (!HM.connected()) {
    tabs.innerHTML = '';
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(slots()[0])}" alt=""><p>Every Mind you hold gets its <b>own AI</b> that farms, raids, duels and explores for you, thinking every move itself. Your AIs live on <b>Hello Minds</b>: connect your account (or make one, it takes a minute).</p></div>
      <button class="btn primary wide" data-a="connect">🧠 Connect Hello Minds</button>`;
    return;
  }
  if (!ap) { tabs.innerHTML = ''; body.innerHTML = '<p class="muted">Loading your AIs…</p>'; return; }
  tabs.innerHTML = slots().map(s => `<button class="md-tab ${s === sel ? 'on' : ''} ${running.has(s) ? 'run' : ''}" data-slot="${s}" title="${slotName(s)}"><img src="${slotPic(s)}" alt=""><span>${s === '0' ? 'Pass' : '#' + s}</span>${aiOf(s) ? '' : '<em>＋</em>'}</button>`).join('');
  const s = sel, ai = aiOf(s), l = L(s);
  if (!ai) {   // this Mind has no AI yet: a fresh one, made for this Mind only (never one used for something else)
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(s)}" alt=""><p><b>${slotName(s)}</b> has no AI yet. Give it one, and it plays for you.</p></div>
      <button class="btn primary wide" data-a="fresh" ${busy ? 'disabled' : ''}>${busy ? 'Waking it up…' : '✨ Awaken an AI for this Mind'}</button>
      <small class="muted">A brand-new AI on your Hello Minds account, with a clean slate, that only ever plays this Mind. You train it here.</small>
      <button class="btn small" data-a="out">Disconnect Hello Minds</button>`;
    return;
  }
  const on = running.has(s), steps = ai.steps, cog = l.cog;
  const warn = cog == null || cog >= LOW_COG ? '' : `<div class="md-cogwarn ${cog <= 0 ? 'out' : ''}"><b>${cog <= 0 ? '⛔ Out of cognition' : `⚠️ Low cognition: ${Math.round(cog).toLocaleString()} left`}</b><span>${cog <= 0 ? 'This AI cannot think, so it cannot play.' : 'It stops playing when it runs out.'}</span><button class="btn small ${cog <= 0 ? 'primary' : 'gem'}" data-a="topup">➕ Add cognition</button></div>`;
  body.innerHTML = `${warn}<div class="md-card"><img src="${slotPic(s)}" alt=""><div><b>${K.esc(ai.name || 'AI')}</b><small>Hello Minds AI · plays ${slotName(s)} · <span id="md-cog" class="${cog != null && cog < LOW_COG ? 'low' : ''}">${cog == null ? '🧠 …' : cog <= 0 ? '⛔ no cognition left' : `${Math.round(cog).toLocaleString()} cognition left`}</span> <button class="md-add" data-a="topup" title="Add cognition on Hello Minds">➕</button></small>
      <small class="md-now">${K.esc(on ? (l.now || 'starting…') : steps.length ? 'resting' : 'no plan yet')}</small>${l.think && on ? `<small class="md-think">💭 ${K.esc(l.think)}</small>` : ''}</div></div>
    <div class="md-row"><button class="btn ${on ? 'red' : 'primary'}" data-a="go">${on ? '⏸ Stop' : '▶ Start'}</button><button class="btn small" data-a="follow">👁 Follow</button><button class="btn small" data-a="train">🎯 Train</button><button class="btn small" data-a="history">📜</button></div>
    <div class="md-plan">${steps.length ? `<b>${on ? 'Playing now' : 'Current plan (▶ Start runs this)'}</b> ${K.esc(planText(steps))}${ai.loop ? ' · 🔁' : ''}` : 'Pick a plan below, or ask your AI.'}</div>
    <div class="label">Plans · tap to see the steps</div>
    <div class="md-presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="md-preset ${ai.preset === k ? 'on' : ''}" data-preset="${k}"><i>${p.icon}</i>${K.esc(p.name)}</button>`).join('')}</div>
    <div class="label">Talk to ${K.esc(ai.name || 'your AI')}</div>
    <div class="md-chat" id="md-chat">${(l.chat || []).map(c => `<div class="mp-line ${c.who}">${K.esc(c.text)}</div>`).join('') || `<div class="mp-line mind">${l.chat ? 'Hi! Tell me what to play, like "farm, then raid, then duel 3 times".' : 'Loading our chat…'}</div>`}${l.typing ? `<div class="mp-line mind typing">${K.esc(ai.name || 'Your AI')} is thinking<i>.</i><i>.</i><i>.</i></div>` : ''}</div>
    <div class="fr-add"><input id="md-in" maxlength="300" placeholder="Tell your AI what to do…"><button class="btn small primary" data-a="send">Send</button></div>
    <small class="muted md-hint">When your AI answers with a plan, you see it first: approve it and it <b>replaces</b> the current plan.</small>
    <div class="md-foot"><button class="btn small ${ap.gems.on ? 'gem' : ''}" data-a="gems">${ap.gems.on ? `💎 ${ap.gems.spent}/${ap.gems.cap} today` : '💎 Gems OFF'}</button></div>`;
  const chat = $('#md-chat'); chat.scrollTop = 1e9;
  if (ai.hm && Date.now() - l.cogAt > COG_EVERY) checkCog(s).then(c => { if (c != null && s === sel && Math.round(c) !== Math.round(cog ?? -1)) paint(); });
}
const say = (slot, text, who = 'mind') => { const l = L(slot); (l.chat ||= []).push({ who, text }); l.chat = l.chat.slice(-200); if (slot === sel) paint(); };
const setNow = (slot, text, kind) => { const l = L(slot); l.now = text; if (kind && kind !== l.kind) { l.kind = kind; followTo(slot); } else if (kind) l.kind = kind; if (slot === sel) { const el = $('#mdock .md-now'); if (el) el.textContent = text; } paintFollow(); };
const think = (slot, why) => { if (!why) return; L(slot).think = why; paintFollow(); if (slot === sel) { const el = $('#mdock .md-think'); if (el) el.textContent = `💭 ${L(slot).think}`; } };

// ---------- taps ----------
async function onClick(e) {
  const t = e.target.closest('button'); if (!t || $('#mdock').dataset.dragged) return;
  if (t.id === 'md-bubble') return setMin(false);
  if (t.id === 'md-min') return setMin(true);
  if (t.id === 'md-big') { const b = !$('#mdock').classList.contains('big'); $('#mdock').classList.toggle('big', b); save(BIG_KEY, b); return; }
  if (t.dataset.slot) { sel = t.dataset.slot; K.sfx('select'); paint(); return loadChat(sel); }
  if (t.dataset.preset) return previewPlan(PRESETS[t.dataset.preset].steps, t.dataset.preset);
  const a = t.dataset.a;
  if (a === 'connect') return HM.signIn().catch(err => K.toast(err.message, true));
  if (a === 'wallet') return K.connectWallet?.();
  if (a === 'out') { stopAll(); await HM.signOut(); paint(); return K.toast('Hello Minds disconnected.'); }
  if (a === 'fresh') return makeFresh(sel);
  if (a === 'go') return running.has(sel) ? stop(sel, 'Stopped. Tell me when to play again!') : start(sel);
  if (a === 'send') return talk();
  if (a === 'follow') return openFollow(sel);
  if (a === 'history') return openHistory();
  if (a === 'train') return openTraining(sel);
  if (a === 'gems') return gemsToggle();
  if (a === 'topup') return topUp();
}
async function makeFresh(slot) {
  if (busy) return;
  const name = `Clash-${slot === '0' ? 'Pass' : slot}`;
  if (!(await K.modal(`<h3>✨ Awaken an AI for ${slotName(slot)}</h3><p>This makes a brand-new AI Mind called <b>${name}</b> on <b>your</b> Hello Minds account. It starts with a clean slate and only ever plays ${slotName(slot)}.</p><p class="muted">It thinks every move itself, using your own Hello Minds cognition.</p>`, [['Awaken it', 1, 'primary'], ['Cancel', 0]]))) return;
  busy = true; paint();
  try {
    const m = await HM.awaken(name);
    ap = await K.api('autopilot', { op: 'link', mind: slot, hm: m.mindId, name: m.name || name, token: await HM.token() });
    L(slot).chat = []; K.sfx('levelup'); say(slot, `Hi! I'm ${m.name || name}, the AI for ${slotName(slot)}. Train me with 🎯, pick a plan, and I'll play.`);
  } catch (err) { K.toast(`Hello Minds: ${err.message}`, true); }
  busy = false; paint();
}

// ---------- 🎯 Training: how this AI plays each part of the game ----------
let trainDraft = null;
document.addEventListener('change', e => { const k = e.target.dataset?.tr; if (k && trainDraft) { const [g, f] = k.split('.'); trainDraft[g][f] = e.target.value; } });
async function openTraining(slot) {
  const ai = aiOf(slot); if (!ai) return;
  trainDraft = cleanTraining(ai.train);
  const html = Object.entries(TRAINING).map(([g, G]) => `<fieldset class="md-train"><legend>${G.label}</legend>${Object.entries(G).filter(([k]) => k !== 'label').map(([k, o]) => `<label><span>${o.label}</span><select data-tr="${g}.${k}">${Object.entries(o.opts).map(([v, n]) => `<option value="${v}" ${trainDraft[g][k] === v ? 'selected' : ''}>${K.esc(n)}</option>`).join('')}</select></label>`).join('')}</fieldset>`).join('');
  const go = await K.modal(`<h3>🎯 Train ${K.esc(ai.name || 'your AI')}</h3><p class="muted">This is how you teach your AI: it reads it before every move it thinks about. The AI makes every move itself; the game never plays for it.</p><div class="md-trainbox">${html}</div>`, [['Save training', 1, 'primary'], ['Cancel', 0]]);
  if (!go) return;
  try { ap = await K.api('autopilot', { op: 'train', mind: slot, train: trainDraft }); K.sfx('select'); K.toast('Training saved.'); say(slot, 'Got it! I will play the way you trained me.'); } catch (err) { K.toast(err.message, true); }
}

// a plan is never started by surprise: show the steps, then Start
async function previewPlan(steps, preset = null, loop = true, from = '') {
  steps = cleanPlan(steps); if (!steps.length) return;
  const p = preset && PRESETS[preset], ai = aiOf(sel);
  const go = await K.modal(`<h3>${p ? `${p.icon} ${K.esc(p.name)}` : '📋 New plan'}</h3>${p ? `<p>${K.esc(p.desc)}</p>` : from ? `<p class="muted">${K.esc(from)}</p>` : ''}
    <ol class="md-steps">${steps.map(s => `<li><i>${STEPS[s.do].icon}</i><b>${STEPS[s.do].name}${s.n > 1 ? ` ×${s.n}` : ''}${s.min ? ` · ${s.min} min` : ''}</b><span>${STEPS[s.do].say}</span></li>`).join('')}</ol>
    <p class="muted">${loop ? '🔁 Then it starts again from the top, until you stop it.' : 'It plays this once.'} ${K.esc(ai?.name || 'Your AI')} thinks about every step and every duel move itself, the way you trained it (🎯).</p>
    ${ai?.steps?.length ? `<p class="muted">This <b>replaces</b> the current plan: ${K.esc(planText(ai.steps))}.</p>` : ''}${steps.some(s => s.do === 'build') && !ap?.gems?.on ? '<p class="warn">💎 Gem rushes need Gems ON (💎 button below the chat): until then it only upgrades with Dust.</p>' : ''}`,
    [[running.has(sel) ? '▶ Switch to this plan' : '▶ Start this plan', 'go', 'primary'], ['Save only', 'save'], ['Cancel', 0]]);
  if (!go) return;
  try { ap = await K.api('autopilot', { op: 'save', mind: sel, steps, preset, loop }); Object.assign(L(sel), { at: 0, rest: 0, town: 0 }); wake?.(); K.sfx('select'); log(sel, `📋 switched to the new plan: ${planText(steps)}`); }   // a new plan starts at its first step, now (no old rest or town time left over)
  catch (err) { return K.toast(err.message, true); }
  if (go === 'go') { if (running.has(sel)) { say(sel, 'Switching to the new plan now.'); paint(); } else start(sel); } else paint();
}

// what the AI is told about the game right now, with every chat message: the island, the plan, what it did lately
function gameState(slot) {
  const st = K.island?.() || null, ai = aiOf(slot), lines = (ap?.log || []).filter(x => x.mind === slot).slice(0, 5).map(x => x.text);
  const plan = `Plan: ${ai?.steps?.length ? planText(ai.steps) : 'none'} (${running.has(slot) ? 'playing now' : 'not playing'}). Lately: ${lines.join(' | ') || 'nothing yet'}.`;
  if (!st) return plan;
  const th = (st.b || []).find(b => b.type === 'home')?.lv || 1, byType = {};
  const skip = new Set(['home', 'well', 'flowers', 'lamp', 'fence', 'bench', 'banner', 'lantern', 'crystal', 'fountain', 'trap']);
  for (const b of st.b || []) if (!skip.has(b.type)) (byType[b.type] ||= []).push(`Lv${b.lv || 1}${b.done ? '↑' : ''}`);
  return `Town Hall Lv${th} (other buildings can go up to its level; ↑ = upgrading now). Buildings: ${Object.entries(byType).map(([t, l]) => `${t} ${l.join('/')}`).join(', ') || 'none'}. ${(st.dust || 0).toLocaleString()} Dust, ${st.gems || 0} Gems (Gem spending ${ap?.gems?.on ? `ON, ${Math.max(0, ap.gems.cap - ap.gems.spent)} left today` : 'OFF'}), wood ${st.inv?.wood || 0}, stone ${st.inv?.stone || 0}. ${plan}`;
}
// the chat box: the player's own Hello Minds AI answers; a PLAN line in its answer is offered as a plan
async function talk() {
  const box = $('#md-in'), text = box?.value.trim(), slot = sel, ai = aiOf(slot); if (!text || !ai) return;
  box.value = ''; say(slot, text, 'me');
  if (/^\s*(stop|pause|halt)\b/i.test(text)) return stop(slot, 'Okay, I stop. 💤');
  const was = L(slot).now; L(slot).typing = true; paint();
  let reply = null;
  try { reply = await HM.ask(ai.hm, text, gameState(slot), 120e3); } catch (err) { setNow(slot, was); if (noCog(err.message)) { outOfCog(slot); return say(slot, '⛔ I am out of cognition, so I cannot think. Tap ➕ Add cognition.'); } return say(slot, `(Hello Minds: ${err.message})`); }
  L(slot).typing = false; setNow(slot, running.has(slot) ? L(slot).now || was : '');
  if (reply == null) return say(slot, '(I did not answer within 2 minutes. Hello Minds may be busy: try again.)');
  let { say: words, plan } = HM.splitReply(reply);
  if (words) say(slot, words);
  let r = parsePlan(plan || ''), fromWords = false;
  if (!r.steps && !/PLAN:\s*none/i.test(reply)) {   // the AI agreed but wrote no plan line: the plan comes from what the player asked
    const mine = parsePlan(text);
    if (mine.steps) { r = mine; fromWords = true; }
  }
  // what the player asked always counts: "diamonds only" makes the plan's upgrades Gem upgrades, "don't farm" takes farming out
  const asked = parsePlan(text);
  if (r.steps && asked.steps?.some(x => x.gems)) r = { ...r, steps: r.steps.map(x => (x.do === 'build' ? { ...x, gems: 1 } : x)) };
  if (r.steps && /(?:don'?t|do not|dont|no|never|without|not)\s+(?:\w+\s+){0,2}?farm/i.test(text.replace(/’/g, "'"))) r = { ...r, steps: r.steps.filter(x => x.do !== 'farm') };
  if (r.steps && !r.steps.length) r = parsePlan('');
  if (r.stop) return stop(slot, 'Okay, I stop. 💤');
  if (r.steps) { say(slot, `📋 ${fromWords ? 'Plan from what you asked' : 'I made a plan'}: ${planText(cleanPlan(r.steps))}. Approve it to use it.`); previewPlan(r.steps, r.preset || null, r.loop, fromWords ? 'The plan from what you asked (your AI agreed).' : `${ai.name || 'Your AI'} suggests this plan for what you asked.`); }
  else if (plan) say(slot, '(I could not turn that into game steps. Try: farm, sell, upgrade buildings, raid, adventure, duel, town.)');
}

// ---------- playing: the AI decides ----------
async function start(slot) {
  if (!HM.connected()) return K.toast('Connect Hello Minds first.', true);
  if (!aiOf(slot)?.steps.length) return K.toast('Pick a plan first.', true);
  const cog = await checkCog(slot, true);
  if (cog != null && cog <= 0) { paint(); return K.modal(`<h3>⛔ ${K.esc(aiOf(slot).name || 'Your AI')} is out of cognition</h3><p>Your AI thinks with cognition from your Hello Minds account. With none left it cannot play.</p>`, [['➕ Add cognition', 1, 'primary'], ['Not now', 0]]).then(go => go && topUp()); }
  running.add(slot); keepRunning(); K.sfx('levelup');
  if (!L(slot).chat?.at(-1)?.text?.startsWith('Let\'s go!')) say(slot, 'Let\'s go! I think about every move myself while the lobby is open (even in the background). Tap 👁 Follow to watch me.');
  paint(); loop();
}
function stop(slot, msg) {
  const wasDuel = L(slot).kind === 'duel';
  if (follow === slot && K.watching?.()) K.stopWatch();
  running.delete(slot); keepRunning();
  Object.assign(L(slot), { town: 0, rest: 0, now: '', duel: null });
  if (msg) say(slot, msg); paint(); paintFollow(); wake?.();
  if (wasDuel) K.api('autopilot', { op: 'duel_leave' }).catch(() => {});
}
const stopAll = () => [...running].forEach(s => stop(s));
const log = async (slot, text) => { try { ap = await K.api('autopilot', { op: 'log', mind: slot, text }); } catch { /* offline for a moment */ } paintFollow(); };
// the AI picks the next step: the plan says what is next, the AI may pick another step of the plan if it is smarter now
async function nextStep(slot, ai, l) {
  const planned = ai.steps[l.at % ai.steps.length];
  setNow(slot, `🧠 thinking about the next step (Hello Minds answers can take up to a minute)…`);
  let r = null;
  try {   // short calls until the AI has answered (Hello Minds can take a minute)
    for (let n = 0; n < 15 && running.has(slot); n++) {
      r = await K.api('autopilot', { op: 'next', mind: slot, at: l.at, token: await HM.token() });
      if (!r.pending) break;
      setNow(slot, `🧠 thinking about the next step… ${Math.round((r.waited || 0) / 1000)} s`);
    }
  } catch (e) { if (e.status === 401 || e.status === 403) stop(slot, `⚠️ ${e.message}`); return planned; }
  if (!r || r.pending) return planned;
  if (r.cog != null) { l.cog = r.cog; l.cogAt = Date.now(); paintCog(); }
  if (r.out) { outOfCog(slot); return planned; }
  await missed(slot, r.ai);
  if (!r.ai) { await log(slot, '🧠 (thought too long: kept to the plan)'); return planned; }
  think(slot, r.why || `${STEPS[r.do].name} next.`);
  return ai.steps.find(x => x.do === r.do) || planned;
}
// one loop for all the AIs: each takes its next step in turn; Mind Town and rests run on their own clocks meanwhile
async function loop() {
  if (looping) return;
  looping = true;
  let turn = 0;
  try {
    while (running.size) {
      if (!K.idle()) { await sleep(3000); continue; }   // you are playing yourself: the AIs wait
      for (const s of [...running]) await checkCog(s);   // every AI, every minute, also in Mind Town or resting: no cognition = it stops
      await townBeats();
      const now = Date.now(), ready = [...running].filter(s => L(s).town < now && L(s).rest < now);
      if (!ready.length) { await sleep(2500); continue; }
      const slot = ready[turn++ % ready.length], ai = aiOf(slot), l = L(slot);
      if (!ai?.steps.length) { running.delete(slot); continue; }
      await checkCog(slot);   // no cognition, no thinking: it stops instead of playing without its mind
      if (!running.has(slot)) continue;
      if (!ai.loop && l.at >= ai.steps.length) { stop(slot, 'All done! ✅'); continue; }
      const s = await nextStep(slot, ai, l);
      if (!running.has(slot)) continue;
      // ask the AI about the step after this one now, while this one runs (Hello Minds answers take a while)
      HM.token().then(token => K.api('autopilot', { op: 'next', mind: slot, at: l.at + 1, token })).catch(() => {});
      setNow(slot, `${STEPS[s.do].icon} ${STEPS[s.do].say}…`, KIND[s.do]); L(slot).acts = ACT_ICON[s.do] || [];
      try { await run(slot, s); } catch (e) { await log(slot, `${STEPS[s.do].icon} ${e.message || 'that did not work'}`); }
      l.at++;
      K.refresh(); paint();
      await sleep(1200);
    }
  } finally { looping = false; }
}
async function run(slot, s) {
  const l = L(slot);
  if (s.do === 'wait') { l.rest = Date.now() + s.min * 60e3; setNow(slot, `💤 resting ${s.min} min`, 'rest'); return log(slot, `💤 resting ${s.min} min`); }
  if (s.do === 'town') { l.town = Date.now() + s.min * 60e3; l.beat = 0; l.got = 0; setNow(slot, `🏘️ in Mind Town for ${s.min} min`, 'town'); return log(slot, `🏘️ off to Mind Town for ${s.min} min`); }
  if (s.do === 'duel') { for (let i = 0; i < s.n && running.has(slot); i++) if (!(await duel(slot, i + 1, s.n))) break; return; }
  const r = await K.api('autopilot', { op: 'step', do: s.do, mind: slot, at: l.at });
  ap = { ...ap, log: r.log, gems: r.gems }; setNow(slot, r.text); paintFollow();
  K.babble(slot === '0' ? 49 : +slot, r.ok ? 'happy' : 'sad', 0.5);
}
// Mind Town: walk around now and then (standing still earns nothing) and collect the Town Time rewards
async function townBeats() {
  const now = Date.now();
  for (const slot of running) {
    const l = L(slot);
    if (!l.town) continue;
    if (l.town < now) { l.town = 0; await log(slot, `🏘️ back from Mind Town${l.got ? `: +${l.got} ✨` : ''}`); continue; }
    if (now - l.beat < 12e3) continue;
    l.beat = now; l.x = Math.max(900, Math.min(1500, (l.x || 1200) + (Math.random() - 0.5) * 120)); l.y = Math.max(700, Math.min(1100, (l.y || 900) + (Math.random() - 0.5) * 120));
    try { const r = await K.api('town', { x: l.x | 0, y: l.y | 0, mind: slot === '0' ? 49 : +slot }); if (r.got?.dust) { l.got = (l.got || 0) + r.got.dust; setNow(slot, `🏘️ in Mind Town · +${l.got} ✨ so far`, 'town'); } } catch { /* next beat */ }
  }
}
// one ranked duel with this Mind: every card and spell is the AI's own choice
async function duel(slot, i, n) {
  const ai = aiOf(slot), train = cleanTraining(ai?.train), pass = slot === '0' && K.rankPass();
  if (slot === '0' && (!pass || pass.left < 1)) { await log(slot, pass ? '🃏 the Rank Pass has no games left today' : '🃏 ranked needs a Mind or a Rank Pass: skipping duels'); return false; }
  let minds = pass ? pass.minds : [+slot];
  if (!pass && K.energyOf(+slot) <= 0) {
    if (train.energy.refill === 'stop') { await log(slot, '🃏 out of ranked energy (training: stop dueling)'); return false; }
    const r = await K.api('autopilot', { op: 'refill', mind: +slot, only: train.energy.refill }).catch(() => ({ ok: false }));
    if (!r.ok) { await log(slot, '🃏 no ranked energy left: skipping duels'); return false; }
    await log(slot, `⚡ refilled with ${r.pay === 'shard' ? 'shards' : r.pay === 'dust' ? 'Dust' : 'Gems'}`); K.refresh(); minds = [+slot];
  }
  setNow(slot, '🧠 writing its duel strategy…', 'duel');   // the AI's own rules for turns where its live answer is too slow
  let sp = {};
  for (let n = 0; n < 18 && running.has(slot); n++) { sp = await K.api('autopilot', { op: 'duel_plan', mind: slot, token: await HM.token() }).catch(() => ({})); if (!sp.pending) break; setNow(slot, `🧠 writing its duel strategy… ${n * 8} s`, 'duel'); }
  if (sp.out) { outOfCog(slot); return false; }
  if (!sp.plan && !aiOf(slot)?.duelPlan) { await log(slot, '🃏 my duel strategy did not come in time: skipping this duel (I never duel without my own plan)'); return false; }
  if (sp.plan) { ap.ai[slot] = { ...ap.ai[slot], duelPlan: sp.plan }; think(slot, `My duel plan: ${Object.entries(sp.plan).map(([k, v]) => `${k} ${v}`).join(', ')}`); }
  let q = await K.api('autopilot', { op: 'duel_join', mind: slot, mode: 'ranked', minds, ...(pass ? { pass: true } : {}) });
  const until = Date.now() + 90e3;
  while (running.has(slot) && !q.match && Date.now() < until) { setNow(slot, `🃏 duel ${i}/${n}: looking for a rival…`, 'duel'); await sleep(2500); q = await K.api('autopilot', { op: 'duel_poll' }); }
  if (!q.match) { await K.api('autopilot', { op: 'duel_leave' }).catch(() => {}); return false; }
  const id = q.match, l = L(slot);
  l.match = id; if (follow === slot && K.watching?.()) K.watchDuel(id, ai?.name || 'Your AI');   // following: show this duel
  let v = null, own = 0, planned = 0, total = 0;
  for (let guard = 0; guard < 400; guard++) {
    v = await K.api('autopilot', { op: 'duel_view', id });
    if (v.status !== 'live' || v.view.over) break;
    if (guard % 8 === 7) await checkCog(slot);   // a long duel: still has cognition?
    const last = v.view.lastEvent;
    l.duel = { rival: v.view.rival.name, me: v.view.me.score, them: v.view.rival.score, round: v.view.round, crown: v.view.crown, pot: v.view.pot, next: v.view.next, cards: [...v.view.me.cards].sort((a, b) => a - b), rivalLeft: v.view.rival.cards.length, spells: [...v.view.me.spells, ...(v.view.me.reverse ? ['reverse'] : [])], played: l.duel?.played || null, last: last && last.cards?.[0] != null ? { mine: last.cards[v.seat], theirs: last.cards[1 - v.seat], win: last.win == null ? null : last.win === v.seat } : l.duel?.last || null };
    setNow(slot, `🃏 dueling ${v.view.rival.name} · ${v.view.me.score}–${v.view.rival.score}`, 'duel');
    if (!v.view.me.locked && v.view.crown) {   // the server asks the AI and plays its card (nobody else can)
      setNow(slot, `🧠 thinking about crown ${v.view.crown}…`, 'duel');
      const r = await K.api('autopilot', { op: 'duel_think', mind: slot, id, token: await HM.token() }).catch(e => ({ error: e }));
      if (r.pending) { await sleep(300); continue; }   // still thinking: look again right away
      if (r.out) { outOfCog(slot); continue; }
      if (r.error) { if (r.error.status === 401 || r.error.status === 403) { stop(slot, `⚠️ ${r.error.message}`); continue; } }
      else if (r.think) {
        const d = r.think; total++; if (d.ai) own++; if (d.plan) planned++;
        await missed(slot, d.ai || d.plan);
        if (d.card) l.duel.played = { card: d.card, spell: d.spell, crown: d.crown };
        think(slot, d.ai ? `Crown ${d.crown}: ${d.card}${d.spell ? ` + ${d.spell}` : ''}. ${d.why}` : `Crown ${d.crown}: ${d.why}`);
      }
    }
    await sleep(1500);
    if (!running.has(slot)) { await K.api('autopilot', { op: 'duel_forfeit', id }).catch(() => {}); return false; }
  }
  l.duel = null; l.match = null;
  const won = v?.winner === v?.seat, tie = v?.winner == null;
  await log(slot, `🃏 ${tie ? 'tied' : won ? 'won' : 'lost'} vs ${v?.view.rival.name}${v?.delta ? ` (${v.delta > 0 ? '+' : ''}${v.delta} rating)` : ''}${v?.dustWon ? `, +${v.dustWon} ✨` : ''} · the AI chose ${own} of ${total} cards live${planned ? `, ${planned} by its own duel strategy` : ''}${own + planned < total ? `, ${total - own - planned} not played (no answer)` : ''}`);
  K.babble(slot === '0' ? 49 : +slot, won ? 'happy' : 'sad', 0.6); K.refresh();
  return true;
}

// ---------- 👁 Follow: watch one Mind play, live ----------
// In a duel you watch the real duel screen; on the island you watch your real island; elsewhere (raid, adventure,
// Mind Town, rest) a live card. It switches by itself as the AI moves on.
function followTo(slot) {
  if (follow !== slot || !K.watching?.()) return;
  const l = L(slot), name = aiOf(slot)?.name || 'Your AI';
  if (l.kind === 'duel' && l.match) K.watchDuel(l.match, name);
  else if (l.kind === 'island') K.watchIsland(name);
}
function openFollow(slot) {
  const l = L(slot), name = aiOf(slot)?.name || 'Your AI';
  if (running.has(slot) && l.kind === 'duel' && l.match) { follow = slot; $('#mfollow')?.classList.remove('on'); return K.watchDuel(l.match, name); }
  if (running.has(slot) && l.kind === 'island') { follow = slot; $('#mfollow')?.classList.remove('on'); return K.watchIsland(name); }
  follow = slot;
  let f = $('#mfollow');
  if (!f) {
    f = document.createElement('div'); f.id = 'mfollow'; f.className = 'mfollow';
    f.addEventListener('click', e => { if (e.target.closest('[data-f="close"]') || e.target === f) { f.classList.remove('on'); follow = null; } else if (e.target.closest('[data-f="stop"]')) stop(follow, 'Stopped.'); else if (e.target.closest('[data-f="go"]')) start(follow); });
    document.body.append(f);
  }
  K.home(); f.classList.add('on'); paintFollow();
}
function paintFollow() {
  const f = $('#mfollow'); if (!f || !follow || !f.classList.contains('on')) return;
  const s = follow, l = L(s), ai = aiOf(s), on = running.has(s), kind = on ? l.kind : 'rest', D = on && kind === 'duel' ? l.duel : null;
  const lines = (ap?.log || []).filter(x => x.mind === s).slice(0, 12);
  const card = (n, cls = '') => `<span class="mf-c ${cls}">${n}</span>`;
  const board = D ? `<div class="mf-board"><div class="mf-crown"><small>CROWN</small><b>${D.crown ?? '–'}</b>${D.pot && D.pot !== D.crown ? `<small>pot ${D.pot}</small>` : ''}${D.next ? `<em>next: ${D.next}</em>` : ''}</div>
      <div class="mf-vs"><span>${K.esc(ai?.name || 'AI')} <b>${D.me}</b></span><span>round ${D.round}</span><span><b>${D.them}</b> ${K.esc(D.rival)}</span></div>
      ${D.last ? `<div class="mf-last">last turn: ${card(D.last.mine, D.last.win === true ? 'win' : D.last.win === false ? 'lose' : '')} vs ${card(D.last.theirs, D.last.win === false ? 'win' : D.last.win === true ? 'lose' : '')}</div>` : ''}
      <div class="mf-hand">${D.cards.map(n => card(n, D.played?.card === n ? 'pick' : '')).join('')}</div>
      <div class="mf-spells">${D.spells.map(x => `<i>${x}</i>`).join('') || '<i class="muted">no spells left</i>'} · rival has ${D.rivalLeft} cards</div></div>`
    : `<div class="mf-acts">${(on ? l.acts : ['💤']).map((x, i) => `<i style="--d:${i * 0.35}s">${x}</i>`).join('')}</div>`;
  f.innerHTML = `<div class="mf-card px ${D ? 'duel' : ''}" style="--scene:url(${SCENE[kind] || SCENE.rest})">
    <div class="mf-scene"><img class="mf-mind ${on ? 'walk' : ''}" src="${slotPic(s)}" alt="">${on && l.think ? `<div class="mf-bubble">💭 ${K.esc(l.think)}</div>` : ''}<span class="mf-where">${{ island: '🏝️ on your island', adventure: '🧭 on an adventure', duel: '🃏 in a ranked duel', town: '🏘️ in Mind Town', raid: '⚔️ raiding', rest: '💤 resting' }[kind]}</span>${board}</div>
    <div class="mf-info"><b>${K.esc(ai?.name || 'AI')} · ${slotName(s)}</b><small class="muted">a real Hello Minds AI, thinking every move</small><p class="mf-now">${K.esc(on ? l.now || '…' : 'Not playing right now.')}</p>
      <ol class="mf-log">${lines.map(x => `<li><time>${new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>${K.esc(x.text)}</li>`).join('') || '<li class="muted">What it does shows here.</li>'}</ol>
      <div class="md-row">${on ? '<button class="btn red" data-f="stop">⏸ Stop</button>' : '<button class="btn primary" data-f="go">▶ Start</button>'}<button class="btn" data-f="close">Close</button></div></div></div>`;
}
// ---------- 📜 History: everything the AIs did, filtered by Mind ----------
let histOnly = '';
async function openHistory() {
  try { ap = await K.api('autopilot', { op: 'get' }); } catch { /* show what we have */ }
  const list = (ap?.log || []).filter(x => !histOnly || x.mind === histOnly);
  const opts = [['All', 'h:'], ...slots().map(s => [s === '0' ? 'Pass' : '#' + s, 'h:' + s])].map(([n, v]) => [n, v, v === 'h:' + histOnly ? 'primary' : '']);
  const day = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const go = await K.modal(`<h3>📜 What your AIs did${histOnly ? ` · ${slotName(histOnly)}` : ''}</h3><ol class="md-hist">${list.map(x => `<li><time>${day(x.at)} ${new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>${x.mind ? `<img src="${slotPic(x.mind)}" alt="">` : '<i>🧠</i>'}<span>${K.esc(x.text)}</span></li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ol>`,
    [...(slots().length > 1 ? opts : []), ['Close', 0, 'primary']]);
  if (typeof go === 'string' && go.startsWith('h:')) { histOnly = go.slice(2); return openHistory(); }
  histOnly = '';
}

// ---------- 💎 Gems: a warning, a daily amount the player types, then CONFIRM; the server checks every spend ----------
let gemDraft = { n: '', word: '' };
document.addEventListener('input', e => { if (e.target.id === 'md-gem-n') gemDraft.n = e.target.value; if (e.target.id === 'md-gem-word') gemDraft.word = e.target.value; });
async function gemsToggle() {
  if (!ap) return;
  if (ap.gems.on) { ap = await K.api('autopilot', { op: 'gems', on: false }); paint(); return K.toast('Your AIs can no longer spend Gems.'); }
  if (!(await K.modal('<h3>💎 Let your AIs spend Gems?</h3><p>Gems can be bought with real money. If you say yes, your AIs may use them for <b>Raid Tickets, Adventure Tickets and ranked energy</b> when they run out.</p><p class="muted">They never buy Gems, never send them to anyone and never buy looks.</p>', [['Continue', 1, 'primary'], ['No, keep it off', 0]]))) return;
  gemDraft = { n: '', word: '' };
  const go = await K.modal('<h3>⚠️ Your daily Gem limit</h3><p>How many Gems may your AIs spend <b>in one day, all together</b>?</p><input id="md-gem-n" type="number" min="1" max="1000" inputmode="numeric" placeholder="e.g. 10" style="width:100%"><p>Type <b>CONFIRM</b> to allow it. You can turn it off any time with one tap.</p><input id="md-gem-word" maxlength="10" placeholder="CONFIRM" autocomplete="off" style="width:100%">', [['Allow', 1, 'gem'], ['Cancel', 0, 'primary']]);
  if (!go) return;
  const cap = Math.floor(Number(gemDraft.n)), word = gemDraft.word.trim();
  if (!(cap >= 1 && cap <= 1000)) return K.toast('Type a daily limit from 1 to 1,000 Gems.', true);
  if (word !== 'CONFIRM') return K.toast('Not allowed: you did not type CONFIRM.', true);
  try { ap = await K.api('autopilot', { op: 'gems', on: true, cap, confirm: word }); paint(); K.toast(`Your AIs may spend up to ${cap} 💎 a day.`); } catch (err) { K.toast(err.message, true); }
}
export const autopilotRunning = () => running.size > 0;
