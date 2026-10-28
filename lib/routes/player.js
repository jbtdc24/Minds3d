// Public profile + last 20 finished matches.
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';

export default route(async ({ query }) => {
  if (!/^[0-9a-f-]{36}$/.test(query.id || '')) fail(400, 'bad player id');
  const p = await db.one('players', `id=eq.${query.id}`);
  if (!p) fail(404, 'player not found');
  const ms = await db.select('matches', `or=(p0.eq.${p.id},p1.eq.${p.id})&status=neq.live&select=id,p0,p1,bot_level,winner,delta0,delta1,ended_at,players:state->p&order=created_at.desc&limit=20`);
  const others = [...new Set(ms.flatMap(m => [m.p0, m.p1]).filter(x => x && x !== p.id))];
  const names = others.length ? Object.fromEntries((await db.select('players', `id=in.(${others.join(',')})&select=id,name,pfp`)).map(o => [o.id, o])) : {};
  const history = ms.map(m => {
    const seat = m.p0 === p.id ? 0 : 1, rival = seat ? m.p0 : m.p1;
    return {
      id: m.id, at: m.ended_at, bot: !rival, vs: rival ? names[rival]?.name : `BOT · ${m.bot_level}`, vsPfp: rival ? names[rival]?.pfp : null,
      result: m.winner === null ? 'draw' : m.winner === seat ? 'win' : 'loss', delta: seat ? m.delta1 : m.delta0,
      minds: m.players?.[seat]?.minds || [],
    };
  });
  return { player: publicPlayer(p), history };
}, { methods: ['GET'], auth: false, limit: [60, 60] });
