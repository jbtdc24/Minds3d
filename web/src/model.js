// Hand-built voxel models for every MDG trait. A token = base body coloured by its traits
// + face + headwear + hand item + emote stacked on top. Units: 1 = one voxel.
// Character faces +z. Head x -10..9, y 11..25, z -8..7. Torso x -5..4, y 3..10. Legs y 0..2.

// ---------- trait colours (sampled from the original layers) ----------
export const SKIN = {
  Emerald: ['#62b46d', '#c4e2bf'], Gold: ['#f2cf5b', '#ffebba'], Lime: ['#b6cb67', '#e6efbf'],
  Mint: ['#84c4a2', '#cbe7d6'], Monochrome: ['#d7d7d7', '#ffffff'], Peach: ['#fab598', '#fde0d2'],
  Periwinkle: ['#9ca9d6', '#d5d9ee'], Rose: ['#f69aa2', '#fcd6d7'], Sky: ['#78b2e1', '#c9ddf2'],
};
export const SHIRT = {
  Black: '#3f4040', Blue: '#009dc5', Brown: '#704e58', 'Light Blue': '#8ad3db', Orange: '#e19923',
  Purple: '#492a7d', Red: '#d71f27', White: '#ffffff', Yellow: '#fee86b',
};
export const PANTS = { Blue: '#373f59', Gray: '#919a99', Green: '#549271', Red: '#b16a88' };
export const NECK = { Gold: '#e2c35a', Jade: '#7fbf8f', Silver: '#d9d9d9' };
export const BACKGROUND = {
  Blush: '#f3d8e0', Coral: '#ff9c97', Frost: '#d8e6f0', Lilac: '#c9b8f2', Mist: '#b8d4e0', Peach: '#ffd8c9',
  Sage: '#d1e8d1', Sandstone: '#d8c5b8', Sunbeam: '#fde68a', Violet: '#9372e2',
};
const SUIT = '#26262c';   // the dark body every MDG wears

// ---------- voxel container ----------
export class Vox {
  constructor() { this.m = new Map(); }
  static k(x, y, z) { return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512); }
  set(x, y, z, c) { if (c) this.m.set(Vox.k(x, y, z), { x, y, z, c }); else this.m.delete(Vox.k(x, y, z)); }
  get(x, y, z) { return this.m.get(Vox.k(x, y, z))?.c; }
  has(x, y, z) { return this.m.has(Vox.k(x, y, z)); }
  // fill a box; c may be a colour or (x,y,z) => colour|null. round=true drops the 12 edges.
  box(x0, y0, z0, x1, y1, z1, c, round = false) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (round && (x === x0 || x === x1) + (y === y0 || y === y1) + (z === z0 || z === z1) >= 2) continue;
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
    }
    return this;
  }
  // frontmost (largest z) voxel in a column, or null
  front(x, y, zMax = 20) { for (let z = zMax; z > -20; z--) if (this.has(x, y, z)) return z; return null; }
  // draw an ASCII map on the x-y plane at depth z0..z1. Row 0 is the top (y = yTop).
  sprite(rows, pal, x0, yTop, z0, z1 = z0) {
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (pal[ch]) for (let z = z0; z <= z1; z++) this.set(x0 + c, yTop - r, z, pal[ch]);
    }));
    return this;
  }
}

// ---------- faces: 13 x 7 maps placed at head cols 6..18, rows 8..14 ----------
const FACE_PAL = { k: '#16161a', w: '#ffffff', g: '#e2e6ea', p: '#f59aa3', b: '#7fd0ec', r: '#e6394a', e: '#e7f2d8' };
// 'w' in an eye = the little shine pixel
const FACES = {
  Blank: ['', '', '...wk...wk', '...kk...kk', '', '.....kkk'],
  Blushing: ['', '..wk.....wk', '..kk.....kk', '', 'p.k.......k.p', '...kkkkkkk'],
  Crying: ['', '..wk.....wk', '..kk.....kk', '..bb..k..bb', '..bb.....bb', '..bb.....bb'],
  Glasses: ['', '.kkkkk.kkkkk', 'kkwggkkkwggk', '.kgggk.kgggk', '.kkkkk.kkkkk'],
  Happy: ['', '', '..kk.....kk', '', '...k.....k', '....kkkkk'],
  'Knocked Out': ['', '..k.k...k.k', '...k.....k', '..k.k...k.k'],
  Neutral: ['', '', '..kkk...kkk'],
  Sad: ['', '', '...wk...wk', '...kk...kk', '....kkkkk', '...k.....k'],
  'Side Eye': ['', '..eee...eee', '..ekk...ekk', '..ekk...ekk', '', '....kkkk'],
  Silenced: ['', '', '...wk...wk', '...kk...kk', '', '....k.k.k'],
  'Tongue Out': ['', '..wk.....wk', '..kk.....kk', '', '....kkkkk', '.....rrr', '......r'],
  Wink: ['', '', '...wk', '...kk...kkk'],
};
const HAIR_FRONT = (row, col) => row <= 7 || (row <= 9 && col <= 5) || (row <= 11 && col <= 3) || (row <= 13 && col <= 1);
const hash = (a, b, c = 0) => (Math.imul(a * 374761393 + b * 668265263 + c * 2147483647, 1274126177) >>> 0) % 1000;

