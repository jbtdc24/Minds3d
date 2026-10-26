// All sound is synthesized with WebAudio: chiptune music loops + punchy SFX. No files to load.
let ctx = null, master, musicBus, sfxBus, noiseBuf;
const vol = { music: 0.5, sfx: 0.8 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.connect(comp);
  setVolume(vol.music, vol.sfx);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(music, sfx) {
  vol.music = music; vol.sfx = sfx;
  if (!ctx) return;
  musicBus.gain.value = music * 0.35;
  sfxBus.gain.value = sfx * 0.8;
}

function tone(freq, t0, dur, { type = 'square', gain = 0.3, slide = 0, bus = sfxBus, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, { gain = 0.3, hp = 800, lp = 12000, bus = sfxBus } = {}) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  f1.type = 'highpass'; f1.frequency.value = hp;
  f2.type = 'lowpass'; f2.frequency.value = lp;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(bus);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

const SFX = {
  click: t => tone(880, t, 0.05, { gain: 0.12 }),
  hover: t => tone(1320, t, 0.03, { gain: 0.05, type: 'triangle' }),
  select: t => { tone(660, t, 0.06, { gain: 0.15 }); tone(990, t + 0.05, 0.08, { gain: 0.15 }); },
  deselect: t => { tone(660, t, 0.06, { gain: 0.12 }); tone(440, t + 0.05, 0.08, { gain: 0.12 }); },
  denied: t => tone(140, t, 0.15, { gain: 0.2, type: 'sawtooth' }),
  whoosh: t => noise(t, 0.25, { gain: 0.25, hp: 600, lp: 3000 }),
  hit: t => { tone(160, t, 0.18, { type: 'sine', gain: 0.7, slide: 0.4 }); noise(t, 0.09, { gain: 0.45, hp: 1500 }); },
  crit: t => { tone(120, t, 0.35, { type: 'sine', gain: 0.9, slide: 0.3 }); noise(t, 0.2, { gain: 0.6, hp: 900 }); tone(1760, t + 0.02, 0.25, { gain: 0.12, type: 'triangle' }); },
  miss: t => { noise(t, 0.15, { gain: 0.2, hp: 3000 }); tone(1200, t, 0.12, { gain: 0.06, slide: 1.6, type: 'sine' }); },
  block: t => { tone(520, t, 0.2, { type: 'triangle', gain: 0.3, slide: 0.9 }); tone(780, t, 0.25, { type: 'triangle', gain: 0.15 }); },
  heal: t => [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.06, 0.25, { type: 'triangle', gain: 0.15 })),
  shield: t => { tone(330, t, 0.4, { type: 'triangle', gain: 0.2, slide: 2 }); noise(t, 0.3, { gain: 0.08, hp: 4000 }); },
  buff: t => [440, 554, 659, 880].forEach((f, i) => tone(f, t + i * 0.05, 0.15, { gain: 0.1 })),
  debuff: t => [660, 523, 415, 330].forEach((f, i) => tone(f, t + i * 0.05, 0.15, { gain: 0.1 })),
  stun: t => [1200, 1500, 1200, 1500].forEach((f, i) => tone(f, t + i * 0.07, 0.08, { type: 'sine', gain: 0.1 })),
  burn: t => noise(t, 0.4, { gain: 0.25, hp: 300, lp: 2000 }),
  cast: t => { tone(300, t, 0.35, { type: 'sawtooth', gain: 0.12, slide: 3 }); noise(t, 0.3, { gain: 0.1, hp: 2000 }); },
  energy: t => { tone(880, t, 0.1, { type: 'sine', gain: 0.15 }); tone(1320, t + 0.08, 0.15, { type: 'sine', gain: 0.15 }); },
  ko: t => { tone(400, t, 0.8, { type: 'sawtooth', gain: 0.25, slide: 0.15 }); noise(t, 0.5, { gain: 0.4, hp: 200 }); },
  land: t => { tone(90, t, 0.2, { type: 'sine', gain: 0.6, slide: 0.5 }); noise(t, 0.12, { gain: 0.2, hp: 400, lp: 2000 }); },
  round: t => { tone(523, t, 0.12, { gain: 0.15 }); tone(784, t + 0.12, 0.2, { gain: 0.15 }); },
  fight: t => { tone(392, t, 0.1, { gain: 0.2 }); tone(523, t + 0.1, 0.1, { gain: 0.2 }); tone(784, t + 0.2, 0.35, { gain: 0.22 }); },
  victory: t => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, i === 5 ? 0.6 : 0.14, { gain: 0.2 })),
  defeat: t => [392, 349, 311, 262].forEach((f, i) => tone(f, t + i * 0.22, 0.3, { gain: 0.18, type: 'triangle' })),
  levelup: t => [523, 784, 1046, 1568].forEach((f, i) => tone(f, t + i * 0.07, 0.2, { type: 'triangle', gain: 0.18 })),
  star: t => { tone(1568, t, 0.15, { type: 'triangle', gain: 0.18 }); tone(2093, t + 0.08, 0.3, { type: 'triangle', gain: 0.15 }); },
};
export function sfx(name, delay = 0) {
  if (!ctx || !SFX[name]) return;
  SFX[name](ctx.currentTime + delay);
}

// ---------- music: a tiny step sequencer ----------
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  title: { bpm: 104, bars: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 64]], drums: 'x...o...x...o...', lead: [76, 0, 72, 0, 74, 76, 0, 79, 77, 0, 76, 0, 72, 0, 74, 0] },
  battle: { bpm: 142, bars: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [56, 59, 64, 68]], drums: 'x.h.o.h.x.xho.h.', lead: [81, 0, 79, 81, 0, 76, 0, 79, 81, 0, 84, 0, 83, 81, 79, 0] },
  menu: { bpm: 96, bars: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]], drums: 'x.......o.......', lead: [72, 0, 0, 74, 76, 0, 0, 0, 79, 0, 76, 0, 74, 0, 0, 0] },
};
let song = null, step = 0, nextTime = 0, timer = null;
export function music(name) {
  if (!ctx) return;
  if (song === SONGS[name]) return;
  song = SONGS[name] || null;
  step = 0; nextTime = ctx.currentTime + 0.1;
  if (!timer) timer = setInterval(schedule, 25);
}
function schedule() {
  if (!song || !ctx) return;
  const spb = 60 / song.bpm / 4;                 // 16th notes
  while (nextTime < ctx.currentTime + 0.12) {
    const bar = song.bars[Math.floor(step / 16) % song.bars.length], s = step % 16, t = nextTime;
    const o = { bus: musicBus };
    if (s % 4 === 0) tone(N(bar[0] - 24), t, spb * 3.5, { ...o, type: 'triangle', gain: 0.5 });       // bass
    if (s % 2 === 0) tone(N(bar[(s / 2) % 4] + 12), t, spb * 0.9, { ...o, type: 'square', gain: 0.07 }); // arp
    const L = song.lead[s];
    if (L && Math.floor(step / 32) % 2) tone(N(L), t, spb * 1.8, { ...o, type: 'square', gain: 0.08 });
    const d = song.drums[s];
    if (d === 'x') tone(150, t, 0.18, { ...o, type: 'sine', gain: 0.8, slide: 0.3 });
    if (d === 'o') noise(t, 0.12, { ...o, gain: 0.35, hp: 1200 });
    if (d === 'h') noise(t, 0.04, { ...o, gain: 0.12, hp: 7000 });
    nextTime += spb; step++;
  }
}
