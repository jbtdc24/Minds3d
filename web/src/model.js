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
const FACES = {
  Blank: ['', '', '...kk...kk', '...kk...kk', '', '.....kkk'],
  Blushing: ['', '..kk.....kk', '..kk.....kk', '', 'p.k.......k.p', '...kkkkkkk'],
  Crying: ['', '..kk.....kk', '..kk.....kk', '..bb..k..bb', '..bb.....bb', '..bb.....bb'],
  Glasses: ['', '.kkkkk.kkkkk', 'kkgggkkkgggk', '.kgggk.kgggk', '.kkkkk.kkkkk'],
  Happy: ['', '', '..kk.....kk', '', '...k.....k', '....kkkkk'],
  'Knocked Out': ['', '..k.k...k.k', '...k.....k', '..k.k...k.k'],
  Neutral: ['', '', '..kkk...kkk'],
  Sad: ['', '', '...kk...kk', '...kk...kk', '....kkkkk', '...k.....k'],
  'Side Eye': ['', '..eee...eee', '..ekk...ekk', '..ekk...ekk', '', '....kkkk'],
  Silenced: ['', '', '...kk...kk', '...kk...kk', '', '....k.k.k'],
  'Tongue Out': ['', '..kk.....kk', '..kk.....kk', '', '....kkkkk', '.....rrr', '......r'],
  Wink: ['', '', '...kk', '...kk...kkk'],
};
const HAIR_FRONT = (row, col) => row <= 7 || (row <= 9 && col <= 5) || (row <= 11 && col <= 3) || (row <= 13 && col <= 1);

function buildHead(v, hair, face) {
  v.box(-10, 11, -8, 9, 25, 7, (x, y, z) => {
    const row = 25 - y, col = x + 10;
    if (row <= 7 || z <= -2) return hair;
    if (z >= 6) return HAIR_FRONT(row, col) ? hair : face;
    return (x < 0 ? row <= 12 : row <= 8) ? hair : face;
  }, true);
}
function paintFace(v, rows, pal = FACE_PAL, protrude = false) {
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    if (!pal[ch]) return;
    const x = c + 6 - 10, y = 25 - (r + 8), z = v.front(x, y);
    if (z !== null) v.set(x, y, protrude ? z + 1 : z, pal[ch]);
  }));
}

// ---------- body ----------
function buildBody(t, s) {
  const torso = new Vox(), armL = new Vox(), armR = new Vox(), legL = new Vox(), legR = new Vox();
  torso.box(-5, 3, -4, 4, 10, 3, (x, y, z) => {
    if (y >= 7) {
      if (z === 3 && ((y >= 9 && x >= -2 && x <= 1) || (y === 8 && x >= -1 && x <= 0))) return s.suit;  // V collar
      return s.shirt;
    }
    return s.suit;
  });
  for (const [x, y] of [[-5, 3], [4, 3], [-5, 10], [4, 10]]) for (let z = -4; z <= 3; z += 7) torso.set(x, y, z, null);
  const arm = (v, x0) => v.box(x0, 5, -1, x0 + 2, 10, 1, (x, y) => y >= 8 ? s.shirt : s.hand);
  arm(armL, -8); arm(armR, 5);
  const leg = (v, x0) => v.box(x0, 0, -2, x0 + 3, 2, 1, (x, y) => y === 0 ? s.foot : s.pants);
  leg(legL, -4); leg(legR, 0);
  if (s.neck) {          // chain V from the shoulders down to a pendant
    for (const [x, y] of [[-4, 10], [-3, 9], [-2, 8], [-1, 7], [3, 10], [2, 9], [1, 8], [0, 7]]) torso.set(x, y, 4, s.neck);
    torso.box(-1, 5, 4, 0, 6, 4, s.neck);
  }
  return { torso, armL, armR, legL, legR };
}

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

