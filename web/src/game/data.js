// Game rules data: classes, stats, and the skill card every trait gives.
export const STATS = {
  Legendary: { hp: 430, atk: 44, spd: 21, crit: 0.14 },
  Epic: { hp: 422, atk: 43, spd: 17, crit: 0.11 },
  Rare: { hp: 414, atk: 42, spd: 14, crit: 0.09 },
  Uncommon: { hp: 407, atk: 41, spd: 12, crit: 0.07 },
  Common: { hp: 400, atk: 40, spd: 10, crit: 0.05 },
};
export const RARITY_COLOR = { Legendary: '#ffb020', Epic: '#c46bff', Rare: '#3fa8ff', Uncommon: '#5fd068', Common: '#a3a8b0' };

// Skin decides the class. Blaze beats Bloom, Bloom beats Tide, Tide beats Blaze.
export const CLASSES = {
  Blaze: { color: '#ff7a3d', icon: '🔥', beats: 'Bloom' },
  Bloom: { color: '#5fd068', icon: '🌿', beats: 'Tide' },
  Tide: { color: '#3fa8ff', icon: '💧', beats: 'Blaze' },
  Mythic: { color: '#ffb020', icon: '✦', beats: null },
};
const SKIN_CLASS = { Gold: 'Blaze', Peach: 'Blaze', Rose: 'Blaze', Emerald: 'Bloom', Lime: 'Bloom', Mint: 'Bloom', Sky: 'Tide', Periwinkle: 'Tide', Monochrome: 'Tide' };
export const classOf = t => t.Legendary ? 'Mythic' : SKIN_CLASS[t.Skin] || 'Tide';
export function classMult(att, def) {
  if (CLASSES[att].beats === def) return 1.2;
  if (CLASSES[def].beats === att) return 0.85;
  return 1;
}
// Shirt colour: a small stat flavour
const SHIRT_BONUS = {
  Red: { atk: 2 }, Orange: { atk: 1, spd: 1 }, Yellow: { spd: 2 }, White: { hp: 12 }, Black: { crit: 0.03 },
  Blue: { hp: 8, atk: 1 }, 'Light Blue': { spd: 1, hp: 6 }, Purple: { crit: 0.02, atk: 1 }, Brown: { hp: 16 },
};
const NECK_PASSIVE = {
  Gold: { crit: 0.06, text: '+6% crit' }, Jade: { healBonus: 0.15, text: '+15% healing' }, Silver: { startShield: 0.15, text: 'Starts with a 15% shield' },
};

