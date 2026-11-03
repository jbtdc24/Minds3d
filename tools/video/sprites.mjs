// Exports the game's own code-drawn pixel sprites (buildings, defences, troops) as big PNG icons for the website.
// Usage: node tools/video/sprites.mjs <msedge.exe> <outDir>   (game served at http://localhost:5190)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [browser, out] = process.argv.slice(2);
const PORT = 9800 + Math.floor(Math.random() * 100), wait = ms => new Promise(r => setTimeout(r, ms));
const prof = join(out, '_profile'); rmSync(prof, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const proc = spawn(browser, ['--headless=new', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
for (let i = 0; i < 60 && !ws; i++) { try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); } catch { await wait(250); } }
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise(ok => { const n = ++id; pending.set(n, ok); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'http://localhost:5190/site/blank.html' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await wait(2500);
const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const B = await import('/src/island/buildings.js'), T = await import('/src/island/troops.js');
  const big = (c, k = 6) => { const o = document.createElement('canvas'); o.width = c.width * k; o.height = c.height * k; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };
  const list = { tower: B.tower(), cannon: B.cannon(), mortar: B.mortar(), spire: B.spire(), trap: B.trap(), keep: B.bossKeepSprite(), barn: B.barn(), cottage: B.cottage(), camp: B.camp(),
    tower10: B.leveled(B.tower(), 10, 'tower'), cannon8: B.leveled(B.cannon(), 8, 'cannon'),
    brawler: T.troopSprite('brawler'), archer: T.troopSprite('archer'), bomber: T.troopSprite('bomber'), giant: T.troopSprite('giant') };
  const out = {}; for (const [k, c] of Object.entries(list)) { try { out[k] = big(c.cv || c.canvas || c); } catch (e) { out[k] = 'ERR ' + e.message; } } return out;
})()` }, S);
const v = r?.result?.value || {};
for (const [k, d] of Object.entries(v)) { if (d.startsWith('data:')) writeFileSync(join(out, k + '.png'), Buffer.from(d.split(',')[1], 'base64')); console.log(k, d.startsWith('data:') ? 'ok' : d); }
if (r?.exceptionDetails) console.log(r.exceptionDetails.exception?.description);
ws.close(); proc.kill(); process.exit(0);
