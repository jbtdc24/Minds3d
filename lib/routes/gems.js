// Buying Gems with ETH, or with a dollar stablecoin (lib/stable.js), on Robinhood Chain.
// op 'info'  → treasury address + packs (the client sends the ETH from the player's own wallet)
// op 'claim' → { tx, pack }: the server reads that transaction from the chain and only adds Gems when ALL of these hold:
//   it succeeded · it was sent TO the treasury · FROM this player's signed-in wallet · on Robinhood Chain ·
//   for at least the pack price · with a few confirmations · and that tx hash was never used before (DB primary key).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { addPoints, GEM_BONUS } from '../points.js';
import { client, robinhood } from '../chain.js';
import { flag, missing } from '../admin.js';
import { normalize, logBuy, addLoaner } from '../../web/src/island/rules.js';
import { GEM_PACKS, packOf, LOANER_PRICE } from '../../web/src/gems.js';
import { stableToken, stableDecimals, toUnits, paidIn } from '../stable.js';
import { report } from '../monitor.js';
import { parseEther, getAddress } from 'viem';

const CONFIRMATIONS = 6n;   // deep enough that a chain reorganisation cannot undo a payment we credited
const treasury = () => { try { return process.env.TREASURY_ADDRESS ? getAddress(process.env.TREASURY_ADDRESS) : null; } catch { return null; } };