// ---------- legendaries ----------
const LEGENDS = {
  angel: { skin: ['#f1f1f4', '#ffffff'], shirt: '#ffffff', pants: '#d8d8e0', face: FACES.Happy,
    extra(p) {
      for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; p.head.set(Math.round(Math.cos(t) * 7 - 0.5), 30, Math.round(Math.sin(t) * 5 - 0.5), '#ffd84a'); }
      for (const s of [-1, 1]) for (let i = 0; i < 9; i++) for (let j = 0; j <= 8 - Math.abs(i - 3); j++)
        p.torso.box(s < 0 ? -6 - i : 5 + i, 4 + j, -6, s < 0 ? -6 - i : 5 + i, 4 + j, -5, j === 8 - Math.abs(i - 3) ? '#d9dbe6' : '#ffffff');
    } },
  bones: { skin: ['#e9e9e6', '#ffffff'], shirt: SUIT, pants: SUIT, hand: '#ffffff', foot: '#ffffff',
    face: ['', '..kkk...kkk', '..kkk...kkk', '..kkk...kkk', '......k', '...k.k.k.k', '...kkkkkkk'],
    extra(p) { for (const y of [4, 6, 8]) p.torso.box(-3, y, 4, 2, y, 4, '#f2f2f2'); p.torso.box(-1, 3, 4, 0, 9, 4, '#f2f2f2'); } },
  error: { skin: ['#8f84c9', '#b4a8e6'], shirt: '#7d72b8', pants: '#5d5498',
    face: ['', '', '..rr.....rr', '..rr.....rr', '', '....rrrrr'],
    extra(p) {
      for (let i = 0; i < 26; i++) { const t = i * 2.4; p.head.set(Math.round(Math.cos(t) * 11.5), 12 + (i * 7) % 15, Math.round(Math.sin(t) * 9), '#ff2a2a'); }
      p.head.box(11, 22, -1, 14, 25, -1, '#ff2a2a'); p.head.box(12, 23, -1, 13, 24, -1, '#ffd84a');
    } },
  fire: { skin: ['#efdc6c', '#f7ec9a'], shirt: '#e8a23a', pants: '#b5531f', face: FACES.Blank,
    fx: ['#e8432a', '#f6892b', '#ffd34a'],
    extra(p) {        // flame tongues around the head and shoulders: red base -> orange -> yellow tips
      const ramp = ['#d8321f', '#e8432a', '#f6892b', '#f6892b', '#ffb43a', '#ffd34a', '#fff0a0'];
      const tongue = (x, y, z, h) => { for (let i = 0; i < h; i++) p.fx.set(x, y + i, z, ramp[Math.min(6, Math.round(i / (h - 1 || 1) * 6))]); };
      for (let x = -11; x <= 10; x++) for (const z of [-9, 8]) tongue(x, 22, z, 4 + ((x * 7 + z) & 5));
      for (let z = -9; z <= 8; z++) for (const x of [-11, 10]) tongue(x, 14 + ((z * 3) & 7), z, 4 + ((z * 5 + x) & 5));
      for (let x = -9; x <= 8; x += 2) tongue(x, 26, ((x * 13) & 7) - 4, 3 + ((x * 3) & 3));
      for (const x of [-9, 8]) for (let z = -3; z <= 2; z++) tongue(x, 9, z, 3 + ((z * 7) & 3));
    } },
  glitch: { skin: ['#f4f4f4', '#ffffff'], shirt: '#e8e8e8', pants: '#bcbcbc', face: FACES.Blank,
    extra(p) {
      for (let y = 12; y <= 24; y += 2) { p.head.box(-12, y, -2, -11, y, 2, '#2ee6ff'); p.head.box(10, y + 1, -2, 11, y + 1, 2, '#ff3b6b'); }
      p.head.box(-4, 26, 2, 3, 26, 2, '#2ee6ff');
    } },
  ice: { skin: ['#a9d7f2', '#d9f0fb'], shirt: '#8cc8ea', pants: '#5f9fc8', face: FACES.Neutral,
    extra(p) {
      for (let i = 0; i < 9; i++) { const x = -9 + i * 2, h = 2 + ((i * 5) % 4); p.head.box(x, 26, -2 + (i % 3) * 2, x + 1, 25 + h, -1 + (i % 3) * 2, i % 2 ? '#e8f8ff' : '#bfe8ff'); }
      p.armL.box(-8, 11, -1, -6, 12, 1, '#e8f8ff'); p.armR.box(5, 11, -1, 7, 12, 1, '#e8f8ff');
    } },
  joker: { skin: ['#ffffff', '#ffffff'], shirt: '#f2c037', pants: '#d33a2c',
    face: ['', '..rr.....rr', '..kk.....kk', '.r..rr.rr..r', '......', '...rrrrrrr', '....rrrrr'],
    extra(p) {
      p.head.box(-1, 15, 8, 1, 17, 9, '#e6394a', true);
      for (const s of [-1, 1]) p.head.box(s < 0 ? -14 : 10, 16, -6, s < 0 ? -11 : 13, 26, 4, '#8bc34a', true);
      p.head.box(-10, 25, -8, 9, 27, 7, '#8bc34a', true);
      for (let x = -5; x <= 4; x += 3) p.torso.box(x, 4, 4, x + 1, 6, 4, '#e8432a');
    } },
  monkey: { skin: ['#f2a5ad', '#fbd3d6'], shirt: SUIT, pants: SUIT, face: ['', '', '...kk...kk', '...kk...kk', '', '.....kkk', '......'],
    extra(p) {
      for (const s of [-1, 1]) { p.head.box(s < 0 ? -13 : 10, 15, -1, s < 0 ? -11 : 12, 21, 3, '#f2a5ad', true); p.head.box(s < 0 ? -13 : 12, 16, 0, s < 0 ? -13 : 12, 20, 2, '#fbd3d6'); }
      p.head.box(-3, 12, 8, 5, 15, 8, '#fde3e5', true);
      const tail = [[0, 4, -5], [0, 4, -6], [0, 5, -7], [0, 6, -8], [0, 7, -8], [0, 8, -8], [1, 9, -8], [2, 9, -7], [2, 8, -7]];
      for (const [x, y, z] of tail) p.torso.set(x + 3, y, z, '#f2a5ad');
    } },
  robot: { skin: ['#7fa6d6', '#b9d2f0'], shirt: '#7fa6d6', pants: '#5c7fae', face: ['', '..kkk...kkk', '..kkk...kkk', '', '....kkkkk'],
    extra(p) {
      for (const s of [-1, 1]) { p.head.box(s < 0 ? -12 : 10, 15, -3, s < 0 ? -11 : 11, 21, 3, '#8a929c'); p.head.set(s < 0 ? -12 : 11, 18, 0, '#4cff7a'); }
      p.head.box(0, 26, 0, 0, 29, 0, '#8a929c'); p.head.box(-1, 30, -1, 1, 31, 1, '#4cff7a');
      p.torso.box(-2, 4, 4, 1, 6, 4, '#c9d6e6'); p.torso.set(-1, 5, 5, '#4cff7a');
    } },
  void: { skin: ['#1b1e30', '#242842'], shirt: '#161827', pants: '#10121c', hand: '#242842', foot: '#242842',
    face: ['', '', '...ww...ww', '...ww...ww', '', '....www'], facePal: { ...FACE_PAL, w: '#7ff6ff' },
    extra(p) { for (let i = 0; i < 30; i++) { const t = i * 2.39996, r = 13 + (i % 4); p.fx.set(Math.round(Math.cos(t) * r), 4 + (i * 7) % 26, Math.round(Math.sin(t) * r * 0.6), i % 2 ? '#2a2f55' : '#4a3f8f'); } } },
};

