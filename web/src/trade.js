// 🤝 Trading in Mind Town (tap another player's Mind → Trade) and 🎁 gifts to friends.
// The server does the real checks (lib/routes/trade.js): both must agree to the same version of both offers,
// any change clears the agreements, and the goods move exactly once. This screen only shows it and asks.
// ⚔️ Stake duels use the same screen: both put stakes in and agree, then the duel starts and the winner takes both.
import { canTrade, tradeHave } from './island/rules.js';

let K = null, tr = null, timer = 0, draft = {}, dirty = false, watching = 0, seenInvite = null, stakeDuel = null;
const $ = s => document.querySelector(s);
const ICON = { dust: '✨', gems: '💎', wood: '🪵', stone: '🪨', herb: '🌿', potion: '🧪', fuel: '⛽', raid_ticket: '📯', adv_ticket: '🧭' };
const label = k => `${ICON[k] || (k.startsWith('seed_') ? '🌱' : k.startsWith('crop_') ? '🧺' : '•')} ${k === 'dust' ? 'Dust' : k === 'gems' ? 'Gems' : k.replace(/^(seed|crop)_/, '').replace(/_/g, ' ') + (k.startsWith('seed_') ? ' seeds' : '')}`;
const list = give => Object.entries(give || {}).map(([k, n]) => `<li><b>${n.toLocaleString()}</b> ${K.esc(label(k))}</li>`).join('') || '<li class="muted">nothing</li>';
// what you could put in: everything tradeable you have
const mine = () => { const st = K.island(); if (!st) return []; return ['dust', 'gems', ...Object.keys(st.inv || {})].filter((k, i, a) => a.indexOf(k) === i && canTrade(k) && tradeHave(st, k) > 0); };

