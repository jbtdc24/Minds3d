// The owner's admin screen (hidden). Settings → "Code" → the server checks your wallet against ADMIN_ADDRESSES
// (a Vercel setting, not in the repo); only then this screen opens. Find players, give resources, suspend/ban/unban,
// and the cheat meter (players the server flagged for suspicious play).
const $ = s => document.querySelector(s);
let K = null, cur = null;

export function initAdmin(ctx) { K = ctx; }
export async function tryCode(code) {
  if (!code) return false;
  try { const r = await K.api('admin', { op: 'me' }); if (!r.admin) return false; } catch { return false; }
  open(); return true;
}
function open() {
  K.show('admin');
  $('#adm-detail').innerHTML = '<p class="muted">Search a player by name, wallet (0x…) or id.</p>';
  meter();
}
async function search() {
  const q = $('#adm-q').value.trim();
  if (!q) return;
  const r = await K.api('admin', { op: 'find', q });
  $('#adm-results').innerHTML = r.players.map(p => `<button class="adm-row" data-pid="${p.id}"><b>${K.esc(p.name)}</b><span>${p.guest ? 'trial' : p.address || ''} · ⭐${p.points} · ${p.rating}${p.banned_until ? ' · <em>BANNED</em>' : ''}</span></button>`).join('') || '<p class="muted">Nobody found.</p>';
}
async function meter() {
  const r = await K.api('admin', { op: 'flags' }).catch(e => ({ players: [], err: e.message }));
  $('#adm-meter').innerHTML = r.setup ? '<p class="muted">Run supabase/005_admin.sql to switch on the cheat meter.</p>'
    : (r.players.map(p => `<button class="adm-row" data-pid="${p.pid}"><b>${K.esc(p.name)}</b><span>🚩 ${p.n} · ${Object.entries(p.kinds).map(([k, n]) => `${k} ×${n}`).join(', ')}</span></button>`).join('') || '<p class="muted">No suspicious activity. 👍</p>');
}
async function show(pid) {
  const r = await K.api('admin', { op: 'player', pid });
  cur = r.player;
  const p = r.player, i = r.island;
  const banned = p.banned_until && Date.parse(p.banned_until) > Date.now();
  $('#adm-detail').innerHTML = `<h3>${K.esc(p.name)} ${banned ? '<em class="adm-ban">' + (p.banned_until.startsWith('2999') ? 'BANNED' : 'SUSPENDED until ' + new Date(p.banned_until).toLocaleString()) + '</em>' : ''}</h3>
    <p class="muted">${p.address || 'trial account'} · id ${p.id}<br>⭐ ${p.points} points · rating ${p.rating} · W/L ${p.wins}/${p.losses} · joined ${new Date(p.created_at).toLocaleDateString()}</p>
    ${i ? `<p>✨ ${i.dust} · 💎 ${i.gems} · 🏗️ ${i.buildings} buildings · airship ${i.ship} · Minds ${i.minds}<br><small class="muted">${Object.entries(i.inv).map(([k, n]) => `${k} ${n}`).join(' · ')}</small></p>` : '<p class="muted">No island yet.</p>'}
    <div class="adm-box"><b>Give</b> <input id="adm-dust" type="number" placeholder="✨ Dust"> <input id="adm-gems" type="number" placeholder="💎 Gems"> <input id="adm-pts" type="number" placeholder="⭐ Points">
      <input id="adm-item" placeholder="item (potion, fuel, troop_giant…)"> <input id="adm-qty" type="number" placeholder="qty"> <button class="btn small primary" data-a="give">Send</button>
      <small class="muted">Use negative numbers to take away.</small></div>
    <div class="adm-box"><b>Discipline</b> <input id="adm-reason" placeholder="reason"> <input id="adm-hours" type="number" placeholder="hours" value="24">
      <button class="btn small" data-a="suspend">Suspend</button><button class="btn small red" data-a="ban">Ban</button><button class="btn small" data-a="unban">Unban</button></div>
    <div class="adm-flags"><b>🚩 Flags</b>${r.flags.map(f => `<div><span>${new Date(f.at).toLocaleString()}</span> <b>${f.kind}</b> <small>${K.esc(JSON.stringify(f.detail))}</small></div>`).join('') || '<p class="muted">None.</p>'}</div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('#s-admin')) return;
  const row = e.target.closest('[data-pid]');
  try {
    if (row) return await show(row.dataset.pid);
    if (e.target.closest('#adm-go')) return await search();
    if (e.target.closest('#adm-refresh')) return await meter();
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a || !cur) return;
    if (a === 'give') {
      const items = {}; const it = $('#adm-item').value.trim(), q = +$('#adm-qty').value || 0;
      if (it && q) items[it] = q;
      await K.api('admin', { op: 'give', pid: cur.id, dust: +$('#adm-dust').value || 0, gems: +$('#adm-gems').value || 0, points: +$('#adm-pts').value || 0, items });
      K.toast('Sent.');
    } else if (a === 'suspend' || a === 'ban') {
      if (!(await K.modal(`<h3>${a === 'ban' ? 'Ban' : 'Suspend'} ${K.esc(cur.name)}?</h3>`, [['Yes', 1, 'primary'], ['Cancel', 0]]))) return;
      await K.api('admin', { op: 'ban', pid: cur.id, hours: a === 'ban' ? 0 : +$('#adm-hours').value || 24, reason: $('#adm-reason').value });
      K.toast(a === 'ban' ? 'Banned.' : 'Suspended.');
    } else if (a === 'unban') { await K.api('admin', { op: 'unban', pid: cur.id }); K.toast('Unbanned.'); }
    await show(cur.id);
  } catch (err) { K.toast(err.message, true); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'adm-q') search().catch(err => K.toast(err.message, true)); });
