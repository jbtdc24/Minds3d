// Hello Minds on the server: the player's browser sends its own Hello Minds access token (never stored), and the
// server talks to the player's AI with it. So the server itself knows the AI is real and theirs, asks it for every
// decision, reads its cognition, and plays what it said: a browser cannot fake the AI's moves.
import { createMindsClient } from '../web/vendor/minds-client-lib.js';
// replies can come as web text: tags go, paragraphs become lines (same as the browser)
const plain = t => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').trim();

export const hm = { client: token => createMindsClient({ accessToken: token }) };   // tests swap this
const playAlias = id => `mindsclash-play-${id}`;
const cache = new Map(), TTL = 5 * 60e3;   // token → the Minds it owns, for a few minutes (fewer calls)

// the AIs this token's Hello Minds account owns: Map mindId → mind, or throws 401 if the token is no good
export async function mindsOf(token, fresh = false) {   // fresh: skip the cache (right after an AI is made or linked)
  if (typeof token !== 'string' || token.length < 20 || token.length > 8000) throw Object.assign(new Error('Connect Hello Minds again.'), { status: 401 });
  const hit = cache.get(token);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.minds;
  let list;
  try { list = await hm.client(token).listMinds(); } catch (e) { throw Object.assign(new Error(`Hello Minds: ${e.message || 'sign in again'}`), { status: 401 }); }
  const minds = new Map(list.map(m => [m.mindId, m]));
  cache.set(token, { at: Date.now(), minds });
  if (cache.size > 2000) cache.clear();
  return minds;
}
// make a brand-new AI on the player's own Hello Minds account (the server does it, so it knows the AI is new)
export async function awakenAi(token, name) {
  const m = await hm.client(token).awakenMind({ name, id: 'mastermind' });
  const mindId = m?.mindId || m?.id;
  if (!mindId) throw Object.assign(new Error('Hello Minds did not send the new AI back. Try again.'), { status: 502 });
  cache.delete(token);
  return { ...m, mindId, name: m.name || name };
}
export const balance = (token, mindId) => hm.client(token).getCognitionBalance(mindId).then(b => Number(b.cognition)).catch(() => null);
// send a question and return where to look for the answer (stored with the player, so the next short call can look)
export async function askStart(token, mindId, question) {
  const c = hm.client(token), alias = playAlias(mindId);
  const text = `[MINDS CLASH game: you are playing for your human. Answer ONLY in the format asked, in plain text (no HTML), then one short WHY line.]\n${question}`;
  await c.ensureConversation(alias, mindId);
  const before = await c.getLatestHistoryFingerprint(alias).catch(() => undefined);
  await c.sendMessage({ alias, messageText: text });
  return { alias, before: before || null, text, at: Date.now() };
}
// look for the answer for at most waitMs (null = not yet)
export async function askPoll(token, q, waitMs = 8e3) {
  const r = await hm.client(token).waitForReply({ alias: q.alias, timeoutMs: Math.max(500, waitMs), sentMessageText: q.text, ...(q.before ? { afterFingerprint: q.before } : {}) });
  return r.timedOut ? null : plain(r.reply?.messageText);
}
// ask the AI one game question and wait for its answer (null = no answer in time)
export async function decide(token, mindId, question, timeoutMs = 13e3) {
  const c = hm.client(token), alias = playAlias(mindId);
  const messageText = `[MINDS CLASH game: you are playing for your human. Answer ONLY in the format asked, in plain text (no HTML), then one short WHY line.]\n${question}`;
  await c.ensureConversation(alias, mindId);
  const before = await c.getLatestHistoryFingerprint(alias).catch(() => undefined);
  await c.sendMessage({ alias, messageText });
  const r = await c.waitForReply({ alias, timeoutMs, sentMessageText: messageText, ...(before ? { afterFingerprint: before } : {}) });
  return r.timedOut ? null : plain(r.reply?.messageText);
}
