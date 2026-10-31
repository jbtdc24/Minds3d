// The daily payment check, started by Vercel Cron. Without CRON_SECRET it refuses to run.
import { timingSafeEqual } from 'node:crypto';
import { route, fail } from '../http.js';
import { runReconcile } from '../reconcile.js';

export default route(async ({ req }) => {
  const want = process.env.CRON_SECRET, got = req.headers.authorization || '';
  if (!want) fail(503, 'daily check is not set up');
  const a = Buffer.from(`Bearer ${want}`), b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(401, 'not allowed');
  return runReconcile();
}, { methods: ['GET'], auth: false, limit: [5, 60] });
