// Economy check: what a player earns per day vs what things cost. Run: node tools/sim_economy.mjs
import { CROPS, BUILD, SHOP, SHIP_COSTS, gemPrice, BASE_PLOTS } from '../web/src/island/rules.js';
import { advMap, advLoot } from '../web/src/island/adventure.js';
import { raidFee, botLoot } from '../web/src/island/raid.js';
import { GEM_PACKS } from '../web/src/gems.js';
const H = 3600e3, line = (a, b) => console.log(String(a).padEnd(34), b);
console.log('--- farming: Dust profit per day (sessions = times you log in) ---');
for (const plots of [BASE_PLOTS, 24]) for (const [c, sess] of [['bean', 6], ['carrot', 6], ['melon', 3], ['star', 1]]) {
  const d = CROPS[c], cycles = Math.min(sess, 24 * H / d.grow);
  line(`${plots} plots ${c} x${cycles}/day`, Math.round(plots * cycles * (d.sell - d.seed)));
}
console.log('--- adventure: loot of a full clear, a realistic run is ~40% ---');
for (const lv of [1, 2, 3, 4]) { const m = advMap(1234, lv), l = advLoot(m, m.nodes.map(n => n.id), m.monsters.map(x => x.id)); line(`level ${lv} full clear`, JSON.stringify(l)); }
console.log('--- raids on game villages: net Dust per raid (2 stars ≈ 70%) ---');
const army = { brawler: 4, archer: 3, bomber: 1, giant: 0 }, armyCost = 4 * 20 + 3 * 25 + 60;
for (const lv of [1, 2, 3]) {
  const loot = Math.round(botLoot(lv) * 0.7); line(`level ${lv} loot ${loot} - fee ${raidFee(army)} - troops ${armyCost}`, loot - raidFee(army) - armyCost);
}
console.log('--- what things cost (Dust value, Gem price) ---');
for (const [k, d] of Object.entries(BUILD)) if (!d.fixed && !d.gem) line(k, `${JSON.stringify(d.cost)} = ${gemPrice(d.cost)} gems`);
SHIP_COSTS.forEach(s => s && line(s.name, `${JSON.stringify(s.cost)} = ${s.gems} gems`));
console.log('--- gem packs ---');
for (const p of GEM_PACKS) line(p.name, `${p.gems} gems = ${(p.gems * 100).toLocaleString()} Dust value, ${p.eth} ETH, ${(Number(p.eth) / p.gems * 1e5).toFixed(2)} ETH per 100k gems`);
