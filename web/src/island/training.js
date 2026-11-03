// How a player trains their AI Mind: choices per part of the game. They go into every question the AI is asked,
// so its own judgement follows them. The game never plays a move for the AI: no answer means no move.
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

// ---- what the AI is asked, and how its answer is read (the server asks; the same text everywhere) ----
// the AI's reason, whole (cut at a word near 400 characters, never mid-word)
const why = reply => { const w = ((/WHY:\s*([\s\S]+)/i.exec(reply || '') || [])[1] || '').trim().replace(/\s+/g, ' '); return w.length > 400 ? w.slice(0, 400).replace(/\s+\S*$/, '') + '…' : w; };
export const STEP_NAMES = { build: 'Upgrade buildings', farm: 'Farm', sell: 'Sell crops', well: 'Energy Well', train: 'Train troops', raid: 'Raid', adventure: 'Adventure', duel: 'Ranked duel', town: 'Mind Town', decorate: 'Decorate', wait: 'Rest' };
export function stepQuestion({ steps, planned, st, energy, train, crops, spots }) {
  const opts = [...new Set(steps.map(s => s.do))];
  const growing = Object.values(st?.tiles || {}).filter(t => t.s === 'p' && t.c).length, bag = Object.entries(st?.inv || {}).filter(([k]) => k.startsWith('crop_')).reduce((s, [, n]) => s + n, 0);
  const troops = Object.entries(st?.inv || {}).filter(([k]) => k.startsWith('troop_')).reduce((s, [, n]) => s + n, 0);
  return `NEXT STEP. Your plan: ${steps.map(s => STEP_NAMES[s.do]).join(' → ')}. The plan says next: ${STEP_NAMES[planned]}.
Island: ${(st?.dust || 0).toLocaleString()} Dust, ${st?.gems || 0} Gems, ${growing} crops growing, ${bag} crops in the bag, ${troops} troops.${energy != null ? ` Ranked energy of this Mind: ${energy}.` : ''}
Your training: ${trainingText(train, 'farm')}; ${trainingText(train, 'raid')}; ${trainingText(train, 'explore')}.
Reply "DO: <one of ${opts.join(', ')}>" (keep to the plan unless another step is clearly better now).
Then the details for that step (you decide them): farm → "CROP: <${Object.keys(crops || {}).join('|') || 'crop'}>"; sell → "SELL: all|half|none"; train → "TROOPS: brawler N, archer N, bomber N, giant N";
build → "UPGRADE: <home|house|mill|camp|barn|tower|cannon|mortar|spire|wall, … in order> RUSH: yes|no" (rush = finish with Gems, only within the player's Gem limit);
adventure → "SPOT: <${(spots || []).map((s, i) => `${i}=${s.name}`).join(', ') || 'number'}> POTIONS: 0-3"; raid → "ARMY: brawler N, archer N, bomber N, giant N"; decorate → "DECOR: <flowers|lamp|bench|banner, …>".
Last line: "WHY: <reason>".`;
}
// the details the AI chose for its step (only known values; the step checks every rule again)
export function readDetails(reply, { crops = {}, spots = [] } = {}) {
  const r = String(reply || ''), get = k => (new RegExp(`${k}:\\s*([^\\n]+?)(?=\\s+[A-Z]+:|$)`, 'im').exec(r) || [])[1]?.trim() || '';
  const army = t => Object.fromEntries([...t.toLowerCase().matchAll(/(brawler|archer|bomber|giant)s?\s*[:x]?\s*(\d+)/g)].map(m => [m[1], Math.min(60, +m[2])]).filter(([, n]) => n > 0));
  const out = {}, crop = get('CROP').toLowerCase().split(/[\s,]/)[0], sell = get('SELL').toLowerCase().split(/\s/)[0], spot = Number(get('SPOT').match(/\d+/)?.[0]);
  if (Object.hasOwn(crops, crop)) out.crop = crop;
  if (['all', 'half', 'none'].includes(sell)) out.sell = sell;
  const troops = army(get('TROOPS')); if (Object.keys(troops).length) out.troops = troops;
  const raid = army(get('ARMY')); if (Object.keys(raid).length) out.army = raid;
  if (Number.isInteger(spot) && spot >= 0 && spot < spots.length) out.spot = spot;
  const pot = Number(get('POTIONS').match(/\d+/)?.[0]); if (pot >= 0 && pot <= 3) out.potions = pot;
  const decor = get('DECOR').toLowerCase().match(/flowers|lamp|bench|banner/g); if (decor) out.decor = decor.slice(0, 6);
  const up = get('UPGRADE').toLowerCase().replace(/town ?hall/g, 'home').match(/home|house|mill|camp|barn|tower|cannon|mortar|spire|wall/g); if (up) out.upgrade = [...new Set(up)];
  if (/^y/i.test(get('RUSH'))) out.rush = true;
  return out;
}
export function readStep(reply, steps) {
  const pick = (/DO:\s*([a-z]+)/i.exec(reply || '') || [])[1]?.toLowerCase();
  return { pick: steps.some(s => s.do === pick) ? pick : null, why: why(reply) };
}
export function duelQuestion(v, train) {
  const spells = [...v.me.spells, ...(v.me.reverse ? ['reverse'] : [])], sort = a => [...a].sort((x, y) => x - y).join(', ');
  return `DUEL TURN (Prize Duel: both play a card 1-15 at the same time, the higher card wins the crown; each card once per round).
Crown now: ${v.crown} (pot ${v.pot}). Next crown will be ${v.next || 'none'}. Crowns already played this round: ${v.seen.join(', ') || 'none'}.
Round ${v.round} of 3. Score: you ${v.me.score} – rival ${v.rival.score}. Rounds won: you ${v.me.rounds} – rival ${v.rival.rounds}.
Your cards: ${sort(v.me.cards)}. Your spells: ${spells.join(', ') || 'none'}.
Rival cards left: ${sort(v.rival.cards)}. Rival spells: ${[...v.rival.spells, ...(v.rival.reverse ? ['reverse'] : [])].join(', ') || 'none'}.
Spells: boost +2 to your card, double = crown x2, trap = if the rival plays 7+ you win, reverse = the lower card wins (once per match).
Your training: ${trainingText(train, 'duel')}.
Reply "CARD: <a card you have> SPELL: <${spells.join('|') || 'none'}|none>" then "WHY: <reason>".`;
}
// the AI's card, or null when the answer does not fit (then the trained move is played)
export function readCard(reply, v) {
  const spells = [...v.me.spells, ...(v.me.reverse ? ['reverse'] : [])];
  const card = Number((/CARD:\s*(\d+)/i.exec(reply || '') || [])[1]), sp = ((/SPELL:\s*([a-z]+)/i.exec(reply || '') || [])[1] || '').toLowerCase();
  return v.me.cards.includes(card) ? { card, spell: spells.includes(sp) ? sp : null, why: why(reply) } : null;
}

