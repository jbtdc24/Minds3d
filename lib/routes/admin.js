// Admin tools (only wallets/ids listed in the ADMIN_ADDRESSES / ADMIN_PLAYER_IDS env vars):
// me · find · player · give (Dust / Gems / items / leaderboard points) · ban / suspend / unban · flags (cheat meter) · log
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { isAdmin, forgetBan, missing } from '../admin.js';
import { normalize } from '../../web/src/island/rules.js';
import { runReconcile } from '../reconcile.js';
import { claimPayment, creditGems } from './gems.js';

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
    case 'players': {   // every player, page by page: who they are, their state, and how their account stands
      const per = 50, page = Math.max(0, body.page | 0), sort = { seen: 'last_seen.desc.nullslast', new: 'created_at.desc', rating: 'rating.desc', points: 'points.desc' }[body.sort] || 'last_seen.desc.nullslast';
      const filt = { online: `&last_seen=gt.${new Date(Date.now() - 150e3).toISOString()}`, wallets: '&is_guest=eq.false', trial: '&is_guest=eq.true', banned: `&banned_until=gt.${new Date().toISOString()}` }[body.filter] || '';
      let rows;
      try { rows = await db.select('players', `select=id,name,address,is_guest,rating,points,wins,losses,draws,bot_wins,bot_losses,created_at,last_seen,banned_until,ban_reason${filt}&order=${sort}&limit=${per}&offset=${page * per}`); }
      catch (e) { if (!missing(e)) throw e; rows = await db.select('players', `select=id,name,address,is_guest,rating,points,wins,losses,draws,bot_wins,bot_losses,created_at,last_seen${filt.includes('banned') ? '' : filt}&order=${sort.replace('.nullslast', '')}&limit=${per}&offset=${page * per}`); }
      const isl = rows.length ? await db.select('islands', `player_id=in.(${rows.map(r => r.id).join(',')})&select=player_id,minds,dust:state->dust,gems:state->gems,b:state->b`).catch(() => []) : [];
      const byId = Object.fromEntries(isl.map(i => [i.player_id, i]));
      return { page, per, players: rows.map(p => { const i = byId[p.id], th = (i?.b || []).find?.(x => x.type === 'home')?.lv || (i ? 1 : 0);
        return { id: p.id, name: p.name, address: p.address || null, guest: !!p.is_guest, rating: p.rating, points: p.points, wins: (p.wins || 0) + (p.bot_wins || 0), losses: (p.losses || 0) + (p.bot_losses || 0),
          created_at: p.created_at, last_seen: p.last_seen, online: !!p.last_seen && Date.now() - Date.parse(p.last_seen) < 150e3, banned_until: p.banned_until && Date.parse(p.banned_until) > Date.now() ? p.banned_until : null,
          dust: i?.dust ?? null, gems: i?.gems ?? null, minds: i?.minds ?? 0, th }; }) };
    }
    case 'player': {
      const p = await target();
      const isl = await db.one('islands', `player_id=eq.${p.id}`);
      const st = isl ? normalize(isl.state, Number(isl.seed), Date.now()) : null;
      let flags = [];
      try { flags = await db.select('flags', `player_id=eq.${p.id}&order=at.desc&limit=30`); } catch (e) { if (!missing(e)) throw e; }
      let payments = [];   // real-money Gem purchases on record (the chain transaction is the proof)
      try { payments = await db.select('payments', `player_id=eq.${p.id}&order=created_at.desc&limit=50`); } catch (e) { if (!missing(e)) throw e; }
      return { player: { ...publicPlayer(p), id: p.id, address: p.address, banned_until: p.banned_until || null, ban_reason: p.ban_reason || null, created_at: p.created_at, last_seen: p.last_seen },
        island: st && { dust: st.dust, gems: st.gems || 0, inv: st.inv, buildings: (st.b || []).length, ship: st.ship || 0, minds: isl.minds }, flags,
        buys: st?.buys || [], payments: payments.map(x => ({ tx: x.tx, pack: x.pack, gems: x.gems, wei: x.wei, at: x.created_at })) };
    }
    case 'snaps': {   // the daily copies of a player's island (last 7 days)
      const p = await target();
      let snaps = [];
      try { snaps = await db.select('island_snaps', `player_id=eq.${p.id}&select=day,created_at,dust:state->dust,gems:state->gems&order=day.desc&limit=8`); } catch (e) { if (!missing(e)) throw e; return { snaps: [], setup: 'Run supabase/011_island_snaps.sql first.' }; }
      return { snaps };
    }
    case 'restore': {   // put a player's island back to one of those copies (the current one is saved first, as today's copy)
      const p = await target(), day = String(body.day || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(400, 'pick a day');
      const snap = await db.one('island_snaps', `player_id=eq.${p.id}&day=eq.${day}`);
      if (!snap) fail(404, 'no copy for that day');
      const isl = await db.one('islands', `player_id=eq.${p.id}`);
      if (!isl) fail(404, 'no island');
      await db.upsert('island_snaps', { player_id: p.id, day: new Date().toISOString().slice(0, 10), state: isl.state }, 'player_id,day').catch(() => {});
      const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${isl.rev}`, { state: { ...snap.state, snapDay: new Date().toISOString().slice(0, 10) }, rev: isl.rev + 1, updated_at: new Date().toISOString() });
      if (!saved.length) fail(409, 'the island just changed, try again');
      await log(me, 'restore_island', p.id, { day });
      return { ok: true };
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
          for (const [k, n] of Object.entries(items)) { if (!/^[a-z][a-z_]{1,29}$/.test(k)) continue; st.inv[k] = Math.max(0, (st.inv[k] || 0) + (n | 0)); if (!st.inv[k]) delete st.inv[k]; }
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
    case 'stats': {   // how the game is doing
      const ago = ms => new Date(Date.now() - ms).toISOString(), n = (t, q) => db.count(t, q).catch(e => { if (missing(e)) return null; throw e; });
      const [players, wallets, online, playing, day, week, newDay, newWeek, live, queue, islands, town, open, keys] = await Promise.all([
        n('players', ''), n('players', 'is_guest=eq.false'), n('players', `last_seen=gt.${ago(5 * 60e3)}`), n('players', `last_seen=gt.${ago(60e3)}`),
        n('players', `last_seen=gt.${ago(864e5)}`), n('players', `last_seen=gt.${ago(7 * 864e5)}`), n('players', `created_at=gt.${ago(864e5)}`), n('players', `created_at=gt.${ago(7 * 864e5)}`),
        n('matches', 'status=eq.live'), n('queue', ''), n('islands', ''), n('town_now', `at=gt.${ago(60e3)}`), n('reports', 'done=eq.false'), n('agent_keys', 'revoked=eq.false'),
      ]);
      let gems = 0;
      try { gems = (await db.select('payments', 'select=gems&limit=5000')).reduce((s, p) => s + (p.gems || 0), 0); } catch (e) { if (!missing(e)) throw e; }
      const [errOpen, payOpen] = await Promise.all([n('errors', 'resolved=eq.false'), n('recon_findings', 'status=eq.open')]);
      return { errOpen, payOpen, players, wallets, trials: players - wallets, online, playing, day, week, newDay, newWeek, live, queue, islands, town, open, keys, gems };
    }
    case 'mail': {   // to: player id, or nothing = everyone
      const title = String(body.title || '').trim().slice(0, 80), text = String(body.body || '').trim().slice(0, 2000);
      if (!title) fail(400, 'Give the mail a title.');
      const gift = { dust: Math.max(0, body.gift?.dust | 0), gems: Math.max(0, body.gift?.gems | 0) };
      const m = await db.insert('mail', { to_id: UUID.test(body.to || '') ? body.to : null, title, body: text, gift: gift.dust || gift.gems ? gift : null });
      await log(me, 'mail', m.to_id, { title, gift });
      return { ok: true };
    }
    case 'mails': return { mail: await db.select('mail', 'order=created_at.desc&limit=20') };
    case 'mail_del': await db.remove('mail', `id=eq.${Number(body.id) | 0}`); await log(me, 'mail_del', null, { id: body.id }); return { ok: true };
    case 'reports': {
      const rows = await db.select('reports', 'order=created_at.desc&limit=60');
      const ids = [...new Set(rows.flatMap(r => [r.player_id, r.target]).filter(Boolean))];
      const names = ids.length ? Object.fromEntries((await db.select('players', `id=in.(${ids.join(',')})&select=id,name`)).map(p => [p.id, p.name])) : {};
      return { reports: rows.map(r => ({ ...r, by: names[r.player_id] || '?', about: names[r.target] || null })) };
    }
    case 'report_done': await db.update('reports', `id=eq.${Number(body.id) | 0}`, { done: !!body.done }); return { ok: true };
    case 'errors': {
      try { return { errors: await db.select('errors', 'order=resolved.asc,last_at.desc&limit=60') }; } catch (e) { if (missing(e)) return { errors: [], setup: true }; throw e; }
    }
    case 'error_done': await db.update('errors', `id=eq.${Number(body.id) | 0}`, { resolved: !!body.done }); return { ok: true };
    case 'recon': {
      try {
        const [findings, runs] = await Promise.all([db.select('recon_findings', 'order=last_at.desc&limit=100'), db.select('recon_runs', 'order=at.desc&limit=1')]);
        return { findings, last: runs[0] || null };
      } catch (e) { if (missing(e)) return { findings: [], setup: true }; throw e; }
    }
    case 'recon_run': { const run = await runReconcile(); await log(me, 'recon_run', null, run); return run; }
    case 'recon_mark': {
      if (!['open', 'reviewed'].includes(body.status)) fail(400, 'bad status');
      await db.update('recon_findings', `key=eq.${encodeURIComponent(String(body.key))}`, { status: body.status });
      await log(me, 'recon_mark', null, { key: body.key, status: body.status });
      return { ok: true };
    }
    case 'recon_fix': {   // the owner's button: runs the same checks as a purchase and can never add Gems twice
      const f = await db.one('recon_findings', `key=eq.${encodeURIComponent(String(body.key))}`);
      if (!f || !['missing_credit', 'unclaimed_payment'].includes(f.kind)) fail(400, 'This one cannot be fixed by a button.');
      const p = await db.one('players', `id=eq.${f.player_id}`);
      if (!p) fail(404, 'player not found');
      const out = f.kind === 'unclaimed_payment' ? await claimPayment(p, f.tx, f.pack) : await creditGems(p.id, f.tx, f.gems);
      if (!(out.ok || out.already)) fail(409, out.message || 'Not credited, try again.');
      await db.update('recon_findings', `key=eq.${encodeURIComponent(f.key)}`, { status: 'fixed' });
      await log(me, 'recon_fix', p.id, { kind: f.kind, already: !!out.already });
      return { ok: true, already: !!out.already };
    }
    case 'log': {
      try { return { log: await db.select('admin_log', 'order=at.desc&limit=50') }; } catch (e) { if (missing(e)) return { log: [] }; throw e; }
    }
  }
  fail(400, 'unknown admin action');
}, { limit: [120, 60] });
