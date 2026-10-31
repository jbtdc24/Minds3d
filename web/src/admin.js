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
  meter(); stats();
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
const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function stats() {
  const r = await K.api('admin', { op: 'stats' });
  const box = [['🟢 Online now', r.online], ['🎮 Playing this minute', r.playing], ['📅 Active 24 hours', r.day], ['🗓 Active 7 days', r.week], ['👥 Registered', r.players], ['👛 Wallets', r.wallets], ['🧪 Trial accounts', r.trials], ['🆕 New 24 hours', r.newDay], ['🆕 New 7 days', r.newWeek], ['⚔️ Live matches', r.live], ['⏳ In queue', r.queue], ['🏝️ Islands', r.islands], ['🏘️ In Mind Town', r.town ?? '–'], ['🤖 AI keys', r.keys ?? '–'], ['💎 Gems sold', r.gems]];
  $('#adm-open').textContent = r.open || ''; $('#adm-payn').textContent = r.payOpen || ''; $('#adm-errn').textContent = r.errOpen || '';
  $('#adm-detail').innerHTML = `<h3>📊 Players</h3><div class="adm-stats">${box.map(([k, v]) => `<div><b>${(v ?? 0).toLocaleString()}</b><span>${k}</span></div>`).join('')}</div>`;
}
async function mailForm() {
  const r = await K.api('admin', { op: 'mails' }).catch(() => ({ mail: [] }));
  $('#adm-detail').innerHTML = `<h3>✉️ Mail to every player</h3>
    <div class="adm-box"><input id="ml-title" class="wide" maxlength="80" placeholder="Title"><textarea id="ml-body" class="rep-text" rows="5" maxlength="2000" placeholder="Announcement or update"></textarea>
    <input id="ml-dust" type="number" min="0" placeholder="Gift ✨"><input id="ml-gems" type="number" min="0" placeholder="Gift 💎"><input id="ml-to" class="wide" placeholder="Player id (empty = everyone)"><button class="btn small primary" data-a="mail">Send</button></div>
    ${r.mail.map(m => `<div class="adm-row"><b>${K.esc(m.title)}</b><span>${when(m.created_at)} · ${m.to_id ? 'one player' : 'everyone'}${m.gift ? ' · gift' : ''}</span><button class="btn small" data-del="${m.id}">Delete</button></div>`).join('')}`;
}
async function reports() {
  const r = await K.api('admin', { op: 'reports' });
  $('#adm-detail').innerHTML = `<h3>🐞 Reports</h3>${r.reports.map(x => `<div class="adm-report ${x.done ? 'done' : ''}"><b>${x.kind === 'player' ? `🚩 ${K.esc(x.about || 'a player')}` : '🐞 Bug'}</b> <small>by ${K.esc(x.by)} · ${when(x.created_at)}${x.place ? ' · ' + K.esc(x.place) : ''}</small><p>${K.esc(x.text)}</p>${x.player_id ? `<button class="btn small" data-pid="${x.player_id}">Open reporter</button>` : ''}${x.target ? `<button class="btn small" data-pid="${x.target}">Open reported</button>` : ''}<button class="btn small" data-rep="${x.id}" data-v="${x.done ? 0 : 1}">${x.done ? 'Reopen' : 'Done'}</button></div>`).join('') || '<p class="muted">No reports yet.</p>'}`;
}
const eth = wei => (wei == null ? '–' : `${(Number(wei) / 1e18).toFixed(5)} ETH`), shortTx = t => `${t.slice(0, 10)}…${t.slice(-6)}`;
async function payments() {
  const r = await K.api('admin', { op: 'recon' });
  if (r.setup) { $('#adm-detail').innerHTML = '<h3>💳 Payments</h3><p class="muted">Run supabase/009_monitoring.sql to switch this on.</p>'; return; }
  const open = r.findings.filter(f => f.status === 'open'), rest = r.findings.filter(f => f.status !== 'open').slice(0, 15);
  const row = f => `<div class="adm-report sev-${K.esc(f.severity)} ${f.status === 'open' ? '' : 'done'}"><b>${K.esc(f.kind.replace(/_/g, ' '))}</b> <small>${K.esc(f.severity)} · ${K.esc(f.status)} · ${when(f.last_at)}</small>
    <p>${K.esc(f.action || '')}${f.detail ? `<br><small>${K.esc(f.detail)}</small>` : ''}</p>
    <small class="muted">tx <span title="${K.esc(f.tx)}">${K.esc(shortTx(f.tx))}</span> · ${K.esc(f.pack || '–')} · ${f.gems ?? '–'} 💎 · ${eth(f.wei)}</small><br>
    ${f.status === 'open' && ['missing_credit', 'unclaimed_payment'].includes(f.kind) ? `<button class="btn small primary" data-fix="${K.esc(f.key)}">Credit Gems</button>` : ''}${f.status === 'open' ? `<button class="btn small" data-mark="${K.esc(f.key)}" data-v="reviewed">Mark reviewed</button>` : ''}${f.player_id ? `<button class="btn small" data-pid="${K.esc(f.player_id)}">Open player</button>` : ''}</div>`;
  $('#adm-detail').innerHTML = `<h3>💳 Payments <button class="btn small" id="adm-pay-run">Check now</button></h3>
    <p class="muted">${r.last ? `Last check ${when(r.last.at)}: ${r.last.checked} payments, ${r.last.findings} findings${r.last.partial ? '. <b>Incomplete: the chain could not be read.</b>' : ''}` : 'Not run yet.'}</p>
    ${open.map(row).join('') || '<p class="muted">No open problems.</p>'}${rest.length ? `<h3>History</h3>${rest.map(row).join('')}` : ''}`;
}
async function errorsList() {
  const r = await K.api('admin', { op: 'errors' });
  if (r.setup) { $('#adm-detail').innerHTML = '<h3>🚨 Errors</h3><p class="muted">Run supabase/009_monitoring.sql to switch this on.</p>'; return; }
  $('#adm-detail').innerHTML = `<h3>🚨 Errors</h3>${r.errors.map(e => `<div class="adm-report sev-${K.esc(e.severity)} ${e.resolved ? 'done' : ''}"><b>${K.esc(e.feature)}</b> <small>${K.esc(e.severity)} · seen ${e.count}× · last ${when(e.last_at)} · first ${when(e.created_at)}</small><p>${K.esc(e.message)}</p>${e.stack ? `<small class="muted">${K.esc(e.stack)}</small><br>` : ''}<button class="btn small" data-err="${e.id}" data-v="${e.resolved ? 0 : 1}">${e.resolved ? 'Reopen' : 'Done'}</button></div>`).join('') || '<p class="muted">No errors.</p>'}`;
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
    if (e.target.closest('#adm-stats')) return await stats();
    if (e.target.closest('#adm-mail')) return await mailForm();
    if (e.target.closest('#adm-reports')) return await reports();
    if (e.target.closest('#adm-pay')) return await payments();
    if (e.target.closest('#adm-err')) return await errorsList();
    if (e.target.closest('#adm-pay-run')) { const r = await K.api('admin', { op: 'recon_run' }); K.toast(`Checked ${r.checked} payments: ${r.findings} findings.`); return await payments(); }
    const fix = e.target.closest('[data-fix]');
    if (fix) {
      if (!(await K.modal('<h3>Credit these Gems?</h3><p>The payment is rechecked, and it can never be credited twice.</p>', [['Credit Gems', 1, 'primary'], ['Cancel', 0]]))) return;
      const r = await K.api('admin', { op: 'recon_fix', key: fix.dataset.fix }); K.toast(r.already ? 'Already credited, nothing added.' : 'Gems credited.'); return await payments();
    }
    const mk = e.target.closest('[data-mark]');
    if (mk) { await K.api('admin', { op: 'recon_mark', key: mk.dataset.mark, status: mk.dataset.v }); return await payments(); }
    const er = e.target.closest('[data-err]');
    if (er) { await K.api('admin', { op: 'error_done', id: +er.dataset.err, done: er.dataset.v === '1' }); return await errorsList(); }
    const rep = e.target.closest('[data-rep]');
    if (rep) { await K.api('admin', { op: 'report_done', id: +rep.dataset.rep, done: rep.dataset.v === '1' }); return await reports(); }
    const del = e.target.closest('[data-del]');
    if (del) { await K.api('admin', { op: 'mail_del', id: +del.dataset.del }); return await mailForm(); }
    if (e.target.closest('[data-a="mail"]')) {
      const to = $('#ml-to').value.trim();
      if (!(await K.modal(`<h3>Send to ${to ? 'this player' : 'EVERY player'}?</h3>`, [['Send', 1, 'primary'], ['Cancel', 0]]))) return;
      await K.api('admin', { op: 'mail', title: $('#ml-title').value, body: $('#ml-body').value, to, gift: { dust: +$('#ml-dust').value || 0, gems: +$('#ml-gems').value || 0 } });
      K.toast('Mail sent.'); return await mailForm();
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a || !cur) return;
    if (a === 'give') {
      const items = {}; const it = $('#adm-item').value.trim(), q = +$('#adm-qty').value || 0;
      if (it && q) items[it] = q;
      await K.api('admin', { op: 'give', pid: cur.id, dust: +$('#adm-dust').value || 0, gems: +$('#adm-gems').value || 0, points: +$('#adm-pts').value || 0, items });
      K.toast('Sent.'); K.onGive?.(cur.id);
    } else if (a === 'suspend' || a === 'ban') {
      if (!(await K.modal(`<h3>${a === 'ban' ? 'Ban' : 'Suspend'} ${K.esc(cur.name)}?</h3>`, [['Yes', 1, 'primary'], ['Cancel', 0]]))) return;
      await K.api('admin', { op: 'ban', pid: cur.id, hours: a === 'ban' ? 0 : +$('#adm-hours').value || 24, reason: $('#adm-reason').value });
      K.toast(a === 'ban' ? 'Banned.' : 'Suspended.');
    } else if (a === 'unban') { await K.api('admin', { op: 'unban', pid: cur.id }); K.toast('Unbanned.'); }
    await show(cur.id);
  } catch (err) { K.toast(err.message, true); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'adm-q') search().catch(err => K.toast(err.message, true)); });
