// 🖼️ A player's personal invite card (1200x630 JPEG): one of 5 painted backgrounds (picked by their link code, so it
// never changes), their Mind NFT in a gold frame, name, rank, rating and wins. X shows it under an invite post.
// Drawn as SVG with the game's pixel font (resvg), the Mind turned from WebP into PNG and the result into JPEG (sharp).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url);
const file = p => readFile(new URL(p, ROOT));
const FONT = fileURLToPath(new URL('tools/video/fonts/PixelifySans.ttf', ROOT));
const cache = new Map();
const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn().catch(e => { cache.delete(k); throw e; })); return cache.get(k); };
const b64 = async (p, type) => `data:${type};base64,${(await once(p, () => file(p))).toString('base64')}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CARD_BGS = 5;
export const bgOf = code => [...String(code)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CARD_BGS + 1;

// text with the game's hard pixel shadow
const t = (x, y, s, size, fill) => `<text x="${x + 3}" y="${y + 4}" font-size="${size}" fill="#000">${esc(s)}</text><text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${esc(s)}</text>`;
// pixel font is about 0.56 em wide per letter: close enough to size the chips and shrink long names
const wide = (s, size) => String(s).length * size * 0.56;

export async function renderCard({ code, name, mind, rank, rating, wins }) {
  const bg = await b64(`web/assets/cards/bg${bgOf(code)}.jpg`, 'image/jpeg');
  const crown = await b64('web/assets/crown.png', 'image/png');
  const m = Math.max(0, Math.min(3333, mind | 0)), x = 60, y = 70;
  const pfp = await once(`m${m}`, async () => `data:image/png;base64,${(await sharp(await file(`web/data/thumbs/${m}.webp`)).png().toBuffer()).toString('base64')}`);
  const nm = String(name || 'A player').slice(0, 18), nsize = Math.min(82, Math.floor(780 / Math.max(1, nm.length) / 0.56));
  let cx = 372, chips = '';
  for (const [label, val] of [['RANK', `#${rank}`], ['RATING', String(rating)], ['WINS', String(wins)]]) {
    const w = Math.max(130, 30 + wide(val, 36));
    chips += `<rect x="${cx + 4}" y="304" width="${w}" height="80" fill="#000"/><rect x="${cx}" y="300" width="${w}" height="80" fill="#2b2340"/>`
      + `<text x="${cx + 14}" y="326" font-size="20" fill="#b9b0d0">${label}</text><text x="${cx + 14}" y="366" font-size="36" fill="#ffc93c">${esc(val)}</text>`;
    cx += w + 16;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="Pixelify Sans">
    <image href="${bg}" width="1200" height="630"/>
    <rect x="${x - 14}" y="${y - 14}" width="278" height="278" fill="#000"/><rect x="${x - 10}" y="${y - 10}" width="270" height="270" fill="#ffc93c"/><rect x="${x - 4}" y="${y - 4}" width="258" height="258" fill="#fff8e4"/>
    <image href="${pfp}" x="${x}" y="${y}" width="250" height="250" style="image-rendering:optimizeSpeed"/>
    <rect x="${x + 70}" y="${y + 236}" width="${Math.max(110, 30 + wide(`#${m}`, 26))}" height="34" fill="#000"/><text x="${x + 82}" y="${y + 262}" font-size="26" fill="#c6f432">#${m}</text>
    <image href="${crown}" x="370" y="66" width="60" height="54" style="image-rendering:optimizeSpeed"/>
    ${t(444, 110, 'MINDS CLASH', 44, '#c6f432')}
    ${t(370, 140 + nsize * 0.95, nm, nsize, '#ffffff')}
    ${t(372, 270, 'invites you to the arena', 36, '#f3ecff')}
    ${chips}
    ${t(64, 450, 'Crown duels. A sky island to build. An AI Mind that plays for you.', 30, '#f3ecff')}
    <rect x="64" y="500" width="586" height="66" fill="#000"/><rect x="60" y="496" width="586" height="66" fill="#c6f432"/>
    <polygon points="82,512 82,546 108,529" fill="#17122a"/><text x="124" y="542" font-size="34" fill="#17122a">JOIN FREE · mindsclash.games</text>
  </svg>`;
  const png = new Resvg(svg, { font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Pixelify Sans' } }).render().asPng();
  return sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}
