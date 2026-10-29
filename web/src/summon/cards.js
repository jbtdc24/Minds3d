// Mind Summoners: the creatures (cards), the elements and the Hero Skills. Pure data, shared by the
// browser, the server and the balance simulator (tools/sim_summon.mjs). Numbers are tuned by the sim.

// Fire > Nature > Water > Fire (+2 power when you face what you beat). Light and Shadow beat each other.
export const ELEMENTS = ['fire', 'water', 'nature', 'light', 'shadow'];
export const BEATS = { fire: 'nature', nature: 'water', water: 'fire', light: 'shadow', shadow: 'light' };
export const ELEMENT_BONUS = 2;

// keywords
// burn N   on summon: N damage to the enemy Mind        heal N   on summon: heal your Mind N
// tough    survives a tie (and never drops below 1)     guard    loses no power when it wins a fight
// pierce   when it wins a fight, the extra power hits the enemy Mind
// grow     +1 power at the end of every turn it survives (max +3)
// spark N  on summon: the enemy creature in front of it gets -N power
// splash   on summon: every enemy creature gets -1 power
// leech    heals your Mind 1 whenever it hits the enemy Mind
// draw     on summon: draw a card                       rally    on summon: your other creatures get +1 power (for good)
// shield N on summon: your Mind blocks the next N damage
export const CREATURES = [
  // family, stage 1..3, element
  { id: 'emberpup', name: 'Emberpup', fam: 'ember', stage: 1, el: 'fire', cost: 1, power: 2 },
  { id: 'cinderhound', name: 'Cinderhound', fam: 'ember', stage: 2, el: 'fire', cost: 3, power: 3, burn: 1 },
  { id: 'blazewolf', name: 'Blazewolf', fam: 'ember', stage: 3, el: 'fire', cost: 5, power: 5, burn: 2 },
  { id: 'magmite', name: 'Magmite', fam: 'magma', stage: 1, el: 'fire', cost: 2, power: 2, tough: true },
  { id: 'lavashell', name: 'Lavashell', fam: 'magma', stage: 2, el: 'fire', cost: 4, power: 3, tough: true },
  { id: 'volcanox', name: 'Volcanox', fam: 'magma', stage: 3, el: 'fire', cost: 6, power: 5, guard: true },

  { id: 'bubblin', name: 'Bubblin', fam: 'bubble', stage: 1, el: 'water', cost: 1, power: 1, heal: 1 },
  { id: 'tidefin', name: 'Tidefin', fam: 'bubble', stage: 2, el: 'water', cost: 3, power: 2, heal: 2 },
  { id: 'leviathorn', name: 'Leviathorn', fam: 'bubble', stage: 3, el: 'water', cost: 5, power: 3, splash: true },
  { id: 'driplet', name: 'Driplet', fam: 'storm', stage: 1, el: 'water', cost: 2, power: 2, pierce: true },
  { id: 'mistwisp', name: 'Mistwisp', fam: 'storm', stage: 2, el: 'water', cost: 4, power: 3, pierce: true },
  { id: 'stormray', name: 'Stormray', fam: 'storm', stage: 3, el: 'water', cost: 6, power: 5, pierce: true },

  { id: 'sproutling', name: 'Sproutling', fam: 'sprout', stage: 1, el: 'nature', cost: 1, power: 1, grow: true },
  { id: 'thornback', name: 'Thornback', fam: 'sprout', stage: 2, el: 'nature', cost: 3, power: 3, grow: true },
  { id: 'elderoak', name: 'Elderoak', fam: 'sprout', stage: 3, el: 'nature', cost: 5, power: 5, grow: true, tough: true },
  { id: 'pollenix', name: 'Pollenix', fam: 'bloom', stage: 1, el: 'nature', cost: 1, power: 2, draw: true, rally: true },
  { id: 'bloomwing', name: 'Bloomwing', fam: 'bloom', stage: 2, el: 'nature', cost: 3, power: 3, draw: true, rally: true },
  { id: 'floravyn', name: 'Floravyn', fam: 'bloom', stage: 3, el: 'nature', cost: 5, power: 7, rally: true },

  { id: 'glimmit', name: 'Glimmit', fam: 'glow', stage: 1, el: 'light', cost: 1, power: 2 },
  { id: 'lumeon', name: 'Lumeon', fam: 'glow', stage: 2, el: 'light', cost: 3, power: 3, shield: 2 },
  { id: 'solarion', name: 'Solarion', fam: 'glow', stage: 3, el: 'light', cost: 5, power: 5, heal: 2 },
  { id: 'shadowmite', name: 'Shadowmite', fam: 'shade', stage: 1, el: 'shadow', cost: 1, power: 1, leech: true },
  { id: 'duskfang', name: 'Duskfang', fam: 'shade', stage: 2, el: 'shadow', cost: 3, power: 3, leech: true, spark: 1 },
  { id: 'umbraxis', name: 'Umbraxis', fam: 'shade', stage: 3, el: 'shadow', cost: 5, power: 5, leech: true, spark: 1 },
];
export const CARD = Object.fromEntries(CREATURES.map(c => [c.id, c]));

