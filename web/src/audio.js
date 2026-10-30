// All sound is synthesized with WebAudio: chiptune music loops + punchy SFX. No files to load.
// Browsers only allow sound after the player's first tap/key press, so the song asked for before that is
// remembered and starts the moment audio is unlocked.
let ctx = null, master, musicBus, sfxBus, echoBus, noiseBuf, analyser, wanted = null;
const vol = { music: 0.5, sfx: 0.8 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  setTimeout(() => { if (wanted) music(wanted); }, 0);
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  analyser = ctx.createAnalyser(); analyser.fftSize = 2048; master.connect(analyser);
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
// how loud the output is right now (0-1), for checking the mix: { rms, peak, state }
export function level() {
  if (!analyser) return { rms: 0, peak: 0, state: 'off' };
  const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b);
  let sum = 0, peak = 0; for (const v of b) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
  return { rms: Math.sqrt(sum / b.length), peak, state: ctx.state, song: !!song, music: musicBus.gain.value, sfx: sfxBus.gain.value, master: master.gain.value, step, next: nextTime, now: ctx.currentTime, vol: { ...vol } };
}
export function setVolume(music, sfx) {
  vol.music = music; vol.sfx = sfx;
  if (!ctx) return;
  musicBus.gain.value = music * 0.65;
  sfxBus.gain.value = sfx * 0.6;
}

