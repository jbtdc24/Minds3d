// Payment reconciliation: compares what the chain says, what was recorded and what was credited. It only ever writes
// findings, so running it again is always safe. It never adds or removes Gems: the owner decides, in Admin.
import { db } from './db.js';
import { client, robinhood } from './chain.js';
import { GEM_PACKS } from '../web/src/gems.js';
import { parseEther } from 'viem';
import { alert, report } from './monitor.js';

const WINDOW_DAYS = 14, BATCH = 150, INTENT_AGE_MS = 30 * 60_000, BURST = 6;
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const ADVICE = {
  missing_credit: 'Payment is real but no Gems were credited. Use Credit Gems.',
  unclaimed_payment: 'Player paid but the game never recorded it. Use Credit Gems.',
  wrong_gems: 'Credited amount differs from the pack. Check the player and adjust by hand.',
  underpaid: 'Paid less than the pack price. Check how this was accepted, then decide.',
  double_credit: 'Gems were credited more than once. Check the player and take back the extra by hand.',
  chain_failed: 'The transaction failed on the chain but Gems were credited. Check and remove them by hand.',
  chain_missing: 'The transaction is no longer on the chain. Check the explorer before acting.',
  wrong_recipient: 'Payment did not go to the treasury. Treat as fraud until checked.',
  wrong_sender: 'Paid from a different wallet than the account. Check for abuse.',
  wrong_chain: 'Payment was on another chain. Treat as fraud until checked.',
  overpaid: 'Paid far more than the pack price. Consider contacting the player.',
  burst: 'Many purchases in one hour. Check for a stolen wallet or a script.',
  no_island: 'Payment has no island to credit. Check the account.',
};
const SEVERITY = { missing_credit: 'critical', unclaimed_payment: 'critical', double_credit: 'critical', chain_failed: 'critical', chain_missing: 'critical', wrong_recipient: 'critical', wrong_chain: 'critical', wrong_gems: 'high', underpaid: 'high', wrong_sender: 'high', no_island: 'high', overpaid: 'info', burst: 'info' };

export async function runReconcile({ now = Date.now() } = {}) {
  const t0 = Date.now(), since = new Date(now - WINDOW_DAYS * 864e5).toISOString(), found = new Map();
  const add = (kind, row, detail = '') => found.set(`${row.tx}:${kind}`, { key: `${row.tx}:${kind}`, tx: row.tx, kind, severity: SEVERITY[kind], player_id: row.player_id || null, pack: row.pack || null, gems: row.gems ?? null, wei: row.wei != null ? String(row.wei) : null, detail, action: ADVICE[kind], last_at: new Date(now).toISOString() });
  const treasury = process.env.TREASURY_ADDRESS, rows = await db.select('payments', `created_at=gt.${since}&order=created_at.desc&limit=${BATCH}`);
  let partial = false, head = null;
  try { head = await client.getBlockNumber(); } catch { partial = true; }
  const readChain = async tx => {
    if (head === null) return null;
    try { const [t, r] = await Promise.all([client.getTransaction({ hash: tx }), client.getTransactionReceipt({ hash: tx })]); return { t, r }; }
    catch (e) { if (/not.?found|could not be found/i.test(`${e.name} ${e.message}`)) return { gone: true }; partial = true; return null; }
  };
  const checkChain = (row, c) => {
    if (c.gone) return add('chain_missing', row);
    if (c.r.status !== 'success') add('chain_failed', row);
    if (treasury && !same(c.t.to, treasury)) add('wrong_recipient', row);
    if (c.t.chainId != null && Number(c.t.chainId) !== robinhood.id) add('wrong_chain', row, `chain ${c.t.chainId}`);
    if (row.address && !same(c.t.from, row.address)) add('wrong_sender', row);
  };
  const ids = [...new Set(rows.map(r => r.player_id).filter(Boolean))];
  const islands = ids.length ? await db.select('islands', `player_id=in.(${ids.join(',')})&select=player_id,state`) : [], byPlayer = new Map(islands.map(i => [i.player_id, i.state]));
  const perHour = new Map();
  for (const row of rows) {
    const pack = GEM_PACKS.find(p => p.id === row.pack), mark = byPlayer.get(row.player_id)?.paid?.[row.tx];
    if (pack && row.gems !== pack.gems) add('wrong_gems', row, `pack ${pack.gems}, recorded ${row.gems}`);
    if (pack && BigInt(row.wei) < parseEther(pack.eth)) add('underpaid', row, `price ${pack.eth} ETH`);
    if (pack && BigInt(row.wei) >= parseEther(pack.eth) * 3n) add('overpaid', row, `price ${pack.eth} ETH`);
    if (!byPlayer.has(row.player_id)) add('no_island', row);
    else if (!row.legacy) {
      if (!mark) add('missing_credit', row);
      else {
        if (mark.g !== row.gems) add('wrong_gems', row, `recorded ${row.gems}, credited ${mark.g}`);
        if ((mark.n || 1) > 1) add('double_credit', row, `credited ${mark.n} times`);
      }
    }
    const c = await readChain(row.tx);
    if (c) checkChain(row, c);
    const hour = `${row.player_id}|${String(row.created_at).slice(0, 13)}`, n = (perHour.get(hour) || 0) + 1;
    perHour.set(hour, n);
    if (n >= BURST) add('burst', row, `${n} purchases in one hour`);
  }
  // the player paid, but the browser closed before the claim finished
  const intents = await db.select('payment_intents', `at=lt.${new Date(now - INTENT_AGE_MS).toISOString()}&limit=${BATCH}`);
  for (const it of intents) {
    if (await db.one('payments', `tx=eq.${it.tx}`)) { await db.remove('payment_intents', `tx=eq.${it.tx}`); continue; }
    const c = await readChain(it.tx);
    if (!c) continue;
    const player = c.t ? await db.one('players', `id=eq.${it.player_id}&select=address`) : null;
    if (c.gone || c.r.status !== 'success' || !same(c.t.to, treasury) || !same(c.t.from, player?.address)) { await db.remove('payment_intents', `tx=eq.${it.tx}`); continue; }   // a guess or a failed try, nothing owed
    add('unclaimed_payment', { ...it, gems: GEM_PACKS.find(p => p.id === it.pack)?.gems, wei: c.t.value }, '');
  }
  const open = await db.select('recon_findings', 'status=eq.open&limit=500');
  for (const f of found.values()) {
    await db.upsert('recon_findings', f, 'key');
    await db.update('recon_findings', `key=eq.${encodeURIComponent(f.key)}&status=eq.resolved`, { status: 'open' });   // it came back
  }
  // only close what was really rechecked: a chain outage must never hide a problem
  if (!partial) for (const o of open) if (!found.has(o.key)) await db.update('recon_findings', `key=eq.${encodeURIComponent(o.key)}`, { status: 'resolved', detail: `${o.detail || ''} (cleared by a later check)`.trim() });
  const critical = [...found.values()].filter(f => f.severity === 'critical').length;
  const run = { checked: rows.length, intents: intents.length, findings: found.size, critical, partial, ms: Date.now() - t0 };
  await db.insert('recon_runs', run);
  if (critical) { await report({ feature: 'payments', severity: 'critical', code: 'reconcile', message: `${critical} payment problems need review` }); await alert(`MINDS CLASH payments: ${critical} problems need review in Admin`); }
  if (partial) await report({ feature: 'payments', severity: 'error', code: 'reconcile_partial', message: 'The chain could not be read, so the payment check is incomplete' });
  return run;
}
