// Rank Pass on the server: a wallet player without Minds plays ranked with the loaner Minds (DEMO_MINDS).
// Their energy is the pass's own (5 ranked games a day, on the island: st.rp), never the shared loaner tokens' energy.
import { db } from './db.js';
import { DEMO_MINDS } from './owned.js';
import { normalize, passActive, passLeft } from '../web/src/island/rules.js';

export const PASS_MINDS = DEMO_MINDS;
const day = now => new Date(now).toISOString().slice(0, 10);
export const isPassPick = minds => minds.length > 0 && minds.every(id => PASS_MINDS.includes(id));

export async function passOf(pid, now = Date.now()) {
  const isl = await db.one('islands', `player_id=eq.${pid}`).catch(() => null);
  if (!isl) return { active: false, left: 0, until: 0 };
  const st = normalize(isl.state, Number(isl.seed), now);
  return { active: passActive(st, now), left: passLeft(st, now), until: st.rp?.until || 0 };
}
// one ranked game off today's pass games; false if none left (safe against two requests at once)
export async function spendPass(pid, now = Date.now()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return false;
    const st = normalize(isl.state, Number(isl.seed), now);
    if (passLeft(st, now) < 1) return false;
    const d = day(now);
    st.rp = { ...st.rp, day: d, used: (st.rp.day === d ? st.rp.used || 0 : 0) + 1 };
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return true;
  }
  return false;
}
// give a pass game back (the match did not start after all)
export async function refundPass(pid, now = Date.now()) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return;
    const st = normalize(isl.state, Number(isl.seed), now);
    if (!(st.rp?.used > 0)) return;
    st.rp = { ...st.rp, used: st.rp.used - 1 };
    if ((await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() })).length) return;
  }
}
