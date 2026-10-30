-- Mindclash admin tools: bans / suspensions, cheat flags, admin action log. Only the game server reads/writes these.
-- Run once in Supabase → SQL Editor. Safe to run again. Nothing old changes.

alter table players add column if not exists banned_until timestamptz;   -- null = fine; far future = banned; a date = suspended until
alter table players add column if not exists ban_reason text;

create table if not exists flags (                    -- the cheat meter: suspicious things the server noticed
  id         bigserial primary key,
  player_id  uuid references players(id) on delete cascade,
  kind       text not null,                           -- adv_reject, adv_fast, raid_mismatch, rate_limit, ...
  detail     jsonb,
  at         timestamptz not null default now()
);
create index if not exists flags_player on flags (player_id, at desc);
create index if not exists flags_at on flags (at desc);

create table if not exists admin_log (                -- every admin action, for the record
  id         bigserial primary key,
  admin_id   uuid,
  action     text not null,
  target     uuid,
  detail     jsonb,
  at         timestamptz not null default now()
);

alter table flags enable row level security;          -- no public access
alter table admin_log enable row level security;