// Rounded head (superellipsoid), hair cap that stands 1 voxel proud of the face, messy tufts on top.
function buildHead(v, hair, face, { cap = true, tufts = true } = {}) {
  const inside = (x, y, z, k) => ((x + 0.5) / (10 * k)) ** 4 + ((y - 18) / (7.5 * k)) ** 4 + ((z + 0.5) / (8 * k)) ** 4 <= 1;
  const colorAt = (x, y, z) => {
    const row = 25 - y, col = Math.max(0, Math.min(19, x + 10));
    if (row <= 7 || z <= -2) return hair;
    if (z >= 5) return HAIR_FRONT(row, col) ? hair : face;
    return (x < 0 ? row <= 12 : row <= 8) ? hair : face;
  };
  // inner head, plus a smooth hair shell ~1 voxel thicker everywhere except the face window
  v.box(-11, 11, -9, 10, 26, 8, (x, y, z) => {
    if (inside(x, y, z, 1)) return colorAt(x, y, z);
    if (cap && inside(x, y, z, 1.09) && colorAt(x, Math.min(y, 25), Math.min(z, 7)) === hair) return hair;
    return null;
  });
  if (tufts) for (let x = -8; x <= 7; x++) for (let z = -6; z <= 6; z++) {       // a few soft tufts on top
    let top = 30; while (top > 11 && !v.has(x, top, z)) top--;
    if (top > 11 && hash(x, z) % 6 === 0) v.box(x, top + 1, z, x + 1, top + 1, z + 1, hair);
  }
}
function paintFace(v, rows, pal = FACE_PAL, protrude = false) {
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    if (!pal[ch]) return;
    const x = c + 6 - 10, y = 25 - (r + 8), z = v.front(x, y);
    if (z !== null) v.set(x, y, protrude ? z + 1 : z, pal[ch]);
  }));
}

// ---------- body: torso x -6..5, arms at the sides, legs with a gap and toes ----------
function buildBody(s) {
  const torso = new Vox(), armL = new Vox(), armR = new Vox(), legL = new Vox(), legR = new Vox();
  torso.box(-6, 3, -4, 5, 10, 3, (x, y, z) => {
    if ((x === -6 || x === 5) && (z === -4 || z === 3)) return null;            // soft corners
    if (y >= 7) {
      if (z === 3 && ((y >= 9 && x >= -2 && x <= 1) || (y === 8 && x >= -1 && x <= 0))) return s.suit;  // V collar
      return y === 7 ? s.shirtDark : s.shirt;
    }
    return s.suit;
  });
  const arm = (v, x0) => v.box(x0, 4, -1, x0 + 2, 10, 1, (x, y, z) => {
    if (y === 4 && (x === x0 || x === x0 + 2) && (z === -1 || z === 1)) return null;   // round fist
    return y >= 8 ? s.shirt : s.hand;
  });
  arm(armL, -9); arm(armR, 6);
  const leg = (v, x0) => {
    v.box(x0, 0, -2, x0 + 3, 2, 1, (x, y) => y === 0 ? s.foot : s.pants);
    v.box(x0, 0, 2, x0 + 3, 0, 2, s.foot);                                          // toes
  };
  leg(legL, -5); leg(legR, 1);
  if (s.neck) {          // chain V from the shoulders down to a pendant
    for (const [x, y] of [[-5, 10], [-4, 9], [-3, 8], [-2, 7], [4, 10], [3, 9], [2, 8], [1, 7]]) torso.set(x, y, 4, s.neck);
    torso.box(-1, 5, 4, 0, 6, 4, s.neck); torso.set(-1, 6, 5, '#ffffff');
  }
  return { torso, armL, armR, legL, legR };
}
const darken = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

