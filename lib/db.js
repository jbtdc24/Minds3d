// Server-only Supabase access (PostgREST over fetch) with the secret key from Vercel env vars.
const URL_ = process.env.SUPABASE_URL || 'https://yohvqlblzejgfzujxotm.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  if (!KEY) throw new Error('SUPABASE_SECRET_KEY is not set');
  return { apikey: KEY, 'content-type': 'application/json', ...extra };
}
async function req(method, path, body, prefer) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: headers(prefer ? { prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`db ${method} ${path.split('?')[0]}: ${res.status} ${text.slice(0, 200)}`), { status: res.status, body: text });
  return text ? JSON.parse(text) : null;
}
export const db = {
  select: (table, query = '') => req('GET', `${table}?${query}`),
  one: async (table, query) => (await req('GET', `${table}?${query}&limit=1`))[0] || null,
  insert: (table, row) => req('POST', table, row, 'return=representation').then(r => r[0]),
  upsert: (table, row, onConflict) => req('POST', `${table}?on_conflict=${onConflict}`, row, 'return=representation,resolution=merge-duplicates').then(r => r[0]),
  update: (table, query, patch) => req('PATCH', `${table}?${query}`, patch, 'return=representation'),
  remove: (table, query) => req('DELETE', `${table}?${query}`),
  rpc: (fn, args) => req('POST', `rpc/${fn}`, args),
};

// Push a "something changed" ping to everyone watching a topic (match id, leaderboard).
// It carries no secrets: clients re-fetch their own view from the API.
export async function broadcast(topic, event = 'update', payload = {}) {
  try {
    await fetch(`${URL_}/realtime/v1/api/broadcast`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    });
  } catch { /* realtime is best-effort; clients also poll */ }
}
