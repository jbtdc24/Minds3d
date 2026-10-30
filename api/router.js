// Single entry point for every /api/* call (Vercel's free plan allows 12 functions per deploy).
// vercel.json rewrites /api/<path> -> /api/router?route=<path>.
import auth_nonce from '../lib/routes/auth_nonce.js';
import auth_verify from '../lib/routes/auth_verify.js';
import auth_guest from '../lib/routes/auth_guest.js';
import me from '../lib/routes/me.js';
import profile from '../lib/routes/profile.js';
import queue_join from '../lib/routes/queue_join.js';
import queue_poll from '../lib/routes/queue_poll.js';
import queue_leave from '../lib/routes/queue_leave.js';
import match_view from '../lib/routes/match_view.js';
import match_act from '../lib/routes/match_act.js';
import match_forfeit from '../lib/routes/match_forfeit.js';
import leaderboard from '../lib/routes/leaderboard.js';
import player from '../lib/routes/player.js';
import match_chat from '../lib/routes/match_chat.js';
import friends from '../lib/routes/friends.js';
import friend from '../lib/routes/friend.js';
import messages from '../lib/routes/messages.js';
import island from '../lib/routes/island.js';
import raid from '../lib/routes/raid.js';
import adventure from '../lib/routes/adventure.js';
import admin from '../lib/routes/admin.js';
import gems from '../lib/routes/gems.js';
import energy from '../lib/routes/energy.js';
import mail from '../lib/routes/mail.js';
import report from '../lib/routes/report.js';

const ROUTES = {
  'auth/nonce': auth_nonce, 'auth/verify': auth_verify, 'auth/guest': auth_guest, me, profile,
  'queue/join': queue_join, 'queue/poll': queue_poll, 'queue/leave': queue_leave,
  'match/view': match_view, 'match/act': match_act, 'match/forfeit': match_forfeit, 'match/chat': match_chat, leaderboard, player, friends, friend, messages, island, raid, adventure, admin, gems, energy, mail, report,
};

export default async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');
  const fn = ROUTES[route];
  if (!fn) { res.statusCode = 404; res.setHeader('content-type', 'application/json'); return res.end('{"error":"not found"}'); }
  return fn(req, res);
}