// a move from the duel strategy the AI wrote itself before the duel (strategyQuestion / readStrategy): used on a turn where
// its live answer does not come in time (turns are only 20 s). The rules are the AI's own, never the game's.
export function strategyMove(v, plan) {
  const d = cleanTraining({ duel: plan }).duel, mine = [...v.me.cards].sort((a, b) => a - b), theirs = [...v.rival.cards].sort((a, b) => a - b);
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

// before a duel the AI writes its strategy, using the same choices as the training (so the game can read it)
export function strategyQuestion(train) {
  const D = TRAINING.duel;
  return `DUEL STRATEGY. You are about to play a Prize Duel (both play a card 1-15 at once, higher card wins the crown; 3 rounds).
Write your strategy for this duel, one line each, choosing one option per line. Your human's training: ${trainingText(train, 'duel')}.
${Object.entries(D).filter(([k]) => k !== 'label').map(([k, o]) => `${k.toUpperCase()}: ${Object.keys(o.opts).join('|')}   (${o.label}: ${Object.values(o.opts).join(' / ')})`).join('\n')}
Last line: "WHY: <reason>".`;
}
export function readStrategy(reply) {
  const out = {}, r = String(reply || '');
  for (const [k, o] of Object.entries(TRAINING.duel)) {
    if (k === 'label') continue;
    const m = new RegExp(`${k}:\\s*([a-z0-9]+)`, 'i').exec(r);
    if (m && Object.hasOwn(o.opts, m[1].toLowerCase())) out[k] = m[1].toLowerCase();
  }
  return Object.keys(out).length >= 3 ? out : null;
}
