// Change display name and profile picture (must be a Mind you own).
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { checkName } from '../auth.js';
import { ownedMinds, DEMO_MINDS } from '../owned.js';

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
  if (body.pfp !== undefined) {
    const mine = p.is_guest ? DEMO_MINDS : await ownedMinds(p.address);
    if (!mine.includes(+body.pfp)) fail(403, 'you can only use a Mind you own');
    patch.pfp = +body.pfp;
  }
  if (!Object.keys(patch).length) return { player: publicPlayer(p) };
  const [row] = await db.update('players', `id=eq.${p.id}`, patch);
  return { player: publicPlayer(row) };
}, { limit: [15, 60] });