// ---------- headwear (built around the head box) ----------
const shell = (v, x0, y0, z0, x1, y1, z1, c) => v.box(x0, y0, z0, x1, y1, z1, c, true);
const HATS = {
  Beanie(v) {
    shell(v, -11, 19, -9, 10, 27, 8, (x, y, z) => y <= 20 ? ((x + z) % 2 ? '#4a4a4f' : '#5c5c62') : (x % 3 === 0 ? '#55555b' : '#66666c'));
    v.box(-8, 28, -6, -5, 30, -3, '#77777d', true);           // pompom
    v.box(6, 20, 9, 8, 21, 9, '#f2f2f2'); v.set(7, 20, 9, '#333');
  },
  'Bowler Hat'(v) {
    for (let x = -13; x <= 12; x++) for (let z = -11; z <= 10; z++)
      if (((x + 0.5) / 13) ** 2 + ((z + 0.5) / 11) ** 2 <= 1) v.set(x, 21, z, '#2e2e33');
    shell(v, -9, 22, -7, 8, 28, 6, (x, y) => y === 22 ? '#1d1d21' : '#46464d');
    v.box(-7, 28, -5, -4, 28, -3, '#5a5a62');
  },
  Cap(v) {
    shell(v, -11, 20, -9, 10, 27, 8, (x, y, z) => (x <= -4 || z <= -5) ? '#6a9e63' : '#efeee6');
    v.box(-8, 20, 9, 7, 20, 13, '#e2e0d6', true);             // brim
    v.box(-1, 28, -1, 0, 28, 0, '#a8d39b');
    v.box(2, 23, 9, 6, 24, 9, '#5f8f59');                     // logo patch
  },
  Crown(v) {
    const gold = '#f5cf55', dark = '#d9a92f';
    for (let y = 25; y <= 27; y++) for (let x = -11; x <= 10; x++) for (let z = -9; z <= 8; z++)
      if (x === -11 || x === 10 || z === -9 || z === 8) v.set(x, y, z, y === 25 ? dark : gold);
    for (let x = -11; x <= 10; x += 3) for (const z of [-9, 8]) v.box(x, 28, z, x, 29 + (x === -2 ? 2 : 0), z, gold);
    for (let z = -9; z <= 8; z += 3) for (const x of [-11, 10]) v.box(x, 28, z, x, 29, z, gold);
    v.box(-3, 26, 9, -1, 28, 9, '#1e9e54'); v.set(-2, 28, 9, '#8fe3b0');
    v.box(-9, 26, 9, -8, 27, 9, '#1e9e54'); v.box(6, 26, 9, 7, 27, 9, '#1e9e54');
  },
  'Frog Hat'(v) {
    shell(v, -11, 21, -9, 10, 27, 8, '#6db35f');
    v.box(-10, 21, -8, 9, 21, 7, '#5a9b4e');
    for (const x0 of [-10, 4]) {
      v.box(x0, 27, 2, x0 + 5, 31, 7, '#6db35f', true);
      v.box(x0 + 1, 28, 8, x0 + 4, 30, 8, '#ffffff');
      v.box(x0 + 2, 28, 9, x0 + 3, 29, 9, '#16161a');
    }
    v.box(-2, 24, 9, 1, 24, 9, '#16161a'); v.set(-3, 25, 9, '#16161a'); v.set(2, 25, 9, '#16161a');
  },
  Goggles(v) {
    for (let x = -11; x <= 10; x++) for (let z = -9; z <= 8; z++) if (x === -11 || x === 10 || z === -9 || z === 8)
      v.box(x, 21, z, x, 22, z, '#3a3a40');
    for (const x0 of [-8, 1]) {
      v.box(x0, 20, 8, x0 + 5, 24, 10, '#8a8f96', true);
      v.box(x0 + 1, 21, 11, x0 + 4, 23, 11, '#cfe3ee');
      v.set(x0 + 1, 23, 11, '#ffffff'); v.set(x0 + 2, 22, 11, '#ffffff');
    }
  },
  Headphones(v) {
    const band = '#ececec';
    for (let x = -11; x <= 10; x++) v.box(x, x <= -10 || x >= 9 ? 24 : 26, -1, x, 26, 1, band);
    for (const [x0, x1] of [[-14, -11], [10, 13]]) {
      v.box(x0, 12, -3, x1, 19, 3, band, true);
      const out = x0 < 0 ? x0 : x1;
      v.box(out, 14, -1, out, 17, 1, '#5aa66a');
      v.box(x0 < 0 ? -11 : 10, 19, -1, x0 < 0 ? -11 : 10, 24, 1, band);
    }
  },
  Helmet(v) {
    shell(v, -11, 20, -9, 10, 27, 8, (x, y) => y === 20 ? '#222226' : '#38383e');
    v.box(-12, 14, -9, -11, 21, -2, '#2c2c31');                  // side flap
    v.box(6, 25, 9, 7, 25, 9, '#77777f');
    v.box(-1, 28, -1, 0, 31, 0, '#9a9aa2');
    v.box(-2, 32, -2, 1, 35, 1, '#3cbf4a', true); v.set(-1, 35, 1, '#c7f7a0'); v.set(-2, 34, 1, '#9ae68a');
  },
};

// ---------- hand items (grip at origin, pointing up) ----------
const ITEMS = {
  Sword(v) {
    v.box(0, -2, 0, 0, 1, 0, '#6b4423');
    v.box(-2, 2, -1, 2, 2, 1, '#e3b33c'); v.set(0, 2, 2, '#7ac36a');
    v.box(-1, 3, 0, 1, 14, 0, (x) => x === -1 ? '#f4f6f8' : x === 0 ? '#d3d8de' : '#a9b0b8');
    v.box(0, 15, 0, 0, 16, 0, '#d3d8de');
  },
  Torch(v) {
    v.box(0, -2, 0, 0, 6, 0, '#7a4a25');
    v.box(-1, 7, -1, 1, 8, 1, '#c7922e');
    const fire = [['#e8432a', 9, 2], ['#f6892b', 10, 2], ['#f6892b', 11, 1], ['#ffd34a', 12, 1], ['#ffd34a', 13, 0], ['#fff3b0', 14, 0]];
    for (const [c, y, r] of fire) v.box(-r, y, -r, r, y, r, c);
    v.set(1, 13, 0, '#f6892b'); v.set(-1, 12, 1, '#e8432a');
  },
  Lollipop(v) {
    v.box(0, -2, 0, 0, 6, 0, '#f4f4f4');
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (x * x + y * y <= 11) {
      const a = Math.atan2(y, x) + Math.hypot(x, y) * 1.3;
      v.box(x, 10 + y, -1, x, 10 + y, 0, Math.sin(a * 2) > 0.2 ? '#ffffff' : '#f07aa0');
    }
  },
  Pencil(v) {
    v.box(-1, -3, 0, 0, -2, 0, '#f19aa8');
    v.box(-1, -1, 0, 0, -1, 0, '#b8b8b8');
    v.box(-1, 0, 0, 0, 9, 0, (x) => x === -1 ? '#f7cf45' : '#e2ac2c');
    v.box(-1, 10, 0, 0, 10, 0, '#edd2a2'); v.set(-1, 11, 0, '#edd2a2'); v.set(-1, 12, 0, '#333338');
  },
  Ruler(v) {
    v.box(-1, -2, 0, 1, 12, 0, '#f5c84a');
    for (let y = -1; y <= 12; y += 2) v.set(1, y, 0, '#8a6a1c');
    for (let y = 0; y <= 12; y += 4) v.set(0, y, 0, '#8a6a1c');
  },
  Flower(v) {
    v.box(0, -2, 0, 0, 7, 0, '#4f9a3c'); v.set(1, 4, 0, '#6cc04f'); v.set(2, 5, 0, '#6cc04f');
    for (const [x, y] of [[0, 3], [0, -3], [3, 0], [-3, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]])
      v.box(x - 1, 10 + y - 1, -1, x + 1, 10 + y + 1, 0, '#fff5d6');
    v.box(-1, 9, 0, 1, 11, 1, '#f5b52a');
  },
  Twig(v) {
    const path = [[0, -2], [0, -1], [0, 0], [1, 1], [1, 2], [1, 3], [2, 4], [2, 5], [2, 6], [3, 7], [3, 8], [4, 9], [4, 10]];
    for (const [x, y] of path) v.set(x, y, 0, '#8a5a32');
    v.set(-1, 3, 0, '#8a5a32'); v.set(-2, 4, 0, '#8a5a32');
    v.box(-4, 5, 0, -3, 6, 0, '#7cc04b'); v.box(4, 11, 0, 5, 13, 0, '#7cc04b'); v.set(5, 13, 0, '#a7e07a');
  },
};

