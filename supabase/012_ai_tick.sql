-- 🌙 Away play timer that really runs: Supabase calls the game every 2 minutes (pg_cron + pg_net).
-- GitHub Actions schedules are best-effort and ran only a few times a day, so AIs stopped when the player's PC was off.
-- Safe to run twice.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'mindsclash-ai-tick';
select cron.schedule(
  'mindsclash-ai-tick',
  '*/2 * * * *',
  $$ select net.http_get(url := 'https://minds3d.vercel.app/api/cron/ai-tick', timeout_milliseconds := 60000) $$
);

-- check it: select * from cron.job_run_details order by start_time desc limit 5;
