// 🧠 AI Minds dock: floats on every screen (drag it by its title bar, make it big, or fold it into a bubble).
// Each Mind NFT the player holds gets its own AI: a fresh Mind on the player's own Hello Minds account (hellominds.js).
// AI Jobs: the player picks ONE job per AI (Ranked, Siege Cup, Farming, Clean island, Adventure, Train troops, Raid)
// and presses Start. Every round the server asks the AI for that job's details (which crop, which army, which cards…)
// and does it by the normal rules (lib/routes/autopilot.js 'work', 'duel_plan', 'duel_think'). It waits while you play.
// 👁 Follow watches it live; 📜 History has everything. Gems: OFF by default, a typed daily limit + CONFIRM.
import { JOBS, PACE, TRAINING, PLAN_MAX, cleanTraining } from './island/training.js';
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
  dragBy($('#md-head'), d);   // the folded bubble always sits in the corner: only the open window moves
  setMin(load(MIN_KEY, false)); d.classList.toggle('big', !!load(BIG_KEY, false)); place(load(POS_KEY, null));
}
// opening (or growing) the window puts it back fully on screen: it never hangs off an edge
function setMin(v) { $('#mdock').classList.toggle('min', v); save(MIN_KEY, v); if (!v) requestAnimationFrame(() => place(load(POS_KEY, null))); }
// move the dock anywhere (remembered on this device); a short tap is still a tap
function place(p) {
  const d = $('#mdock'); if (!d) return;
  if (!p) { d.style.left = d.style.top = ''; d.classList.remove('moved'); return; }
  const w = d.offsetWidth || 340, h = Math.min(d.offsetHeight || 200, innerHeight - 8);
  const x = Math.max(4, Math.min(innerWidth - w - 4, p.x)), y = Math.max(4, Math.min(innerHeight - h - 4, p.y));
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
  running = new Set([...running].filter(s => aiOf(s)?.job && HM.connected()));
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
const jobOf = s => aiOf(s)?.job || null;
function paint() {
  const tabs = $('#md-tabs'), body = $('#md-body'); if (!tabs) return;
  $('#md-count').textContent = running.size ? `${running.size} playing` : '';
  $('#mdock').classList.toggle('on', running.size > 0);
  if (K.guest()) {   // trial account: show what it is and how to get it
    tabs.innerHTML = '';
    body.innerHTML = `<div class="md-hero"><img src="${K.thumb(49)}" alt=""><p><b>Your Minds can play for you.</b> Every Mind NFT gets its own real AI (on Hello Minds). Give it a job (Ranked, Siege Cup, Farming, Cleaning, Adventure, Troops or Raids) and it plays it, thinking every move itself.</p></div>
      <ol class="md-steps"><li><i>👛</i><b>Connect your wallet</b><span>the one with your Minds</span></li><li><i>🧠</i><b>Connect Hello Minds</b><span>your AI account (free to make)</span></li><li><i>✨</i><b>Awaken an AI, pick a job, press Start</b><span>and watch it play with 👁 Follow</span></li></ol>
      <button class="btn primary wide" data-a="wallet">👛 Connect a wallet</button>`;
    return;
  }
  if (!HM.connected()) {
    tabs.innerHTML = '';
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(slots()[0])}" alt=""><p>Every Mind you hold gets its <b>own AI</b> that plays a job for you (Ranked, Siege Cup, Farming, Cleaning, Adventure, Troops or Raids), thinking every move itself. Your AIs live on <b>Hello Minds</b>: connect your account (or make one, it takes a minute).</p></div>
      <button class="btn primary wide" data-a="connect">🧠 Connect Hello Minds</button>`;
    return;
  }
  if (!ap) { tabs.innerHTML = ''; body.innerHTML = '<p class="muted">Loading your AIs…</p>'; return; }
  tabs.innerHTML = slots().map(s => `<button class="md-tab ${s === sel ? 'on' : ''} ${running.has(s) ? 'run' : ''}" data-slot="${s}" title="${slotName(s)}"><img src="${slotPic(s)}" alt=""><span>${s === '0' ? 'Pass' : '#' + s}</span>${aiOf(s) ? (jobOf(s) ? `<em class="job">${JOBS[jobOf(s).kind].icon}</em>` : '') : '<em>＋</em>'}</button>`).join('');
  const s = sel, ai = aiOf(s), l = L(s);
  if (!ai) {   // this Mind has no AI yet: a fresh one, made for this Mind only
    body.innerHTML = `<div class="md-hero"><img src="${slotPic(s)}" alt=""><p><b>${slotName(s)}</b> has no AI yet. Give it one, then give it a job.</p></div>
      <button class="btn primary wide" data-a="fresh" ${busy ? 'disabled' : ''}>${busy ? 'Waking it up…' : '✨ Awaken an AI for this Mind'}</button>
      <small class="muted">A brand-new AI on your Hello Minds account, with a clean slate, that only ever plays this Mind.</small>
      <button class="btn small" data-a="out">Disconnect Hello Minds</button>`;
    return;
  }
  const on = running.has(s), job = jobOf(s), cog = l.cog;
  const warn = cog == null || cog >= LOW_COG ? '' : `<div class="md-cogwarn ${cog <= 0 ? 'out' : ''}"><b>${cog <= 0 ? '⛔ Out of cognition' : `⚠️ Low cognition: ${Math.round(cog).toLocaleString()} left`}</b><span>${cog <= 0 ? 'This AI cannot think, so it cannot play.' : 'It stops playing when it runs out.'}</span><button class="btn small ${cog <= 0 ? 'primary' : 'gem'}" data-a="topup">➕ Add cognition</button></div>`;
  const last = ai.last?.kind === job?.kind ? ai.last : null;   // a result of another job is not shown under this one
  const status = on ? (l.now || 'starting…') : job ? (last?.text || 'ready: press ▶ Start') : 'pick a job below';
  const plan = mixing(s) ? planOf(s) : null, mix = !!plan;
  body.innerHTML = `${warn}<div class="md-card"><img src="${slotPic(s)}" alt=""><div><b>${K.esc(ai.name || 'AI')}</b><small>Hello Minds AI · plays ${slotName(s)} · <span id="md-cog" class="${cog != null && cog < LOW_COG ? 'low' : ''}">${cog == null ? '🧠 …' : cog <= 0 ? '⛔ no cognition left' : `${Math.round(cog).toLocaleString()} cognition left`}</span> <button class="md-add" data-a="topup" title="Add cognition on Hello Minds">➕</button></small></div></div>
    <div class="md-jobhead"><span class="label">${mix ? 'Plan' : 'Job'}</span><button class="btn small ${mix ? 'primary' : ''}" data-a="mix" title="Do several jobs in your order">📋 ${mix ? 'Plan ON' : 'Mix jobs'}</button></div>
    ${mix ? `<small class="muted md-mixhelp">Tap jobs in the order you want (up to ${PLAN_MAX}). Your AI stays on a job while it can, then moves to the next one, and starts again from the top.</small>` : ''}
    <div class="md-jobs">${Object.entries(JOBS).map(([k, j]) => { const n = plan ? plan.indexOf(k) + 1 : 0; return `<button class="md-job ${(mix ? n : job?.kind === k) ? 'on' : ''} ${mix && job?.kind === k && job.plan ? 'now' : ''}" data-job="${k}" title="${K.esc(j.say)}">${n ? `<em class="md-n">${n}</em>` : ''}<i>${j.icon}</i><span>${K.esc(j.name)}</span></button>`; }).join('')}</div>
    ${mix && plan.length ? `<div class="md-order">${plan.map(k => `<span class="${job?.kind === k && job.plan ? 'now' : ''}">${JOBS[k].icon} ${K.esc(JOBS[k].name)}</span>`).join('<b>→</b>')}<b>↺</b></div>` : ''}
    ${mix && plan.length === 1 ? '<small class="muted">Pick at least one more job for a plan.</small>' : ''}
    ${job ? `<div class="md-status ${on ? 'run' : ''}"><b>${JOBS[job.kind].icon} ${K.esc(JOBS[job.kind].name)}${job.plan ? ` <small>· job ${job.plan.indexOf(job.kind) + 1} of ${job.plan.length}</small>` : ''}</b><span class="md-now">${K.esc(status)}</span>${(l.think || last?.why) ? `<small class="md-think">💭 ${K.esc(l.think || last.why)}</small>` : ''}</div>
    <div class="md-row"><button class="btn ${on ? 'red' : 'primary'}" data-a="go">${on ? '⏸ Stop' : '▶ Start'}</button><button class="btn small" data-a="follow">👁 Follow</button><button class="btn small" data-a="history">📜 History</button><button class="btn small" data-a="proof" title="See that a real AI is deciding">🔍 Proof</button></div>
    ${awayBox()}
    <details class="md-set"><summary>⚙️ Settings for this job</summary>
      <label>How often <select id="md-pace">${Object.entries(PACE).map(([k, v]) => `<option value="${k}" ${job.pace === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
      <label>Your tip for the AI <input id="md-tip" maxlength="240" value="${K.esc(job.tip || '')}" placeholder="e.g. save big cards for crowns 10+"></label>
      ${job.kind === 'ranked' ? rulesBox(ai) : ''}
      <div class="md-row"><button class="btn small" data-a="saveset">Save settings</button><button class="btn small ${ap.gems.on ? 'gem' : ''}" data-a="gems">${ap.gems.on ? `💎 Gems ON · ${ap.gems.spent}/${ap.gems.cap} today` : '💎 Gems OFF'}</button></div>
      <small class="muted">Gems are only used if you turn them ON with a daily limit (Siege Cup entries, tickets, energy, and Gem upgrades).</small>
    </details>` : '<p class="muted md-pick">Tap a job: your AI plays it for you and decides every move itself.</p>'}
    <details class="md-coach" ${l.coach ? 'open' : ''}><summary>💬 Talk to ${K.esc(ai.name || 'your AI')} (optional)</summary>
      <div class="md-chat" id="md-chat">${(l.chat || []).map(c => `<div class="mp-line ${c.who}">${K.esc(c.text)}</div>`).join('') || `<div class="mp-line mind">${l.chat ? 'Hi! Ask me anything, or give me a tip for my job.' : 'Loading our chat…'}</div>`}${l.typing ? `<div class="mp-line mind typing">${K.esc(ai.name || 'Your AI')} is thinking<i>.</i><i>.</i><i>.</i></div>` : ''}</div>
      <div class="fr-add"><input id="md-in" maxlength="300" placeholder="Talk to your AI…"><button class="btn small primary" data-a="send">Send</button></div>
    </details>`;
  const chat = $('#md-chat'); if (chat) chat.scrollTop = 1e9;
  if (ai.hm && Date.now() - l.cogAt > COG_EVERY) checkCog(s).then(c => { if (c != null && s === sel && Math.round(c) !== Math.round(cog ?? -1)) paint(); });
}
const say = (slot, text, who = 'mind') => { const l = L(slot); (l.chat ||= []).push({ who, text }); l.chat = l.chat.slice(-200); if (slot === sel) paint(); };
const setNow = (slot, text, kind) => { const l = L(slot); l.now = text; if (kind && kind !== l.kind) { l.kind = kind; followTo(slot); } else if (kind) l.kind = kind; if (slot === sel) { const el = $('#mdock .md-now'); if (el) el.textContent = text; } paintFollow(); };
const think = (slot, why) => { if (!why) return; L(slot).think = why; paintFollow(); if (slot === sel) { const el = $('#mdock .md-think'); if (el) el.textContent = `💭 ${why}`; } };

// ---------- taps ----------
async function onClick(e) {
  const t = e.target.closest('button'); if (!t || $('#mdock').dataset.dragged) return;
  if (t.id === 'md-bubble') return setMin(false);
  if (t.id === 'md-min') return setMin(true);
  if (t.id === 'md-big') { const b = !$('#mdock').classList.contains('big'); $('#mdock').classList.toggle('big', b); save(BIG_KEY, b); return requestAnimationFrame(() => place(load(POS_KEY, null))); }
  if (t.dataset.slot) { sel = t.dataset.slot; K.sfx('select'); paint(); return loadChat(sel); }
  if (t.dataset.job) return mixing(sel) ? planToggle(t.dataset.job) : pickJob(t.dataset.job);
  const a = t.dataset.a;
  if (a === 'connect') return HM.signIn().catch(err => K.toast(err.message, true));
  if (a === 'wallet') return K.connectWallet?.();
  if (a === 'out') { stopAll(); await HM.signOut(); paint(); return K.toast('Hello Minds disconnected.'); }
  if (a === 'fresh') return makeFresh(sel);
  if (a === 'go') return running.has(sel) ? stop(sel, 'Stopped. Tell me when to play again!') : start(sel);
  if (a === 'send') { L(sel).coach = true; return talk(); }
  if (a === 'follow') return openFollow(sel);
  if (a === 'history') return openHistory();
  if (a === 'proof') return openProof(sel);
  if (a === 'mix') return mixToggle();
  if (a === 'gems') return gemsToggle();
  if (a === 'topup') return topUp();
  if (a === 'away') return awayToggle();
  if (a === 'rules') return saveRules();
  if (a === 'airules') return aiRules();
  if (a === 'saveset') return saveJob(jobOf(sel)?.kind, { pace: $('#md-pace')?.value, tip: $('#md-tip')?.value }).then(() => K.toast('Saved.'));
}
async function saveJob(kind, extra = {}) {
  const j = jobOf(sel) || {};
  try { ap = await K.api('autopilot', { op: 'job', mind: sel, kind, pace: extra.pace ?? j.pace, tip: extra.tip ?? j.tip, plan: 'plan' in extra ? extra.plan : j.plan }); } catch (err) { K.toast(err.message, true); }
  paint();
}
// a new job starts with a clean status: nothing of the old job's result or reason is shown under it
const freshStatus = slot => Object.assign(L(slot), { result: '', think: '', now: '', wait: 0, long: 0 });
// 📋 plans: several jobs in the player's order (a draft of one job stays in this browser until a second is picked)
const draft = {};
const mixing = s => !!jobOf(s)?.plan || !!draft[s];
const planOf = s => jobOf(s)?.plan || draft[s] || [];
async function mixToggle() {
  K.sfx('select');
  const s = sel, j = jobOf(s);
  if (mixing(s)) { delete draft[s]; if (j?.plan) await saveJob(j.kind, { plan: [] }); return paint(); }
  draft[s] = j ? [j.kind] : []; paint();
}
async function planToggle(kind) {
  K.sfx('select');
  const s = sel, now = planOf(s);
  const plan = now.includes(kind) ? now.filter(k => k !== kind) : [...now, kind].slice(0, PLAN_MAX);
  if (kind === 'cup' && !now.includes(kind) && !ap?.gems?.on) K.toast('The Siege Cup costs 5 💎 an entry: turn 💎 Gems ON in ⚙️ Settings so your AI can enter.');
  if (plan.length < 2) { draft[s] = plan; if (jobOf(s)?.plan) await saveJob(plan[0] || jobOf(s).kind, { plan: [] }); return paint(); }
  delete draft[s];
  const cur = jobOf(s)?.kind, keep = plan.includes(cur) ? cur : plan[0];
  if (keep !== cur) freshStatus(s);
  await saveJob(keep, { plan });
  if (running.has(s) && keep !== cur) { Object.assign(L(s), { round: (L(s).round || 0) + 1 }); wake?.(); }
}
// a job is picked with one tap; a running AI switches to it at once
async function pickJob(kind) {
  K.sfx('select');
  if (kind === 'cup' && !ap?.gems?.on) K.toast('The Siege Cup costs 5 💎 an entry: turn 💎 Gems ON in ⚙️ Settings so your AI can enter.');
  if (jobOf(sel)?.kind !== kind) freshStatus(sel);
  await saveJob(kind, { plan: [] });
  Object.assign(L(sel), { round: (L(sel).round || 0) + 1, wait: 0 }); wake?.();
  if (running.has(sel)) say(sel, `${JOBS[kind].icon} Switching to ${JOBS[kind].name} now.`);
}
async function makeFresh(slot) {
  if (busy) return;
  const name = `Clash-${slot === '0' ? 'Pass' : slot}`;
  if (!(await K.modal(`<h3>✨ Awaken an AI for ${slotName(slot)}</h3><p>This makes a brand-new AI Mind called <b>${name}</b> on <b>your</b> Hello Minds account. It starts with a clean slate and only ever plays ${slotName(slot)}.</p><p class="muted">It thinks every move itself, using your own Hello Minds cognition.</p>`, [['Awaken it', 1, 'primary'], ['Cancel', 0]]))) return;
  busy = true; paint();
  try {
    const m = await HM.awaken(name);
    ap = await K.api('autopilot', { op: 'link', mind: slot, hm: m.mindId, name: m.name || name, token: await HM.token() });
    L(slot).chat = []; K.sfx('levelup'); say(slot, `Hi! I'm ${m.name || name}, the AI for ${slotName(slot)}. Give me a job and press Start.`);
  } catch (err) { K.toast(`Hello Minds: ${err.message}`, true); }
  busy = false; paint();
}

// 🃏 duel rules: the pre-set moves for Ranked (the AI writes them, the player may change any of them)
function rulesBox(ai) {
  const r = cleanTraining({ duel: ai.duelPlan || {} }).duel;
  return `<div class="md-rules"><b>🃏 Duel rules</b> <small class="muted">${ai.duelPlan ? 'written by your AI, change any you like' : 'your AI has not written them yet'}</small>
    ${Object.entries(TRAINING.duel).filter(([k]) => k !== 'label').map(([k, o]) => `<label>${K.esc(o.label)}<select data-rule="${k}">${Object.entries(o.opts).map(([v, n]) => `<option value="${v}" ${r[k] === v ? 'selected' : ''}>${K.esc(n)}</option>`).join('')}</select></label>`).join('')}
    <div class="md-row"><button class="btn small primary" data-a="rules">Save duel rules</button><button class="btn small" data-a="airules">✨ Let my AI write them</button></div></div>`;
}
async function saveRules() {
  const rules = Object.fromEntries([...document.querySelectorAll('#mdock [data-rule]')].map(e => [e.dataset.rule, e.value]));
  try { ap = await K.api('autopilot', { op: 'rules', mind: sel, rules }); K.toast('Duel rules saved: your AI plays them on every pre-set move.'); } catch (err) { K.toast(err.message, true); }
  paint();
}
async function aiRules() {
  K.toast('Asking your AI for its duel rules (it can take a minute)…');
  let sp = {};
  for (let n = 0; n < 18; n++) { sp = await K.api('autopilot', { op: 'duel_plan', mind: sel, token: await HM.token() }).catch(() => ({})); if (!sp.pending) break; }
  if (sp.plan) { ap.ai[sel] = { ...ap.ai[sel], duelPlan: sp.plan }; K.toast('Your AI wrote its duel rules.'); } else K.toast('No answer in time: try again.', true);
  paint();
}
// 🌙 away play: the server keeps doing the jobs with the game closed (up to 90 days)
function awayBox() {
  const w = ap?.away;
  if (w?.on) return `<div class="md-away on"><b>🌙 Playing while you're away</b><span>until ${new Date(w.until).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${w.rounds || 0} rounds so far</span><button class="btn small" data-a="away">Turn off</button></div>`;
  return `<div class="md-away"><b>🌙 Keep playing while I'm away</b><span>Your AIs keep doing their jobs with the game closed, for up to 90 days (Ranked too, with their pre-set duel rules).</span><button class="btn small primary" data-a="away">Turn on</button></div>`;
}
let awayDays = '7';
document.addEventListener('change', e => { if (e.target.id === 'md-away-days') awayDays = e.target.value; });
async function awayToggle() {
  if (ap?.away?.on) { try { ap = await K.api('autopilot', { op: 'away_off' }); K.toast('Away play is off.'); } catch (err) { K.toast(err.message, true); } return paint(); }
  const jobs = slots().filter(s => jobOf(s));
  if (!jobs.length) return K.toast('Give your AI a job first.', true);
  awayDays = '7';
  const go = await K.modal(`<h3>🌙 Keep playing while I'm away</h3><p>${jobs.map(s => `<b>${K.esc(aiOf(s).name || 'AI')}</b>: ${JOBS[jobOf(s).kind].icon} ${K.esc(JOBS[jobOf(s).kind].name)}`).join('<br>')}</p>
    <p>The game server keeps asking your AIs and doing their jobs, even with the game closed. For how long?</p><select id="md-away-days" style="width:100%">${[1, 3, 7, 14, 30, 60, 90].map(n => `<option value="${n}" ${n === 7 ? 'selected' : ''}>${n} day${n > 1 ? 's' : ''}</option>`).join('')}</select>
    <p class="muted">You sign in to Hello Minds once more: that sign-in is only for the game server, locked away, and forgotten when you turn this off. It uses your AIs' cognition and stops when it runs out; Gems only within your daily limit. Ranked plays with each AI's pre-set duel rules (⚙️ Settings → Duel rules). You get a short letter each day.</p>`, [['🌙 Sign in and start', 1, 'primary'], ['Cancel', 0]]);
  if (go) HM.awaySignIn(+awayDays).catch(err => K.toast(err.message, true));
}
// what the AI is told about the game right now, with every chat message
function gameState(slot) {
  const st = K.island?.() || null, ai = aiOf(slot), job = jobOf(slot), lines = (ap?.log || []).filter(x => x.mind === slot).slice(0, 5).map(x => x.text);
  const head = `Your job: ${job ? JOBS[job.kind].name : 'none yet'} (${running.has(slot) ? 'playing now' : 'not playing'}). Lately: ${lines.join(' | ') || 'nothing yet'}.`;
  if (!st) return head;
  const th = (st.b || []).find(b => b.type === 'home')?.lv || 1;
  return `Town Hall Lv${th}. ${(st.dust || 0).toLocaleString()} Dust, ${st.gems || 0} Gems (Gem spending ${ap?.gems?.on ? `ON, ${Math.max(0, ap.gems.cap - ap.gems.spent)} left today` : 'OFF'}). ${head}`;
}
// the coach chat: the player's own Hello Minds AI answers (the job is picked with the buttons, not here)
async function talk() {
  const box = $('#md-in'), text = box?.value.trim(), slot = sel, ai = aiOf(slot); if (!text || !ai) return;
  box.value = ''; say(slot, text, 'me');
  L(slot).typing = true; paint();
  let reply = null;
  try { reply = await HM.ask(ai.hm, text, gameState(slot), 120e3); }
  catch (err) { L(slot).typing = false; if (noCog(err.message)) { outOfCog(slot); return say(slot, '⛔ I am out of cognition, so I cannot think. Tap ➕ Add cognition.'); } return say(slot, `(Hello Minds: ${err.message})`); }
  L(slot).typing = false;
  if (reply == null) return say(slot, '(I did not answer within 2 minutes. Hello Minds may be busy: try again.)');
  say(slot, HM.splitReply(reply).say || reply);
  // the player named a job in the chat: offer it (one tap)
  const named = Object.entries(JOBS).find(([k, j]) => new RegExp(`\\b(${j.name.split(' ')[0]}|${k})`, 'i').test(text));
  if (named && named[0] !== jobOf(slot)?.kind && (await K.modal(`<h3>${named[1].icon} Switch to ${K.esc(named[1].name)}?</h3><p>${K.esc(ai.name || 'Your AI')} ${K.esc(named[1].say)}.</p>`, [['Switch job', 1, 'primary'], ['Not now', 0]]))) pickJob(named[0]);
}

// ---------- playing: one job, round after round; the AI decides every round itself ----------
function start(slot) {
  if (!HM.connected()) return K.toast('Connect Hello Minds first.', true);
  if (!jobOf(slot)) return K.toast('Pick a job first.', true);
  return checkCog(slot, true).then(cog => {
    if (cog != null && cog <= 0) { paint(); return K.modal(`<h3>⛔ ${K.esc(aiOf(slot).name || 'Your AI')} is out of cognition</h3><p>Your AI thinks with cognition from your Hello Minds account. With none left it cannot play.</p>`, [['➕ Add cognition', 1, 'primary'], ['Not now', 0]]).then(go => go && topUp()); }
    running.add(slot); keepRunning(); K.sfx('levelup');
    Object.assign(L(slot), { wait: 0 });
    say(slot, `${JOBS[jobOf(slot).kind].icon} Starting ${JOBS[jobOf(slot).kind].name}. I think about every move myself while the game is open. Tap 👁 Follow to watch me.`);
    paint(); loop();
  });
}
function stop(slot, msg) {
  const wasDuel = L(slot).kind === 'duel';
  if (follow === slot && K.watching?.()) K.stopWatch();
  running.delete(slot); keepRunning();
  Object.assign(L(slot), { wait: 0, now: '', duel: null });
  if (msg) say(slot, msg); paint(); paintFollow(); wake?.();
  if (wasDuel) K.api('autopilot', { op: 'duel_leave' }).catch(() => {});
}
const stopAll = () => [...running].forEach(s => stop(s));
const log = async (slot, text) => { try { ap = await K.api('autopilot', { op: 'log', mind: slot, text }); } catch { /* offline for a moment */ } paintFollow(); };
const KIND_OF = { ranked: 'duel', cup: 'raid', farm: 'island', clean: 'island', adventure: 'adventure', train: 'island', raid: 'raid' };
// one loop for all the AIs: each does a round of its job in turn; between rounds it waits by its pace (or 2 min if nothing was to do)
async function loop() {
  if (looping) return;
  looping = true;
  let turn = 0;
  try {
    while (running.size) {
      if (!K.idle()) { await sleep(3000); continue; }   // you are playing yourself: the AIs wait
      for (const s of [...running]) await checkCog(s);   // no cognition = it stops
      const now = Date.now(), ready = [...running].filter(s => (L(s).wait || 0) < now);
      if (!ready.length) { const next = Math.min(...[...running].map(s => L(s).wait || 0)); for (const s of running) if (L(s).wait > now) setNow(s, `${L(s).result ? `${L(s).result} · ` : ''}⏳ next round in ${Math.max(1, Math.round((L(s).wait - now) / 60e3))} min`, 'rest'); await sleep(Math.min(15e3, Math.max(1500, next - now))); continue; }
      const slot = ready[turn++ % ready.length], job = jobOf(slot), l = L(slot);
      if (!job) { running.delete(slot); continue; }
      setNow(slot, `${JOBS[job.kind].icon} ${JOBS[job.kind].say}…`, KIND_OF[job.kind]); l.acts = ACT_ICON[{ ranked: 'duel', cup: 'raid', farm: 'farm', clean: 'farm', adventure: 'adventure', train: 'train', raid: 'raid' }[job.kind]] || [];
      let did = false;
      try { did = job.kind === 'ranked' ? await duel(slot, 1, 1) : await work(slot, job); } catch (e) { await log(slot, `${JOBS[job.kind].icon} ${e.message || 'that did not work'}`); }
      const gap = did ? PACE[job.pace]?.gap || 60e3 : 120e3;
      l.wait = Math.max(Date.now() + gap, l.long || 0);   // no energy / cup done: a long wait instead of trying every minute
      if (job.plan && running.has(slot) && jobOf(slot)?.kind === job.kind) {   // 📋 a plan: nothing done = on to the next job now
        const r = await K.api('autopilot', { op: 'advance', mind: slot, did }).catch(() => null);
        if (r?.ai) { ap = { ...ap, ai: r.ai, log: r.log || ap.log }; if (!did && !r.lap) { freshStatus(slot); l.wait = Date.now() + 2000; } else if (!did) l.wait = Math.max(l.wait, Date.now() + 15 * 60e3); }
      }
      l.long = 0;
      l.round = (l.round || 0) + 1;
      K.refresh(); paint();
      await sleep(800);
    }
  } finally { looping = false; }
}
// one round of a job (not Ranked): short calls until the AI has decided and the server has done it
async function work(slot, job) {
  const l = L(slot);
  let r = null;
  for (let n = 0; n < 15 && running.has(slot); n++) {
    if (jobOf(slot)?.kind !== job.kind) return false;   // the player picked another job: this round ends here
    r = await K.api('autopilot', { op: 'work', mind: slot, kind: job.kind, round: l.round || 0, token: await HM.token() }).catch(e => ({ error: e }));
    if (r.switched) return false;
    if (r.error) { if (r.error.status === 401 || r.error.status === 403) stop(slot, `⚠️ ${r.error.message}`); else await log(slot, `${JOBS[job.kind].icon} ${r.error.message}`); return false; }
    if (r.cog != null) { l.cog = r.cog; l.cogAt = Date.now(); paintCog(); }
    if (r.out) { outOfCog(slot); return false; }
    if (!r.pending) break;
    setNow(slot, `🧠 deciding: ${JOBS[job.kind].name}… ${Math.round((r.waited || 0) / 1000)} s`);
  }
  if (!r || r.pending) return false;
  await missed(slot, r.ai);
  if (r.log) ap = { ...ap, log: r.log, gems: r.gems || ap.gems, ai: r.ai && typeof r.ai === 'object' ? r.ai : ap.ai };
  if (r.wait) l.long = Date.now() + r.wait;   // e.g. the Siege Cup is done for today
  l.result = r.text; setNow(slot, r.text); if (r.why) think(slot, r.why);
  K.babble(slot === '0' ? 49 : +slot, r.ok ? 'happy' : 'sad', 0.5);
  return !!r.did;
}
// one ranked duel with this Mind: every card and spell is the AI's own choice
async function duel(slot, i, n) {
  const ai = aiOf(slot), train = cleanTraining(ai?.train), pass = slot === '0' && K.rankPass();
  if (slot === '0' && (!pass || pass.left < 1)) { await log(slot, pass ? '🃏 the Rank Pass has no games left today' : '🃏 ranked needs a Mind or a Rank Pass: skipping duels'); return false; }
  let minds = pass ? pass.minds : [+slot];
  if (!pass && K.energyOf(+slot) <= 0) {
    if (train.energy.refill === 'stop') { await log(slot, '🃏 out of ranked energy (training: stop dueling)'); return false; }
    const r = await K.api('autopilot', { op: 'refill', mind: +slot, only: train.energy.refill }).catch(() => ({ ok: false }));
    if (!r.ok) { await log(slot, r.max ? '🃏 no energy and no refills left today: I wait 30 minutes, then look again' : '🃏 no ranked energy left (no shards, Dust or allowed Gems): I wait 30 minutes'); L(slot).long = Date.now() + 30 * 60e3; return false; }
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
  L(slot).result = ap?.log?.[0]?.text || '';
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
// ---------- 🔍 Proof: a real AI decides, not a game bot ----------
// Two sources side by side: the same conversation read straight from Hello Minds by this browser (with the player's own
// Hello Minds sign-in, not through our server), and what the game server did with each answer.
async function openProof(slot) {
  const ai = aiOf(slot); if (!ai) return;
  K.toast("Reading your AI's conversation from Hello Minds…");
  try { ap = await K.api('autopilot', { op: 'get' }); } catch { /* show what we have */ }
  const mine = aiOf(slot)?.proof || [], hm = await HM.playHistory(ai.hm, 30).catch(() => null);
  const t = x => new Date(x).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const short = (x, n = 260) => K.esc(String(x || '').slice(0, n)) + (String(x || '').length > n ? '…' : '');
  const said = (hm || []).filter(r => r.who === 'mind').slice(0, 8);
  await K.modal(`<h3>🔍 Is it really ${K.esc(ai.name || 'my AI')}?</h3>
    <p>Every move is a question sent to <b>your own AI on Hello Minds</b> (AI id <code>${K.esc(String(ai.hm).slice(0, 8))}…</code>), and it answers in its own words. Each answer uses your Hello Minds cognition, so you can also watch your cognition go down while it plays.</p>
    <div class="md-proof"><h4>📡 Straight from Hello Minds <small class="muted">read now by your browser, not by our game server</small></h4>
    ${hm == null ? '<p class="muted">Could not reach Hello Minds right now. Try again in a moment.</p>' : said.length ? `<ol>${said.map(r => `<li><time>${t(r.at)}</time><b>${K.esc(ai.name || 'AI')}:</b> ${short(r.text)}</li>`).join('')}</ol>` : '<p class="muted">No game answers yet: press ▶ Start and come back after a round.</p>'}
    <h4>🎮 What the game did with each answer</h4>
    ${mine.length ? `<ol>${mine.slice(0, 8).map(x => `<li><time>${t(x.at)}</time>${JOBS[x.kind]?.icon || '🧠'} <i>answered in ${x.ms == null ? '?' : Math.round(x.ms / 1000)} s</i><br><b>Its answer:</b> ${short(x.answer)}</li>`).join('')}</ol>` : '<p class="muted">Nothing yet.</p>'}
    </div><p class="muted">The answers in both lists match. In the Hello Minds app, the conversation of ${K.esc(ai.name || 'your AI')} called <b>mindsclash-play</b> has every game question and answer.</p>`, [['Close', 0, 'primary']]);
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
