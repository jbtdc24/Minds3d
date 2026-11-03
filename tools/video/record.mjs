// Records real MINDS CLASH gameplay (offline practice) from Edge over the DevTools protocol: one folder of
// timestamped JPEG frames per scene. Every tap is a real mouse click. Usage: node record.mjs <browser.exe> <outDir> <scene>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [chrome, out, scene] = process.argv.slice(2);
const W = 1280, H = 720, PORT = 9333 + Math.floor(Math.random() * 500);
const wait = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', `--remote-debugging-port=${PORT}`, `--window-size=${W + 24},${H + 126}`, '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${join(out, '_profile_' + scene)}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0;
const pending = new Map(), handlers = [];
const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const n = ++id; pending.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); setTimeout(() => { if (pending.delete(n)) { console.log('  slow', method); ok(null); } }, 10000); });
for (let i = 0; i < 50; i++) { try { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await wait(200); } }
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else handlers.forEach(h => h(m)); });
let targetId = null;
for (let i = 0; i < 40 && !targetId; i++) { targetId = (await send('Target.getTargets')).targetInfos.find(t => t.type === 'page')?.targetId; if (!targetId) await wait(250); }
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (m, p) => send(m, p, S);
await page('Page.enable'); await page('Runtime.enable'); await page('Page.bringToFront'); await page('Emulation.setFocusEmulationEnabled', { enabled: true });
const js = async (expr) => { const r = await page('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }).catch(e => { console.log('  js', e.message); return null; }); if (!r) return null; if (r.exceptionDetails) console.log('JS error', r.exceptionDetails.text, r.exceptionDetails.exception?.description); return r.result?.value; };
const click = async (x, y) => { await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); for (const type of ['mousePressed', 'mouseReleased']) await page('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const drag = async (x0, y0, x1, y1, steps = 20) => { await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 }); for (let i = 1; i <= steps; i++) { await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, button: 'left', buttons: 1 }); await wait(30); } await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 }); };
// tap a visible element: a CSS selector, or /text/ for a button whose text matches
const tap = async (what, label = what, patience = 20000) => {
  const q = what.startsWith('/') ? `[...document.querySelectorAll('button, [role=button], .mode')].find(b => b.offsetParent && ${what}.test(b.textContent.trim()))` : `[...document.querySelectorAll(${JSON.stringify(what)})].find(b => b.offsetParent)`;
  let r = null;
  for (const until = Date.now() + patience; !r && Date.now() < until; await wait(250)) r = await js(`const el = ${q}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
  if (!r) { console.log('  (not found)', label); return false; }
  await click(r.x, r.y); return true;
};

const dir = join(out, scene); mkdirSync(dir, { recursive: true });
const frames = []; let rec = false;
handlers.push(m => {
  if (m.method !== 'Page.screencastFrame') return;
  page('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  if (!rec) return;
  const f = `f${String(frames.length).padStart(5, '0')}.jpg`;
  writeFileSync(join(dir, f), Buffer.from(m.params.data, 'base64'));
  frames.push({ f, t: m.params.metadata.timestamp });
});
// steady stills: a picture as often as the browser can give one (key moments are picked and animated later)
let loop = null;
const start = async () => {
  rec = true;
  loop = (async () => { while (rec) { const t = Date.now() / 1000; const r = await page('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); if (r && rec) { const f = `f${String(frames.length).padStart(5, '0')}.jpg`; writeFileSync(join(dir, f), Buffer.from(r.data, 'base64')); frames.push({ f, t }); } else await wait(100); } })();
};
const stop = async () => { rec = false; await loop; };
const go = async (url) => { await page('Page.navigate', { url }); await wait(4000); };
const BASE = 'http://localhost:5190/?debug';
const toLobby = async () => { await tap('/TAP TO PLAY/', 'play', 70000); await wait(1200); await tap('/Practice offline/'); await wait(3000); await tap('/^Skip$/', 'skip', 4000); await wait(800); };
const toIsland = async () => { await toLobby(); await tap('#hub-island'); await wait(4500); await tap('/Skip tour/', 'tour', 5000); await wait(1000); };

// frame-exact capture: the page's clock is paused and moved on 1/30 s per picture (virtual time)
const shoot = async (seconds, at = {}) => {
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) {
    if (at[i]) await at[i]();
    const done = new Promise(r => { const h = m => { if (m.method === 'Emulation.virtualTimeBudgetExpired') { handlers.splice(handlers.indexOf(h), 1); r(); } }; handlers.push(h); });
    await page('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / 30 });
    await Promise.race([done, wait(3000)]);
    const r = await page('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    if (r) { const f = `f${String(frames.length).padStart(5, '0')}.jpg`; writeFileSync(join(dir, f), Buffer.from(r.data, 'base64')); frames.push({ f, t: i / 30 }); }
  }
  await page('Emulation.setVirtualTimePolicy', { policy: 'advance' }).catch(() => {});
};
if (scene === 'vt') {
  await page('Page.navigate', { url: BASE });
  for (let i = 0; i < 120 && !(await js(`return /Ready/.test(document.querySelector('#boot-msg')?.textContent)`)); i++) await wait(250);
  await page('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  await shoot(4);
}
if (scene === 'probe') {
  await page('Page.navigate', { url: BASE });
  for (let i = 0; i < 60; i++) { const m = await js(`return document.querySelector('#boot-msg')?.textContent + ' | ' + performance.getEntriesByType('resource').filter(r => r.duration > 1500).map(r => r.name.split('/').slice(-2).join('/') + ' ' + Math.round(r.duration)).join(', ')`); console.log(i, m); if (/Ready/.test(m)) break; await wait(1000); }
}
if (scene === 'title') { await go(BASE); for (let i = 0; i < 120 && !(await js(`return !![...document.querySelectorAll('button')].find(b => b.offsetParent && /TAP TO PLAY/.test(b.textContent))`)); i++) await wait(250); await wait(1500); await start(); await wait(9000); await stop(); }

if (scene === 'duel') {
  await go(BASE); await toLobby();
  await tap('#hub-practice'); await wait(1500);
  await start();
  await tap('#prep-go'); await wait(4000);
  for (let t = 0; t < 16; t++) {
    const st = await js(`const cards = [...document.querySelectorAll('#d-hand [data-card]')].filter(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return r.width > 10 && r.height > 10 && cs.visibility !== 'hidden' && +cs.opacity > 0.5 && !b.disabled; }).map(b => +b.dataset.card);
      const prize = +((document.body.innerText.match(/PRIZE\\s*(\\d+)/) || [])[1] || 8); return { cards, prize };`);
    if (!st || !st.cards.length) { await wait(1500); continue; }
    const s = [...st.cards].sort((a, b) => a - b), pick = s[Math.min(s.length - 1, Math.max(0, Math.round(((st.prize - 1) / 14) * (s.length - 1))))];
    await tap(`#d-hand [data-card="${pick}"]`); await wait(600);
    if (st.prize >= 11) { await tap('/^Double/', 'double', 800); await wait(400); }
    else if (t === 3) { await tap('/^Trap/', 'trap', 800); await wait(400); }
    await tap('#d-lock', 'lock', 2000); console.log('turn', t, 'card', pick, 'prize', st.prize);
    await wait(5600);
    if (frames.length && frames.at(-1).t - frames[0].t > 75) break;
  }
  await wait(1500); await stop();
}

if (scene === 'island') {
  await go(BASE); await toIsland();
  await start(); await wait(1500);
  // hand tool: tap wild tiles near the home so the Minds walk over and clear them
  for (const [x, y] of [[520, 300], [560, 330], [760, 300], [800, 360], [470, 420], [830, 440], [600, 250], [700, 470]]) { await click(x, y); await wait(350); }
  await wait(4000);
  await drag(900, 420, 560, 330, 50); await wait(3500);
  await drag(500, 330, 760, 440, 50); await wait(3500);
  await stop();
}

if (scene === 'raid') {
  await go(BASE); await toIsland();
  await tap('/^\\W*Raid$/'); await wait(2500);
  await tap('/Attack!/'); await wait(7000);
  await start(); await wait(1500);
  const drops = [[230, 260], [240, 430], [1040, 230], [1050, 460], [640, 640], [260, 340], [1020, 350]];
  for (const [x, y] of drops) { await click(x, y); await wait(300); await click(x + 16, y + 12); await wait(300); }
  await tap('/Archer/'); await wait(300);
  for (const [x, y] of drops.slice(0, 5)) { await click(x - 12, y + 22); await wait(280); }
  await tap('/Captain/'); await wait(300); await click(640, 640);
  await wait(16000);
  await stop();
}

if (scene === 'adventure') {
  await go(BASE); await toIsland();
  await tap('/^\\W*Adventure$/'); await wait(3500);
  await start(); await wait(2500);
  await tap('/Fly!/'); await wait(9000);
  // walk around: tap the ground ahead of the hero
  for (const [x, y] of [[800, 360], [900, 300], [700, 250], [560, 420], [900, 480]]) { await click(x, y); await wait(1800); }
  await stop();
}

writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames));
console.log(scene, frames.length, 'frames', frames.length ? (frames.at(-1).t - frames[0].t).toFixed(1) + ' s' : '');
ws.close(); proc.kill();
process.exit(0);
