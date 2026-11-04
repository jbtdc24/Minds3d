// Films real MINDS CLASH gameplay frame by frame (smooth 30 fps whatever the capture speed): the game runs offline
// in headless Edge with tools/video/vclock.js controlling its clock; each frame = taps due now, +1/30 s, one picture.
// Usage: node tools/video/film.mjs <msedge.exe> <outDir> <duel|island|raid|adventure|title> [seconds]
// Needs the game served at http://localhost:5190 (node tools/video/serve.mjs web 5190).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [browser, out, scene, secs] = process.argv.slice(2);
const W = 1280, H = 720, FPS = 30, PORT = 9400 + Math.floor(Math.random() * 400), BASE = 'http://localhost:5190/play.html?debug';
const wait = ms => new Promise(r => setTimeout(r, ms));
const profile = join(out, '_profile_' + scene + '_' + Date.now());
const proc = spawn(browser, ['--headless=new', '--no-first-run', '--hide-scrollbars', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise(ok => { const n = ++id; pending.set(n, ok); ws.send(JSON.stringify({ id: n, method, params, sessionId })); setTimeout(() => { if (pending.delete(n)) { console.log('  slow', method); ok(null); } }, 20000); });
for (let i = 0; i < 60 && !ws; i++) { try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); } catch { await wait(250); } }
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const ok = pending.get(m.id); pending.delete(m.id); ok(m.result ?? null); } });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (m, p) => send(m, p, S);
await page('Page.enable'); await page('Runtime.enable');
await page('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await page('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'vclock.js'), 'utf8') });
const js = async expr => (await page('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;
const mouse = (type, x, y, extra = {}) => page('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };
const find = what => js(`const el = ${what.startsWith('/') ? `[...document.querySelectorAll('button, .mode')].find(b => b.offsetParent && ${what}.test(b.textContent.trim()))` : `[...document.querySelectorAll(${JSON.stringify(what)})].find(b => { const r = b.getBoundingClientRect(); return r.width > 8 && getComputedStyle(b).visibility !== 'hidden'; })`}; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
const tap = async (what, patience = 20000) => { for (const until = Date.now() + patience; Date.now() < until; await wait(300)) { const r = await find(what); if (r) { await click(r.x, r.y); return true; } } console.log('  (not found)', what); return false; };

// ---------- getting to the scene (real time) ----------
await page('Page.navigate', { url: BASE });
for (let i = 0; i < 240 && !(await js(`return /Ready/.test(document.querySelector('#boot-msg')?.textContent || '')`)); i++) await wait(250);
await wait(800); await tap('/TAP TO PLAY/', 20000); await wait(1500);
const where = async () => js(`return [...document.querySelectorAll('section, .screen, [id^=s-]')].filter(e => e.offsetParent && e.id).map(e => e.id).join(',')`);
const lobby = async () => { await tap('/Practice offline/'); await wait(3000); await tap('/^Skip$/', 5000); await wait(800); console.log('  at', await where()); };
// promo boost (offline only, never saved anywhere): a Town Hall 8 home and a full army, so raids meet Town Hall 8 villages
const boost = () => js(`const S = await import('/src/island/store.js'); const st = S.isle.state; if (!st) return 'no state';
  for (const b of st.b || []) if (b.type === 'home' || b.type === 'well') b.lv = 8;
  Object.assign(st.inv, { troop_brawler: 24, troop_archer: 18, troop_bomber: 8, troop_giant: 6, potion: 6, fuel: 6 }); st.dust = 48000; st.gems = 120; st.ship = 3;
  return (st.b || []).map(b => b.type + ':' + (b.lv || 1)).join(',');`);
const island = async () => { await lobby(); await tap('#hub-island'); await wait(5000); await tap('/Skip tour/', 6000); await wait(1200); console.log('  boost', await boost()); await wait(1500); };

// ---------- filming (virtual time) ----------
const dir = join(out, scene); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
async function film(seconds, director) {
  await js('__vc.freeze()');
  const n = Math.round(seconds * FPS);
  for (let f = 0; f < n; f++) {
    await director(f);
    await js(`__vc.step(${1000 / FPS})`);
    const shot = await page('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    if (shot) writeFileSync(join(dir, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    if (f % 60 === 0) console.log(scene, f, '/', n);
  }
}
const at = (f, list) => list.filter(([k]) => k === f).map(([, fn]) => fn);
const run = async (f, list) => { for (const fn of at(f, list)) await fn(); };

if (scene === 'title') {
  await page('Page.navigate', { url: BASE }); await wait(6000);
  await film(+secs || 6, async () => {});
}
if (scene === 'duel') {
  await lobby(); await tap('#hub-practice'); await wait(1500); await tap('#prep-go'); await wait(3000);
  let plan = null;
  await film(+secs || 26, async f => {
    if (plan && f >= plan.at) { const { step } = plan; plan = step.next ? { step: step.next, at: f + step.next.wait } : null; await step.go(); return; }
    if (plan || f % 6) return;
    const st = await js(`const cards = [...document.querySelectorAll('#d-hand [data-card]')].filter(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return r.width > 10 && cs.visibility !== 'hidden' && +cs.opacity > .5 && !b.disabled; }).map(b => +b.dataset.card);
      const lock = document.querySelector('#d-lock'); return { cards, ready: !!lock && /Pick a card/.test(lock.textContent), prize: +((document.body.innerText.match(/PRIZE\\s*(\\d+)/) || [])[1] || 8) };`);
    if (!st?.ready || !st.cards.length) return;
    const s = [...st.cards].sort((a, b) => a - b), pick = s[Math.min(s.length - 1, Math.max(0, Math.round(((st.prize - 1) / 14) * (s.length - 1))))];
    const spell = st.prize >= 11 ? '/^Double/' : st.prize <= 3 && s.length > 3 ? '/^Reverse/' : null;
    const lock = { wait: 14, go: () => tap('#d-lock', 1500) };
    const pickIt = { go: () => tap(`#d-hand [data-card="${pick}"]`, 1500), next: spell ? { wait: 12, go: () => tap(spell, 1500), next: lock } : lock };
    plan = { step: pickIt, at: f + 20 };
  });
}
if (scene === 'island') {
  await island();
  const taps = [[520, 300], [560, 330], [760, 300], [800, 360], [470, 420], [830, 440], [600, 250], [700, 470]];
  await film(+secs || 14, async f => {
    if (f >= 6 && f < 6 + taps.length * 4 && (f - 6) % 4 === 0) { const [x, y] = taps[(f - 6) / 4]; await click(x, y); }
    // a slow camera drag across the island
    if (f === 150) await mouse('mousePressed', 900, 420);
    if (f > 150 && f < 300) await mouse('mouseMoved', 900 - (f - 150) * 2.2, 420 - (f - 150) * 0.6, { buttons: 1 });
    if (f === 300) await mouse('mouseReleased', 570, 330);
  });
}
if (scene === 'raid') {
  await island(); await tap('/^\\W*Raid$/'); await wait(2500); await tap('/Attack!/'); await wait(6000);
  const drops = [[230, 260], [240, 430], [1040, 230], [1050, 460], [640, 640], [260, 340], [1020, 350]];
  const plan = []; drops.forEach(([x, y], i) => { plan.push([10 + i * 5, () => click(x, y)], [12 + i * 5, () => click(x + 16, y + 12)]); });
  plan.push([50, () => tap('/Archer/', 1500)]); drops.slice(0, 5).forEach(([x, y], i) => plan.push([54 + i * 4, () => click(x - 12, y + 22)]));
  plan.push([80, () => tap('/Captain/', 1500)], [84, () => click(640, 640)], [200, () => tap('/^\\W*Rage/', 1500)], [204, () => click(640, 380)]);
  await film(+secs || 22, f => run(f, plan));
}
if (scene === 'worldmap') {   // the sky world map: drifting clouds, the airship, islands picked one after another
  await island(); await tap('/^\\W*Adventure$/'); await wait(4000);
  const spots = [[260, 300], [420, 210], [600, 330], [840, 250], [1000, 380], [700, 480]];
  await film(+secs || 12, f => run(f, spots.map(([x, y], i) => [20 + i * 55, () => click(x, y)])));
}
if (scene === 'adventure') {
  await island(); await tap('/^\\W*Adventure$/'); await wait(3500);
  await tap('/Fly!/', 4000); await wait(9000);   // the flight and the island load in real time; filming starts on the island
  const plan = [];
  [[800, 360], [900, 300], [700, 250], [560, 420], [900, 480], [640, 300], [760, 420], [520, 300]].forEach(([x, y], i) => plan.push([10 + i * 50, () => click(x, y)]));
  await film(+secs || 16, f => run(f, plan));
}

const mp4 = join(out, scene + '.mp4');
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', mp4], { stdio: 'inherit' });
console.log('done', mp4);
ws.close(); proc.kill(); process.exit(0);
