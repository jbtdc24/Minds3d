// Mind Duel bot. It only sees what a player sees (viewFor), never the rival's hidden pick.
// It learns the rival's habits: favourite moves, what they play after each move, and
// whether they repeat after winning / switch after losing.
import { MOVES, BEATS, SKILLS } from './engine.js';

const LOSES_TO = { trick: 'strike', guard: 'trick', strike: 'guard' };   // value beats key
export const BOT_LEVELS = { easy: { read: 0.12, skill: 0.3 }, normal: { read: 0.62, skill: 0.7 }, hard: { read: 0.82, skill: 0.95 } };

export class Bot {
  constructor(level = 'normal', seed = 7) {
    this.cfg = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.seed = seed >>> 0;
    this.freq = { strike: 1, guard: 1, trick: 1 };
    this.after = {};                  // rival's last move -> counts of their next move
    this.stay = 1; this.shift = 1;    // rival behaviour after a decided clash
    this.prev = null;                 // rival's previous move
    this.prevResult = null;           // 'won' | 'lost' | 'tie' from the rival's point of view
    this.mine = { strike: 1, guard: 1, trick: 1 };   // my own habits (what a reader would see)
    this.score = [0, 0, 0];           // how well each strategy would have done: 0 = read them, 1 = they read me, 2 = they read me reading them
    this.lastPlans = null;
  }
  r() {                               // mulberry32
    let a = (this.seed = (this.seed + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // feed every resolved turn event; me = this bot's player index
  observe(ev, me) {
    if (!ev?.moves) return;
    const rm = ev.moves[1 - me];
    if (this.lastPlans) this.lastPlans.forEach((m, k) => { this.score[k] = this.score[k] * 0.85 + (BEATS[m] === rm ? 1 : m === rm ? 0 : -1); });
    for (const m of MOVES) this.mine[m] *= 0.9;
    this.mine[ev.moves[me]] += 1;
    for (const m of MOVES) this.freq[m] *= 0.9;
    this.freq[rm] += 1;
    if (this.prev) {
      const t = (this.after[this.prev] ||= { strike: 0.5, guard: 0.5, trick: 0.5 });
      t[rm] += 1;
      if (this.prevResult === 'won') rm === this.prev ? this.stay++ : this.shift++;
    }
    this.prevResult = ev.win === null ? 'tie' : ev.win === 1 - me ? 'won' : 'lost';
    this.prev = ev.roundOver ? null : rm;
  }
  // probability of each rival move next turn
  predict(view) {
    if (view.rival && view.forced === undefined) { /* noop: keeps signature simple */ }
    const p = { ...this.freq };
    if (this.prev && this.after[this.prev]) for (const m of MOVES) p[m] += this.after[this.prev][m] * 1.5;
    if (this.prev && this.prevResult === 'won') p[this.prev] += 2 * this.stay / (this.stay + this.shift);
    if (view.peekInfo) p[view.peekInfo] = 0;                       // Peek: they did not pick this
    if (view.rivalForced) for (const m of MOVES) p[m] = m === view.rivalForced ? 1 : 0;
    if (view.rivalForbid) p[view.rivalForbid] = 0;
    const sum = MOVES.reduce((s, m) => s + p[m], 0) || 1;
    for (const m of MOVES) p[m] /= sum;
    return p;
  }
  decide(view) {
    const pr = this.predict(view);
    const guess = MOVES.reduce((a, b) => pr[b] > pr[a] ? b : a);
    const conf = pr[guess];
    // three plans: beat their habit / assume they beat my habit / assume they expect that too
    const myHabit = MOVES.reduce((a, b) => this.mine[b] > this.mine[a] ? b : a);
    const plan0 = LOSES_TO[guess], plan1 = LOSES_TO[LOSES_TO[myHabit]], plan2 = LOSES_TO[LOSES_TO[plan0]];
    this.lastPlans = [plan0, plan1, plan2];
    const best = this.score.indexOf(Math.max(...this.score));
    let move = this.r() < this.cfg.read ? this.lastPlans[best] : MOVES[Math.floor(this.r() * 3)];
    if (!view.allowed.includes(move)) move = view.allowed.includes(LOSES_TO[guess]) ? LOSES_TO[guess] : view.allowed[Math.floor(this.r() * view.allowed.length)];
    const me = view.me, rv = view.rival;
    const can = k => me.loadout.includes(k) && me.uses[k] > 0 && me.focus >= SKILLS[k].cost;
    let skill = null, target = null;
    if (this.r() < this.cfg.skill) {
      const opts = [];
      if (can('counter') && conf > 0.5) opts.push(['counter', 6 + conf * 4]);
      if (can('overcharge') && conf > 0.45) opts.push(['overcharge', 5 + conf * 3]);
      if (can('heal') && me.hp <= 60) opts.push(['heal', 4 + (60 - me.hp) / 10]);
      if (can('ironmind') && me.hp <= 40 && conf < 0.5) opts.push(['ironmind', 5]);
      if (can('quickdraw') && pr[move] > 0.3) opts.push(['quickdraw', 2 + pr[move] * 3]);
      if (can('drain') && rv.focus >= 2) opts.push(['drain', 2 + rv.focus]);
      if (can('chaos') && me.hp < rv.hp - 30) opts.push(['chaos', 4]);
      if (can('freeze') && me.focus >= 2) opts.push(['freeze', 3]);
      if (can('mindlock') && rv.last) opts.push(['mindlock', 3]);
      if (can('peek') && me.focus >= 1) opts.push(['peek', 2.5]);
      if (can('bluff') && me.focus >= 1) opts.push(['bluff', 2]);
      if (can('mirror') && rv.last) opts.push(['mirror', 1.5]);
      if (opts.length) {
        opts.sort((a, b) => b[1] - a[1]);
        skill = opts[0][0];
        if (skill === 'counter') target = guess;
        if (skill === 'freeze') target = MOVES.reduce((a, b) => this.freq[b] > this.freq[a] ? b : a);
        if (skill === 'bluff') target = MOVES[Math.floor(this.r() * 3)];
      }
    }
    return { move, skill, target };
  }
}
