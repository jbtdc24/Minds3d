// Mind Autopilot panel (lobby, right side): pick a preset or tell your Mind what to do, press Start, and it plays for
// you while the game is open: farming, adventures, raids, ranked duels, Mind Town. It plays through /api/autopilot,
// so every rule a human has applies. It pauses while you play something yourself, and stops with one tap.
// Gems: OFF by default; turning them on takes two warnings, a daily limit and typing CONFIRM.
import { PRESETS, STEPS, parsePlan, planText, cleanPlan } from './island/autoplay.js';
import { Bot } from './duel/bot.js';

let K = null, ap = null, running = false, stepAt = 0, wake = null, lastDuelMind = 0;
const $ = s => document.querySelector(s);
const RUN_KEY = 'mc_autopilot_on';
const sleep = ms => new Promise(res => { const t = setTimeout(res, ms); wake = () => { clearTimeout(t); res(); }; });
const say = (text, who = 'mind') => {
  const box = $('#mp-chat'); if (!box) return;
  const el = document.createElement('div'); el.className = `mp-line ${who}`; el.innerHTML = K.esc(text);
  box.append(el); while (box.children.length > 30) box.firstChild.remove(); box.scrollTop = 1e9;
};

export function initAutopilot(ctx) {
  K = ctx;
  $('#mp-presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button class="mp-preset" data-preset="${k}" title="${K.esc(p.desc)}"><i>${p.icon}</i><span>${K.esc(p.name)}</span></button>`).join('');
  $('#mp-presets').onclick = e => { const k = e.target.closest('[data-preset]')?.dataset.preset; if (k) choose(PRESETS[k].steps, k); };
  $('#mp-go').onclick = () => (running ? stop('Stopped. Tell me when to play again!') : start());
  $('#mp-send').onclick = talk;
  $('#mp-in').addEventListener('keydown', e => { if (e.key === 'Enter') talk(); });
  $('#mp-gems').onclick = gemsToggle;
  $('#mp-fold').onclick = () => { $('#mindp').classList.toggle('folded'); try { localStorage.setItem('mc_mp_fold', $('#mindp').classList.contains('folded') ? '1' : ''); } catch { /* private mode */ } };
  try { if (localStorage.getItem('mc_mp_fold')) $('#mindp').classList.add('folded'); } catch { /* private mode */ }
}
// the lobby opened: load the saved plan and carry on if it was running
export async function openAutopilot() {
  const box = $('#mindp'); if (!box) return;
  const can = K.online() && !K.guest();
  box.classList.toggle('locked', !can);
  $('#mp-name').textContent = K.mindName();
  $('#mp-pfp').src = K.pfp();
  if (!can) { $('#mp-plan').textContent = K.online() ? 'Connect a wallet and your Mind can play for you.' : 'Autopilot needs the game server.'; return; }
  if (!ap) {
    try { ap = await K.api('autopilot', { op: 'get' }); } catch { ap = null; }
    if (ap && !$('#mp-chat').children.length) say(ap.steps.length ? `Hi! My plan: ${planText(ap.steps)}. Press ▶ Start and I play for you.` : 'Hi! Pick a plan below, or tell me what to do, like "farm, then raid, then town for 1 hour".');
  }
  paint();
  let wasOn = false; try { wasOn = localStorage.getItem(RUN_KEY) === '1'; } catch { /* private mode */ }
  if (wasOn && !running && ap?.steps.length) start(true);
}
function paint() {
  if (!ap) return;
  $('#mp-plan').textContent = ap.steps.length ? planText(ap.steps) : 'No plan yet: pick one below.';
  document.querySelectorAll('.mp-preset').forEach(b => b.classList.toggle('on', b.dataset.preset === ap.preset));
  $('#mp-go').textContent = running ? '⏸ Stop' : '▶ Start';
  $('#mp-go').classList.toggle('red', running); $('#mindp').classList.toggle('running', running);
  $('#mp-gems').textContent = ap.gems.on ? `💎 Gems ON · ${ap.gems.spent}/${ap.gems.cap} today` : '💎 Gems OFF';
  $('#mp-gems').classList.toggle('gem', ap.gems.on);
  $('#mp-log').innerHTML = ap.log.slice(0, 8).map(l => `<li><time>${new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>${K.esc(l.text)}</li>`).join('') || '<li class="muted">What your Mind does shows here.</li>';
}
async function choose(steps, preset = null, loop = true) {
  try { ap = await K.api('autopilot', { op: 'save', steps: cleanPlan(steps), preset, loop }); K.sfx('select'); paint(); say(`Okay! ${preset ? PRESETS[preset].name + ': ' : ''}${planText(ap.steps)}.${running ? ' I switch to it now.' : ' Press ▶ Start.'}`); stepAt = 0; }
  catch (e) { K.toast(e.message, true); }
}
// the chat box: a message becomes a plan (real Minds AI talk plugs in here once Minds Connect is set up)
async function talk() {
  const box = $('#mp-in'), text = box.value.trim(); if (!text) return;
  box.value = ''; say(text, 'me');
  const r = parsePlan(text);
  K.babble(K.mindId(), r.talk ? 'chat' : 'happy');
  if (r.stop) return stop('Okay, I stop. 💤');
  if (r.steps) return choose(r.steps, r.preset || null, r.loop);
  if (/\b(status|doing|what|how)\b/i.test(text)) return say(running ? `I'm playing: ${planText(ap.steps)}. Step ${stepAt + 1} of ${ap.steps.length}.` : 'I\'m resting. Press ▶ Start and I play for you!');
  say('Hmm? Tell me what to do: farm, sell, raid, adventure, duel 3 times, town for 1 hour, decorate… Say "then" between steps.');
}
function start(resume) {
  if (!ap?.steps.length) return K.toast('Pick a plan first.', true);
  running = true; try { localStorage.setItem(RUN_KEY, '1'); } catch { /* private mode */ }
  paint(); if (!resume) { K.sfx('levelup'); say('Let\'s go! I\'ll play while the game is open. Leave the lobby open (even in the background).'); }
  loop();
}
function stop(msg) {
  running = false; try { localStorage.removeItem(RUN_KEY); } catch { /* private mode */ }
  wake?.(); paint(); if (msg) say(msg);
  K.api('autopilot', { op: 'duel_leave' }).catch(() => {});
}
const log = async text => { try { ap = await K.api('autopilot', { op: 'log', text }); paint(); } catch { /* offline for a moment */ } };
async function loop() {
  while (running) {
    if (!K.idle()) { await sleep(3000); continue; }   // you are playing yourself: the Mind waits
    const s = ap.steps[stepAt % ap.steps.length];
    if (!ap.loop && stepAt >= ap.steps.length) { stop('All done! ✅'); break; }
    $('#mp-now').textContent = `${STEPS[s.do].icon} ${STEPS[s.do].say}…`;
    try { await run(s); } catch (e) { await log(`${STEPS[s.do].icon} ${e.message || 'that did not work'}`); }
    stepAt++;
    $('#mp-now').textContent = '';
    if (running) { K.refresh(); await sleep(1500); }
  }
}
async function run(s) {
  if (s.do === 'wait') { await log(`💤 resting ${s.min} min`); return sleep(s.min * 60e3); }
  if (s.do === 'town') return town(s.min);
  if (s.do === 'duel') { for (let i = 0; i < s.n && running; i++) if (!(await duel())) break; return; }
  const r = await K.api('autopilot', { op: 'step', do: s.do });
  ap = r; paint(); K.babble(K.mindId(), r.ok ? 'happy' : 'sad', 0.5);
}
// Mind Town for a while: walk around (standing still earns nothing) and collect the Town Time rewards
async function town(min) {
  await log(`🏘️ off to Mind Town for ${min} min`);
  const end = Date.now() + min * 60e3, mind = K.mindId();
  let x = 1200, y = 900, got = 0;
  while (running && Date.now() < end && K.idle()) {
    x = Math.max(900, Math.min(1500, x + (Math.random() - 0.5) * 120)); y = Math.max(700, Math.min(1100, y + (Math.random() - 0.5) * 120));
    try { const r = await K.api('town', { x: x | 0, y: y | 0, mind }); if (r.got?.dust) { got += r.got.dust; $('#mp-now').textContent = `🏘️ in Mind Town · +${got} ✨ so far`; } } catch { /* try again next beat */ }
    await sleep(12000);
  }
  await log(`🏘️ back from Mind Town${got ? `: +${got} ✨` : ''}`);
}
// one ranked duel, played card by card by the Mind (a strong bot brain that sees only what a player sees)
async function duel() {
  const ready = K.myMinds().filter(id => K.energyOf(id) > 0);
  let minds = ready.slice(0, 3);
  if (!minds.length) {
    const id = K.myMinds()[lastDuelMind++ % Math.max(1, K.myMinds().length)];
    const r = await K.api('autopilot', { op: 'refill', mind: id }).catch(() => ({ ok: false }));
    if (!r.ok) { await log('🃏 no ranked energy left: skipping duels'); return false; }
    await log(`⚡ refilled Mind #${id} with ${r.pay === 'shard' ? 'shards' : r.pay === 'dust' ? 'Dust' : 'Gems'}`); K.refresh(); minds = [id];
  }
  let q = await K.api('autopilot', { op: 'duel_join', mode: 'ranked', minds });
  const until = Date.now() + 90e3;
  while (running && !q.match && Date.now() < until) { $('#mp-now').textContent = '🃏 looking for a rival…'; await sleep(2500); q = await K.api('autopilot', { op: 'duel_poll' }); }
  if (!q.match) { await K.api('autopilot', { op: 'duel_leave' }).catch(() => {}); return false; }
  const id = q.match, brain = new Bot('hard', Date.now() & 0xffff);
  let v = null;
  for (let guard = 0; guard < 400; guard++) {
    v = await K.api('autopilot', { op: 'duel_view', id });
    if (v.status !== 'live' || v.view.over) break;
    $('#mp-now').textContent = `🃏 dueling ${v.view.rival.name} · ${v.view.me.score}–${v.view.rival.score}`;
    if (!v.view.me.locked && v.view.crown) { const d = brain.decide(v.view); await K.api('autopilot', { op: 'duel_act', id, card: d.card, spell: d.spell }).catch(() => {}); }
    await sleep(1800);
    if (!running) { await K.api('autopilot', { op: 'duel_forfeit', id }).catch(() => {}); return false; }
  }
  const won = v?.winner === v?.seat, tie = v?.winner == null;
  await log(`🃏 ${tie ? 'tied' : won ? 'won' : 'lost'} vs ${v?.view.rival.name}${v?.delta ? ` (${v.delta > 0 ? '+' : ''}${v.delta})` : ''}${v?.dustWon ? `, +${v.dustWon} ✨` : ''}`);
  K.babble(K.mindId(), won ? 'happy' : 'sad', 0.6); K.refresh();
  return true;
}
// Gems: layer 1 warning, layer 2 warning + daily limit, layer 3 type CONFIRM; the server checks the limit on every spend
async function gemsToggle() {
  if (!ap) return;
  if (ap.gems.on) { ap = await K.api('autopilot', { op: 'gems', on: false }); paint(); return K.toast('Your Mind can no longer spend Gems.'); }
  if (!(await K.modal('<h3>💎 Let your Mind spend Gems?</h3><p>Gems can be bought with real money. If you say yes, your Mind may use them for <b>Raid Tickets, Adventure Tickets and ranked energy</b> when it runs out.</p><p class="muted">It never buys Gems, never sends them to anyone and never buys looks.</p>', [['Continue', 1, 'primary'], ['No, keep it off', 0]]))) return;
  const cap = await K.modal('<h3>💎 Daily limit</h3><p>The most your Mind may spend in one day:</p>', [['3 💎', 3], ['10 💎', 10], ['25 💎', 25], ['Cancel', 0, 'primary']]);
  if (!cap) return;
  const go = await K.modal(`<h3>⚠️ Last check</h3><p>Your Mind may spend up to <b>${cap} 💎 a day</b>. You can turn it off any time with one tap. Type <b>CONFIRM</b> to allow it.</p><input id="mp-confirm" maxlength="10" placeholder="CONFIRM" autocomplete="off" style="width:100%">`, [['Allow', 1, 'gem'], ['Cancel', 0, 'primary']]);
  const word = go ? (confirmDraft || '').trim() : '';
  confirmDraft = '';
  if (!go) return;
  if (word !== 'CONFIRM') return K.toast('Not allowed: you did not type CONFIRM.', true);
  try { ap = await K.api('autopilot', { op: 'gems', on: true, cap, confirm: word }); paint(); K.toast(`Your Mind may spend up to ${cap} 💎 a day.`); } catch (e) { K.toast(e.message, true); }
}
let confirmDraft = '';
document.addEventListener('input', e => { if (e.target.id === 'mp-confirm') confirmDraft = e.target.value; });
export const autopilotRunning = () => running;
