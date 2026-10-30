// All sound is synthesized with WebAudio: chiptune music loops + punchy SFX. No files to load.
// Browsers only allow sound after the player's first tap/key press, so the song asked for before that is
// remembered and starts the moment audio is unlocked.
let ctx = null, master, musicBus, sfxBus, echoBus, noiseBuf, wanted = null;
const vol = { music: 0.5, sfx: 0.8 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  setTimeout(() => { if (wanted) music(wanted); }, 0);
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.connect(comp);
  // echo: delay → low-pass → feedback, mixed back in quietly
  echoBus = ctx.createGain(); echoBus.gain.value = 0.3;
  const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
  dl.delayTime.value = 0.21; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 2600;
  echoBus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
  setVolume(vol.music, vol.sfx);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(music, sfx) {
  vol.music = music; vol.sfx = sfx;
  if (!ctx) return;
  musicBus.gain.value = music * 0.35;
  sfxBus.gain.value = sfx * 0.6;
}

function tone(freq, t0, dur, { type = 'square', gain = 0.3, slide = 0, bus = sfxBus, attack = 0.005, echo = 0, vib = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  if (echo) { const e = ctx.createGain(); e.gain.value = echo * (bus === musicBus ? vol.music * 0.35 : vol.sfx * 0.8); g.connect(e); e.connect(echoBus); }
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

function sweep(t0, dur, f0, f1, gain = 0.3, q = 2) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t0); s.stop(t0 + dur + 0.05);
}
const SFX = {
  click: t => tone(880, t, 0.05, { gain: 0.12 }),
  hover: t => tone(1320, t, 0.03, { gain: 0.05, type: 'triangle' }),
  select: t => { tone(660, t, 0.06, { gain: 0.15 }); tone(990, t + 0.05, 0.08, { gain: 0.15 }); },
  deselect: t => { tone(660, t, 0.06, { gain: 0.12 }); tone(440, t + 0.05, 0.08, { gain: 0.12 }); },
  denied: t => tone(140, t, 0.15, { gain: 0.2, type: 'sawtooth' }),
  whoosh: t => { sweep(t, 0.9, 300, 2400, 0.35, 1.2); sweep(t + 0.15, 1.1, 1800, 400, 0.2, 2); tone(220, t, 0.9, { type: 'sine', gain: 0.08, slide: 2, echo: 0.3 }); },   // wind rushing past
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
  land: t => { tone(90, t, 0.2, { type: 'sine', gain: 0.6, slide: 0.5 }); noise(t, 0.12, { gain: 0.2, hp: 400, lp: 2000 }); [523, 659, 784].forEach((f, i) => tone(f, t + 0.08 + i * 0.06, 0.16, { type: 'triangle', gain: 0.08, echo: 0.3 })); },
  round: t => { tone(523, t, 0.12, { gain: 0.15 }); tone(784, t + 0.12, 0.2, { gain: 0.15 }); },
  fight: t => { tone(392, t, 0.1, { gain: 0.2 }); tone(523, t + 0.1, 0.1, { gain: 0.2 }); tone(784, t + 0.2, 0.35, { gain: 0.22 }); },
  victory: t => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, i === 5 ? 0.6 : 0.14, { gain: 0.2 })),
  defeat: t => [392, 349, 311, 262].forEach((f, i) => tone(f, t + i * 0.22, 0.3, { gain: 0.18, type: 'triangle' })),
  levelup: t => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.07, i === 4 ? 0.5 : 0.18, { type: 'triangle', gain: 0.18, echo: 0.35 })),
  flip: t => { noise(t, 0.06, { gain: 0.3, hp: 2500, lp: 9000 }); tone(1200, t, 0.05, { type: 'triangle', gain: 0.08, slide: 1.5 }); },
  coin: t => { tone(988, t, 0.07, { type: 'square', gain: 0.1 }); tone(1319, t + 0.06, 0.28, { type: 'square', gain: 0.1, echo: 0.25 }); },
  pop: t => { tone(600, t, 0.08, { type: 'sine', gain: 0.25, slide: 2.2 }); },
  notify: t => { tone(784, t, 0.1, { type: 'triangle', gain: 0.18 }); tone(1047, t + 0.1, 0.18, { type: 'triangle', gain: 0.18 }); },
  tick: t => tone(1800, t, 0.03, { type: 'square', gain: 0.06 }),
  magic: t => { [523, 784, 1047, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.04, 0.3, { type: 'sine', gain: 0.1, echo: 0.4 })); sweep(t, 0.5, 4000, 900, 0.08, 3); },
  trap: t => { tone(200, t, 0.25, { type: 'sawtooth', gain: 0.3, slide: 0.5 }); noise(t, 0.15, { gain: 0.5, hp: 600 }); tone(90, t + 0.05, 0.3, { type: 'sine', gain: 0.6, slide: 0.5 }); },
  reverse: t => { tone(300, t, 0.4, { type: 'sawtooth', gain: 0.12, slide: 3 }); tone(900, t + 0.2, 0.4, { type: 'sawtooth', gain: 0.1, slide: 0.33 }); },
  // raids + adventure
  twang: t => { tone(900, t, 0.08, { type: 'triangle', gain: 0.12, slide: 0.6 }); noise(t, 0.05, { gain: 0.12, hp: 4000 }); },
  arrowHit: t => { noise(t, 0.05, { gain: 0.18, hp: 2500 }); tone(300, t, 0.05, { type: 'square', gain: 0.06, slide: 0.5 }); },
  smash: t => { tone(110, t, 0.12, { type: 'square', gain: 0.25, slide: 0.5 }); noise(t, 0.1, { gain: 0.3, hp: 700, lp: 4000 }); },
  boom: t => { tone(70, t, 0.6, { type: 'sine', gain: 0.9, slide: 0.35 }); noise(t, 0.5, { gain: 0.6, hp: 150, lp: 2500 }); noise(t + 0.05, 0.3, { gain: 0.3, hp: 2000 }); },
  crumble: t => { noise(t, 0.4, { gain: 0.4, hp: 300, lp: 3000 }); tone(90, t, 0.3, { type: 'sine', gain: 0.4, slide: 0.6 }); },
  horn: t => { for (const [f, d, at] of [[196, 0.28, 0], [262, 0.28, 0.22], [392, 0.75, 0.44]]) { tone(f, t + at, d, { type: 'triangle', gain: 0.2, attack: 0.04, vib: 0.012, echo: 0.35 }); tone(f * 2, t + at, d, { type: 'square', gain: 0.04, attack: 0.05 }); } },   // a heroic little fanfare
  coins: t => [1319, 1568, 1976, 2349].forEach((f, i) => tone(f, t + i * 0.05, 0.12, { type: 'square', gain: 0.07 })),
  drop: t => { tone(300, t, 0.12, { type: 'sine', gain: 0.3, slide: 0.4 }); noise(t + 0.08, 0.1, { gain: 0.2, hp: 500, lp: 2000 }); },
  roar: t => { tone(110, t, 0.5, { type: 'sawtooth', gain: 0.25, slide: 0.7 }); noise(t, 0.4, { gain: 0.25, hp: 200, lp: 1500 }); },
  step: t => noise(t, 0.03, { gain: 0.025, hp: 900, lp: 3000 }),
  rumble: t => { noise(t, 1.4, { gain: 0.07, hp: 40, lp: 260 }); },
  chest: t => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.06, 0.2, { type: 'triangle', gain: 0.14 })); noise(t, 0.1, { gain: 0.1, hp: 3000 }); },
  slime: t => { tone(200, t, 0.15, { type: 'sine', gain: 0.3, slide: 2 }); tone(300, t + 0.08, 0.12, { type: 'sine', gain: 0.2, slide: 0.5 }); },
  star: t => { tone(1568, t, 0.15, { type: 'triangle', gain: 0.18 }); tone(2093, t + 0.08, 0.3, { type: 'triangle', gain: 0.15 }); },
};
export function sfx(name, delay = 0) {
  if (!ctx || !SFX[name]) return;
  SFX[name](ctx.currentTime + delay);
}

