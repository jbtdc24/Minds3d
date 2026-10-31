// Errors from players' browsers, for the Admin screen. Anyone can send one, so it is short, scrubbed and rate limited.
import { route } from '../http.js';
import { report } from '../monitor.js';

export default route(async ({ body }) => {
  await report({ feature: `browser:${String(body.place || '').slice(0, 30)}`, severity: 'warning', code: 'client', message: String(body.message || '').slice(0, 300), stack: String(body.stack || '').slice(0, 600) });
  return { ok: true };
}, { auth: false, limit: [10, 60] });
