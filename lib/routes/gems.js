// Buying Gems with ETH on Robinhood Chain.
// op 'info'  → treasury address + packs (the client sends the ETH from the player's own wallet)
// op 'claim' → { tx, pack }: the server reads that transaction from the chain and only adds Gems when ALL of these hold:
//   it succeeded · it was sent TO the treasury · FROM this player's signed-in wallet · on Robinhood Chain ·
//   for at least the pack price · with a few confirmations · and that tx hash was never used before (DB primary key).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { client, robinhood } from '../chain.js';
import { flag, missing } from '../admin.js';
import { normalize } from '../../web/src/island/rules.js';
import { GEM_PACKS } from '../../web/src/gems.js';
import { parseEther, getAddress } from 'viem';

const CONFIRMATIONS = 6n;   // deep enough that a chain reorganisation cannot undo a payment we credited
const treasury = () => { try { return process.env.TREASURY_ADDRESS ? getAddress(process.env.TREASURY_ADDRESS) : null; } catch { return null; } };

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const to = treasury();
  if (body.op === 'info') return { treasury: to, chainId: robinhood.id, packs: GEM_PACKS, enabled: !!to && !p.is_guest };
  if (body.op !== 'claim') fail(400, 'unknown action');
  if (!to) fail(503, 'Gem purchases are not switched on yet.');
  if (p.is_guest || !p.address) fail(403, 'Connect a wallet to buy Gems.');
  const pack = GEM_PACKS.find(x => x.id === body.pack);
  if (!pack) fail(400, 'unknown pack');
  const hash = String(body.tx || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) fail(400, 'bad transaction hash');
  // already credited? (also stops two tabs claiming the same payment)
  try { if (await db.one('payments', `tx=eq.${hash}`)) fail(409, 'That payment was already used.'); }
  catch (e) { if (missing(e)) fail(503, 'Run supabase/006_payments.sql in Supabase first.'); throw e; }
  // read it from the chain
  let tx, rc, head;
  try { [tx, rc, head] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash }), client.getBlockNumber()]); }
  catch { return { pending: true, message: 'Waiting for the payment to confirm…' }; }
  if (!rc || rc.status !== 'success') fail(400, 'That transaction failed.');
  if (head - rc.blockNumber + 1n < CONFIRMATIONS) return { pending: true, message: 'Waiting for confirmations…' };
  const bad = why => { flag(p.id, 'payment_reject', { hash, why }); fail(400, why); };
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  if (!same(tx.to, to)) bad('That payment did not go to the game treasury.');
  if (!same(tx.from, p.address)) bad('That payment came from a different wallet.');
  if (tx.chainId != null && Number(tx.chainId) !== robinhood.id) bad('Wrong network.');
  if (tx.value < parseEther(pack.eth)) bad(`That payment was less than ${pack.eth} ETH.`);
  // record it first (unique tx), then add the Gems
  try { await db.insert('payments', { tx: hash, player_id: p.id, address: getAddress(p.address), pack: pack.id, gems: pack.gems, wei: tx.value.toString() }); }
  catch (e) { if (e.dbStatus === 409 || /duplicate|23505/.test(e.body || '')) fail(409, 'That payment was already used.'); throw e; }
  for (let attempt = 0; attempt < 6; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${p.id}`);
    if (!isl) { await db.remove('payments', `tx=eq.${hash}`); fail(400, 'Open your island once, then press Buy Gems again: your payment is safe.'); }
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    st.gems = (st.gems || 0) + pack.gems;
    const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return { ok: true, gems: st.gems, added: pack.gems };
  }
  // not credited: undo the record so the next check can credit it (the payment itself is on the chain)
  await db.remove('payments', `tx=eq.${hash}`);
  return { pending: true, message: 'Your island is busy. Trying again…' };
}, { limit: [30, 60] });