// ---------- emotes (floating icons, 2 voxels thick) ----------
const EMOTES = {
  Confused: [['.yyyy.', 'yy..yy', '....yy', '...yy.', '..yy..', '..yy..', '......', '..yy..'], { y: '#f5c234' }],
  Energized: [['...yyy', '..yyy.', '.yyy..', 'yyyyyy', '...yy.', '..yy..', '.yy...', 'y.....'], { y: '#f7d038' }],
  Love: [['.rr.rr.', 'rwrrrrr', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#e8343c', w: '#ff9aa0' }],
  Nervous: [['...b...', '..bbb..', '.bbbbb.', 'bwbbbbb', 'bwbbbbb', 'bbbbbbb', '.bbbbb.', '..bbb..'], { b: '#7cc8ee', w: '#e6f7ff' }],
  Sleepy: [['....BBBB', '......B.', '.....B..', '....BBBB', 'bbb.....', '..b.....', '.b......', 'bbb.....'], { B: '#7aaee6', b: '#9cc4ef' }],
  Sparks: [['...y...', '...y...', '..yyy..', 'yyywyyy', '..yyy..', '...y...', '...y...'], { y: '#f8d84a', w: '#ffffff' }],
  Surprised: [['.rr.', '.rr.', '.rr.', '.rr.', '.rr.', '....', '.rr.'], { r: '#e8344c' }],
};

// ---------- legendaries: 1-of-1 builds with their own parts, animation and aura ----------
// Each returns { parts, extra, anim, aura }. extra = { part: [parent, pivot in model voxels] }.
// '*' colours glow. anim(t, P, sx) moves only the extra parts (and head offsets).
function base(s, faceRows, opts = {}, pal = FACE_PAL) {
  const p = buildBody({ suit: SUIT, shirtDark: darken(s.shirt, 0.8), ...s });
  p.head = new Vox();
  buildHead(p.head, s.hair, s.face, opts);
  if (faceRows) paintFace(p.head, faceRows, pal);
  return p;
}
const ring = (v, cx, cy, cz, rx, rz, color, plane = 'xz', n = 96) => {
  for (let a = 0; a < n; a++) {
    const t = a / n * Math.PI * 2, u = Math.round(Math.cos(t) * rx - 0.5), w = Math.round(Math.sin(t) * rz - 0.5);
    plane === 'xz' ? v.set(cx + u, cy, cz + w, color) : v.set(cx + u, cy + w, cz, color);
  }
};
const diamond = (v, x, y, z, widths, inner, outer) => widths.forEach((w, i) => {
  for (let dx = -w; dx <= w; dx++) v.set(x + dx, y + i, z, Math.abs(dx) < w || w === 0 ? inner : outer);
});
const recolor = (v, fn) => { for (const e of v.m.values()) { const c = fn(e); if (c) e.c = c; } };
const jitter = (g, k, amt) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + (Math.random() < k ? (Math.random() - 0.5) * amt : 0); };

const LEGENDS = {
  angel() {
    const p = base({ hair: '#ffe08a', face: '#fff7ef', shirt: '#ffffff', pants: '#f3e2b0', hand: '#fff7ef', foot: '#f5c542', suit: '#efe6d2' },
      ['', '', '..kk.....kk', '', 'p..k.....k..p', '....kkkkk']);
    p.halo = new Vox(); ring(p.halo, 0, 31, 0, 7, 5, '*#ffd84a'); ring(p.halo, 0, 31, 0, 6, 4, '*#fff3b0');
    for (const s of [-1, 1]) {
      const w = p[s < 0 ? 'wingL' : 'wingR'] = new Vox();
      for (let i = 0; i <= 12; i++) {
        const x = s < 0 ? -4 - i : 3 + i, top = 11 + Math.round(i * 0.55), bot = 11 - Math.round(i * 0.55) - (i % 2) - (i > 8 ? 2 : 0);
        for (let y = bot; y <= top; y++) for (let z = -7; z <= (i < 7 ? -5 : -6); z++)
          w.set(x, y, z, y === top ? '*#fff6d6' : y - bot < 2 ? '#c9d6ff' : y - bot < 4 ? '#e6edff' : '#ffffff');
      }
    }
    p.item = new Vox();
    p.item.box(0, -4, 0, 0, 15, 0, '#e8c25a'); p.item.box(-1, 14, -1, 1, 14, 1, '#f5d77a');
    diamond(p.item, 0, 16, 0, [1, 2, 2, 1, 1, 0], '*#fff3c4', '*#ffd84a');
    return {
      parts: p, extra: { halo: ['head', [0, 31, 0]], wingL: ['body', [-4, 11, -6]], wingR: ['body', [3, 11, -6]] },
      anim(t, P, sx) {
        const f = 0.25 + (Math.sin(t * 5) + 1) * 0.28;
        P.wingL.rotation.y = -sx * f; P.wingR.rotation.y = sx * f;
        P.halo.position.y = (P.halo.userData.y0 ??= P.halo.position.y) + Math.sin(t * 2.2) * 0.05;
        P.halo.rotation.y = t * 0.8;
      },
      aura: { colors: ['#fff3b0', '#ffd84a', '#ffffff'], rate: 9, rise: 0.7, spread: 0.9, at: [0, 1.0, 0], glow: true },
    };
  },
  bones() {
    const bone = '#ece6d6';
    const p = base({ hair: bone, face: '#f5f1e6', shirt: '#1c1b24', pants: '#1c1b24', hand: bone, foot: bone, suit: '#1c1b24' },
      ['', '..kkk...kkk', '..kGk...kGk', '..kkk...kkk', '......k', '...wkwkwkw', '...kkkkkkk'], { cap: false, tufts: false },
      { ...FACE_PAL, G: '*#6ff3ff', w: '#fbf8ee' });
    for (const [x, y] of [[-7, 23], [-6, 22], [-6, 21], [-5, 20], [-4, 20]]) { const z = p.head.front(x, y); if (z !== null) p.head.set(x, y, z, '#8a8478'); }
    // ribcage + spine on the dark torso, bones for limbs
    p.torso.box(-1, 3, 4, 0, 10, 4, bone);
    for (const y of [5, 7, 9]) { p.torso.box(-5, y, 4, 4, y, 4, bone); for (const x of [-7, 6]) p.torso.box(x, y, -3, x, y, 2, bone); }
    p.armL = new Vox().box(-8, 6, 0, -7, 10, 1, bone).box(-9, 4, -1, -7, 5, 1, bone);
    p.armR = new Vox().box(6, 6, 0, 7, 10, 1, bone).box(6, 4, -1, 8, 5, 1, bone);
    p.legL = new Vox().box(-4, 1, -1, -3, 2, 0, bone).box(-5, 0, -2, -2, 0, 2, bone);
    p.legR = new Vox().box(2, 1, -1, 3, 2, 0, bone).box(1, 0, -2, 4, 0, 2, bone);
    p.item = new Vox();
    p.item.box(0, -6, 0, 0, 18, 0, '#3b2f2a'); p.item.box(-1, 17, 0, 1, 17, 0, '#9a9aa2');
    for (let i = 0; i <= 10; i++) { const y = 18 - Math.round(i * i * 0.07); p.item.set(-i, y, 0, '*#c49cff'); p.item.set(-i, y - 1, 0, '#6b4fc4'); }
    return { parts: p, extra: {},
      anim(t, P) { P.head.rotation.x = Math.sin(t * 7) * 0.03; },
      aura: { colors: ['#8a5cff', '#c9a6ff', '#5a3fd1'], rate: 8, rise: 0.5, spread: 0.8, at: [0, 0.8, 0], glow: true } };
  },
  error() {
    const p = base({ hair: '#6f63b8', face: '#a99ee6', shirt: '#4b4390', pants: '#2f2a63', hand: '#a99ee6', foot: '#2f2a63' },
      ['', '..R.R...R.R', '...R.....R', '..R.R...R.R', '', '...k.k.k.k', '....k.k.k'], {}, { ...FACE_PAL, R: '*#ff2a2a' });
    recolor(p.head, e => hash(e.x, e.y, e.z) % 13 === 0 ? '#ff2a2a' : null);
    for (let i = 0; i < 6; i++) p.head.box(i % 2 ? 10 : -12, 13 + i * 2, -3 + i, i % 2 ? 11 : -11, 13 + i * 2, 1 + i, '*#ff2a2a');
    p.warn = new Vox().sprite(['....R....', '...RRR...', '...RWR...', '..RRWRR..', '..RRWRR..', '.RRRRRRR.', '.RRRWRRR.', 'RRRRRRRRR'],
      { R: '*#ff2a2a', W: '*#ffffff' }, -4, 36, 0, 1);
    p.errs = new Vox();
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2, cx = Math.round(Math.cos(a) * 15), cz = Math.round(Math.sin(a) * 15), cy = 14 + k * 4;
      p.errs.box(cx - 4, cy, cz, cx + 4, cy + 5, cz, (x, y) => y === cy + 5 ? '*#ff2a2a' : '#f4f4f8');
      for (let d = -1; d <= 1; d++) { p.errs.set(cx + d, cy + 2 + d, cz, '#ff2a2a'); p.errs.set(cx + d, cy + 2 - d, cz, '#ff2a2a'); }
    }
    p.item = new Vox(); p.item.box(0, -3, 0, 0, 1, 0, '#222228');
    for (let y = 2; y <= 15; y++) { const o = y % 3 === 0 ? 1 : 0; p.item.set(o, y, 0, '*#ff3b3b'); p.item.set(o - 1, y, 0, '#c21f2f'); }
    return { parts: p, extra: { warn: ['head', [0, 32, 0]], errs: ['root', [0, 0, 0]] },
      anim(t, P) {
        P.errs.rotation.y = t * 0.7;
        P.warn.position.y = (P.warn.userData.y0 ??= P.warn.position.y) + Math.sin(t * 3) * 0.06; P.warn.rotation.y = Math.sin(t * 2) * 0.6;
        jitter(P.head, 0.08, 0.12); jitter(P.torso, 0.05, 0.1);
      },
      aura: { colors: ['#ff2a2a', '#ffffff', '#a99ee6'], rate: 6, rise: 0.25, spread: 1.0, at: [0, 1.0, 0], glow: true } };
  },
  fire() {
    const p = base({ hair: '#ff7a1a', face: '#ffe3a0', shirt: '#d9481f', pants: '#7a2412', hand: '*#ffb03a', foot: '#3a1a10' },
      ['', '', '...wk...wk', '...kk...kk', '', '....kkkk'], { tufts: false });
    const ramp = ['*#d8321f', '*#ff4a1f', '*#ff7a1a', '*#ffa52e', '*#ffd34a', '*#fff3a0'];
    const flames = (seed, scale) => {
      const v = new Vox();
      for (let x = -10; x <= 9; x++) for (let z = -8; z <= 7; z++) {
        const h0 = hash(x, z, seed);
        if (h0 % 3) continue;
        const h = Math.round((3 + (h0 % 6) + (10 - Math.abs(x)) * 0.5) * scale);
        for (let i = 0; i < h; i++) v.set(x, 24 + i, z, ramp[Math.min(5, Math.floor(i / h * 6))]);
      }
      for (const x of [-8, 7]) for (let z = -1; z <= 1; z++) for (let i = 0; i < 3 + (hash(x, z, seed) % 3); i++) v.set(x + (x < 0 ? -1 : 1), 11 + i, z, ramp[Math.min(5, i + 1)]);
      return v;
    };
    p.flames = flames(1, 1); p.flames2 = flames(7, 0.75);
    return { parts: p, extra: { flames: ['head', [0, 24, 0]], flames2: ['head', [0, 24, 0]] },
      anim(t, P) {
        P.flames.scale.y = 1 + Math.sin(t * 13) * 0.14; P.flames.rotation.y = Math.sin(t * 3) * 0.08;
        P.flames2.scale.y = 1 + Math.sin(t * 11 + 2) * 0.18; P.flames2.rotation.y = -Math.sin(t * 2.5) * 0.1;
      },
      aura: { colors: ['#ff7a1a', '#ffd34a', '#ff3b1a'], rate: 18, rise: 1.6, spread: 0.7, at: [0, 1.7, 0], glow: true } };
  },
  glitch() {
    const p = base({ hair: '#eaeaea', face: '#ffffff', shirt: '#dcdcdc', pants: '#b5b5b5', hand: '#ffffff', foot: '#9a9a9a' }, FACES.Blank);
    for (const [name, c] of [['ghostC', '*#00e5ff'], ['ghostM', '*#ff2bd6']]) {
      p[name] = new Vox();
      for (const e of p.head.m.values()) p[name].set(e.x, e.y, e.z, c);
    }
    p.noise = new Vox();
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996, r = 12 + (i % 5);
      p.noise.set(Math.round(Math.cos(a) * r), 3 + (i * 7) % 28, Math.round(Math.sin(a) * r), ['*#ffffff', '*#00e5ff', '*#ff2bd6'][i % 3]);
    }
    p.item = new Vox(); p.item.box(0, -3, 0, 0, 1, 0, '#16161a'); p.item.box(-1, 2, 0, 1, 2, 0, '*#00e5ff');
    p.item.box(0, 3, 0, 0, 18, 0, '*#d9fdff'); p.item.box(1, 3, 0, 1, 16, 0, '*#00e5ff');
    return { parts: p, extra: { ghostC: ['head', [0, 11, 0]], ghostM: ['head', [0, 11, 0]], noise: ['root', [0, 0, 0]] },
      anim(t, P) {
        const on = Math.random() < 0.85;
        P.ghostC.visible = P.ghostM.visible = on;
        P.ghostC.position.set(-0.06 - Math.random() * 0.05, 0, -0.05); P.ghostM.position.set(0.06 + Math.random() * 0.05, 0, -0.05);
        P.noise.rotation.y = Math.floor(t * 6) * 0.9; P.noise.visible = Math.random() < 0.7;
        jitter(P.head, 0.06, 0.15);
      },
      aura: { colors: ['#00e5ff', '#ff2bd6', '#ffffff'], rate: 8, rise: 0.15, spread: 1.0, at: [0, 1.0, 0], glow: true } };
  },
  ice() {
    const p = base({ hair: '#8fd0f2', face: '#e9f7ff', shirt: '#5aa9dc', pants: '#2f6fa8', hand: '#d4f1ff', foot: '#2f6fa8' },
      ['', '', '...wk...wk', '...kk...kk', 'b.........b', '.....kkk'], {}, { ...FACE_PAL, b: '#a8dcff' });
    p.crown = new Vox();
    for (let a = 0; a < 11; a++) {
      const t = a / 11 * Math.PI * 2 + Math.PI / 2, x = Math.round(Math.cos(t) * 8), z = Math.round(Math.sin(t) * 6);
      const h = 4 + Math.round((Math.sin(t) + 1) * 3) + (a % 2) * 2;
      for (let i = 0; i < h; i++) {
        const w = i < h * 0.5 ? 1 : 0;
        p.crown.box(x, 25 + i, z, x + w, 25 + i, z + w, i === h - 1 ? '*#c9f5ff' : i > h * 0.6 ? '#e8f8ff' : '#a9e1fb');
      }
    }
    for (const [v, x0] of [[p.armL, -10], [p.armR, 6]]) {
      v.box(x0, 9, -2, x0 + 4, 11, 2, '#bfe8ff');
      v.box(x0 + 1, 12, 0, x0 + 1, 14, 0, '#e8f8ff'); v.box(x0 + 3, 12, -1, x0 + 3, 13, -1, '#e8f8ff');
    }
    p.shards = new Vox();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, x = Math.round(Math.cos(a) * 15), z = Math.round(Math.sin(a) * 15);
      diamond(p.shards, x, 12 + (k % 2) * 6, z, [0, 1, 1, 2, 1, 1, 0], '*#c9f5ff', '#8fdcff');
    }
    p.item = new Vox(); p.item.box(0, -5, 0, 0, 13, 0, '#7fc8ee');
    diamond(p.item, 0, 14, 0, [1, 2, 2, 2, 1, 1, 0], '*#d9f8ff', '#8fdcff');
    return { parts: p, extra: { crown: ['head', [0, 25, 0]], shards: ['root', [0, 0, 0]] },
      anim(t, P) { P.shards.rotation.y = t * 1.1; P.shards.position.y = Math.sin(t * 2) * 0.06; },
      aura: { colors: ['#ffffff', '#d6f2ff'], rate: 10, rise: -0.3, spread: 1.8, at: [0, 3.0, 0], glow: true } };
  },
  joker() {
    const red = '#d6263b', purple = '#5b2a86';
    const p = base({ hair: '#ffffff', face: '#ffffff', shirt: red, pants: purple, hand: '#ffffff', foot: '#16161a', suit: '#16161a' },
      ['', '..P.....P', '.PkP...PkP', '..P.....P', '.rr.....rr', '..rwwwwwr', '...rrrrr'], { cap: false, tufts: false },
      { ...FACE_PAL, P: '#7b3fc4' });
    p.head.box(0, 13, 8, 2, 15, 9, '#ff2a3a', true);                              // nose
    for (let x = -11; x <= 10; x++) for (let z = -9; z <= 8; z++) if (x === -11 || x === 10 || z === -9 || z === 8)
      p.head.box(x, 21, z, x, 23, z, (x + z) & 2 ? red : purple);
    const prong = (pts, c) => pts.forEach(([x, y, z], i) => {
      const r = i < 2 ? 2 : 1;
      p.head.box(x - r + 1, y - r + 1, z - r + 1, x + r - 1, y + r - 1, z + r - 1, c);
      if (i === pts.length - 1) p.head.box(x - 1, y - 2, z - 1, x, y - 1, z, '*#ffd84a');
    });
    prong([[-6, 25, 0], [-8, 27, 0], [-10, 29, 0], [-12, 30, 0], [-14, 30, 0], [-16, 29, 0], [-17, 27, 0]], red);
    prong([[0, 25, -2], [0, 28, -3], [0, 31, -4], [0, 33, -6], [0, 33, -8], [0, 31, -10]], purple);
    prong([[5, 25, 0], [7, 27, 0], [9, 29, 0], [11, 30, 0], [13, 30, 0], [15, 29, 0], [16, 27, 0]], red);
    recolor(p.torso, e => e.y >= 7 ? (((e.x + e.y) & 2) ? red : purple) : null);
    for (let x = -7; x <= 6; x++) for (let z = -5; z <= 4; z++) if (x === -7 || x === 6 || z === -5 || z === 4) p.torso.set(x, (x + z) & 1 ? 11 : 10, z, '#ffffff');
    recolor(p.legR, e => e.y > 0 ? red : null);
    p.item = new Vox(); p.item.box(0, -3, 0, 0, 11, 0, '#f2c037');
    p.item.box(-4, 12, -2, 4, 16, 2, (x) => Math.abs(x) >= 3 ? '#ffd84a' : '#e6394a', true);
    return { parts: p, extra: {},
      anim(t, P) { P.head.rotation.x = Math.sin(t * 4) * 0.04; },
      aura: { colors: ['#ff4d6d', '#ffd84a', '#4dd2ff', '#7cff6b'], rate: 6, rise: 0.6, spread: 1.0, at: [0, 2.2, 0], glow: false } };
  },
  monkey() {
    const fur = '#e98e9a', skin = '#fbd3d6';
    const p = base({ hair: fur, face: skin, shirt: '#d6263b', pants: '#f5c542', hand: fur, foot: '#5a3b22' }, ['', '', '...wk...wk', '...kk...kk']);
    for (const [x0, x1, xi] of [[-14, -11, -14], [10, 13, 13]]) { p.head.box(x0, 15, -1, x1, 21, 2, fur, true); p.head.box(xi, 16, 0, xi, 20, 1, skin); }
    p.head.box(-2, 11, 8, 5, 15, 8, '#fde3e5', true);                              // muzzle
    p.head.set(0, 14, 9, '#16161a'); p.head.set(3, 14, 9, '#16161a'); p.head.box(0, 12, 9, 3, 12, 9, '#16161a');
    for (let x = -11; x <= 10; x++) for (let z = -9; z <= 8; z++) if (x === -11 || x === 10 || z === -9 || z === 8) p.head.box(x, 21, z, x, 22, z, '#f5c542');
    p.head.box(1, 21, 9, 2, 22, 9, '*#ff3b3b');                                   // circlet gem
    recolor(p.torso, e => e.y === 7 ? '#f5c542' : null);
    p.tail = new Vox();
    for (const [y, z] of [[5, -5], [4, -6], [4, -7], [4, -8], [5, -9], [6, -10], [8, -11], [10, -11], [12, -10], [13, -9], [13, -8], [12, -7]])
      p.tail.box(2, y, z, 3, y + 1, z, fur);
    p.item = new Vox(); p.item.box(0, -12, 0, 0, 22, 0, '#f5c542');
    p.item.box(-1, -14, -1, 1, -11, 1, '#d6263b'); p.item.box(-1, 20, -1, 1, 23, 1, '#d6263b');
    p.item.set(0, -15, 0, '*#ffd84a'); p.item.set(0, 24, 0, '*#ffd84a');
    return { parts: p, extra: { tail: ['body', [2.5, 5, -5]] },
      anim(t, P) { P.tail.rotation.z = Math.sin(t * 3) * 0.3; P.tail.rotation.y = Math.sin(t * 2) * 0.25; },
      aura: { colors: ['#ffffff', '#ffe9b0'], rate: 7, rise: 0.15, spread: 0.6, at: [0, 0.05, 0], glow: false } };
  },
  robot() {
    const p = base({ hair: '#8aa3c8', face: '#b8c8dc', shirt: '#4f6a8f', pants: '#3a4f6c', hand: '#c9d3de', foot: '#2c3440', suit: '#2a3140' },
      null, { cap: false, tufts: false });
    recolor(p.head, e => e.y >= 22 ? '#8aa3c8' : e.y === 21 ? '#6f86a8' : '#b8c8dc');
    for (let x = -9; x <= 9; x++) for (let y = 14; y <= 18; y++) {
      const z = p.head.front(x, y);
      if (z !== null && x >= -8 && x <= 8) p.head.set(x, y, z, y === 14 || y === 18 ? '#1b2230' : '*#3cf2ff');
    }
    for (let x = -1; x <= 4; x++) { const z = p.head.front(x, 12); if (z !== null && x % 2) p.head.set(x, 12, z, '#3a4558'); }
    for (const [x0, x1, xl] of [[-12, -11, -12], [10, 11, 11]]) { p.head.box(x0, 14, -3, x1, 20, 3, '#5d6f8a'); p.head.set(xl, 17, 0, '*#4cff7a'); }
    p.antenna = new Vox().box(0, 26, 0, 0, 30, 0, '#9aa6b4').box(-1, 31, -1, 1, 33, 1, '*#ff3b5c', true);
    p.torso.box(-2, 4, 4, 1, 7, 4, '#1b2230'); p.torso.box(-1, 5, 5, 0, 6, 5, '*#3cf2ff');
    p.armL.box(-10, 9, -2, -6, 11, 2, '#6f86a8', true); p.armR.box(6, 9, -2, 10, 11, 2, '#6f86a8', true);
    p.jets = new Vox();
    for (const x0 of [-4, 1]) { p.jets.box(x0, 5, -7, x0 + 2, 9, -5, '#5d6f8a'); p.jets.box(x0, 4, -7, x0 + 2, 4, -5, '*#5ad1ff'); }
    p.item = new Vox(); p.item.box(0, -3, 0, 0, 1, 0, '#9aa6b4'); p.item.box(-1, 2, 0, 1, 2, 0, '#2a3140');
    p.item.box(0, 3, 0, 0, 18, 0, '*#ff3b5c'); p.item.box(1, 3, 0, 1, 17, 0, '*#ff9aac');
    return { parts: p, extra: { antenna: ['head', [0, 26, 0]], jets: ['body', [0, 7, -5]] },
      anim(t, P) { P.antenna.rotation.z = Math.sin(t * 5) * 0.15; P.antenna.children.at(-1).visible = Math.sin(t * 6) > -0.3; },
      aura: { colors: ['#5ad1ff', '#ffffff', '#3c8bff'], rate: 18, rise: -1.4, spread: 0.12, at: [0, 0.55, -0.45], glow: true } };
  },
  void() {
    const p = base({ hair: '#141729', face: '#1d2140', shirt: '#0f1120', pants: '#0b0c16', hand: '#1d2140', foot: '#0b0c16', suit: '#0f1120' },
      ['', '', '...ww...ww', '...ww...ww'], {}, { ...FACE_PAL, w: '*#7ff6ff' });
    for (const v of [p.head, p.torso, p.armL, p.armR, p.legL, p.legR])
      recolor(v, e => e.c[0] !== '*' && hash(e.x, e.y, e.z) % 29 === 0 ? (hash(e.z, e.x) % 2 ? '*#ffffff' : '*#b79cff') : null);
    p.ring = new Vox(); ring(p.ring, 0, 19, -10, 13, 13, '*#8a5cff', 'xy', 160); ring(p.ring, 0, 19, -10, 12, 12, '#2a1f5a', 'xy', 160);
    p.item = new Vox();
    for (let x = -3; x <= 3; x++) for (let y = 0; y <= 6; y++) for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x, y - 3, z);
      if (d <= 3.2) p.item.set(x, y, z, d < 1.6 ? '*#ffffff' : d < 2.5 ? '*#b48cff' : '*#6a3fe0');
    }
    return { parts: p, extra: { ring: ['head', [0, 19, -10]] },
      anim(t, P) { P.ring.rotation.z = t * 0.7; },
      aura: { colors: ['#8a5cff', '#7ff6ff', '#3b2a7a'], rate: 14, rise: 0.5, spread: 1.3, at: [0, 0.6, 0], glow: true } };
  },
};