// Card fields: cost, target (front|back|lowest|all|self|ally|allies|random), dmg (x ATK), hits, heal/shield (x max HP),
// fx: list of effects, move: animation (punch|kick|slash|smash|cast|skill), color: FX colour.
const C = (name, cost, target, move, desc, extra = {}) => ({ name, cost, target, move, desc, ...extra });
export const CARDS = {
  bonk: C('Bonk', 1, 'front', 'punch', 'Hit the front enemy.', { dmg: 1.0 }),
  // Face
  Blank: C('Blank Stare', 1, 'front', 'punch', 'Hit and lower its ATK 15%.', { dmg: 0.8, fx: [{ k: 'atkDown', v: 0.15, t: 2 }] }),
  Blushing: C('Charm', 1, 'front', 'cast', '45% chance to stun.', { dmg: 0.4, fx: [{ k: 'stun', chance: 0.45 }], color: '#ff8fb0' }),
  Crying: C('Flood of Tears', 2, 'all', 'cast', 'Splash every enemy.', { dmg: 0.55, color: '#7fd0ec' }),
  Glasses: C('Analyze', 1, 'lowest', 'cast', 'Hit the weakest enemy. Crits if it is below half HP.', { dmg: 0.9, execute: true, color: '#e2e6ea' }),
  Happy: C('Cheer', 1, 'self', 'skill', '+1 energy and heal 8%.', { heal: 0.08, energy: 1, color: '#ffd84a' }),
  'Knocked Out': C('Play Dead', 1, 'self', 'skill', 'Dodge the next 2 hits.', { fx: [{ k: 'dodge', v: 2 }], color: '#c9c9d6' }),
  Neutral: C('Steady Jab', 0, 'front', 'punch', 'A free quick jab.', { dmg: 0.6 }),
  Sad: C('Gloom', 1, 'all', 'cast', 'All enemies lose 15% ATK.', { fx: [{ k: 'atkDown', v: 0.15, t: 2 }], color: '#7a8cff' }),
  'Side Eye': C('Glare', 1, 'back', 'cast', 'Hit the back enemy, lower its ATK.', { dmg: 0.75, fx: [{ k: 'atkDown', v: 0.15, t: 2 }], color: '#e7f2d8' }),
  Silenced: C('Hush', 2, 'front', 'punch', 'Hit and steal 1 energy.', { dmg: 0.9, drain: 1 }),
  'Tongue Out': C('Taunt', 1, 'self', 'skill', 'Enemies must hit me. +30% DEF.', { fx: [{ k: 'taunt', t: 2 }, { k: 'defUp', v: 0.3, t: 2 }], color: '#e6394a' }),
  Wink: C('Wink Shot', 1, 'lowest', 'cast', 'Snipe the weakest enemy, +25% crit.', { dmg: 1.1, critBonus: 0.25, color: '#ff8fb0' }),
  // Hand items
  Sword: C('Slash', 2, 'front', 'slash', 'A heavy sword cut.', { dmg: 1.6 }),
  Torch: C('Ignite', 2, 'front', 'slash', 'Hit and burn for 3 rounds.', { dmg: 1.0, fx: [{ k: 'burn', v: 0.3, t: 3 }], color: '#ff7a1a' }),
  Lollipop: C('Sugar Rush', 1, 'ally', 'cast', 'Heal the weakest ally 18%, +speed.', { heal: 0.18, fx: [{ k: 'speedUp', t: 2 }], color: '#f07aa0' }),
  Pencil: C('Sketch Shield', 1, 'ally', 'cast', 'Shield the weakest ally (22% HP).', { shield: 0.22, color: '#f7cf45' }),
  Ruler: C('Measure Up', 1, 'front', 'slash', 'Hit and lower its ATK 20%.', { dmg: 1.0, fx: [{ k: 'atkDown', v: 0.2, t: 2 }] }),
  Flower: C('Bloom', 2, 'allies', 'cast', 'Heal every ally 12%.', { heal: 0.12, color: '#9be07a' }),
  Twig: C('Poke', 0, 'back', 'slash', 'A free poke at the back enemy.', { dmg: 0.5 }),
  // Headwear
  Beanie: C('Cozy Up', 1, 'self', 'skill', 'Shield 25% HP and +30% DEF.', { shield: 0.25, fx: [{ k: 'defUp', v: 0.3, t: 2 }], color: '#9aa0a8' }),
  'Bowler Hat': C("Gentleman's Strike", 2, 'front', 'punch', 'Heavy hit, +30% crit.', { dmg: 1.3, critBonus: 0.3 }),
  Cap: C('Fastball', 1, 'back', 'cast', 'Throw at the back enemy.', { dmg: 0.9, color: '#efeee6' }),
  Crown: C('Royal Decree', 2, 'allies', 'skill', 'All allies +25% ATK for 2 rounds.', { fx: [{ k: 'atkUp', v: 0.25, t: 2 }], color: '#ffd84a' }),
  'Frog Hat': C('Leap', 2, 'lowest', 'smash', 'Jump on the weakest enemy, ignores taunt.', { dmg: 1.4, ignoreTaunt: true }),
  Goggles: C('Focus', 1, 'self', 'skill', 'Next hit crits. +15% ATK.', { fx: [{ k: 'focus' }, { k: 'atkUp', v: 0.15, t: 2 }], color: '#cfe3ee' }),
  Headphones: C('Drop the Beat', 2, 'allies', 'skill', 'All allies +speed, +1 energy.', { energy: 1, fx: [{ k: 'speedUp', t: 2 }], color: '#5aa66a' }),
  Helmet: C('Headbutt', 2, 'front', 'smash', 'Hit with 50% stun chance.', { dmg: 1.2, fx: [{ k: 'stun', chance: 0.5 }] }),
  // Emotes
  Confused: C('Bamboozle', 1, 'front', 'cast', '50% chance to stun.', { dmg: 0.4, fx: [{ k: 'stun', chance: 0.5 }], color: '#f5c234' }),
  Energized: C('Charge Up', 0, 'self', 'skill', '+2 energy.', { energy: 2, color: '#f7d038' }),
  Love: C('Heart Beam', 1, 'ally', 'cast', 'Heal the weakest ally 20%.', { heal: 0.2, color: '#e8343c' }),
  Nervous: C('Sweat Dodge', 1, 'self', 'skill', 'Dodge the next hit, +speed.', { fx: [{ k: 'dodge', v: 1 }, { k: 'speedUp', t: 2 }], color: '#7cc8ee' }),
  Sleepy: C('Power Nap', 1, 'self', 'skill', 'Heal 30%.', { heal: 0.3, color: '#7aaee6' }),
  Sparks: C('Spark Burst', 2, 'all', 'cast', 'Zap every enemy.', { dmg: 0.7, color: '#f8d84a' }),
  Surprised: C('Gasp', 1, 'front', 'cast', 'Hit and steal 1 energy.', { dmg: 0.6, drain: 1, color: '#e8344c' }),
};
// Legendary signature cards
export const LEGEND_CARDS = {
  angel: [C('Holy Light', 2, 'allies', 'cast', 'Heal all allies 18% and cleanse.', { heal: 0.18, cleanse: true, color: '#fff3b0' }),
    C('Judgement', 3, 'lowest', 'smash', 'Smite the weakest enemy.', { dmg: 1.8, critBonus: 0.2, color: '#ffd84a' })],
  bones: [C('Bone Rattle', 1, 'all', 'cast', 'Rattle all enemies, -15% ATK.', { dmg: 0.5, fx: [{ k: 'atkDown', v: 0.15, t: 2 }], color: '#c9a6ff' }),
    C('Reap', 3, 'front', 'slash', 'Huge cut, heals 30% of damage.', { dmg: 2.0, lifesteal: 0.3, color: '#8a5cff' })],
  error: [C('Blue Screen', 2, 'all', 'cast', '35% chance to stun every enemy.', { fx: [{ k: 'stun', chance: 0.35 }], color: '#3c8bff' }),
    C('Corrupt', 2, 'front', 'cast', 'Hit, burn 3 rounds, steal 1 energy.', { dmg: 1.0, drain: 1, fx: [{ k: 'burn', v: 0.3, t: 3 }], color: '#ff2a2a' })],
  fire: [C('Inferno', 3, 'all', 'cast', 'Burn every enemy.', { dmg: 1.0, fx: [{ k: 'burn', v: 0.3, t: 2 }], color: '#ff7a1a' }),
    C('Flame Fist', 1, 'front', 'punch', 'Burning punch.', { dmg: 1.2, fx: [{ k: 'burn', v: 0.25, t: 2 }], color: '#ffb03a' })],
  glitch: [C('Phase Shift', 1, 'self', 'skill', 'Dodge 2 hits, +speed.', { fx: [{ k: 'dodge', v: 2 }, { k: 'speedUp', t: 2 }], color: '#00e5ff' }),
    C('Pixel Storm', 3, 'random', 'cast', '4 hits on random enemies.', { dmg: 0.5, hits: 4, color: '#ff2bd6' })],
  ice: [C('Frostbite', 2, 'front', 'cast', 'Hit with 60% freeze (stun).', { dmg: 1.1, fx: [{ k: 'stun', chance: 0.6 }], color: '#a8ecff' }),
    C('Blizzard', 3, 'all', 'cast', 'Hit all enemies, -20% ATK.', { dmg: 0.8, fx: [{ k: 'atkDown', v: 0.2, t: 2 }], color: '#ffffff' })],
  joker: [C('Wild Card', 2, 'random', 'cast', 'Something random happens!', { wild: true, color: '#ffd84a' }),
    C('Prank Mallet', 2, 'front', 'smash', 'Bonk with 40% stun.', { dmg: 1.5, fx: [{ k: 'stun', chance: 0.4 }], color: '#ff4d6d' })],
  monkey: [C('Staff Spin', 2, 'all', 'slash', 'Spin into every enemy.', { dmg: 0.9, color: '#f5c542' }),
    C('Cloud Somersault', 1, 'self', 'skill', 'Dodge 1 hit, +30% ATK.', { fx: [{ k: 'dodge', v: 1 }, { k: 'atkUp', v: 0.3, t: 2 }], color: '#ffffff' })],
  robot: [C('Laser Barrage', 3, 'random', 'cast', '4 laser hits on random enemies.', { dmg: 0.5, hits: 4, color: '#ff3b5c' }),
    C('Overclock', 1, 'self', 'skill', '+2 energy, +20% ATK.', { energy: 2, fx: [{ k: 'atkUp', v: 0.2, t: 2 }], color: '#3cf2ff' })],
  void: [C('Event Horizon', 3, 'all', 'cast', 'Crush all enemies, steal 1 energy.', { dmg: 1.2, drain: 1, color: '#8a5cff' }),
    C('Void Shield', 2, 'allies', 'skill', 'Shield every ally 20% HP.', { shield: 0.2, color: '#7ff6ff' })],
};