// Hero Skill: one per Mind, from its Face trait; used once per match, chosen in secret with your summons.
export const HERO_SKILLS = {
  mend: { name: 'Mend', desc: 'Heal your Mind 6 and block the next 2 damage.' },
  cry: { name: 'Battle Cry', desc: 'All your creatures +1 power this turn.' },
  focus: { name: 'Focus', desc: '+2 Focus this turn.' },
  rage: { name: 'Rage', desc: 'One of your creatures +3 power this turn and loses no power when it wins.' },
  hex: { name: 'Hex', desc: 'One enemy creature -3 power this turn.' },
  bolt: { name: 'Bolt', desc: '6 damage to the enemy Mind.' },
  ward: { name: 'Ward', desc: 'Your Mind blocks the next 5 damage.' },
  curse: { name: 'Curse', desc: 'One enemy creature -2 power this turn and -1 for good.' },
};
export const FACE_SKILL = {
  Happy: 'mend', Blushing: 'mend', Neutral: 'cry', Glasses: 'cry', Wink: 'focus', 'Tongue Out': 'rage',
  'Side Eye': 'hex', Sad: 'hex', Crying: 'bolt', Blank: 'ward', Silenced: 'ward', 'Knocked Out': 'curse',
};
// element affinity from Skin: your creatures of that element counter for +3 instead of +2
export const SKIN_ELEMENT = { Rose: 'fire', Peach: 'fire', Sky: 'water', Periwinkle: 'water', Mint: 'nature', Lime: 'nature', Emerald: 'nature', Gold: 'light', Monochrome: 'shadow' };
export const LEGENDARY_SKILL = { fire: 'bolt', ice: 'ward', angel: 'mend', bones: 'hex', glitch: 'curse', joker: 'rage', monkey: 'focus', robot: 'cry', void: 'hex', error: 'bolt' };
export const LEGENDARY_ELEMENT = { fire: 'fire', ice: 'water', angel: 'light', bones: 'shadow', glitch: 'water', joker: 'fire', monkey: 'nature', robot: 'light', void: 'shadow', error: 'shadow' };

export const RULES = { hp: 20, lanes: 3, deck: 12, copies: 2, maxStage3: 4, hand: 3, maxFocus: 6, maxTurns: 12, growMax: 3 };

// four free starter decks (complete, with stage 3): together they cover all 8 families (46-55% in the sim)
const pair = (a, b) => CREATURES.filter(c => c.fam === a || c.fam === b).flatMap(c => [c.id, c.id]);
export const STARTER_DECKS = {
  ember_sprout: { name: 'Wildfire', els: ['fire', 'nature'], cards: pair('ember', 'sprout') },
  magma_glow: { name: 'Bastion', els: ['fire', 'light'], cards: pair('magma', 'glow') },
  bubble_bloom: { name: 'Tidebloom', els: ['water', 'nature'], cards: pair('bubble', 'bloom') },
  storm_shade: { name: 'Nightstorm', els: ['water', 'shadow'], cards: pair('storm', 'shade') },
};
export const KEYWORDS = {
  burn: n => `Burn ${n}: ${n} damage to the enemy Mind when summoned`,
  heal: n => `Heal ${n}: heal your Mind ${n} when summoned`,
  shield: n => `Shield ${n}: your Mind blocks the next ${n} damage`,
  spark: n => `Spark ${n}: the enemy in front gets -${n} power`,
  splash: () => 'Splash: every enemy creature gets -1 power',
  draw: () => 'Draw: draw a card when summoned',
  rally: () => 'Rally: your other creatures get +1 power',
  tough: () => 'Tough: survives ties',
  guard: () => 'Guard: loses no power when it wins',
  pierce: () => 'Pierce: extra power from a win hits the enemy Mind',
  grow: () => 'Grow: +1 power each turn it survives (max +3)',
  leech: () => 'Leech: heals your Mind 1 when it hits the Mind',
};
export const abilitiesOf = c => Object.keys(KEYWORDS).filter(k => c[k]).map(k => ({ k, n: c[k] === true ? null : c[k], text: KEYWORDS[k](c[k]) }));
export const ELEMENT_INFO = {
  fire: { name: 'Fire', color: '#ff7a4a', icon: '🔥' }, water: { name: 'Water', color: '#5ec8ff', icon: '💧' },
  nature: { name: 'Nature', color: '#7fcf55', icon: '🌿' }, light: { name: 'Light', color: '#ffe27a', icon: '✨' }, shadow: { name: 'Shadow', color: '#a99ae6', icon: '🌑' },
};
