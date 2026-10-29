// Change display name, profile picture and lobby showcase (Minds you own only).
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { checkName } from '../auth.js';
import { stillOwns, DEMO_MINDS } from '../owned.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const patch = {};
  if (body.name !== undefined) {
    if (p.is_guest) fail(403, 'connect a wallet to pick a name');
    const err = checkName(body.name);
    if (err) fail(400, err);
    const key = body.name.trim().toLowerCase();
    const taken = await db.one('players', `name_key=eq.${encodeURIComponent(key)}&id=neq.${p.id}`);
    if (taken) fail(409, 'that name is taken');
    patch.name = body.name.trim(); patch.name_key = key;
  }
  // only the Minds this change uses are checked on-chain (one quick call), not the whole collection
  const asked = [...(Array.isArray(body.showcase) ? body.showcase : []), ...(body.pfp !== undefined ? [body.pfp] : [])].map(Number).filter(n => n >= 1 && n <= 3333);
  const mine = !asked.length ? [] : p.is_guest ? DEMO_MINDS : (await stillOwns(p.address, [...new Set(asked)]).catch(() => false)) ? asked : [];
  if (body.showcase !== undefined) {
    const list = [...new Set((Array.isArray(body.showcase) ? body.showcase : []).map(Number))];
    if (list.length > 3) fail(400, 'show up to 3 Minds');
    if (list.some(id => !mine.includes(id))) fail(403, 'you can only show Minds you own');
    patch.showcase = list;
  }
  if (body.pfp !== undefined) {
    if (!mine.includes(+body.pfp)) fail(403, 'you can only use a Mind you own');
    patch.pfp = +body.pfp;
  }
  if (!Object.keys(patch).length) return { player: publicPlayer(p) };
  const [row] = await db.update('players', `id=eq.${p.id}`, patch);
  return { player: publicPlayer(row) };
}, { limit: [15, 60] });
