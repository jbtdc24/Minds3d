// Error monitoring: failures are stored for the Admin screen, grouped by kind. Critical ones also go to the owner's
// webhook if ALERT_WEBHOOK_URL is set. Everything is scrubbed first, and reporting can never break the game.
import { createHash } from 'node:crypto';
import { db } from './db.js';

const QUIET_MS = 60_000, ALERT_GAP_MS = 30 * 60_000, MAX_TEXT = 400;
const recent = new Map(), alerted = new Map();

// nothing private may be stored: tokens, keys, wallets, ids, emails, signatures
export function scrub(text) {
  return String(text ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [hidden]')
    .replace(/\b(mk|sb)_[A-Za-z0-9_-]+/g, '[key]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)*/g, '[token]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[token]')
    .replace(/0x[a-fA-F0-9]{130}/g, '[signature]')
    .replace(/0x[a-fA-F0-9]{64}/g, '[tx]')
    .replace(/0x[a-fA-F0-9]{40}/g, '[wallet]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b(key|secret|password|token|apikey)=\S+/gi, '$1=[hidden]')
    .replace(/[A-Za-z0-9+/_-]{48,}/g, '[long value]')
    .slice(0, MAX_TEXT);
}
const finger = (feature, code, message) => createHash('sha256').update(`${feature}|${code}|${message.replace(/\d+/g, '#')}`).digest('hex').slice(0, 24);

export async function alert(text) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || !/^https:\/\//.test(url)) return false;
  try {
    const ctl = AbortSignal.timeout(2500), body = scrub(text);
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: body, text: body }), signal: ctl });
    return true;
  } catch { return false; }
}
// severity: critical | error | warning
export async function report({ feature = 'server', severity = 'error', code = '', message = '', stack = '' }) {
  try {
    const msg = scrub(message), f = finger(feature, code, msg), now = Date.now();
    if (severity === 'critical' && now - (alerted.get(f) || 0) > ALERT_GAP_MS) { alerted.set(f, now); await alert(`MINDS CLASH ${severity}: ${feature} ${code} ${msg}`); }
    if (now - (recent.get(f) || 0) < QUIET_MS) return;    // a flood of one error costs one write a minute
    recent.set(f, now);
    if (recent.size > 500) recent.clear();
    const iso = new Date(now).toISOString(), open = await db.one('errors', `fingerprint=eq.${f}&resolved=eq.false`);
    if (open) await db.update('errors', `id=eq.${open.id}`, { count: (open.count || 1) + 1, last_at: iso, message: msg });
    else await db.insert('errors', { fingerprint: f, feature: scrub(feature).slice(0, 60), severity, code: scrub(code).slice(0, 60), message: msg, stack: scrub(String(stack).split('\n').slice(0, 5).join(' | ')), count: 1, last_at: iso, resolved: false });
  } catch { /* the error log itself must never cause an error */ }
}
