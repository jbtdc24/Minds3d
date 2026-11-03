// Mind Autopilot: your Mind plays the game for you. A plan is a list of steps that repeats; presets are ready plans,
// and a typed message ("farm, then raid, then go to town for an hour") becomes a plan too. Runs in the browser and on
// the server (lib/routes/autopilot.js) with the same rules as playing by hand: nothing is free or faster.
import { CROPS, BUILD, SHOP, ripe, fits, canAfford, countOf, maxOf, homeOf, troopCount, troopMax, thLv, wellShards } from './rules.js';
import { TW, TH } from './gen.js';

// a step: { do, n?, min? }. 'duel' and 'town' and 'wait' run in the game tab; the rest is one server call each.
export const STEPS = {
  farm: { icon: '🧺', name: 'Farm', say: 'harvest ripe crops and plant the empty plots' },
  sell: { icon: '💰', name: 'Sell crops', say: 'sell the crops in the bag (keeps a few seeds)' },
  well: { icon: '⚡', name: 'Energy Well', say: 'collect the Energy Well shards' },
  train: { icon: '🏹', name: 'Train troops', say: 'train troops with spare Dust' },
  raid: { icon: '⚔️', name: 'Raid', say: 'raid another island' },
  adventure: { icon: '🧭', name: 'Adventure', say: 'explore a wild island' },
  duel: { icon: '🃏', name: 'Ranked duel', say: 'play ranked duels' },
  town: { icon: '🏘️', name: 'Mind Town', say: 'hang out in Mind Town for the Town Time rewards' },
  decorate: { icon: '🌷', name: 'Decorate', say: 'put decorations around your home with spare Dust' },
  wait: { icon: '💤', name: 'Rest', say: 'rest a little' },
};
export const PRESETS = {
  daily: { icon: '🔁', name: 'Daily Loop', desc: 'A bit of everything: farm, adventure, duel, town, raid.', steps: [{ do: 'farm' }, { do: 'well' }, { do: 'adventure' }, { do: 'duel', n: 1 }, { do: 'town', min: 20 }, { do: 'farm' }, { do: 'raid' }, { do: 'sell' }, { do: 'wait', min: 10 }] },
  farmer: { icon: '🧺', name: 'Farmer', desc: 'Grows, harvests and sells all day.', steps: [{ do: 'farm' }, { do: 'sell' }, { do: 'well' }, { do: 'wait', min: 8 }] },
  raider: { icon: '⚔️', name: 'Raider', desc: 'Trains troops and raids, farms between raids.', steps: [{ do: 'train' }, { do: 'raid' }, { do: 'farm' }, { do: 'wait', min: 8 }] },
  ranked: { icon: '🃏', name: 'Ranked Grinder', desc: 'Plays ranked duels while there is energy.', steps: [{ do: 'well' }, { do: 'duel', n: 3 }, { do: 'farm' }, { do: 'wait', min: 10 }] },
  explorer: { icon: '🧭', name: 'Explorer', desc: 'Goes on adventures, sells what it finds.', steps: [{ do: 'adventure' }, { do: 'farm' }, { do: 'sell' }, { do: 'wait', min: 8 }] },
  decorator: { icon: '🌷', name: 'Decorator', desc: 'Makes your island pretty with spare Dust.', steps: [{ do: 'farm' }, { do: 'sell' }, { do: 'decorate' }, { do: 'wait', min: 8 }] },
  social: { icon: '🏘️', name: 'Town Social', desc: 'Lives in Mind Town for rewards, farms now and then.', steps: [{ do: 'town', min: 60 }, { do: 'farm' }, { do: 'sell' }] },
};
Object.setPrototypeOf(STEPS, null); Object.setPrototypeOf(PRESETS, null);
export const MAX_STEPS = 12;

// clean a plan from the browser or a message: known steps only, sane numbers
export function cleanPlan(steps) {
  return (Array.isArray(steps) ? steps : []).slice(0, MAX_STEPS).filter(s => STEPS[s?.do]).map(s => ({
    do: s.do,
    ...(s.do === 'duel' ? { n: Math.max(1, Math.min(10, s.n | 0 || 1)) } : {}),
    ...(s.do === 'town' || s.do === 'wait' ? { min: Math.max(1, Math.min(240, s.min | 0 || (s.do === 'town' ? 20 : 10))) } : {}),
  }));
}
export const planText = steps => steps.map(s => `${STEPS[s.do].icon} ${STEPS[s.do].name}${s.n > 1 ? ` ×${s.n}` : ''}${s.min ? ` ${s.min >= 60 && s.min % 60 === 0 ? s.min / 60 + ' h' : s.min + ' min'}` : ''}`).join(' → ');