// Build every voxel part for one token's traits.
export function buildToken(traits) {
  const L = traits.Legendary && LEGENDS[traits.Legendary];
  const [hair, face] = L ? L.skin : SKIN[traits.Skin] || SKIN.Peach;
  const s = {
    suit: SUIT, hair, face, hand: L?.hand || hair, foot: L?.foot || hair,
    shirt: L ? L.shirt : SHIRT[traits.Shirt] || SUIT, pants: L ? L.pants : PANTS[traits.Pants] || SUIT,
    neck: !L && NECK[traits.Neck],
  };
  const parts = buildBody(traits, s);
  parts.head = new Vox();
  buildHead(parts.head, hair, face);
  const faceRows = L ? L.face : FACES[traits.Face] || FACES.Blank;
  paintFace(parts.head, faceRows, L?.facePal || FACE_PAL, traits.Face === 'Glasses');
  if (traits.Face === 'Glasses') {                      // temple arm wraps to the left side
    for (let x = -10; x <= -5; x++) { const z = parts.head.front(x, 15); if (z !== null) parts.head.set(x, 15, z + 1, FACE_PAL.k); }
    for (let z = -3; z <= 6; z++) parts.head.set(-11, 15, z, FACE_PAL.k);
  }
  if (!L && HATS[traits.Headwear]) HATS[traits.Headwear](parts.head);
  if (L) { parts.fx = new Vox(); L.extra(parts); if (!parts.fx.m.size) delete parts.fx; }
  if (!L && ITEMS[traits.Hand]) ITEMS[traits.Hand](parts.item = new Vox());
  if (!L && EMOTES[traits.Emotion]) {
    const [rows, pal] = EMOTES[traits.Emotion];
    parts.emote = new Vox().sprite(rows, pal, 0, 0, 0, 1);
  }
  return parts;
}
