// 🧠 AI Minds dock: floats on every screen (minimize it to a bubble). Each Mind NFT the player holds gets its own AI,
// the player's own Mind on Hello Minds (hellominds.js): a fresh one made for the game, or one they already have.
// Each AI has its own plan and chat; tap a plan to see the steps, then Start. They play through /api/autopilot, so every
// rule a human has applies, one step at a time in turn, while the lobby is open (they wait while you play yourself).
// 👁 Follow shows what a Mind is doing live; 📜 History lists everything the AIs did.
// Gems: OFF by default; turning them on takes a warning, a daily amount the player types, and typing CONFIRM.
import { PRESETS, STEPS, parsePlan, planText, cleanPlan } from './island/autoplay.js';
import { Bot } from './duel/bot.js';
import * as HM from './hellominds.js';

let K = null, ap = null, hmMinds = null, sel = null, busy = false, looping = false, wake = null, follow = null;
const $ = s => document.querySelector(s);
const RUN_KEY = 'mc_ai_run', MIN_KEY = 'mc_ai_min', SEEN_KEY = 'mc_ai_seen';
const live = {};   // per Mind slot: { at (step index), now, kind, town (until), rest (until), beat, chat: [] }
const L = slot => (live[slot] ||= { at: 0, now: '', kind: 'rest', town: 0, rest: 0, beat: 0, chat: [] });
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
let running = new Set(load(RUN_KEY, []));
const keepRunning = () => save(RUN_KEY, [...running]);
const sleep = ms => new Promise(res => { const t = setTimeout(res, ms); wake = () => { clearTimeout(t); res(); }; });
const SCENE = { island: 'assets/sky_island.webp', adventure: 'assets/sky_adventure.webp', duel: 'assets/stage_meadow.webp', town: 'assets/stage_castle.webp', raid: 'assets/sky_storm.webp', rest: 'assets/sky_aurora.webp' };
const KIND = { farm: 'island', sell: 'island', well: 'island', train: 'island', decorate: 'island', raid: 'raid', adventure: 'adventure', duel: 'duel', town: 'town', wait: 'rest' };

// the Minds that can have an AI: every NFT held, or one Rank Pass slot ('0') for a wallet without Minds
const slots = () => (K.myMinds().length ? K.myMinds().map(String) : ['0']);
const slotName = s => (s === '0' ? 'Rank Pass Mind' : `Mind #${s}`);
const slotPic = s => K.thumb(s === '0' ? 49 : +s);
const aiOf = s => ap?.ai?.[s] || null;

export function initAutopilot(ctx) {
  K = ctx;
  const d = document.createElement('div');
  d.id = 'mdock'; d.className = 'mdock px hide';
  d.innerHTML = `<button class="md-bubble" id="md-bubble"><b>🧠</b><span>AI Minds</span><i id="md-count"></i></button>
    <div class="md-win"><div class="md-head"><b>🧠 Your AI Minds</b><small>they play MINDS CLASH for you</small><button class="iconbtn px small" id="md-min" title="Minimize">—</button></div>
    <div class="md-tabs" id="md-tabs"></div><div class="md-body" id="md-body"></div></div>`;
  document.body.append(d);
  d.addEventListener('click', onClick);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'md-in') talk(); });
  d.addEventListener('change', e => { if (e.target.id === 'md-existing') linkExisting(e.target.value); });
  setMin(load(MIN_KEY, false));
}
function setMin(v) { $('#mdock').classList.toggle('min', v); save(MIN_KEY, v); }
// the screen changed: show the dock (minimized in fights, so it never covers the controls)
export function dockScreen(id) {
  const d = $('#mdock'); if (!d) return;
  d.classList.toggle('hide', !K.online() || K.guest() || ['login', 'boot', 'setup'].includes(id));
  d.classList.toggle('fight', ['duel', 'raid', 'adventure'].includes(id));
  d.classList.toggle('isl', id === 'island');
}
// the lobby opened: load the AIs and carry on with the ones that were playing
export async function openAutopilot() {
  dockScreen('hub');
  if (!K.online() || K.guest()) return;
  if (!load(SEEN_KEY, false)) { save(SEEN_KEY, true); setMin(false); }   // first time: open, so nobody misses it
  if (HM.connected() && !hmMinds) { try { hmMinds = await HM.listMinds(); } catch (e) { hmMinds = []; K.toast(`Hello Minds: ${e.message}`, true); } }
  try { ap = await K.api('autopilot', { op: 'get' }); } catch { ap = ap || null; }
  if (!sel || !slots().includes(sel)) sel = slots().find(s => aiOf(s)) || slots()[0];
  running = new Set([...running].filter(s => aiOf(s)?.steps.length && HM.connected()));
  keepRunning(); paint();
  if (running.size) loop();
}

