// 🖼️ Invite links with a personal picture: /i/<code> is a tiny page whose X/Discord card is the player's own invite
// card (/api/card?c=<code>), and which sends people straight on to the homepage with the referral (?ref=<code>).
import { route } from '../http.js';
import { db } from '../db.js';
import { cleanRef } from '../referral.js';
import { renderCard } from '../card.js';

const SITE = 'https://www.mindsclash.games';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function inviter(code) {
  if (!code) return null;
  const p = await db.one('players', `ref_code=eq.${code}&is_guest=eq.false&select=id,name,pfp,rating,wins,bot_wins`).catch(() => null);
  if (!p) return null;
  const above = await db.count('players', `is_guest=eq.false&rating=gt.${Number(p.rating) || 0}`).catch(() => null);
  return { ...p, rank: above == null ? '—' : above + 1, allWins: (p.wins || 0) + (p.bot_wins || 0) };
}

// the card picture itself (cached by Vercel's CDN for an hour, so a viral link costs one render an hour)
export const card = route(async ({ res, query }) => {
  const code = cleanRef(query.c), p = await inviter(code);
  if (!p) { res.statusCode = 302; res.setHeader('location', '/assets/og_share.jpg'); return res.end(); }
  const jpg = await renderCard({ code, name: p.name, mind: p.pfp || 1, rank: p.rank, rating: p.rating, wins: p.allWins });
  res.statusCode = 200;
  res.setHeader('content-type', 'image/jpeg');
  res.setHeader('cache-control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
  res.end(jpg);
}, { methods: ['GET'], auth: false, limit: [120, 60] });

// the page X reads for the link preview; people are sent on at once
export const share = route(async ({ res, query }) => {
  const code = cleanRef(query.c), p = await inviter(code);
  const go = code ? `/?ref=${code}` : '/';
  const title = p ? `${p.name} invites you to MINDS CLASH` : 'MINDS CLASH', desc = 'Crown duels. A sky island to build. An AI Mind that plays for you. Free to play.';
  const img = p ? `${SITE}/api/card?c=${code}` : `${SITE}/assets/og_share.jpg`;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300, s-maxage=600');
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="MINDS CLASH"><meta property="og:url" content="${SITE}/i/${esc(code)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${go}"></head>
<body style="background:#120d24;color:#fff;font-family:sans-serif"><a href="${go}" style="color:#c6f432">Open MINDS CLASH</a></body></html>`);
}, { methods: ['GET'], auth: false, limit: [120, 60] });