// Build every voxel part for one token's traits.
export function buildToken(traits) {
  if (traits.Legendary && LEGENDS[traits.Legendary]) return LEGENDS[traits.Legendary]();
  const [hair, face] = SKIN[traits.Skin] || SKIN.Peach;
  const shirt = SHIRT[traits.Shirt] || SUIT;
  const parts = buildBody({ suit: SUIT, hair, face, hand: hair, foot: hair, shirt, shirtDark: darken(shirt, 0.82),
    pants: PANTS[traits.Pants] || SUIT, neck: NECK[traits.Neck] });
  parts.head = new Vox();
  const hat = HATS[traits.Headwear];
  buildHead(parts.head, hair, face, { tufts: !hat });
  paintFace(parts.head, FACES[traits.Face] || FACES.Blank, FACE_PAL, traits.Face === 'Glasses');
  if (traits.Face === 'Glasses') {                      // temple arm wraps to the left side
    for (let z = -3; z <= 6; z++) parts.head.set(-11, 15, z, FACE_PAL.k);
  }
  if (hat) hat(parts.head);
  if (ITEMS[traits.Hand]) ITEMS[traits.Hand](parts.item = new Vox());
  if (EMOTES[traits.Emotion]) {
    const [rows, pal] = EMOTES[traits.Emotion];
    parts.emote = new Vox().sprite(rows, pal, 0, 0, 0, 1);
  }
  return { parts };
}
