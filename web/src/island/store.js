// Your island's state in the browser: every action shows at once (same rules as the server),
// then goes to the server in small batches; the server's answer is the truth.
import { api } from '../net.js';
import { act, normalize, newIsland } from './rules.js';
import { hashStr } from './gen.js';

export const isle = { seed: 0, state: null, minds: 0, offline: false, loaded: false, skew: 0, error: '' };
const subs = new Set();
let queue = [], inflight = null, timer = 0;
export const now = () => Date.now() + isle.skew;
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
const emit = info => subs.forEach(fn => fn(info));

export async function loadIsland({ online, guestSeed, minds = 0 }) {
  if (!online) {
    isle.offline = true; isle.seed = hashStr(guestSeed || 'guest'); isle.minds = minds;
    isle.state ||= newIsland(isle.seed, Date.now());
    isle.loaded = true; emit({}); return isle;
  }
  const r = await api('island', { acts: [] });
  take(r); isle.loaded = true; isle.at = Date.now(); emit({});
  return isle;
}
function take(r) {
  isle.offline = false; isle.seed = r.island.seed; isle.minds = r.island.minds; isle.skew = r.now - Date.now();
  isle.state = r.island.state;
  for (const a of queue) act(isle.state, a, ctx());   // actions made while the batch was on its way
}
const ctx = () => ({ seed: isle.seed, now: now(), minds: isle.minds });

// do something: returns the local result ({ gain, done } or { error })
export function doAct(a) {
  if (!isle.state) return { error: 'island not loaded' };
  normalize(isle.state, isle.seed, now());
  const res = act(isle.state, a, ctx());
  if (res.error || !res.done) return res;
  if (!isle.offline) {
    const last = queue[queue.length - 1];
    if (last && last.type === a.type && last.crop === a.crop && ['clear', 'till', 'plant', 'harvest', 'untill'].includes(a.type)) last.tiles = [...last.tiles, ...a.tiles];
    else queue.push({ ...a, tiles: a.tiles ? [...a.tiles] : undefined });
    clearTimeout(timer); timer = setTimeout(flush, 600);
  }
  emit({ act: a, res });
  return res;
}
export async function flush() {
  if (inflight || !queue.length || isle.offline) return inflight;
  const batch = queue; queue = [];
  inflight = api('island', { acts: batch })
    .then(r => { take(r); isle.at = Date.now(); isle.error = ''; emit({ synced: true, points: r.points }); })
    .catch(e => { isle.error = e.message; queue = batch.concat(queue); emit({ failed: e.message }); setTimeout(flush, 4000); })
    .finally(() => { inflight = null; if (queue.length) { clearTimeout(timer); timer = setTimeout(flush, 300); } });
  return inflight;
}
// re-read the island from the server (gifts, raids on you, payments… change it from outside)
export async function refreshIsland() {
  if (isle.offline || !isle.loaded || queue.length || inflight) return;
  try { const r = await api('island', { acts: [] }); if (!queue.length && !inflight) { take(r); isle.at = Date.now(); emit({ synced: true }); } } catch { /* next time */ }
}
export function resetIsland() { isle.state = null; isle.loaded = false; queue = []; }