function tone(freq, t0, dur, { type = 'square', gain = 0.3, slide = 0, bus = sfxBus, attack = 0.005, echo = 0, vib = 0, dry = false } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  if (echo && !dry) { const e = ctx.createGain(); e.gain.value = echo * vol.sfx * 0.6; g.connect(e); e.connect(echoBus); }
  if (echo && dry) { const e = ctx.createGain(), d = ctx.createDelay(1); e.gain.value = echo * 0.35; d.delayTime.value = 0.24; g.connect(d); d.connect(e); e.connect(bus); }   // song echo stays inside the song's fader
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
// Minds talk in cute gibberish: 2-5 little syllables, each a quick blip. Every Mind has its own pitch.
// mood: 'chat' | 'work' | 'happy' | 'sad'. id keeps one Mind's voice the same every time. Returns the words to show.
const SYL = ['mi', 'mo', 'bu', 'pa', 'nya', 'bi', 'doo', 'ta', 'wa', 'ni', 'pu', 'ko'];
// about one line in four is a real word or two, so players catch what their Minds are saying
const REAL = {
  chat: ['gm!', 'hello!', 'nice day', 'so sleepy', 'where is my Dust?', "let's duel!", 'I love this town', 'hehe', 'wow!', 'hungry...', 'who stole my hat?', 'gg!', 'crown is mine'],
  work: ['almost done!', 'heave ho!', 'so much work', 'I need a break', 'this one is heavy', 'nearly there', 'for the island!'],
  happy: ['yay!', 'nice!', 'okay!', 'on it!', 'love you!', 'hehe yes!'],
  sad: ['oh no...', 'hmm?', 'sorry...', 'I am confused'],
};
export function babble(id = 1, mood = 'chat', loud = 1) {
  const base = 330 + ((id * 37) % 260), real = Math.random() < 0.25 ? REAL[mood][Math.random() * REAL[mood].length | 0] : null;
  const n = real ? Math.min(6, 2 + real.split(' ').length) : 2 + (Math.random() * 4 | 0), words = [];
  for (let i = 0; i < n; i++) {
    words.push(SYL[Math.random() * SYL.length | 0]);
    if (!ctx) continue;
    const t = ctx.currentTime + i * 0.105, f = base * (1 + Math.random() * 0.35) * (mood === 'sad' ? 0.8 : mood === 'happy' ? 1.25 : 1);
    const end = mood === 'sad' ? 0.7 : i === n - 1 ? 1.5 : 0.88 + Math.random() * 0.3;
    tone(f, t, 0.1, { type: 'triangle', gain: 0.3 * loud, slide: end, attack: 0.012 });
    tone(f * 2.02, t, 0.08, { type: 'sine', gain: 0.1 * loud, slide: end, attack: 0.012 });
  }
  return real || words.join(mood === 'work' ? '-' : ' ');
}
// a tiny cute battle squeak: scream (attack), ow (hit), bye (fell)
export function squeak(kind = 'scream', id = 1) {
  if (!ctx) return;
  const t = ctx.currentTime, f = (520 + (id * 53) % 420) * (1 + Math.random() * 0.2);
  if (kind === 'scream') { tone(f, t, 0.14, { type: 'triangle', gain: 0.24, slide: 1.7, attack: 0.01 }); tone(f * 1.5, t + 0.07, 0.1, { type: 'sine', gain: 0.12, slide: 1.3 }); }
  else if (kind === 'ow') tone(f * 1.2, t, 0.12, { type: 'triangle', gain: 0.24, slide: 0.55, attack: 0.008 });
  else { tone(f, t, 0.3, { type: 'triangle', gain: 0.24, slide: 0.3, attack: 0.01 }); tone(f * 0.5, t + 0.1, 0.22, { type: 'sine', gain: 0.12, slide: 0.5 }); }
}

// ---------- music: a small chiptune sequencer (chords, bass, arp, lead, drums) ----------
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  // the plaza: bouncy, sing-along hook (C - G - Am - F)
  menu: { bpm: 118, bass: 'x..x..x.x..x..x.', drums: 'x..hx.o.x.hhx.oh',
    chords: [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
    lead: [[72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 74, 76, 0, 0, 0, 0], [71, 0, 74, 79, 0, 74, 72, 0, 71, 0, 72, 74, 0, 0, 67, 0],
      [72, 0, 76, 81, 0, 79, 76, 0, 74, 0, 76, 72, 0, 0, 0, 0], [69, 0, 72, 77, 0, 76, 74, 0, 72, 74, 76, 79, 0, 0, 0, 0]] },
  // duels: a soft, catchy music-box tune; calm enough to think over your cards (C - Am - F - G)
  duel: { lofi: true, soft: true, bpm: 100, bass: 'x.....x.x.......', drums: 'x...h...o...h...',
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
    lead: [[76, 0, 79, 0, 84, 0, 83, 79, 0, 0, 76, 0, 79, 0, 0, 0], [72, 0, 76, 0, 81, 0, 79, 76, 0, 0, 72, 0, 74, 0, 0, 0],
      [69, 0, 72, 0, 77, 0, 76, 72, 0, 0, 69, 0, 72, 0, 0, 0], [71, 0, 74, 0, 79, 0, 77, 74, 0, 72, 0, 71, 67, 0, 0, 0]] },
  // island: slow, warm and sleepy (Cmaj7 - Am7 - Dm7 - G7)
  cozy: { lofi: true, bpm: 68, bass: 'x.......x.......', drums: 'x.......o.....h.',
    chords: [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]],
    lead: [[0, 0, 0, 0, 79, 0, 0, 0, 76, 0, 0, 72, 0, 0, 0, 0], [0, 0, 0, 0, 76, 0, 0, 0, 72, 0, 0, 69, 0, 0, 0, 0],
      [0, 0, 0, 0, 77, 0, 0, 0, 74, 0, 0, 69, 0, 0, 0, 0], [0, 0, 0, 0, 74, 0, 0, 71, 0, 0, 67, 0, 0, 0, 0, 0]] },
  // adventures: quiet, a bit mysterious (Em9 - Cmaj7 - Am7 - B7)
  wild: { lofi: true, bpm: 74, bass: 'x.....x.........', drums: 'x...h.....o...h.',
    chords: [[52, 55, 59, 66], [48, 52, 55, 59], [45, 48, 52, 55], [47, 51, 54, 57]],
    lead: [[0, 0, 83, 0, 0, 79, 0, 0, 78, 0, 0, 76, 0, 0, 0, 0], [0, 0, 79, 0, 0, 76, 0, 0, 72, 0, 0, 71, 0, 0, 0, 0],
      [0, 0, 76, 0, 0, 72, 0, 0, 69, 0, 0, 72, 0, 0, 0, 0], [0, 0, 78, 0, 0, 75, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0]] },
  // Mind Town: a light market-day stroll (F - G - Em - Am)
  town: { lofi: true, soft: true, bpm: 92, bass: 'x...x...x...x...', drums: 'x..h..h.o..h..h.',
    chords: [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]],
    lead: [[81, 0, 77, 0, 72, 0, 77, 0, 79, 0, 0, 0, 76, 0, 0, 0], [79, 0, 74, 0, 71, 0, 74, 0, 77, 0, 0, 0, 74, 0, 0, 0],
      [76, 0, 72, 0, 67, 0, 72, 0, 74, 0, 0, 0, 71, 0, 0, 0], [72, 0, 76, 0, 79, 0, 84, 0, 81, 0, 0, 0, 0, 0, 0, 0]] },
  // duels: driving and tense (Am - F - C - G)
  battle: { bpm: 150, bass: 'x.xx.x.xx.xx.x.x', drums: 'x.h.o.hxx.h.o.ho',
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [60, 64, 67, 72], [55, 59, 62, 67]],
    lead: [[81, 0, 79, 81, 0, 84, 0, 81, 79, 0, 76, 0, 79, 81, 0, 0], [77, 0, 76, 77, 0, 81, 0, 77, 76, 0, 72, 0, 74, 76, 0, 0],
      [79, 0, 76, 79, 0, 84, 0, 79, 83, 0, 84, 0, 86, 88, 0, 0], [86, 0, 83, 79, 0, 83, 0, 86, 91, 0, 88, 86, 83, 79, 0, 0]] },
  // lo-fi: island / lobby (Fmaj7 - Em7 - Dm7 - Cmaj7)
  lofi: { lofi: true, bpm: 76, bass: 'x......x..x.....', drums: 'x...o..hx.h.o..h',
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
    lead: [[0, 0, 76, 0, 0, 0, 74, 0, 72, 0, 0, 0, 69, 0, 0, 0], [0, 0, 74, 0, 0, 72, 0, 71, 0, 0, 67, 0, 0, 0, 0, 0],
      [0, 0, 72, 0, 0, 0, 69, 0, 65, 0, 0, 67, 0, 0, 0, 0], [0, 0, 71, 0, 72, 0, 0, 0, 67, 0, 0, 0, 0, 0, 64, 0]] },
  // lo-fi: world map / adventures (Am7 - D9 - Gmaj7 - Cmaj7)
  lofi2: { lofi: true, bpm: 82, bass: 'x.....x...x.....', drums: 'x..ho..hx..ho.h.',
    chords: [[57, 60, 64, 67], [50, 54, 57, 64], [55, 59, 62, 66], [48, 52, 55, 59]],
    lead: [[0, 0, 79, 0, 76, 0, 0, 72, 0, 0, 74, 0, 0, 0, 0, 0], [0, 0, 78, 0, 0, 74, 0, 0, 72, 0, 0, 69, 0, 0, 0, 0],
      [0, 0, 74, 0, 78, 0, 0, 79, 0, 0, 81, 0, 0, 0, 0, 0], [0, 0, 76, 0, 0, 0, 72, 0, 71, 0, 0, 67, 0, 0, 0, 0]] },
  // lo-fi beat with more drive: raids (Dm9 - Gm7 - Bbmaj7 - A7)
  lofibeat: { lofi: true, punch: 0.62, bpm: 90, bass: 'x..x..x.x..x....', drums: 'x.h.o.hxx.hxo.hh',
    chords: [[50, 53, 57, 64], [55, 58, 62, 65], [58, 62, 65, 69], [57, 61, 64, 67]],
    lead: [[0, 0, 74, 0, 77, 0, 0, 76, 0, 74, 0, 0, 72, 0, 0, 0], [0, 0, 70, 0, 74, 0, 0, 72, 0, 70, 0, 0, 67, 0, 0, 0],
      [0, 0, 77, 0, 81, 0, 0, 79, 0, 77, 0, 0, 74, 0, 0, 0], [0, 0, 76, 0, 73, 0, 0, 76, 0, 79, 0, 0, 81, 0, 0, 0]] },
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
let song = null, step = 0, nextTime = 0, timer = null, songBus = null;
export function music(name) {
  wanted = name;
  if (!ctx) return;
  if (song === SONGS[name]) return;
  if (name && !SONGS[name]) console.error('[audio] no such song:', name);
  song = SONGS[name] || null;
  // fade the old song out completely: its long chords and echo must never ring on under the next one
  if (songBus) { const old = songBus, t = ctx.currentTime; old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t); old.gain.linearRampToValueAtTime(0, t + 0.25); setTimeout(() => old.disconnect(), 400); }
  songBus = ctx.createGain(); songBus.connect(musicBus);
  step = 0; nextTime = ctx.currentTime + 0.3;
  if (!timer) timer = setInterval(schedule, 25);
}
// lo-fi: mellow electric-piano chords (soft attack, a sine octave below), round sine bass, soft kick + snare,
// swung quiet hats, an echoing sparse melody and a little vinyl crackle
function lofiStep(song, ch, bar, s, t, swing, spb, o) {
  if (s === 0 || s === 10) ch.forEach((n, i) => { tone(N(n), t + i * 0.012, spb * (s ? 5 : 9), { ...o, type: 'triangle', gain: 0.14, attack: 0.03, echo: 0.2 }); tone(N(n) / 2, t, spb * 8, { ...o, type: 'sine', gain: 0.07, attack: 0.05 }); });
  if (song.bass[s] === 'x') tone(N(ch[0] - 12), t, spb * 3, { ...o, type: 'triangle', gain: 0.32, attack: 0.02 });
  const L = song.lead[bar][s], cycle = Math.floor(step / 64) % 4;
  if (L && song.soft) { tone(N(L), t + swing, spb * 3.2, { ...o, type: 'sine', gain: 0.2, attack: 0.008, echo: 0.5 }); tone(N(L) * 3, t + swing, spb * 1.1, { ...o, type: 'sine', gain: 0.025, attack: 0.004 }); }   // music box: a soft ping
  else if (L && cycle !== 0) tone(N(L), t + swing, spb * 2.6, { ...o, type: 'triangle', gain: 0.2, attack: 0.02, echo: 0.55, vib: 0.004 });
  if (L && cycle === 2 && s % 4 === 0) tone(N(L) * 2, t + swing, spb * 1.4, { ...o, type: 'sine', gain: 0.08, echo: 0.6 });
  const d = song.drums[s];
  if (d === 'x') tone(110, t, 0.22, { ...o, type: 'sine', gain: song.punch || 0.45, slide: 0.4 });
  if (d === 'o') { noise(t, 0.16, { ...o, gain: 0.2, hp: 900, lp: 3200 }); tone(180, t, 0.07, { ...o, type: 'triangle', gain: 0.18, slide: 0.7 }); }
  if (d === 'h') noise(t + swing, 0.03, { ...o, gain: 0.06, hp: 6500 });
  if (Math.random() < 0.18) noise(t + Math.random() * spb, 0.006, { ...o, gain: 0.03, hp: 2500 });   // vinyl crackle
}
function schedule() {
  if (!song || !ctx) return;
  const spb = 60 / song.bpm / 4;                 // 16th notes
  while (nextTime < ctx.currentTime + 0.12) {
    const bar = Math.floor(step / 16) % song.chords.length, ch = song.chords[bar], s = step % 16, t = nextTime, o = { bus: songBus, dry: true };
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
