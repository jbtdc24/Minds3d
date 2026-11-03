// How a player trains their AI Mind: choices per part of the game. They go into every question the AI is asked
// (so its own judgement follows them), and they are the safe move when the AI is too slow to answer in time.
// Pure data + pure functions: used by the browser (autopilot.js) and checked by the server (lib/routes/autopilot.js).
export const TRAINING = {
  duel: {
    label: '🃏 Duels (Ranked)',
    style: { label: 'Style', opts: { balanced: 'Balanced', bold: 'Bold: go big for big crowns', careful: 'Careful: never waste high cards', bluff: 'Bluffer: surprise the rival' } },
    big: { label: 'Big crown (10+)', opts: { top: 'Play my highest card', second: 'Play my 2nd highest', trap: 'Sacrifice low + Trap their big card' } },
    small: { label: 'Small crown (1-3)', opts: { lowest: 'Throw my lowest card', mid: 'Play a middle card', steal: 'Steal it with a 2nd lowest' } },
    double: { label: 'Double', opts: { big: 'Only on crowns 10+', sure: 'When I surely win', never: 'Never' } },
    trap: { label: 'Trap', opts: { high: 'When the rival still has 13+', big: 'On big crowns only', never: 'Never' } },
    reverse: { label: 'Reverse', opts: { low: 'When my cards are low', last: 'Save it for the last round', never: 'Never' } },
    boost: { label: 'Boost', opts: { close: 'For close calls', late: 'Near the end of a round', never: 'Never' } },
    next: { label: 'Next crown is HIGH', opts: { save: 'Save my big card for it', ignore: 'Ignore the hint' } },
  },
  raid: {
    label: '⚔️ Raids',
    target: { label: 'Target', opts: { rich: 'The richest island', easy: 'The weakest island', revenge: 'Revenge first' } },
    army: { label: 'Army', opts: { mix: 'Mixed army', brawler: 'Mostly Brawlers', archer: 'Mostly Archers', giant: 'Giants up front' } },
    spells: { label: 'Spells', opts: { early: 'Use them early', save: 'Save them for the Town Hall' } },
  },
  farm: {
    label: '🧺 Farm',
    crop: { label: 'Crops', opts: { profit: 'Most profit', fast: 'Fastest to grow', cheap: 'Cheapest seeds' } },
    sell: { label: 'Selling', opts: { all: 'Sell everything', keep: 'Keep some seeds back', none: 'Never sell' } },
  },
  explore: {
    label: '🧭 Adventures',
    spot: { label: 'Where', opts: { best: 'Best loot it can handle', safe: 'Safe, easy islands', new: 'New islands first' } },
    potions: { label: 'Potions to bring', opts: { 0: 'None', 1: '1', 2: '2', 3: '3' } },
  },
  energy: {
    label: '⚡ Ranked energy',
    refill: { label: 'Out of energy', opts: { shard: 'Shards only', dust: 'Shards, then Dust', stop: 'Stop dueling' } },
  },
};
Object.setPrototypeOf(TRAINING, null);
export const DEFAULT_TRAINING = Object.fromEntries(Object.entries(TRAINING).map(([g, G]) => [g, Object.fromEntries(Object.entries(G).filter(([k]) => k !== 'label').map(([k, o]) => [k, Object.keys(o.opts)[0]]))]));
// keep only known choices (anything else = the first choice)
export function cleanTraining(t) {
  const out = {};
  for (const [g, G] of Object.entries(TRAINING)) {
    out[g] = {};
    for (const [k, o] of Object.entries(G)) if (k !== 'label') out[g][k] = Object.hasOwn(o.opts, String(t?.[g]?.[k])) ? String(t[g][k]) : Object.keys(o.opts)[0];
  }
  return out;
}
// the training in plain words, for the AI
export const trainingText = (t, part) => Object.entries(TRAINING[part]).filter(([k]) => k !== 'label').map(([k, o]) => `${o.label}: ${o.opts[t?.[part]?.[k]] || Object.values(o.opts)[0]}`).join('; ');

// the trained move for a duel turn (v = the player's view of the match). Used when the AI does not answer in time.
export function trainedMove(v, t) {
  const d = cleanTraining(t).duel, mine = [...v.me.cards].sort((a, b) => a - b), theirs = [...v.rival.cards].sort((a, b) => a - b);
  const spells = [...v.me.spells, ...(v.me.reverse ? ['reverse'] : [])], can = k => spells.includes(k);
  const crown = v.pot || v.crown, top = mine.at(-1), low = mine[0];
  let card, spell = null;
  if (crown >= 10) {
    if (d.big === 'trap' && can('trap') && (theirs.at(-1) || 0) >= 7) { card = low; spell = 'trap'; }
    else card = d.big === 'second' && mine.length > 1 ? mine.at(-2) : top;
  } else if (crown <= 3) card = d.small === 'mid' ? mine[mine.length >> 1] : d.small === 'steal' && mine.length > 1 ? mine[1] : low;
  else {
    const rank = Math.round((crown - 1) / 14 * (mine.length - 1));
    card = mine[Math.max(0, Math.min(mine.length - 1, rank - (d.style === 'careful' ? 1 : 0) + (d.style === 'bold' ? 1 : 0)))];
  }
  if (v.next === 'high' && d.next === 'save' && crown < 10 && card === top && mine.length > 1) card = mine.at(-2);
  if (d.style === 'bluff' && (v.turn || 0) % 3 === 2 && mine.length > 2) card = mine[1];
  if (!spell) {
    if (can('double') && d.double !== 'never' && ((d.double === 'big' && crown >= 10) || (d.double === 'sure' && card > (theirs.at(-1) || 0)))) spell = 'double';
    else if (can('trap') && ((d.trap === 'high' && (theirs.at(-1) || 0) >= 13) || (d.trap === 'big' && crown >= 10))) { spell = 'trap'; card = low; }
    else if (can('reverse') && ((d.reverse === 'low' && top <= 6) || (d.reverse === 'last' && v.round === 3 && crown >= 8))) { spell = 'reverse'; card = low; }
    else if (can('boost') && ((d.boost === 'close' && Math.abs(card - (theirs.at(-1) || 0)) <= 2) || (d.boost === 'late' && mine.length <= 2))) spell = 'boost';
  }
  return { card, spell };
}