// ---------- drawing ----------
function paint() {
  const tabs = $('#md-tabs'), body = $('#md-body'); if (!tabs) return;
  $('#md-count').textContent = running.size ? `${running.size} playing` : '';
  $('#mdock').classList.toggle('on', running.size > 0);
  if (!HM.connected()) {
    tabs.innerHTML = '';
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(slots()[0])}" alt=""><p>Every Mind you hold can get its <b>own AI</b> that farms, raids, duels and explores for you. Your AIs live on <b>Hello Minds</b>: connect your account (or make one, it takes a minute).</p></div>
      <button class="btn primary wide" data-a="connect">🧠 Connect Hello Minds</button>`;
    return;
  }
  if (!ap) { tabs.innerHTML = ''; body.innerHTML = '<p class="muted">Loading your AIs…</p>'; return; }
  tabs.innerHTML = slots().map(s => `<button class="md-tab ${s === sel ? 'on' : ''} ${running.has(s) ? 'run' : ''}" data-slot="${s}" title="${slotName(s)}"><img src="${slotPic(s)}" alt=""><span>${s === '0' ? 'Pass' : '#' + s}</span>${aiOf(s) ? '' : '<em>＋</em>'}</button>`).join('');
  const s = sel, ai = aiOf(s), l = L(s);
  if (!ai) {   // this Mind has no AI yet: the player chooses (a fresh one is the default, never made without asking)
    const free = (hmMinds || []).filter(m => !Object.values(ap.ai || {}).some(a => a.hm === m.mindId));
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(s)}" alt=""><p><b>${slotName(s)}</b> has no AI yet. Give it one, and it plays for you.</p></div>
      <button class="btn primary wide" data-a="fresh" ${busy ? 'disabled' : ''}>${busy ? 'Making it…' : '✨ New AI for this Mind'}</button>
      <small class="muted">A clean, new AI on your Hello Minds account, just for this Mind (recommended).</small>
      ${free.length ? `<label class="md-or">or use an AI you already have<select id="md-existing"><option value="">Pick one…</option>${free.map(m => `<option value="${K.esc(m.mindId)}">${K.esc(m.name || 'Mind')}</option>`).join('')}</select></label>` : ''}
      <button class="btn small" data-a="out">Disconnect Hello Minds</button>`;
    return;
  }
  const on = running.has(s), steps = ai.steps;
  body.innerHTML = `<div class="md-card"><img src="${slotPic(s)}" alt=""><div><b>${K.esc(ai.name || 'AI')}</b><small>plays ${slotName(s)} · <span id="md-cog">🧠 …</span></small>
      <small class="md-now">${K.esc(on ? (l.now || 'starting…') : steps.length ? 'resting' : 'no plan yet')}</small></div></div>
    <div class="md-row"><button class="btn ${on ? 'red' : 'primary'}" data-a="go">${on ? '⏸ Stop' : '▶ Start'}</button><button class="btn small" data-a="follow">👁 Follow</button><button class="btn small" data-a="history">📜 History</button></div>
    <div class="md-plan">${steps.length ? `<b>Plan</b> ${K.esc(planText(steps))}${ai.loop ? ' · 🔁' : ''}` : 'Pick a plan below, or ask your AI.'}</div>
    <div class="label">Plans · tap to see the steps</div>
    <div class="md-presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="md-preset ${ai.preset === k ? 'on' : ''}" data-preset="${k}"><i>${p.icon}</i>${K.esc(p.name)}</button>`).join('')}</div>
    <div class="label">Talk to ${K.esc(ai.name || 'your AI')}</div>
    <div class="md-chat" id="md-chat">${l.chat.map(c => `<div class="mp-line ${c.who}">${K.esc(c.text)}</div>`).join('') || '<div class="mp-line mind">Hi! Tell me what to play, like "farm, then raid, then duel 3 times".</div>'}</div>
    <div class="fr-add"><input id="md-in" maxlength="300" placeholder="Ask your AI…"><button class="btn small primary" data-a="send">Send</button></div>
    <div class="md-foot"><button class="btn small ${ap.gems.on ? 'gem' : ''}" data-a="gems">${ap.gems.on ? `💎 ${ap.gems.spent}/${ap.gems.cap} today` : '💎 Gems OFF'}</button><button class="btn small" data-a="unlink">Change AI</button></div>`;
  const chat = $('#md-chat'); chat.scrollTop = 1e9;
  if (ai.hm) HM.balance(ai.hm).then(c => { const el = $('#md-cog'); if (el) el.textContent = c == null ? '' : `🧠 ${Math.round(c).toLocaleString()} cognition`; });
}
const say = (slot, text, who = 'mind') => { const l = L(slot); l.chat.push({ who, text }); l.chat = l.chat.slice(-30); if (slot === sel) paint(); };
const setNow = (slot, text, kind) => { const l = L(slot); l.now = text; if (kind) l.kind = kind; if (slot === sel) { const el = $('#mdock .md-now'); if (el) el.textContent = text; } paintFollow(); };

// ---------- taps ----------
async function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'md-bubble') return setMin(false);
  if (t.id === 'md-min') return setMin(true);
  if (t.dataset.slot) { sel = t.dataset.slot; K.sfx('select'); return paint(); }
  if (t.dataset.preset) return previewPlan(PRESETS[t.dataset.preset].steps, t.dataset.preset);
  const a = t.dataset.a;
  if (a === 'connect') return HM.signIn().catch(err => K.toast(err.message, true));
  if (a === 'out') { stopAll(); await HM.signOut(); hmMinds = null; paint(); return K.toast('Hello Minds disconnected.'); }
  if (a === 'fresh') return makeFresh(sel);
  if (a === 'go') return running.has(sel) ? stop(sel, 'Stopped. Tell me when to play again!') : start(sel);
  if (a === 'send') return talk();
  if (a === 'follow') return openFollow(sel);
  if (a === 'history') return openHistory();
  if (a === 'gems') return gemsToggle();
  if (a === 'unlink') {
    if (!(await K.modal(`<h3>Change AI</h3><p>${K.esc(aiOf(sel)?.name || 'This AI')} stops playing ${slotName(sel)}. The AI stays on your Hello Minds account.</p>`, [['Change', 1, 'primary'], ['Cancel', 0]]))) return;
    stop(sel); try { ap = await K.api('autopilot', { op: 'unlink', mind: sel }); } catch (err) { K.toast(err.message, true); } paint();
  }
}
async function makeFresh(slot) {
  if (busy) return;
  const name = `Clash-${slot === '0' ? 'Pass' : slot}`;
  if (!(await K.modal(`<h3>✨ New AI for ${slotName(slot)}</h3><p>This makes a new AI Mind called <b>${name}</b> on <b>your</b> Hello Minds account, with a clean slate, just for this Mind.</p><p class="muted">When it thinks, it uses your own Hello Minds cognition.</p>`, [['Make it', 1, 'primary'], ['Cancel', 0]]))) return;
  busy = true; paint();
  try { const m = await HM.awaken(name); hmMinds = [...(hmMinds || []), m]; await link(slot, m.mindId, m.name || name); K.sfx('levelup'); say(slot, `Hi! I'm ${m.name || name}, the new AI for ${slotName(slot)}. Pick a plan and I'll play.`); }
  catch (err) { K.toast(`Hello Minds: ${err.message}`, true); }
  busy = false; paint();
}
const linkExisting = id => { const m = (hmMinds || []).find(x => x.mindId === id); if (m) link(sel, m.mindId, m.name || 'AI Mind').then(() => say(sel, `${m.name || 'I'} will play ${slotName(sel)} now.`)); };
async function link(slot, hm, name) { try { ap = await K.api('autopilot', { op: 'link', mind: slot, hm, name }); paint(); } catch (err) { K.toast(err.message, true); } }

// a plan is never started by surprise: show the steps, then Start
async function previewPlan(steps, preset = null, loop = true, from = '') {
  steps = cleanPlan(steps); if (!steps.length) return;
  const p = preset && PRESETS[preset], ai = aiOf(sel);
  const go = await K.modal(`<h3>${p ? `${p.icon} ${K.esc(p.name)}` : '📋 New plan'}</h3>${p ? `<p>${K.esc(p.desc)}</p>` : from ? `<p class="muted">${K.esc(from)}</p>` : ''}
    <ol class="md-steps">${steps.map(s => `<li><i>${STEPS[s.do].icon}</i><b>${STEPS[s.do].name}${s.n > 1 ? ` ×${s.n}` : ''}${s.min ? ` · ${s.min} min` : ''}</b><span>${STEPS[s.do].say}</span></li>`).join('')}</ol>
    <p class="muted">${loop ? '🔁 Then it starts again from the top, until you stop it.' : 'It plays this once.'} ${K.esc(ai?.name || 'Your AI')} plays ${slotName(sel)} while the lobby is open.</p>`,
    [['▶ Start this plan', 'go', 'primary'], ['Save only', 'save'], ['Cancel', 0]]);
  if (!go) return;
  try { ap = await K.api('autopilot', { op: 'save', mind: sel, steps, preset, loop }); L(sel).at = 0; K.sfx('select'); }
  catch (err) { return K.toast(err.message, true); }
  if (go === 'go') start(sel); else paint();
}

// the chat box: the player's own Hello Minds AI answers; a PLAN line in its answer is offered as a plan
async function talk() {
  const box = $('#md-in'), text = box?.value.trim(), slot = sel, ai = aiOf(slot); if (!text || !ai) return;
  box.value = ''; say(slot, text, 'me');
  if (/^\s*(stop|pause|halt)\b/i.test(text)) return stop(slot, 'Okay, I stop. 💤');
  setNow(slot, '🧠 thinking…');
  let reply = null;
  try { reply = await HM.ask(ai.hm, text); } catch (err) { setNow(slot, ''); return say(slot, `(Hello Minds: ${err.message})`); }
  setNow(slot, running.has(slot) ? L(slot).now : '');
  if (reply == null) return say(slot, '(I took too long to think. Try again.)');
  const { say: words, plan } = HM.splitReply(reply);
  if (words) say(slot, words);
  const r = parsePlan(plan || '');
  if (r.stop) return stop(slot, 'Okay, I stop. 💤');
  if (r.steps) previewPlan(r.steps, r.preset || null, r.loop, `${ai.name || 'Your AI'} suggests this plan.`);
}

// ---------- playing ----------
function start(slot) {
  if (!HM.connected()) return K.toast('Connect Hello Minds first.', true);
  if (!aiOf(slot)?.steps.length) return K.toast('Pick a plan first.', true);
  running.add(slot); keepRunning(); K.sfx('levelup');
  say(slot, 'Let\'s go! I play while the lobby is open (even in the background). Tap 👁 Follow to watch me.');
  paint(); loop();
}
function stop(slot, msg) {
  const wasDuel = L(slot).kind === 'duel';
  running.delete(slot); keepRunning();
  Object.assign(L(slot), { town: 0, rest: 0, now: '' });
  if (msg) say(slot, msg); paint(); paintFollow(); wake?.();
  if (wasDuel) K.api('autopilot', { op: 'duel_leave' }).catch(() => {});
}
const stopAll = () => [...running].forEach(s => stop(s));
const log = async (slot, text) => { try { ap = await K.api('autopilot', { op: 'log', mind: slot, text }); } catch { /* offline for a moment */ } paintFollow(); };
// one loop for all the AIs: each takes its next step in turn; Mind Town and rests run on their own clocks meanwhile
async function loop() {
  if (looping) return;
  looping = true;
  let turn = 0;
  try {
    while (running.size) {
      if (!K.idle()) { await sleep(3000); continue; }   // you are playing yourself: the AIs wait
      await townBeats();
      const now = Date.now(), ready = [...running].filter(s => L(s).town < now && L(s).rest < now);
      if (!ready.length) { await sleep(2500); continue; }
      const slot = ready[turn++ % ready.length], ai = aiOf(slot), l = L(slot);
      if (!ai?.steps.length) { running.delete(slot); continue; }
      if (!ai.loop && l.at >= ai.steps.length) { stop(slot, 'All done! ✅'); continue; }
      const s = ai.steps[l.at % ai.steps.length];
      setNow(slot, `${STEPS[s.do].icon} ${STEPS[s.do].say}…`, KIND[s.do]);
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
  const r = await K.api('autopilot', { op: 'step', do: s.do, mind: slot });
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
// one ranked duel with this Mind, card by card (a strong bot brain that sees only what a player sees)
async function duel(slot, i, n) {
  const pass = slot === '0' && K.rankPass();
  if (slot === '0' && (!pass || pass.left < 1)) { await log(slot, pass ? '🃏 the Rank Pass has no games left today' : '🃏 ranked needs a Mind or a Rank Pass: skipping duels'); return false; }
  let minds = pass ? pass.minds : [+slot];
  if (!pass && K.energyOf(+slot) <= 0) {
    const r = await K.api('autopilot', { op: 'refill', mind: +slot }).catch(() => ({ ok: false }));
    if (!r.ok) { await log(slot, '🃏 no ranked energy left: skipping duels'); return false; }
    await log(slot, `⚡ refilled with ${r.pay === 'shard' ? 'shards' : r.pay === 'dust' ? 'Dust' : 'Gems'}`); K.refresh(); minds = [+slot];
  }
  let q = await K.api('autopilot', { op: 'duel_join', mode: 'ranked', minds, ...(pass ? { pass: true } : {}) });
  const until = Date.now() + 90e3;
  while (running.has(slot) && !q.match && Date.now() < until) { setNow(slot, `🃏 duel ${i}/${n}: looking for a rival…`, 'duel'); await sleep(2500); q = await K.api('autopilot', { op: 'duel_poll' }); }
  if (!q.match) { await K.api('autopilot', { op: 'duel_leave' }).catch(() => {}); return false; }
  const id = q.match, brain = new Bot('hard', Date.now() & 0xffff);
  let v = null;
  for (let guard = 0; guard < 400; guard++) {
    v = await K.api('autopilot', { op: 'duel_view', id });
    if (v.status !== 'live' || v.view.over) break;
    L(slot).duel = { rival: v.view.rival.name, me: v.view.me.score, them: v.view.rival.score, round: v.view.round };
    setNow(slot, `🃏 dueling ${v.view.rival.name} · ${v.view.me.score}–${v.view.rival.score}`, 'duel');
    if (!v.view.me.locked && v.view.crown) { const d = brain.decide(v.view); await K.api('autopilot', { op: 'duel_act', id, card: d.card, spell: d.spell }).catch(() => {}); }
    await sleep(1800);
    if (!running.has(slot)) { await K.api('autopilot', { op: 'duel_forfeit', id }).catch(() => {}); return false; }
  }
  L(slot).duel = null;
  const won = v?.winner === v?.seat, tie = v?.winner == null;
  await log(slot, `🃏 ${tie ? 'tied' : won ? 'won' : 'lost'} vs ${v?.view.rival.name}${v?.delta ? ` (${v.delta > 0 ? '+' : ''}${v.delta} rating)` : ''}${v?.dustWon ? `, +${v.dustWon} ✨` : ''}`);
  K.babble(slot === '0' ? 49 : +slot, won ? 'happy' : 'sad', 0.6); K.refresh();
  return true;
}

// ---------- 👁 Follow: watch one Mind play, live ----------
function openFollow(slot) {
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
  const s = follow, l = L(s), ai = aiOf(s), on = running.has(s), kind = on ? l.kind : 'rest';
  const lines = (ap?.log || []).filter(x => x.mind === s).slice(0, 10);
  f.innerHTML = `<div class="mf-card px" style="--scene:url(${SCENE[kind] || SCENE.rest})">
    <div class="mf-scene"><img class="mf-mind ${on ? 'walk' : ''}" src="${slotPic(s)}" alt=""><span class="mf-where">${{ island: '🏝️ on your island', adventure: '🧭 on an adventure', duel: '🃏 in a ranked duel', town: '🏘️ in Mind Town', raid: '⚔️ raiding', rest: '💤 resting' }[kind]}</span></div>
    <div class="mf-info"><b>${K.esc(ai?.name || 'AI')} · ${slotName(s)}</b><p class="mf-now">${K.esc(on ? l.now || '…' : 'Not playing right now.')}</p>
      ${l.duel ? `<div class="mf-duel"><span>vs <b>${K.esc(l.duel.rival)}</b></span><b>${l.duel.me} – ${l.duel.them}</b><small>round ${l.duel.round || 1}</small></div>` : ''}
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