// ---------- music: a small chiptune sequencer (chords, bass, arp, lead, drums) ----------
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  // the plaza: bouncy, sing-along hook (C - G - Am - F)
  menu: { bpm: 118, bass: 'x..x..x.x..x..x.', drums: 'x..hx.o.x.hhx.oh',
    chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
    lead: [[72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 74, 76, 0, 0, 0, 0], [71, 0, 74, 79, 0, 74, 72, 0, 71, 0, 72, 74, 0, 0, 67, 0],
      [72, 0, 76, 81, 0, 79, 76, 0, 74, 0, 76, 72, 0, 0, 0, 0], [69, 0, 72, 77, 0, 76, 74, 0, 72, 74, 76, 79, 0, 0, 0, 0]] },
  // duels: driving and tense (Am - F - C - G)
  battle: { bpm: 150, bass: 'x.xx.x.xx.xx.x.x', drums: 'x.h.o.hxx.h.o.ho',
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [60, 64, 67, 72], [55, 59, 62, 67]],
    lead: [[81, 0, 79, 81, 0, 84, 0, 81, 79, 0, 76, 0, 79, 81, 0, 0], [77, 0, 76, 77, 0, 81, 0, 77, 76, 0, 72, 0, 74, 76, 0, 0],
      [79, 0, 76, 79, 0, 84, 0, 79, 83, 0, 84, 0, 86, 88, 0, 0], [86, 0, 83, 79, 0, 83, 0, 86, 91, 0, 88, 86, 83, 79, 0, 0]] },
  title: { bpm: 96, bass: 'x.......x...x...', drums: 'x.......o.......',
    chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
    lead: [[79, 0, 0, 76, 0, 0, 72, 0, 74, 0, 76, 0, 0, 0, 0, 0], [74, 0, 0, 71, 0, 0, 67, 0, 69, 0, 71, 0, 0, 0, 0, 0],
      [76, 0, 0, 72, 0, 0, 69, 0, 71, 0, 72, 0, 0, 0, 0, 0], [72, 0, 0, 69, 0, 0, 65, 0, 67, 0, 69, 0, 71, 0, 0, 0]] },
  // raids: war drums and a bold call (Dm - Bb - C - A)
  raid: { bpm: 138, bass: 'x..xx..xx.xx.x.x', drums: 'x.oxx.o.x.oxxooh',
    chords: [[62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [57, 61, 64, 69]],
    lead: [[74, 0, 74, 77, 0, 74, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0], [70, 0, 70, 74, 0, 70, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0],
      [72, 0, 72, 76, 0, 72, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0], [73, 0, 76, 81, 0, 79, 76, 0, 73, 0, 76, 79, 81, 0, 85, 0]] },
  // adventure / world map: an airy, curious melody (G - Em - C - D)
  adventure: { bpm: 108, bass: 'x...x.x.x...x.x.', drums: 'x..h..h.o..hx.h.',
    chords: [[55, 59, 62, 67], [52, 55, 59, 64], [48, 52, 55, 60], [50, 54, 57, 62]],
    lead: [[79, 0, 83, 86, 0, 83, 0, 79, 81, 0, 83, 0, 0, 0, 0, 0], [76, 0, 79, 83, 0, 79, 0, 76, 78, 0, 79, 0, 0, 0, 74, 0],
      [72, 0, 76, 79, 0, 84, 0, 83, 81, 0, 79, 0, 76, 0, 0, 0], [74, 0, 78, 81, 0, 86, 0, 84, 83, 0, 81, 0, 78, 79, 81, 0]] },
};
let song = null, step = 0, nextTime = 0, timer = null;
export function music(name) {
  wanted = name;
  if (!ctx) return;
  if (song === SONGS[name]) return;
  song = SONGS[name] || null;
  step = 0; nextTime = ctx.currentTime + 0.1;
  if (!timer) timer = setInterval(schedule, 25);
}
// lo-fi: mellow electric-piano chords (soft attack, a sine octave below), round sine bass, soft kick + snare,
// swung quiet hats, an echoing sparse melody and a little vinyl crackle
function lofiStep(song, ch, bar, s, t, swing, spb, o) {
  if (s === 0 || s === 10) ch.forEach((n, i) => { tone(N(n), t + i * 0.012, spb * (s ? 5 : 9), { ...o, type: 'triangle', gain: 0.03, attack: 0.03, echo: 0.2 }); tone(N(n) / 2, t, spb * 8, { ...o, type: 'sine', gain: 0.018, attack: 0.05 }); });
  if (song.bass[s] === 'x') tone(N(ch[0] - 24), t, spb * 3, { ...o, type: 'sine', gain: 0.42, attack: 0.02 });
  const L = song.lead[bar][s], cycle = Math.floor(step / 64) % 4;
  if (L && cycle % 2 === 1) tone(N(L), t + swing, spb * 2.6, { ...o, type: 'sine', gain: 0.05, attack: 0.02, echo: 0.55, vib: 0.004 });
  if (L && cycle === 2 && s % 4 === 0) tone(N(L) * 2, t + swing, spb * 1.4, { ...o, type: 'triangle', gain: 0.018, echo: 0.6 });
  const d = song.drums[s];
  if (d === 'x') tone(110, t, 0.22, { ...o, type: 'sine', gain: song.punch || 0.45, slide: 0.4 });
  if (d === 'o') { noise(t, 0.16, { ...o, gain: 0.1, hp: 900, lp: 3200 }); tone(180, t, 0.07, { ...o, type: 'triangle', gain: 0.08, slide: 0.7 }); }
  if (d === 'h') noise(t + swing, 0.03, { ...o, gain: 0.028, hp: 6500 });
  if (Math.random() < 0.18) noise(t + Math.random() * spb, 0.006, { ...o, gain: 0.03, hp: 2500 });   // vinyl crackle
}
function schedule() {
  if (!song || !ctx) return;
  const spb = 60 / song.bpm / 4;                 // 16th notes
  while (nextTime < ctx.currentTime + 0.12) {
    const bar = Math.floor(step / 16) % song.chords.length, ch = song.chords[bar], s = step % 16, t = nextTime, o = { bus: musicBus };
    const swing = s % 2 ? spb * (song.lofi ? 0.22 : 0.08) : 0;
    if (song.lofi) { lofiStep(song, ch, bar, s, t, swing, spb, o); nextTime += spb; step++; continue; }
    if (s === 0) ch.forEach(n => tone(N(n), t, spb * 15, { ...o, type: 'triangle', gain: 0.035, attack: 0.08 }));     // soft pad
    if (song.bass[s] === 'x') tone(N(ch[0] - 24), t, spb * 1.8, { ...o, type: 'triangle', gain: 0.5 });
    if (s % 2 === 0) tone(N(ch[(s / 2) % 4] + 12), t + swing, spb * 0.9, { ...o, type: 'square', gain: 0.05 });
    const L = song.lead[bar][s], cycle = Math.floor(step / 64) % 4;
    if (L && cycle !== 0) { tone(N(L - (cycle === 3 ? 12 : 0)), t + swing, spb * 1.8, { ...o, type: 'square', gain: 0.06, echo: 0.45, vib: 0.006 }); tone(N(L) / 2, t + swing, spb * 1.6, { ...o, type: 'triangle', gain: 0.04 }); }
    const d = song.drums[s];
    if (d === 'x') tone(150, t, 0.18, { ...o, type: 'sine', gain: 0.8, slide: 0.3 });
    if (d === 'o') { noise(t, 0.13, { ...o, gain: 0.3, hp: 1400 }); tone(190, t, 0.08, { ...o, type: 'triangle', gain: 0.25, slide: 0.6 }); }
    if (d === 'h') noise(t + swing, 0.04, { ...o, gain: 0.1, hp: 7000 });
    nextTime += spb; step++;
  }
}
