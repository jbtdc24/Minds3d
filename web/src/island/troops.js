// Raid troops drawn by code in the island pixel style: little soldiers (Brawler, Archer, Bomber, Captain) and the Giant.
// Each sprite has its feet at the bottom centre; frame 0/1 = walking legs.
import { sprite } from './pixel.js';

const SKIN = ['#f3c9a0', '#d9a37a', '#a8704a'];
const TEAM = { brawler: ['#2f5fa8', '#4f8ae0', '#8fc3ff'], archer: ['#2f7a3c', '#4fae5a', '#9be08f'], bomber: ['#5b4a6e', '#7c62a0', '#b39ae0'], captain: ['#8a1f2a', '#c43c3c', '#ff8a7a'] };
const STEEL = ['#4a4858', '#7c7b8f', '#cfcfdc'], WOOD = ['#4a2e1c', '#8b5a34', '#c99a63'];

function soldier(kind, frame) {
  const C = TEAM[kind];
  return sprite(12, 17, set => {
    // legs (walk frames)
    const l = frame ? [0, 1] : [1, 0];
    for (let y = 13; y < 17; y++) { set(4, y - l[0], '#3b2a20'); set(5, y - l[0], '#3b2a20'); set(7, y - l[1], '#3b2a20'); set(8, y - l[1], '#3b2a20'); }
    // body (tunic)
    for (let y = 8; y < 14; y++) for (let x = 3; x < 10; x++) set(x, y, x === 3 ? C[0] : y === 8 ? C[2] : C[1]);
    for (let x = 3; x < 10; x++) set(x, 12, WOOD[0]);                                    // belt
    // head
    for (let y = 3; y < 8; y++) for (let x = 4; x < 9; x++) set(x, y, x === 4 ? SKIN[1] : SKIN[0]);
    set(7, 5, '#1d1b2f'); set(5, 5, '#1d1b2f');
    // helmet / hood / hat
    if (kind === 'archer') { for (let y = 1; y < 5; y++) for (let x = 3; x < 10; x++) if (y < 3 || x < 5 || x > 8) set(x, y, C[0]); set(6, 0, C[0]); }
    else if (kind === 'bomber') { for (let x = 3; x < 10; x++) { set(x, 2, '#3b2a20'); set(x, 3, '#3b2a20'); } for (let x = 5; x < 8; x++) set(x, 1, '#3b2a20'); set(6, 4, '#ffd84a'); set(7, 4, '#ffd84a'); }
    else { for (let y = 1; y < 4; y++) for (let x = 3; x < 10; x++) set(x, y, y === 1 ? STEEL[2] : STEEL[1]); set(3, 4, STEEL[0]); set(9, 4, STEEL[0]); if (kind === 'captain') for (let y = 0; y < 3; y++) { set(6, y - 1, '#ff4d6d'); set(7, y - 1, '#c43c3c'); } }
  });
}
function giant(frame) {
  return sprite(22, 28, set => {
    const l = frame ? [0, 2] : [2, 0];
    for (let y = 21; y < 28; y++) for (let x = 5; x < 9; x++) set(x, y - l[0], '#5b4a3a');
    for (let y = 21; y < 28; y++) for (let x = 13; x < 17; x++) set(x, y - l[1], '#5b4a3a');
    for (let y = 9; y < 22; y++) for (let x = 3; x < 19; x++) { const edge = x === 3 || x === 18; set(x, y, edge ? '#6b5a48' : y > 17 ? '#8a6a3a' : (x + y) % 5 === 0 ? '#9a8a74' : '#b3a28a'); }
    for (let y = 10; y < 19; y++) { set(1, y, '#a39278'); set(2, y, '#b3a28a'); set(19, y, '#a39278'); set(20, y, '#b3a28a'); }   // arms
    for (let y = 1; y < 10; y++) for (let x = 6; x < 16; x++) set(x, y, x === 6 ? '#9a8a74' : '#c4b49c');
    set(9, 5, '#ff5a4a'); set(13, 5, '#ff5a4a'); for (let x = 9; x < 14; x++) set(x, 7, '#5b4a3a');                    // glowing eyes, frown
    for (let x = 6; x < 16; x++) set(x, 1, '#7c7b8f');
  });
}
const cache = new Map();
export function troopSprite(kind, frame = 0) {
  const key = kind + frame;
  if (!cache.has(key)) cache.set(key, kind === 'giant' ? giant(frame) : soldier(kind, frame));
  return cache.get(key);
}
// weapons, drawn rotated in the hand
export const weapon = {
  brawler: sprite(4, 10, set => { for (let y = 3; y < 10; y++) set(1, y, WOOD[1]); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!(x === 3 && y === 3)) set(x, y, STEEL[y === 0 ? 2 : 1]); }),
  captain: sprite(3, 12, set => { for (let y = 0; y < 9; y++) set(1, y, STEEL[2 - (y & 1)]); set(0, 9, '#ffd84a'); set(1, 9, '#ffd84a'); set(2, 9, '#ffd84a'); set(1, 10, WOOD[1]); set(1, 11, WOOD[1]); }),
  archer: sprite(5, 12, set => { for (let y = 0; y < 12; y++) set(1 + Math.round(Math.sin(y / 11 * Math.PI) * 2), y, WOOD[1]); for (let y = 1; y < 11; y++) set(1, y, '#e8e0d0'); }),
  bomber: sprite(7, 8, set => { for (let y = 1; y < 8; y++) for (let x = 0; x < 7; x++) if ((x - 3) ** 2 + (y - 4.5) ** 2 < 10) set(x, y, x + y < 6 ? '#5b5a6e' : '#2b2340'); set(4, 0, '#ffd84a'); set(5, 0, '#ff8a3a'); }),
};
const urls = {};
export const troopIcon = kind => (urls[kind] ||= troopSprite(kind).cv.toDataURL());

