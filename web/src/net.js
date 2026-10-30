// Client networking: API calls with the session token, wallet sign-in, live match updates,
// and a fully local practice match (engine + bot in the browser) for offline / trial play.
import { SUPABASE } from './config.js';
import { createMatch, submit, viewFor, forfeitMatch } from './duel/engine.js';
import { Bot } from './duel/bot.js';

const TOKEN_KEY = 'mindclash.session';
export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`/api/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(session.token ? { authorization: `Bearer ${session.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Server error (${res.status})`), { status: res.status });
  return data;
}
export async function serverOnline() {
  try { const r = await fetch('/api/leaderboard', { method: 'GET' }); return r.status !== 404; } catch { return false; }
}

// ---------- wallet ----------
export const hasWallet = () => typeof window !== 'undefined' && !!window.ethereum;
export async function walletLogin() {
  if (!hasWallet()) throw new Error('No wallet found. Open this site in MetaMask, Rabby or Coinbase Wallet.');
  const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const { message } = await api('auth/nonce', { address });
  const hex = '0x' + Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('');
  const signature = await window.ethereum.request({ method: 'personal_sign', params: [hex, address] });
  const out = await api('auth/verify', { address, signature });
  session.token = out.token;
  return out;
}
export async function guestLogin() {
  const out = await api('auth/guest', {});
  session.token = out.token;
  return out;
}
export const logout = () => { session.token = null; try { localStorage.removeItem('mindclash.account'); } catch { /* private mode */ } };

// ---------- live updates: Supabase Realtime broadcast ping + polling fallback ----------
let rt = null;
async function realtime() {
  if (rt !== null) return rt;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    rt = createClient(SUPABASE.url, SUPABASE.publishableKey, { auth: { persistSession: false } });
  } catch { rt = false; }
  return rt;
}
export async function watch(topic, onPing) {
  const sb = await realtime();
  if (!sb) return Object.assign(() => {}, { send() {} });
  const ch = sb.channel(topic).on('broadcast', { event: 'update' }, m => onPing(m.payload || {})).subscribe();
  // one socket may join a topic only once, so anything sent on a topic you watch must go through this same channel
  return Object.assign(() => sb.removeChannel(ch), { send: payload => ch.send({ type: 'broadcast', event: 'update', payload }) });
}
// send something straight to another player's client. Words arrive at once; the server's saved copy stays the truth.
const senders = new Map();
export async function ping(topic, payload = {}) {
  const sb = await realtime();
  if (!sb) return;
  if (!senders.has(topic)) {
    if (senders.size > 8) { const [k, old] = senders.entries().next().value; senders.delete(k); sb.removeChannel((await old)); }
    senders.set(topic, new Promise(done => { const ch = sb.channel(topic), t = setTimeout(() => done(ch), 1500); ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(t); done(ch); } }); }));
  }
  try { (await senders.get(topic)).send({ type: 'broadcast', event: 'update', payload }); } catch { /* polling catches up */ }
}
// a live room: everyone present sees who else is here, where they walk and what they say, instantly
export async function liveRoom(topic, id, me, { onChange, onPing, onSay }) {
  const sb = await realtime();
  if (!sb || !id) return null;
  const ch = sb.channel(topic, { config: { presence: { key: id } } });
  let live = false, mine = me;
  ch.on('presence', { event: 'sync' }, () => onChange())
    .on('broadcast', { event: 'update' }, () => onPing())
    .on('broadcast', { event: 'say' }, m => onSay(m.payload || {}));
  ch.subscribe(s => { live = s === 'SUBSCRIBED'; if (live) ch.track(mine); });
  return {
    live: () => live,
    list: () => Object.values(ch.presenceState()).map(m => m[0]),
    move: pos => { mine = pos; if (live) ch.track(pos); },
    ping: () => { if (live) ch.send({ type: 'broadcast', event: 'update', payload: {} }); },
    say: text => { if (live) ch.send({ type: 'broadcast', event: 'say', payload: { id, text } }); },
    leave: () => sb.removeChannel(ch),
  };
}

// ---------- local match (practice offline / when the server is unreachable) ----------
export class LocalMatch {
  constructor({ name, minds, level = 'normal' }) {
    this.state = createMatch({ seed: (Math.random() * 2 ** 31) | 0, players: [{ name, minds }, { name: `BOT · ${level}`, minds: randomMinds() }] });
    this.bot = new Bot(level, (Math.random() * 2 ** 31) | 0);
    this.level = level;
    this.id = 'local';
    this.botAct();
  }
  botAct() {
    const s = this.state;
    if (s.over || s.p[1].pending) return;
    const r = submit(s, 1, this.bot.decide(viewFor(s, 1)));
    if (r.error) submit(s, 1, { card: s.p[1].cards[0] });
  }
  view() {
    return { id: 'local', seat: 0, status: this.state.over ? 'done' : 'live', ranked: false, vsBot: true, botLevel: this.level, local: true,
      deadline: null, winner: this.state.winner, view: viewFor(this.state, 0), delta: 0 };
  }
  async act(action) {
    const r = submit(this.state, 0, { card: action.card, spell: action.spell ?? null });
    if (r.error) throw new Error(r.error);
    this.botAct();
    return this.view();
  }
  async forfeit() { forfeitMatch(this.state, 0); return this.view(); }
}
let tokenIdsCache = null;
export function setTokenIds(ids) { tokenIdsCache = ids; }
function randomMinds() { const ids = tokenIdsCache || [1, 2, 3]; return [0, 1, 2].map(() => ids[(Math.random() * ids.length) | 0]); }
