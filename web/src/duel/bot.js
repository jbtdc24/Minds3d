// Prize Duel bot. Uses only what a player can see (viewFor): its own cards and spells, the rival's
// remaining cards and spells, the crowns already played (so which values could still come) and the next-crown hint. It bids by crown rank, saves big cards for big
// crowns, uses spells at the right moments, expects the rival's Reverse / Trap, and adds some
// variety so it can't be farmed by one pattern.
export const BOT_LEVELS = {
  easy: { noise: 0.5, spellUse: 0.45, aware: 0.0 },   // for trial / new players
  normal: { noise: 0.2, spellUse: 0.85, aware: 0.6 },
  hard: { noise: 0.07, spellUse: 1, aware: 1 },
};

export class Bot {
  constructor(level = 'normal', seed = 7) {
    this.level = level;
    this.cfg = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.seed = seed | 0;
  }
  r() {
    let a = (this.seed = (this.seed + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  observe() { /* stateless: everything it needs is in the view */ }
  decide(v) {
    const R = () => this.r(), cfg = this.cfg;
    const mine = [...v.me.cards].sort((a, b) => a - b), theirs = [...v.rival.cards].sort((a, b) => a - b);
    // how many of the crowns still to come are probably smaller than this one (values 1-15 not seen yet)
    const unseen = []; for (let c = 1; c <= 15; c++) if (c !== v.crown && !v.seen.includes(c)) unseen.push(c);
    const after = mine.length - 1, below = unseen.filter(c => c < v.crown).length / (unseen.length || 1);
    let rank = Math.round(below * after);
    if (v.next === 'high' && v.crown <= 10 && rank > 0 && R() < cfg.aware + 0.3) rank--;        // save a big card for the big one
    rank = Math.max(0, Math.min(after, rank));
    const mySpells = [...v.me.spells, ...(v.me.reverse ? ['reverse'] : [])];
    const theirSpells = [...v.rival.spells, ...(v.rival.reverse ? ['reverse'] : [])];
    const can = k => mySpells.includes(k);
    const big = v.pot >= 10 || (v.pot >= 8 && v.next !== 'high');
    const rmax = theirs[theirs.length - 1];
    let card = mine[Math.min(mine.length - 1, rank)];
    if (R() < cfg.noise) card = mine[Math.floor(R() * mine.length)];
    if (v.pot <= 3 && R() < 0.7) card = mine[0];                                   // throw a low card on small crowns
    let spell = null;
    if (big && R() < cfg.spellUse) {
      const roll = R();
      if (can('trap') && rmax >= 7 && roll < 0.35) { card = mine[0]; spell = 'trap'; }        // sacrifice low, catch their 7
      else if (can('reverse') && roll < 0.6 && mine[0] < theirs[0] + 2) { card = mine[0]; spell = 'reverse'; }
      else if (can('double') && card >= rmax) spell = 'double';
      else if (can('boost') && card + 2 > rmax && card < rmax + 1) spell = 'boost';
      else { card = mine[mine.length - 1]; if (can('double')) spell = 'double'; }
      // expect the rival's tricks
      if (!spell && R() < cfg.aware) {
        if (theirSpells.includes('reverse') && R() < 0.35) card = mine[0];
        else if (theirSpells.includes('trap') && card >= 7 && R() < 0.5) card = mine.filter(x => x <= 5).pop() ?? card;
      }
    } else if (can('boost') && R() < 0.15 * cfg.spellUse) spell = 'boost';
    // last turn of the round: unused round spells are lost anyway, so throw one on
    if (!spell && mine.length === 1) {
      const pool = ['double', 'boost'].filter(can);
      if (pool.length) spell = pool[0];
    }
    return { card, spell };
  }
}