// add the Gems and the ledger mark in one saved step. Calling this twice for one payment can never add Gems twice.
export async function creditGems(playerId, hash, gems) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${playerId}`);
    if (!isl) return { noIsland: true };
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    if (st.paid?.[hash]) return { already: true, gems: st.gems || 0 };
    st.gems = (st.gems || 0) + gems;
    logBuy(st, { what: `💎 ${gems} Gems pack`, got: { gems }, tx: String(hash).slice(0, 80), real: true });   // a real-money purchase: shown to the player and the admin
    // a thank-you with every purchase: bonus Dust and supplies (leaderboard points are added after the save)
    st.dust += gems * GEM_BONUS.dustPerGem; st.inv.wood = (st.inv.wood || 0) + gems * GEM_BONUS.resPerGem; st.inv.stone = (st.inv.stone || 0) + gems * GEM_BONUS.resPerGem;
    (st.paid ||= {})[hash] = { g: gems, at: Date.now() };
    const saved = await db.update('islands', `player_id=eq.${playerId}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) { await addPoints(playerId, gems * GEM_BONUS.pointsPerGem); return { ok: true, gems: st.gems }; }
  }
  return { busy: true };
}
// 🪪 a paid Loaner Mind: added once per payment (st.paid mark g: 0, loaner: true)
export async function creditLoaner(playerId, hash, currency = 'ETH') {
  for (let attempt = 0; attempt < 6; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${playerId}`);
    if (!isl) return { noIsland: true };
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    if (st.paid?.[hash]) return { already: true, gems: st.gems || 0 };
    const l = addLoaner(st, Date.now());
    logBuy(st, { what: `🪪 Loaner Mind ${l.id} (${currency})`, got: { loaner: 1 }, tx: String(hash).slice(0, 80), real: true });
    (st.paid ||= {})[hash] = { g: 0, loaner: l.id, at: Date.now() };
    const saved = await db.update('islands', `player_id=eq.${playerId}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return { ok: true, gems: st.gems || 0, loaner: l };
  }
  return { busy: true };
}
// all the checks in one place, for the player's claim and for the owner's recovery button
export async function claimPayment(p, hash, packKey) {
  const to = treasury();
  if (!to) fail(503, 'Gem purchases are not switched on yet.');
  const pk = packOf(packKey), pack = pk?.pack, token = pk?.usd ? stableToken() : null;
  if (!pack) fail(400, 'unknown pack');
  if (pk.usd && !token) fail(503, 'Stablecoin payments are not switched on yet.');
  const key = pk.usd ? `${pack.id}:usd` : pack.id;
  if (!/^0x[0-9a-f]{64}$/.test(hash)) fail(400, 'bad transaction hash');
  // already credited? (also stops two tabs claiming the same payment)
  try { if (await db.one('payments', `tx=eq.${hash}`)) fail(409, 'That payment was already used.'); }
  catch (e) { if (missing(e)) fail(503, 'Run supabase/006_payments.sql in Supabase first.'); throw e; }
  db.upsert('payment_intents', { tx: hash, player_id: p.id, pack: key }, 'tx').catch(() => {});   // survives a closed browser
  // read it from the chain
  let tx, rc, head;
  try { [tx, rc, head] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash }), client.getBlockNumber()]); }
  catch { return { pending: true, message: 'Waiting for the payment to confirm…' }; }
  if (!rc || rc.status !== 'success') fail(400, 'That transaction failed.');
  if (head - rc.blockNumber + 1n < CONFIRMATIONS) return { pending: true, message: 'Waiting for confirmations…' };
  const bad = why => { flag(p.id, 'payment_reject', { why }); fail(400, why); };
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  if (!same(tx.from, p.address)) bad('That payment came from a different wallet.');
  if (tx.chainId != null && Number(tx.chainId) !== robinhood.id) bad('Wrong network.');
  let amount;
  if (pk.usd) {   // the token's own Transfer log: player → treasury, this token, at least the price
    amount = paidIn(rc, token.address, p.address, to);
    if (amount < toUnits(pack.usd, await stableDecimals(token))) bad(amount ? `That payment was less than ${pack.usd} ${token.symbol}.` : `No ${token.symbol} reached the game treasury in that transaction.`);
  } else {
    if (!same(tx.to, to)) bad('That payment did not go to the game treasury.');
    if (tx.value < parseEther(pack.eth)) bad(`That payment was less than ${pack.eth} ETH.`);
    amount = tx.value;
  }
  // record it first (unique tx), then add the Gems ('wei' holds the token's smallest unit for stablecoin packs)
  try { await db.insert('payments', { tx: hash, player_id: p.id, address: getAddress(p.address), pack: key, gems: pack.gems, wei: amount.toString() }); }
  catch (e) { if (e.dbStatus === 409 || /duplicate|23505/.test(e.body || '')) fail(409, 'That payment was already used.'); throw e; }
  const done = pack.loaner ? await creditLoaner(p.id, hash, pk.usd ? token.symbol : 'ETH') : await creditGems(p.id, hash, pack.gems);
  if (done.ok || done.already) { db.remove('payment_intents', `tx=eq.${hash}`).catch(() => {}); return { ok: true, gems: done.gems, added: pack.gems, ...(pack.loaner ? { loaner: done.loaner?.id || true } : {}) }; }
  // not credited: undo the record so the next check can credit it (the payment itself is on the chain)
  await db.remove('payments', `tx=eq.${hash}`);
  await report({ feature: 'payments', severity: 'critical', code: done.noIsland ? 'no_island' : 'island_busy', message: 'A confirmed payment could not be credited yet' });
  if (done.noIsland) fail(400, 'Open your island once, then press Buy Gems again: your payment is safe.');
  return { pending: true, message: 'Your island is busy. Trying again…' };
}
export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const to = treasury();
  if (body.op === 'info') {
    const token = stableToken();
    let stable = null;
    if (to && token) try { stable = { ...token, decimals: await stableDecimals(token) }; } catch { /* token unreadable: ETH only for now */ }
    return { treasury: to, chainId: robinhood.id, packs: GEM_PACKS, loaner: LOANER_PRICE, enabled: !!to && !p.is_guest, stable };
  }
  if (body.op === 'loaner_gems') {   // 🪪 buy a Loaner Mind with 120 Gems
    if (p.is_guest || !p.address) fail(403, 'Connect a wallet to get Loaner Minds.');
    for (let attempt = 0; attempt < 5; attempt++) {
      const isl = await db.one('islands', `player_id=eq.${p.id}`);
      if (!isl) fail(400, 'Open your island first.');
      const st = normalize(isl.state, Number(isl.seed), Date.now());
      if ((st.gems || 0) < LOANER_PRICE.gems) fail(403, `A Loaner Mind costs ${LOANER_PRICE.gems} 💎. You have ${st.gems || 0}.`);
      st.gems -= LOANER_PRICE.gems;
      const l = addLoaner(st, Date.now());
      logBuy(st, { what: `🪪 Loaner Mind ${l.id}`, paid: { gems: LOANER_PRICE.gems } });
      const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
      if (saved.length) return { ok: true, gems: st.gems, loaner: l.id };
    }
    fail(409, 'your island is busy, try again');
  }
  if (body.op !== 'claim') fail(400, 'unknown action');
  if (!to) fail(503, 'Gem purchases are not switched on yet.');
  if (p.is_guest || !p.address) fail(403, 'Connect a wallet to buy Gems.');
  return claimPayment(p, String(body.tx || '').toLowerCase(), body.pack);
}, { limit: [30, 60] });
