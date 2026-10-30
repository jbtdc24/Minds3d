// Economy audit: looks for money from nothing. Every loop that buys and sells is checked, and income is compared with costs.
// Run: node tools/economy_audit.mjs. Exit code 1 = a real exploit (a loop that ends with more than it started).
import { CROPS, RAW, SHOP, BUILD, RECIPES, gemPrice, SHIP_COSTS, newIsland, act, ENERGY_PRICE } from '../web/src/island/rules.js';
import { raidFee, botLoot, TROOPS } from '../web/src/island/raid.js';
import { GEM_PACKS } from '../web/src/gems.js';
import { gen, COVER } from '../web/src/island/gen.js';

const bad = [], notes = [];
const VAL = { dust: 1, wood: 5, stone: 6, gems: 100 };
const value = c => Object.entries(c).reduce((s, [k, n]) => s + (VAL[k] ?? 0) * n, 0);

// 1. buy something, sell it straight back
for (const [k, v] of Object.entries(SHOP)) for (const [item, n] of Object.entries(v.gives)) {
  const sell = RAW[item]?.sell ?? (item.startsWith('crop_') ? CROPS[item.slice(5)]?.sell : 0) ?? 0;
  if (sell && sell * n > value(v.price)) bad.push(`shop ${k}: buy ${value(v.price)}, sell ${sell * n}`);
}
// 2. every crop: seed, then sale
console.log('crop          seed  sale  profit  hours  profit/hour');
for (const [k, c] of Object.entries(CROPS)) {
  const profit = c.sell - c.seed, hrs = c.grow / 3600e3;
  console.log(k.padEnd(13), String(c.seed).padEnd(5), String(c.sell).padEnd(5), String(profit).padEnd(7), hrs.toFixed(2).padEnd(6), (profit / hrs).toFixed(1));
  if (profit <= 0) notes.push(`crop ${k} loses money`);
}
// 3. build then demolish, with real actions
for (const [type, d] of Object.entries(BUILD)) {
  if (d.fixed || !d.cost) continue;
  const seed = 11, st = newIsland(seed, 1), w = gen(seed); st.dust = 1e6; st.gems = 1e4; st.inv.wood = 1e4; st.inv.stone = 1e4;
  for (let i = 0; i < w.land.length; i++) if (w.land[i] && w.cover[i] !== COVER.NONE) st.tiles[i] = { s: 'c', t: 1 };
  for (const gems of [false, true]) {
    const before = value({ dust: st.dust, gems: st.gems, wood: st.inv.wood, stone: st.inv.stone });
    let k = -1;
    for (let i = 0; i < w.land.length && k < 0; i++) if (w.land[i] && !st.tiles[i]?.s?.match(/b|p/)) k = i;
    const tries = Array.from({ length: w.land.length }, (_, i) => i).filter(i => w.land[i]);
    let built = null;
    for (const i of tries) { const r = act(st, { type: 'build', item: type, k: i, tiles: [i], gems }, { seed, now: 2, minds: 5, instant: true }); if (r.done) { built = st.b.at(-1); break; } }
    if (!built) { notes.push(`could not place ${type}`); continue; }
    act(st, { type: 'demolish', id: built.id }, { seed, now: 3, minds: 5 });
    const after = value({ dust: st.dust, gems: st.gems, wood: st.inv.wood, stone: st.inv.stone });
    if (after > before) bad.push(`build ${type}${gems ? ' with Gems' : ''} then demolish: ${before} became ${after}`);
  }
}
// 4. crafting
for (const [k, r] of Object.entries(RECIPES)) if (value(r.gives) > value(r.needs) && value(r.needs) > 0) notes.push(`recipe ${k} gains value`);
// 5. Gem conversions
for (const [k, v] of Object.entries(SHOP)) if (v.gem && v.gives.dust) { const perGem = v.gives.dust / v.price.gems; console.log(`Gem to Dust: ${k} pays ${perGem} Dust per Gem`); }
// 6. raids against game villages
console.log('\nraid on a game village (full army of 10 space, all lost, 70% destroyed)');
const armyCost = 6 * 20 + 4 * 25, fee = raidFee({ brawler: 6, archer: 4 });
for (const lv of [1, 2, 3]) console.log(`level ${lv}: loot ${Math.floor(botLoot(lv) * 0.7)}, cost ${armyCost + fee}, net ${Math.floor(botLoot(lv) * 0.7) - armyCost - fee}`);
// 7. daily caps, in Dust
const caps = { 'Town Time': 240, 'meeting players': 100, 'raids on real players (ceiling)': 6000, 'Scout job, per Mind': 480 };
console.log('\ndaily ceilings', caps);
const pack = GEM_PACKS[0]; console.log('cheapest Gem pack:', pack.gems, 'Gems for', pack.eth, 'ETH');
console.log('energy refill', ENERGY_PRICE, 'airships', SHIP_COSTS.slice(1).map(s => s.cost.dust));
void TROOPS; void gemPrice;
console.log('\nnotes:', notes.length ? notes : 'none');
console.log(bad.length ? 'EXPLOITS:\n' + bad.join('\n') : 'no money-from-nothing loop found');
process.exit(bad.length ? 1 : 0);
