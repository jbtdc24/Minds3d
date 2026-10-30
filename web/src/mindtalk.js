// Tap a Mind and talk to it. One account controls every Mind it owns: pick any Mind, give it a job with a button or
// type what you want. Minds answer in gibberish with a small translation. Jobs run on the server (island/jobs.js).
import { JOBS, jobSlots, parseTask } from './island/jobs.js';
import { CROPS } from './island/rules.js';
import { isle, doAct, flush } from './island/store.js';
import { chibi } from './island/chibi.js';
import { babble, sfx } from './audio.js';

const $ = s => document.querySelector(s), KEY = 'mindclash.talk';
let K = null, cur = 0, talk = {};
try { talk = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(talk)); } catch { /* private mode */ } };
const name = id => id ? `Mind #${id}` : 'Captain';
const jobOf = id => isle.state?.jobs?.[id];
const pic = id => { try { return chibi(id || 49).full.cv.toDataURL(); } catch { return ''; } };

export function initMindTalk(ctx) { K = ctx; }
const ids = () => { const m = K.minds(); return m.length ? m : [0]; };
export function openMinds(id) {
  cur = id ?? ids()[0];
  paint(); $('#mindp').classList.add('on');
  if (!talk[cur]?.length) reply('hello');
}
function paintList() {
  const used = Object.keys(isle.state?.jobs || {}).length;
  $('#mp-slots').textContent = `${used}/${jobSlots(isle.minds)} working`;
  $('#mp-list').innerHTML = ids().map(id => `<button class="${id === cur ? 'on' : ''}" data-id="${id}"><img src="${pic(id)}" alt=""><span>${id ? '#' + id : 'Captain'}</span><i>${JOBS[jobOf(id)?.job]?.icon || ''}</i></button>`).join('');
}
function paintJobs() {
  const j = jobOf(cur);
  $('#mp-title').textContent = name(cur);
  $('#mp-job').innerHTML = Object.entries(JOBS).map(([k, d]) => `<button class="${(j?.job || 'rest') === k ? 'on' : ''}" data-job="${k}" title="${d.desc}"><i>${d.icon}</i><span>${d.name}</span></button>`).join('');
  $('#mp-desc').textContent = JOBS[j?.job || 'rest'].desc + (j ? ' One round every 30 minutes, up to 8 hours while you are away.' : '');
}
function paintChat() {
  const box = $('#mp-chat'), list = talk[cur] || [];
  box.innerHTML = list.map(l => `<div class="msg ${l.me ? 'mine' : ''}">${K.esc(l.t)}${l.en ? `<small>${K.esc(l.en)}</small>` : ''}</div>`).join('');
  box.scrollTop = 1e9;
}
function paint() { paintList(); paintJobs(); paintChat(); }
function line(l) { (talk[cur] ||= []).push(l); talk[cur] = talk[cur].slice(-20); keep(); paintChat(); }
function statusText() {
  const j = jobOf(cur), log = (isle.state?.jobLog || []).find(e => e.id === cur);
  if (!j) return "I'm resting. Give me a job!";
  return `I'm your ${JOBS[j.job].name}.${log ? ` Last time I ${log.text}.` : ' Just started.'}`;
}
function reply(kind, extra = '') {
  const en = kind === 'hello' ? `Hi! ${statusText()}` : kind === 'status' ? statusText() : kind === 'job' ? extra
    : kind === 'no' ? extra : 'I only know jobs for now: farm, chop, well, train, scout or rest.';
  line({ t: babble(cur || 7, kind === 'no' || kind === 'confused' ? 'sad' : 'happy'), en });
}
function setJob(job, crop) {
  const r = doAct({ type: 'job', mind: cur, job, ...(crop ? { crop } : {}) });
  if (r.error) { sfx('denied'); return reply('no', r.error); }
  flush(); paintList(); paintJobs();
  reply('job', job === 'rest' ? 'Okay, resting!' : `On it! ${JOBS[job].name}${crop ? ` for ${CROPS[crop].name}` : ''} from now on.`);
}
function send() {
  const box = $('#mp-in'), text = box.value.trim();
  if (!text) return;
  box.value = ''; line({ t: text, me: 1 });
  const p = parseTask(text);
  setTimeout(() => (p.job ? setJob(p.job, p.crop) : reply(p.talk)), 350);
}
document.addEventListener('click', e => {
  if (!e.target.closest('#mindp')) return;
  if (e.target.closest('#mp-close')) return $('#mindp').classList.remove('on');
  if (e.target.closest('#mp-send')) return send();
  const b = e.target.closest('[data-id]');
  if (b) { cur = +b.dataset.id; paint(); return sfx('select'); }
  const j = e.target.closest('[data-job]');
  if (j) setJob(j.dataset.job);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mp-in') send(); });
