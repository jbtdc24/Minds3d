// Signing and checking live chat lines in the browser (server side: lib/chatcert.js). A line is bound to one room, one
// moment and one random number, so it cannot be forged, moved to another room or replayed.
const MAX_AGE = 30e3, MAX_PER_SEC = 40;
const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
const line = (topic, ts, n, body) => enc.encode(`${topic}\n${ts}\n${n}\n${JSON.stringify(body)}`);

export function chatSigner(api, now = () => Date.now()) {
  let pair = null, cert = null, serverKey = null, gotAt = 0;
  const seen = new Map(), known = new Map();
  let windowAt = 0, windowN = 0;
  async function ready() {
    if (serverKey && (!cert || now() - gotAt < 40 * 60e3)) return !!cert;
    pair ||= await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const r = await api('chat/cert', { pub: { x: pub.x, y: pub.y } });
    serverKey = await crypto.subtle.importKey('jwk', r.ck, ALG, false, ['verify']);
    cert = r.cert || null; gotAt = now();
    return !!cert;
  }
  async function seal(topic, body) {
    if (!(await ready().catch(() => false))) return null;   // no certificate, no live line: the server's copy still arrives
    const ts = now(), n = b64(crypto.getRandomValues(new Uint8Array(9)));
    return { cert, ts, n, body, sig: b64(await crypto.subtle.sign(SIG, pair.privateKey, line(topic, ts, n, body))) };
  }
  // returns { pid, name, guest, body } for a genuine, fresh, first-seen line; otherwise null.
  // presence: a position, which is sent again and again, so seeing it twice is fine; trial accounts may walk but not speak
  async function open(topic, m, presence = false) {
    try {
      if (!presence) {
        if (now() - windowAt > 1000) { windowAt = now(); windowN = 0; }
        if (++windowN > MAX_PER_SEC) return null;     // a flood is dropped, the server's copy still arrives
      }
      if (!serverKey) await ready();
      if (!m?.cert?.body || !m.cert.sig || !m.sig || typeof m.n !== 'string' || Math.abs(now() - m.ts) > MAX_AGE) return null;
      const id = `${topic}|${m.n}`;
      if (!presence && seen.has(id)) return null;
      let who = known.get(m.cert.sig);
      if (!who) {
        if (!(await crypto.subtle.verify(SIG, serverKey, unb64(m.cert.sig), enc.encode(m.cert.body)))) return null;
        who = JSON.parse(m.cert.body);
        who.key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: who.x, y: who.y }, ALG, false, ['verify']);
        known.set(m.cert.sig, who);
      }
      if (who.exp < now() || (who.guest && !presence)) return null;
      if (!(await crypto.subtle.verify(SIG, who.key, unb64(m.sig), line(topic, m.ts, m.n, m.body)))) return null;
      if (presence) return { pid: who.pid, name: who.name, guest: !!who.guest, body: m.body };
      seen.set(id, now());
      for (const [k, at] of seen) if (now() - at > MAX_AGE * 2) seen.delete(k); else break;
      return { pid: who.pid, name: who.name, body: m.body };
    } catch { return null; }
  }
  return { ready, seal, open };
}