export const MAX_LEVEL = 10;
export const xpForLevel = lvl => 80 + lvl * 60;

// Everything a token brings into battle.
export function makeUnit(id, traits, rarity, level = 1) {
  const base = STATS[rarity] || STATS.Common, cls = classOf(traits);
  const shirt = SHIRT_BONUS[traits.Shirt] || {}, neck = NECK_PASSIVE[traits.Neck] || {};
  const lv = 1 + (level - 1) * 0.04;
  const deck = [{ ...CARDS.bonk, key: 'bonk' }];
  if (traits.Legendary) LEGEND_CARDS[traits.Legendary].forEach((c, i) => deck.push({ ...c, key: `${traits.Legendary}${i}` }));
  for (const t of ['Face', 'Hand', 'Headwear', 'Emotion']) if (CARDS[traits[t]]) deck.push({ ...CARDS[traits[t]], key: traits[t], from: t });
  const maxHp = Math.round((base.hp + (shirt.hp || 0)) * lv);
  return {
    id, traits, rarity, cls, level, deck,
    maxHp, hp: maxHp, atk: (base.atk + (shirt.atk || 0)) * lv, spd: base.spd + (shirt.spd || 0),
    crit: base.crit + (shirt.crit || 0) + (neck.crit || 0), healBonus: neck.healBonus || 0,
    shield: Math.round(maxHp * (neck.startShield || 0)), passive: neck.text || null,
  };
}
