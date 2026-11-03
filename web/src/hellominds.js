// Hello Minds (Minds Connect): the player signs in to their own Hello Minds account (or makes one there), and their
// own AI Mind talks and plans for them. It uses their account and their cognition, never ours.
// Sign-in leaves for Hello Minds and comes back to this page in the same tab with ?code=…&state=… (see finish()).
import { MindsOAuth, MindsScope, TokenStore } from '../vendor/minds-connect.js';

export const CLIENT_ID = 'dcae7792-2a81-416b-aa96-0137b29191d7';   // public, no secret
const SCOPES = [MindsScope.MindsList, MindsScope.MindsStatus, MindsScope.MindsCognition, MindsScope.MindsAwaken,
  MindsScope.ConversationsCreate, MindsScope.ConversationsList, MindsScope.ConversationsRead, MindsScope.MessagingSend, MindsScope.MessagingHistory, MindsScope.MessagingStream];
const PICK_KEY = 'mc_hm_mind';
let oauth = null;
const hm = () => (oauth ||= new MindsOAuth({ clientId: CLIENT_ID, redirectUri: `${location.origin}/`, scopes: SCOPES }));

// 🌙 away play gets its OWN sign-in: kept in memory only, then handed to the server (so the browser's login stays as it is)
class MemStore extends TokenStore { constructor() { super(); this.v = null; } get() { return this.v; } set(v) { this.v = v; } clear() { this.v = null; } }
const awayAuth = () => new MindsOAuth({ clientId: CLIENT_ID, redirectUri: `${location.origin}/`, scopes: SCOPES, storage: new MemStore() });
export const awaySignIn = days => awayAuth().signIn({ state: { away: Math.max(1, Math.min(90, days | 0 || 7)) } });
export const connected = () => { try { return !!hm().tokens; } catch { return false; } };
export const signIn = () => hm().signIn();
export const signOut = () => hm().signOut().catch(() => {});
export const onChange = f => hm().onTokensChanged(f);
// a fresh access token for our server, which talks to the player's AI itself (it checks the AI and asks it each move)
export const token = () => hm().getAccessToken().catch(() => null);

// back from Hello Minds: finish the sign-in and clean the address bar. Returns null (nothing to do), 'ok' or an error text
export async function finish() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return null;
  let st = {}; try { st = JSON.parse(q.get('state') || '{}') || {}; } catch { /* not ours */ }
  try {
    if (st.away) { const r = await awayAuth().handleRedirect(); return { away: { ...r.tokens, days: st.away } }; }   // the away sign-in: for the server only
    await hm().handleRedirect(); return 'ok';
  }
  catch (e) { return e.errorDescription || e.error || e.message || 'Hello Minds sign-in failed.'; }
  finally { for (const k of ['code', 'state', 'error', 'error_description']) q.delete(k); history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '')); }
}

// the player's Minds on Hello Minds, and which one plays MINDS CLASH for them (remembered on this device)
export const listMinds = () => hm().client.listMinds();
export const picked = () => { try { return localStorage.getItem(PICK_KEY) || ''; } catch { return ''; } };
export const pick = id => { try { localStorage.setItem(PICK_KEY, id); } catch { /* private mode */ } };
export const balance = id => hm().client.getCognitionBalance(id).then(b => b.cognition).catch(() => null);
// a new AI Mind on their account, named after their game Mind (Clash-1234, Clash-1234-2 if taken)
export async function awaken(base) {
  const c = hm().client;
  let name = base;
  for (let i = 2; i < 9; i++) { const r = await c.checkMindName(name).catch(() => ({ isAvailable: true })); if (r.isAvailable) break; name = `${base}-${i}`; }
  return c.awakenMind({ name, id: 'mastermind' });
}

// what the Mind knows about the game, sent with each message so it answers with moves the game understands
// (the game state is added to every message, so the AI always knows the island as it is right now)
const BRIEF = `[MINDS CLASH game] You are playing the game MINDS CLASH for your human. Answer in 1-3 short, friendly sentences.
Plain text only (no HTML). If they ask you to do ANYTHING in the game, you MUST end with one line "PLAN: " and the steps joined by " then ", using only: farm, sell, well, train troops, upgrade buildings, decorate, adventure, raid, duel N times, town for N min. Do not add rests: keep playing. Example: PLAN: upgrade buildings then farm then sell then upgrade buildings.
If they are only chatting or asking a question, end with "PLAN: none". Use the game state below to answer questions about the island.
`;
const HUMAN = 'Human says: ';
// send a message and wait for the reply (null if it takes too long). Chat with the player and the game's questions
// use two conversations, so the chat history the player sees stays a real chat
// replies can come as web text: paragraphs and line breaks become new lines, tags go, &amp; and friends are decoded
export const plain = t => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
const chatAlias = id => `mindsclash-${id}`, playAlias = id => `mindsclash-play-${id}`;
async function send(alias, mindId, messageText, timeoutMs) {
  const c = hm().client;
  await c.ensureConversation(alias, mindId);
  const before = await c.getLatestHistoryFingerprint(alias).catch(() => undefined);
  await c.sendMessage({ alias, messageText });
  const r = await c.waitForReply({ alias, timeoutMs, sentMessageText: messageText, ...(before ? { afterFingerprint: before } : {}) });
  return r.timedOut ? null : plain(r.reply?.messageText);
}
export const ask = (mindId, text, state = '', timeoutMs = 75e3) => send(chatAlias(mindId), mindId, `${BRIEF}${state ? `[Game now] ${state}
` : ''}${HUMAN}${text}`, timeoutMs);
// a game decision: the AI gets the situation and its training, and answers in a fixed format (parsed by the caller)
export const decide = (mindId, question, timeoutMs = 14e3) => send(playAlias(mindId), mindId, `[MINDS CLASH game: you are playing for your human. Answer ONLY in the format asked, then one short WHY line.]\n${question}`, timeoutMs);
// the chat so far (newest last), from Hello Minds itself; the game's own instructions are hidden
export async function history(mindId, limit = 60) {
  const rows = await hm().client.getHistory(chatAlias(mindId), { limit }).catch(() => []);
  // a player's message carries the game's instructions in front of "Human says:": only their own words are shown
  return rows.map(r => ({ who: r.senderType === 1 ? 'me' : 'mind', text: plain(r.messageText).replace(/^[\s\S]*Human says:\s*/, '').replace(/^\s*PLAN:.*$/im, '').trim(), at: r.createdAt })).filter(r => r.text && !/^\[MINDS CLASH game/.test(r.text) && !/^Write only the PLAN line/.test(r.text)).reverse();
}
// split a reply into what to say and the plan line ("PLAN: …"; '' when there is none)
export function splitReply(reply) {
  const m = /^\s*PLAN:\s*(.*)$/im.exec(reply || '');
  const say = (reply || '').replace(/^\s*PLAN:.*$/im, '').trim();
  return { say, plan: m && !/^none\b/i.test(m[1].trim()) ? m[1].trim() : '' };
}