export function initTrade(ctx) {
  K = ctx;
  $('#tr-close').onclick = close;
  $('#tr-cancel').onclick = async () => { if (tr && (await K.modal('<h3>Cancel this trade?</h3>', [['Cancel trade', 1, 'primary'], ['Keep trading', 0]]))) call({ op: 'cancel', id: tr.id }); };
  $('#tr-save').onclick = () => call({ op: 'offer', id: tr.id, give: draft }).then(() => { dirty = false; });
  $('#tr-agree').onclick = async () => {
    if (!tr) return;
    if (dirty) return K.toast('Press "Update my offer" first, so the other player sees it.', true);
    const gems = (tr.mine.gems || 0) - (tr.theirs.gems || 0);
    if (tr.kind === 'duel') {
      const ask2 = `<h3>⚔️ Duel for these stakes?</h3><div class="tr-sum"><div><small>You stake</small><ul>${list(tr.mine)}</ul></div><div><small>They stake</small><ul>${list(tr.theirs)}</ul></div></div><p><b>The winner takes both stakes.</b> A tie gives each their own back.</p><p class="muted">Your stake is locked away as soon as you both agree, then the duel starts.</p>`;
      if (await K.modal(ask2, [['Yes, duel!', 1, 'primary'], ['Not yet', 0]])) call({ op: 'agree', id: tr.id, ver: tr.ver });
      return;
    }
    const ask = `<h3>🤝 Agree to this trade?</h3><div class="tr-sum"><div><small>You give</small><ul>${list(tr.mine)}</ul></div><div><small>You get</small><ul>${list(tr.theirs)}</ul></div></div>${gems > 0 ? `<p class="warn">You give away <b>${gems} 💎</b> more than you get.</p>` : ''}<p class="muted">Trades cannot be undone.</p>`;
    if (await K.modal(ask, [['Yes, I agree', 1, 'primary'], ['Not yet', 0]])) call({ op: 'agree', id: tr.id, ver: tr.ver });
  };
  $('#tr-mine').addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; const n = Math.max(0, Math.floor(+e.target.value || 0)); if (n) draft[k] = n; else delete draft[k]; dirty = true; paintButtons(); });
  watchInvites();
  $('#tr-add').onchange = e => { const k = e.target.value; if (k && !(k in draft)) { draft[k] = 1; dirty = true; paint(); } e.target.value = ''; };
}
async function call(body) {
  try { const r = await K.api('trade', body); show(r.trade); return r; }
  catch (e) { K.sfx('denied'); K.toast(e.message, true); refresh(); }
}
async function refresh() { try { show((await K.api('trade', { op: 'get' })).trade, true); } catch { /* next tick */ } }
function show(t, fromPoll) {
  const was = tr;
  tr = t;
  if (!t) { if (was && $('#trade').classList.contains('on')) { K.toast('The trade is over.'); close(); } return; }
  if (t.kind === 'duel' && ['playing', 'starting', 'paying', 'locked'].includes(t.status)) {   // stakes locked: off to the duel
    if (t.match && stakeDuel?.id !== t.id) { stakeDuel = t; close(); K.sfx('levelup'); K.toast('⚔️ Stakes locked! The winner takes both.'); K.openMatch(t.match); }
    return;
  }
  if (t.status === 'done') { if (t.kind === 'duel') return duelResult(t); K.sfx('levelup'); K.toast('🤝 Trade done! Everything is on your island.'); K.refresh(); close(); return; }
  if (t.status === 'cancelled') { K.toast(`${t.kind === 'duel' ? 'Duel' : 'Trade'} cancelled${t.note && !t.note.startsWith('m:') ? ': ' + t.note : ''}.`, true); close(); return; }
  if (!fromPoll || !dirty) draft = { ...t.mine };
  if (was && was.ver !== t.ver && fromPoll) K.sfx('pop');
  paint();
}
function paint() {
  if (!tr) return;
  const duel = tr.kind === 'duel';
  $('#tr-title').textContent = duel ? `⚔️ Duel ${tr.with?.name || 'player'} for stakes` : `Trade with ${tr.with?.name || 'player'}`;
  $('#trade').classList.toggle('duel', duel);
  $('#tr-l-them').textContent = duel ? 'They stake' : 'They give you';
  $('#tr-l-mine').textContent = duel ? 'You stake (the winner takes both)' : 'You give them';
  $('#tr-agree').textContent = duel ? '⚔️ Agree & duel' : '🤝 Agree';
  $('#tr-cancel').textContent = duel ? 'Cancel duel' : 'Cancel trade';
  $('#tr-them').innerHTML = list(tr.theirs);
  const st = K.island();
  $('#tr-mine').innerHTML = Object.keys(draft).map(k => `<label class="tr-row"><span>${K.esc(label(k))}</span><input type="number" min="0" max="${st ? tradeHave(st, k) : 0}" value="${draft[k]}" data-k="${k}"><small>of ${(st ? tradeHave(st, k) : 0).toLocaleString()}</small></label>`).join('') || '<p class="muted">You give nothing yet. Add something below, or give nothing.</p>';
  $('#tr-add').innerHTML = '<option value="">＋ Add something to give…</option>' + mine().filter(k => !(k in draft)).map(k => `<option value="${k}">${K.esc(label(k))}</option>`).join('');
  $('#tr-state').innerHTML = `<span class="${tr.meOk ? 'ok' : ''}">${tr.meOk ? '✔ You agreed' : '… You have not agreed'}</span><span class="${tr.themOk ? 'ok' : ''}">${tr.themOk ? `✔ ${K.esc(tr.with?.name || 'They')} agreed` : `… ${K.esc(tr.with?.name || 'They')} has not agreed`}</span>`;
  paintButtons();
}
function paintButtons() { $('#tr-save').disabled = !dirty; $('#tr-agree').disabled = !tr || tr.meOk; }
function close() { $('#trade').classList.remove('on'); clearInterval(timer); timer = 0; tr = null; draft = {}; dirty = false; }
// open (or reopen) a trade with a player in Mind Town
export async function openTrade(pid, kind = 'trade') {
  const r = await call({ op: 'open', with: pid, kind });
  if (!r?.trade) return;
  $('#trade').classList.add('on'); K.sfx('select');
  clearInterval(timer); timer = setInterval(refresh, 2000);
}
// while you are in Mind Town: notice when someone opens a trade with you
function watchInvites() {
  clearInterval(watching);
  watching = setInterval(async () => {
    if (!K.inTown() || $('#trade').classList.contains('on') || document.querySelector('#modal.on')) return;
    try {
      const t = (await K.api('trade', { op: 'get' })).trade;
      if (t && t.status === 'open' && !t.started && seenInvite !== t.id) {
        seenInvite = t.id; K.sfx('notify');
        const duel = t.kind === 'duel';
        const a = await K.modal(duel ? `<h3>⚔️ ${K.esc(t.with?.name || 'A player')} challenges you to a duel!</h3><p>You both put stakes in. <b>The winner takes both.</b> Nothing is locked until you both agree.</p>`
          : `<h3>🤝 ${K.esc(t.with?.name || 'A player')} wants to trade</h3><p>Open the trade to see what they offer. Nothing moves until you both agree.</p>`, [[duel ? 'See the stakes' : 'Open trade', 1, 'primary'], ['Say no', 2], ['Later', 0]]);
        if (a === 1 && t.with?.id) openTrade(t.with.id, t.kind);
        else if (a === 2) K.api('trade', { op: 'cancel', id: t.id }).catch(() => {});
      }
    } catch { /* trading not set up yet, or offline */ }
  }, 5000);
  // after a stake duel: learn who took the stakes (the match screen shows the duel itself)
  setInterval(async () => {
    if (!stakeDuel || K.inDuel()) return;
    try { const t = (await K.api('trade', { op: 'see', id: stakeDuel.id })).trade; if (t?.status === 'done' || t?.status === 'cancelled') { stakeDuel = null; t.status === 'done' ? duelResult(t) : show(t); } } catch { /* next tick */ }
  }, 4000);
}
function duelResult(t) {
  close(); K.refresh();
  const msg = t.result === 'won' ? `<h3>🏆 You won the stakes!</h3><p>You get ${'<ul>' + list(t.theirs) + '</ul>'} and your own stake back.</p>`
    : t.result === 'lost' ? `<h3>⚔️ ${K.esc(t.with?.name || 'They')} took the stakes</h3><p>Your stake went to them:</p><ul>${list(t.mine)}</ul>`
      : '<h3>🤝 A tie</h3><p>Each of you got your own stake back.</p>';
  K.sfx(t.result === 'won' ? 'levelup' : 'pop'); K.modal(msg, [['OK', 0, 'primary']]);
}
// 🎁 a one-way gift to a friend (asked twice)
export async function giftTo(friend) {
  const opts = mine();
  if (!opts.length) return K.toast('You have nothing to send yet.', true);
  const go = await K.modal(`<h3>🎁 Send a gift to ${K.esc(friend.name)}</h3><p class="muted">Resources only. It goes straight to their island.</p>
    <select id="gift-k" style="width:100%">${opts.map(k => `<option value="${k}">${K.esc(label(k))} (you have ${tradeHave(K.island(), k).toLocaleString()})</option>`).join('')}</select>
    <input id="gift-n" type="number" min="1" value="1" style="width:100%;margin-top:8px">`, [['Next', 1, 'primary'], ['Cancel', 0]]);
  if (!go) return;
  const k = giftPick.k || opts[0], n = Math.max(0, Math.floor(+giftPick.n || 1));
  giftPick = {};
  if (!n) return;
  if (!(await K.modal(`<h3>Send ${n.toLocaleString()} ${K.esc(label(k))} to ${K.esc(friend.name)}?</h3><p class="muted">Gifts cannot be taken back.</p>`, [['Send gift', 1, 'primary'], ['Cancel', 0]]))) return;
  try { await K.api('trade', { op: 'gift', to: friend.id, give: { [k]: n } }); K.sfx('levelup'); K.toast(`🎁 Sent to ${friend.name}!`); K.refresh(); }
  catch (e) { K.sfx('denied'); K.toast(e.message, true); }
}
let giftPick = {};
document.addEventListener('input', e => { if (e.target.id === 'gift-n') giftPick.n = e.target.value; });
document.addEventListener('change', e => { if (e.target.id === 'gift-k') giftPick.k = e.target.value; });
