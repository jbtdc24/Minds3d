// Hello Minds on the server: the player's browser sends its own Hello Minds access token (never stored), and the
// server talks to the player's AI with it. So the server itself knows the AI is real and theirs, asks it for every
// decision, reads its cognition, and plays what it said: a browser cannot fake the AI's moves.
import { createMindsClient } from '../web/vendor/minds-client-lib.js';

export const hm = { client: token => createMindsClient({ accessToken: token }) };   // tests swap this
const playAlias = id => `mindsclash-play-${id}`;
const cache = new Map(), TTL = 5 * 60e3;   // token → the Minds it owns, for a few minutes (fewer calls)

// the AIs this token's Hello Minds account owns: Map mindId → mind, or throws 401 if the token is no good
export async function mindsOf(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8000) throw Object.assign(new Error('Connect Hello Minds again.'), { status: 401 });
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.minds;
  let list;
  try { list = await hm.client(token).listMinds(); } catch (e) { throw Object.assign(new Error(`Hello Minds: ${e.message || 'sign in again'}`), { status: 401 }); }
  const minds = new Map(list.map(m => [m.mindId, m]));
  cache.set(token, { at: Date.now(), minds });
  if (cache.size > 2000) cache.clear();
  return minds;
}
export const balance = (token, mindId) => hm.client(token).getCognitionBalance(mindId).then(b => Number(b.cognition)).catch(() => null);
// ask the AI one game question and wait for its answer (null = no answer in time)
export async function decide(token, mindId, question, timeoutMs = 13e3) {
  const c = hm.client(token), alias = playAlias(mindId);
  const messageText = `[MINDS CLASH game: you are playing for your human. Answer ONLY in the format asked, then one short WHY line.]\n${question}`;
  await c.ensureConversation(alias, mindId);
  const before = await c.getLatestHistoryFingerprint(alias).catch(() => undefined);
  await c.sendMessage({ alias, messageText });
  const r = await c.waitForReply({ alias, timeoutMs, sentMessageText: messageText, ...(before ? { afterFingerprint: before } : {}) });
  return r.timedOut ? null : String(r.reply?.messageText || '');
}
