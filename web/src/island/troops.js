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