// ---------- Adventure: monsters and things to gather ----------
const SLIME = [['#2f7a3c', '#58b046', '#9be05a', '#d4ff9a'], ['#1f4f8a', '#4fa8ec', '#86d8f7', '#d2f4ff'], ['#7a2416', '#e0503a', '#ff8a6a', '#ffd0b0']];
export function slime(color = 0, squash = 0) {
  const P = SLIME[color % 3];
  return sprite(14, 11, set => {
    const h = 9 - squash, w2 = 6 + squash * 0.6;
    for (let y = 0; y < 11; y++) for (let x = 0; x < 14; x++) {
      const dx = (x - 6.5) / w2, dy = (y - (10 - h / 2)) / (h / 2);
      if (dx * dx + dy * dy > 1 || y > 10) continue;
      set(x, y, dy < -0.5 && dx < 0 ? P[3] : dx + dy > 0.6 ? P[0] : dy < 0 ? P[2] : P[1]);
    }
    const ey = Math.round(10 - h * 0.55);
    set(4, ey, '#1d1b2f'); set(4, ey + 1, '#1d1b2f'); set(9, ey, '#1d1b2f'); set(9, ey + 1, '#1d1b2f'); set(4, ey, '#ffffff'); set(9, ey, '#ffffff');
    set(3, ey - 2, '#1d1b2f'); set(5, ey - 1, '#1d1b2f'); set(10, ey - 2, '#1d1b2f'); set(8, ey - 1, '#1d1b2f');   // angry brows
  });
}
export function boar(frame = 0) {
  return sprite(20, 13, set => {
    for (let y = 2; y < 10; y++) for (let x = 2; x < 17; x++) { const dx = (x - 9) / 7.5, dy = (y - 6) / 4.2; if (dx * dx + dy * dy <= 1) set(x, y, y < 4 ? '#8a5a3a' : dy > 0.4 ? '#4a2e1c' : '#6b4428'); }
    for (let x = 4; x < 14; x += 2) set(x, 1, '#3b2a20');                                     // bristles
    for (let y = 4; y < 9; y++) for (let x = 15; x < 19; x++) set(x, y, x === 18 ? '#c98a7a' : '#7a4a30');    // snout
    set(16, 4, '#ffffff'); set(17, 8, '#f3e6c4'); set(18, 9, '#f3e6c4');                    // eye, tusk
    set(15, 4, '#ff3b3b');
    const l = frame ? [0, 1] : [1, 0];
    for (const [x, o] of [[4, l[0]], [7, l[1]], [11, l[0]], [14, l[1]]]) for (let y = 9; y < 13 - o; y++) set(x, y, '#3b2a20');
  });
}
export function bandit(frame = 0) {
  return sprite(12, 17, set => {
    const l = frame ? [0, 1] : [1, 0];
    for (let y = 13; y < 17; y++) { set(4, y - l[0], '#2b2340'); set(5, y - l[0], '#2b2340'); set(7, y - l[1], '#2b2340'); set(8, y - l[1], '#2b2340'); }
    for (let y = 8; y < 14; y++) for (let x = 3; x < 10; x++) set(x, y, x === 3 ? '#3b2a20' : '#5b4a3a');
    for (let x = 3; x < 10; x++) set(x, 11, '#8a1f2a');
    for (let y = 2; y < 8; y++) for (let x = 3; x < 10; x++) set(x, y, '#2b2340');                    // hood
    for (let x = 4; x < 9; x++) { set(x, 5, '#d9a37a'); set(x, 6, '#8a1f2a'); }                          // eyes slit + mask
    set(5, 5, '#ffffff'); set(7, 5, '#ffffff');
  });
}
export function ogre(frame = 0) {
  return sprite(24, 30, set => {
    const l = frame ? [0, 2] : [2, 0], S2 = ['#2f5a2c', '#4a7a3a', '#6b9a4a', '#8fbf6a'];
    for (let y = 22; y < 30; y++) { for (let x = 5; x < 10; x++) set(x, y - l[0], '#3b2a20'); for (let x = 14; x < 19; x++) set(x, y - l[1], '#3b2a20'); }
    for (let y = 10; y < 23; y++) for (let x = 3; x < 21; x++) { const dx = (x - 12) / 9, dy = (y - 16) / 7; if (dx * dx + dy * dy <= 1.1) set(x, y, y > 19 ? '#6b4428' : x < 8 ? S2[1] : S2[2]); }
    for (let y = 11; y < 20; y++) { set(1, y, S2[1]); set(2, y, S2[2]); set(21, y, S2[1]); set(22, y, S2[2]); }
    for (let y = 2; y < 11; y++) for (let x = 7; x < 17; x++) set(x, y, x === 7 ? S2[1] : S2[3]);
    set(9, 5, '#ffd84a'); set(14, 5, '#ffd84a'); for (let x = 9; x < 15; x++) set(x, 8, '#2b2340'); set(10, 9, '#ffffff'); set(13, 9, '#ffffff');
    set(9, 0, '#e8e0d0'); set(9, 1, '#e8e0d0'); set(14, 0, '#e8e0d0'); set(14, 1, '#e8e0d0');      // horns
  });
}
export function node(type) {
  if (type === 'ore') return sprite(14, 11, set => {
    for (let y = 2; y < 11; y++) for (let x = 0; x < 14; x++) { const dx = (x - 6.5) / 6.5, dy = (y - 7) / 4.5; if (dx * dx + dy * dy <= 1) set(x, y, dy < -0.3 ? '#a3a2b5' : dx > 0.3 ? '#5b5a6e' : '#7c7b8f'); }
    for (const [x, y] of [[4, 5], [8, 4], [10, 7], [5, 8]]) { set(x, y, '#ffd84a'); set(x + 1, y, '#fff3b0'); }
  });
  if (type === 'log') return sprite(18, 8, set => {
    for (let y = 2; y < 8; y++) for (let x = 0; x < 16; x++) set(x, y, y === 2 ? '#a87444' : y > 6 ? '#4a2e1c' : '#8b5a34');
    for (let y = 2; y < 8; y++) for (let x = 15; x < 18; x++) set(x, y, (x + y) % 2 ? '#c99a63' : '#e0b880');
    set(5, 1, '#58b046'); set(6, 0, '#7fcf55'); set(6, 1, '#58b046');
  });
  if (type === 'berry') return sprite(16, 13, set => {
    for (let y = 1; y < 13; y++) for (let x = 0; x < 16; x++) { const dx = (x - 7.5) / 7.5, dy = (y - 7) / 6; if (dx * dx + dy * dy <= 1) set(x, y, dy < -0.3 ? '#58b046' : dx > 0.3 ? '#2d6a2f' : '#3f8d38'); }
    for (const [x, y] of [[4, 5], [9, 4], [11, 8], [6, 9], [3, 8], [12, 5]]) { set(x, y, '#e0304a'); set(x + 1, y, '#ff6a7a'); set(x, y + 1, '#a8142a'); }
  });
  if (type === 'herb') return sprite(10, 12, set => {
    for (let y = 4; y < 12; y++) set(5, y, '#3f8d38');
    for (const [x, y] of [[3, 6], [7, 5], [2, 9], [8, 8]]) { set(x, y, '#7fff9a'); set(x + (x < 5 ? 1 : -1), y, '#3fd46a'); }
    for (const [x, y] of [[5, 2], [4, 3], [6, 3], [5, 3]]) set(x, y, '#d4ff7a');
  });
  const big = type === 'bigchest';
  return sprite(big ? 18 : 14, big ? 14 : 11, set => {
    const W = big ? 18 : 14, H = big ? 14 : 11, lid = big ? 5 : 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1 || y === lid || y === H - 1;
      set(x, y, edge ? (big ? '#c98a00' : '#6b4428') : y < lid ? (big ? '#ffd84a' : '#a87444') : (big ? '#e0b13a' : '#8b5a34'));
    }
    for (let y = lid - 1; y < lid + 3; y++) { set((W >> 1) - 1, y, '#fff3b0'); set(W >> 1, y, '#ffd84a'); }
  });
}
const nodeCache = new Map(), monCache = new Map();
export const nodeSprite = t => nodeCache.get(t) || (nodeCache.set(t, node(t)), nodeCache.get(t));
export function monsterSprite(type, frame = 0, color = 0) {
  const key = `${type}${frame}${color}`;
  if (!monCache.has(key)) monCache.set(key, type === 'slime' ? slime(color, frame) : type === 'boar' ? boar(frame) : type === 'bandit' ? bandit(frame) : ogre(frame));
  return monCache.get(key);
}
