// Admin tools (only wallets/ids listed in the ADMIN_ADDRESSES / ADMIN_PLAYER_IDS env vars):
// me · find · player · give (Dust / Gems / items / leaderboard points) · ban / suspend / unban · flags (cheat meter) · log
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { isAdmin, forgetBan, missing } from '../admin.js';
import { normalize } from '../../web/src/island/rules.js';

const UUID = /^[0-9a-f-]{36}$/;
async function log(admin, action, target, detail) { try { await db.insert('admin_log', { admin_id: admin.id, action, target, detail }); } catch { /* table may be missing */ } }

export default route(async ({ body, session }) => {
  const me = await db.one('players', `id=eq.${session.pid}`);
  if (body.op === 'me') return { admin: isAdmin(me) };
  if (!isAdmin(me)) fail(403, 'not allowed');
  const target = async () => { if (!UUID.test(body.pid || '')) fail(400, 'bad player id'); const p = await db.one('players', `id=eq.${body.pid}`); if (!p) fail(404, 'player not found'); return p; };

  switch (body.op) {
    case 'find': {
      const q = String(body.q || '').trim();
      if (!q) return { players: [] };
      let rows;
      if (UUID.test(q)) rows = await db.select('players', `id=eq.${q}`);
      else if (/^0x[0-9a-fA-F]{6,}/.test(q)) rows = await db.select('players', `address=ilike.${encodeURIComponent(q)}*&limit=20`);
      else rows = await db.select('players', `name_key=ilike.*${encodeURIComponent(q.toLowerCase())}*&limit=20`);
      return { players: rows.map(p => ({ ...publicPlayer(p), id: p.id, banned_until: p.banned_until || null, ban_reason: p.ban_reason || null })) };
    }
    case 'player': {
      const p = await target();
      const isl = await db.one('islands', `player_id=eq.${p.id}`);
      const st = isl ? normalize(isl.state, Number(isl.seed), Date.now()) : null;
      let flags = [];
      try { flags = await db.select('flags', `player_id=eq.${p.id}&order=at.desc&limit=30`); } catch (e) { if (!missing(e)) throw e; }
      return { player: { ...publicPlayer(p), id: p.id, address: p.address, banned_until: p.banned_until || null, ban_reason: p.ban_reason || null, created_at: p.created_at, last_seen: p.last_seen },
        island: st && { dust: st.dust, gems: st.gems || 0, inv: st.inv, buildings: (st.b || []).length, ship: st.ship || 0, minds: isl.minds }, flags };
    }
    case 'give': {
      const p = await target();
      const dust = body.dust | 0, gems = body.gems | 0, points = body.points | 0, items = body.items && typeof body.items === 'object' ? body.items : {};
      if (dust || gems || Object.keys(items).length) {
        for (let attempt = 0; ; attempt++) {
          const isl = await db.one('islands', `player_id=eq.${p.id}`);
          if (!isl) fail(400, 'that player has no island yet');
          const st = normalize(isl.state, Number(isl.seed), Date.now());
          st.dust = Math.max(0, st.dust + dust); st.gems = Math.max(0, (st.gems || 0) + gems);
          for (const [k, n] of Object.entries(items)) { if (!/^[a-z_]{2,30}$/.test(k)) continue; st.inv[k] = Math.max(0, (st.inv[k] || 0) + (n | 0)); if (!st.inv[k]) delete st.inv[k]; }
          const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
          if (saved.length) break;
          if (attempt > 3) fail(409, 'busy, try again');
        }
      }
      if (points) await db.update('players', `id=eq.${p.id}`, { points: Math.max(0, p.points + points) });
      await log(me, 'give', p.id, { dust, gems, points, items });
      return { ok: true };
    }
    case 'ban': {   // hours: number = suspend for that long; 0 / missing = banned for good
      const p = await target();
      const hours = Number(body.hours) || 0, until = hours > 0 ? new Date(Date.now() + hours * 3600e3) : new Date('2999-01-01');
      try { await db.update('players', `id=eq.${p.id}`, { banned_until: until.toISOString(), ban_reason: String(body.reason || '').slice(0, 200) }); }
      catch (e) { if (missing(e)) fail(503, 'Run supabase/005_admin.sql in Supabase first.'); throw e; }
      await db.remove('queue', `player_id=eq.${p.id}`).catch(() => {});
      forgetBan(p.id);
      await log(me, hours > 0 ? 'suspend' : 'ban', p.id, { hours, reason: body.reason || '' });
      return { ok: true, until: until.toISOString() };
    }
    case 'unban': {
      const p = await target();
      try { await db.update('players', `id=eq.${p.id}`, { banned_until: null, ban_reason: null }); }
      catch (e) { if (missing(e)) fail(503, 'Run supabase/005_admin.sql in Supabase first.'); throw e; }
      forgetBan(p.id);
      await log(me, 'unban', p.id, {});
      return { ok: true };
    }
    case 'flags': {   // the cheat meter: who triggered the most suspicious things lately
      let rows = [];
      try { rows = await db.select('flags', `order=at.desc&limit=500`); } catch (e) { if (missing(e)) return { players: [], setup: true }; throw e; }
      const by = new Map();
      for (const f of rows) { const o = by.get(f.player_id) || { pid: f.player_id, n: 0, kinds: {}, last: f.at }; o.n++; o.kinds[f.kind] = (o.kinds[f.kind] || 0) + 1; by.set(f.player_id, o); }
      const top = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 40);
      const ids = top.map(t => t.pid).filter(Boolean);
      const names = ids.length ? Object.fromEntries((await db.select('players', `id=in.(${ids.join(',')})&select=id,name`)).map(p => [p.id, p.name])) : {};
      return { players: top.map(t => ({ ...t, name: names[t.pid] || '?' })) };
    }
    case 'log': {
      try { return { log: await db.select('admin_log', 'order=at.desc&limit=50') }; } catch (e) { if (missing(e)) return { log: [] }; throw e; }
    }
  }
  fail(400, 'unknown admin action');
}, { limit: [120, 60] });
