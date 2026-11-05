// Join matchmaking with 1-3 Minds: ranked (wallets), classic (everyone, unrated) or a practice match vs a bot.
import { route, fail, deviceKey } from '../http.js';
import { db } from '../db.js';
import { stillOwns, DEMO_MINDS } from '../owned.js';
import { cleanPick, liveMatchOf, tryPair, botMatch } from '../matchmaking.js';
import { emptyOf, outOfEnergy } from '../energy.js';
import { passOf, PASS_MINDS } from '../rankpass.js';
import { normalize } from '../../web/src/island/rules.js';
import { isLoanerId, resolveLoaners, emptyLoaners } from '../loaners.js';
import { loanTags } from '../matchmaking.js';

export default route(async ({ req, body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const live = await liveMatchOf(p.id);
  if (live) return { match: live };
  // wallets: only the 1-3 picked Minds are checked on-chain (fast), not the whole collection
  const raw = Array.isArray(body.minds) ? body.minds.slice(0, 3) : [];
  const loans = p.is_guest ? [] : [...new Set(raw.filter(isLoanerId))];
  const asked = [...new Set(raw.filter(v => !isLoanerId(v)).map(Number))].filter(n => n >= 1 && n <= 3333).slice(0, 3);
  const classic = body.mode === 'classic';
  // 🪪 Loaner Minds: play with their art id, energy kept on the island
  let loanArt = [];
  if (loans.length) {
    const isl = await db.one('islands', `player_id=eq.${p.id}`);
    if (!isl) fail(400, 'Open your island first.');
    try { loanArt = resolveLoaners(normalize(isl.state, Number(isl.seed), Date.now()), loans); } catch (e) { fail(403, String(e)); }
  }
  if (loans.length) {
    const owns = !asked.length || await stillOwns(p.address, asked).catch(() => false);
    if (!owns) fail(403, 'you can only play Minds you own');
    const pick = { minds: [...asked, ...loanArt], real: asked, loans };
    if (body.bot) return { match: await botMatch(p, pick, ['easy', 'normal', 'hard'].includes(body.bot) ? body.bot : null, false, true), bot: true };
    if (!classic) {
      const empty = await emptyOf(asked); if (empty.length) fail(403, outOfEnergy(empty));
      const lo = await emptyLoaners(p.id, loans); if (lo.length) fail(403, `Loaner ${lo.join(', ')} has no ranked games left today. Refill it or wait for 00:00 UTC.`);
    }
    const dev = deviceKey(req);
    const m = await tryPair(p, pick, 150, dev, classic, false);
    if (m) return { match: m };
    await db.upsert('queue', { player_id: p.id, rating: classic ? 1000 : p.rating, is_guest: classic, minds: pick.minds, loadout: [dev, ...loanTags(pick)], joined_at: new Date().toISOString(), match_id: null }, 'player_id');
    return { waiting: true, waited: 0 };
  }
  // Rank Pass: a wallet without Minds plays ranked with the loaner Minds, using the pass's own daily games
  const usePass = !!body.pass && !p.is_guest && !classic && !body.bot;
  if (usePass) {
    const pass = await passOf(p.id);
    if (!pass.active) fail(403, 'You need a Rank Pass to play ranked without a Mind. Get one in the Shop.');
    if (pass.left < 1) fail(403, 'Your Rank Pass has no ranked games left today. More at 00:00 UTC.');
  }
  const owns = p.is_guest || usePass || !asked.length ? false : await stillOwns(p.address, asked).catch(() => false);
  // a wallet with no Mind plays Classic and Practice with the loaner Minds (marked like a pass row: no ownership check, no energy)
  const loan = !p.is_guest && !usePass && !owns && (classic || !!body.bot) && asked.length > 0 && asked.every(id => DEMO_MINDS.includes(id));
  const pick = cleanPick(usePass ? { ...body, minds: PASS_MINDS } : body, p.is_guest || loan ? DEMO_MINDS : usePass ? PASS_MINDS : owns ? asked : []);
  // practice vs a chosen bot level never changes rating; trial accounts can practice or play classic
  if (!body.bot && !classic && p.is_guest) fail(403, 'connect a wallet to play ranked');
  if (body.bot) return { match: await botMatch(p, pick, ['easy', 'normal', 'hard'].includes(body.bot) ? body.bot : null, false, true), bot: true };
  if (!classic && !usePass) { const empty = await emptyOf(pick.minds); if (empty.length) fail(403, outOfEnergy(empty)); }   // ranked costs energy
  const dev = deviceKey(req);
  const m = await tryPair(p, pick, 150, dev, classic, usePass || loan);
  if (m) return { match: m };
  await db.upsert('queue', { player_id: p.id, rating: classic ? 1000 : p.rating, is_guest: classic, minds: pick.minds, loadout: usePass || loan ? [dev, 'pass'] : [dev], joined_at: new Date().toISOString(), match_id: null }, 'player_id');
  return { waiting: true, waited: 0 };
}, { limit: [20, 60] });