// a typed message → a plan, in the order the player said it. "every day like a farmer" → a preset.
const WORDS = [
  [/\b(farm|harvest|plant|crops?|seeds?|grow)/, 'farm'], [/\b(sell|market|cash)/, 'sell'], [/\b(well|shards?)\b/, 'well'],
  [/\b(train|troops?|army|soldiers?)/, 'train'], [/\b(raid|attack|loot|plunder)/, 'raid'], [/\b(adventure|explore|quest|wild)/, 'adventure'],
  [/\b(duel|ranked|rank|cards?|pvp|fight)/, 'duel'], [/\b(town|hang ?out|social|meet)/, 'town'], [/\b(decor|decorate|pretty|flowers?|lamps?)/, 'decorate'],
  [/\b(rest|wait|sleep|break)/, 'wait'],
];
const numIn = (t, re) => { const m = t.match(re); return m ? +m[1] : 0; };
export function parsePlan(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(stop|pause|halt|enough)\b/.test(t)) return { stop: true };
  for (const [k, p] of Object.entries(PRESETS)) if (t.includes(p.name.toLowerCase()) || new RegExp(`\\b(be|like|as) an? ${k}\\b`).test(t)) return { preset: k, steps: p.steps };
  const found = [];
  for (const part of t.split(/,|\bthen\b|\band\b|\bafter that\b|;|\.|→|->/)) {
    for (const [re, step] of WORDS) if (re.test(part)) {
      const s = { do: step };
      if (step === 'duel') s.n = numIn(part, /(\d+)\s*(?:x|times|games|duels|matches)?/) || 1;
      if (step === 'town' || step === 'wait') s.min = numIn(part, /(\d+)\s*h(?:ours?|rs?)?\b/) * 60 || numIn(part, /(\d+)\s*m(?:in(?:utes?)?)?\b/) || (step === 'town' ? 20 : 10);
      found.push(s);
      break;
    }
  }
  if (!found.length) return { talk: true };
  return { steps: cleanPlan(found), loop: !/\b(once|one time)\b/.test(t) };
}

// ---- moves the Mind makes on the island (pure: state in, actions out) ----
// harvest everything ripe, then plant the empty plots: with the crop the AI chose (buying its seeds), else the seed it has most of
export function farmActs(st, now, minds, choice = null) {
  const plots = Object.entries(st.tiles || {}).filter(([, t]) => t.s === 'p').map(([k, t]) => [+k, t]), busy = new Set((st.q || []).map(j => j.k));
  const ripeK = plots.filter(([k, t]) => t.c && ripe(t, now, minds) && !busy.has(k)).map(([k]) => k).slice(0, 40);
  const empty = plots.filter(([k, t]) => !t.c && !busy.has(k)).map(([k]) => k).slice(0, 40);
  const acts = [];
  if (ripeK.length) acts.push({ type: 'harvest', tiles: ripeK });
  if (empty.length) {
    const seeds = Object.keys(CROPS).map(c => [c, st.inv?.['seed_' + c] || 0]).sort((a, b) => b[1] - a[1]);
    let [crop, have] = Object.hasOwn(CROPS, choice || '') ? [choice, st.inv?.['seed_' + choice] || 0] : seeds[0] || [];
    if (!have && Object.hasOwn(CROPS, choice || '')) {   // the AI's crop: buy its seeds (keeps 100 Dust)
      const n = Math.max(0, Math.min(empty.length, Math.floor(((st.dust || 0) - 100) / CROPS[crop].seed)));
      if (n) { acts.push({ type: 'buy', item: 'seed_' + crop, n }); have = n; }
    } else if (!have) {   // buy seeds: the best crop it can afford for every empty plot, keeping 200 Dust
      const pick = Object.entries(CROPS).filter(([, c]) => c.seed * empty.length <= (st.dust || 0) - 200).sort((a, b) => (b[1].sell - b[1].seed) - (a[1].sell - a[1].seed))[0]
        || Object.entries(CROPS).sort((a, b) => a[1].seed - b[1].seed)[0];
      crop = pick[0]; const n = Math.max(0, Math.min(empty.length, Math.floor(((st.dust || 0) - 100) / CROPS[crop].seed)));
      if (n) { acts.push({ type: 'buy', item: 'seed_' + crop, n }); have = n; }
    }
    if (have) acts.push({ type: 'plant', crop, tiles: empty.slice(0, have) });
  }
  return acts;
}
// sell every crop in the bag
export const sellActs = st => Object.entries(st.inv || {}).filter(([k, n]) => k.startsWith('crop_') && n > 0).map(([item, n]) => ({ type: 'sell', item, n }));
export const wellActs = (st, now) => wellShards(st, now) > 0 ? [{ type: 'well' }] : [];
// train troops with spare Dust: brawlers and archers, keeps 600 Dust, stops at 3/4 of the camp
export function trainActs(st, mix = null) {
  const room = Math.floor(troopMax(st) * 0.75) - troopCount(st), spare = (st.dust || 0) - 600;
  if (room <= 0 || spare <= 0) return [];
  if (mix && Object.keys(mix).length) {   // the troops the AI asked for, as far as room and Dust go
    const out = []; let left = room, dust = spare;
    for (const [k, want] of Object.entries(mix)) {
      const it = SHOP['troop_' + k]; if (!it) continue;
      const n = Math.max(0, Math.min(want | 0, left, Math.floor(dust / (it.price.dust || 1e9))));
      if (n) { out.push({ type: 'shop', item: 'troop_' + k, n }); left -= n; dust -= n * it.price.dust; }
    }
    return out;
  }
  const per = SHOP.troop_brawler.price.dust + 5, n = Math.max(0, Math.min(room, Math.floor(spare / per), 10));
  return n ? [{ type: 'shop', item: 'troop_brawler', n: Math.ceil(n / 2) }, { type: 'shop', item: 'troop_archer', n: Math.floor(n / 2) }].filter(a => a.n > 0) : [];
}
// the furthest adventure spot the airship and fuel allow (spots of one tier are tried in turn)
export function advSpot(st, spots, n = 0) {
  const ok = spots.map((s, i) => [s, i]).filter(([s]) => s.tier <= (st.ship || 0) && s.tier <= (st.inv?.fuel || 0));
  const top = Math.max(0, ...ok.map(([s]) => s.tier)), best = ok.filter(([s]) => s.tier === top);
  return best.length ? best[n % best.length][1] : 0;
}
// decorations in a ring around the home: flowers, lamps, benches, banners; never Gem decorations, keeps 400 Dust
export function decorActs(st, w, kinds0 = null) {
  const home = homeOf(st, w); if (!home) return [];
  const acts = [], taken = new Set();
  let budget = { ...(st.inv || {}), dust: (st.dust || 0) - 400 };
  const tryPut = (type, k) => {
    const d = BUILD[type];
    if (taken.has(k) || countOf(st, type) + acts.filter(a => a.item === type).length >= maxOf(type, 0, thLv(st)) || !fits(st, w, type, k)) return false;
    if (!canAfford({ ...st, dust: budget.dust, inv: budget }, d.cost)) return false;
    for (const [i, n] of Object.entries(d.cost)) budget[i] = (budget[i] || 0) - n;
    taken.add(k); acts.push({ type: 'build', item: type, tiles: [k] }); return true;
  };
  const kinds = kinds0?.length ? kinds0 : ['flowers', 'flowers', 'lamp', 'flowers', 'bench', 'banner'];   // what the AI chose, or a mix
  let i = 0;
  for (let r = 3; r <= 6 && acts.length < 6; r++) for (let a = 0; a < 16 && acts.length < 6; a++) {
    const x = Math.round(home.x + 1 + Math.cos(a / 16 * Math.PI * 2) * r), y = Math.round(home.y + 1 + Math.sin(a / 16 * Math.PI * 2) * r);
    if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
    if (tryPut(kinds[i % kinds.length], y * TW + x)) i++;
  }
  return acts;
}
