-- Mindclash Mind Island: one island per player (farm tiles, Dust, items). Only the game server reads/writes it.
-- Run once in Supabase → SQL Editor. Safe to run again. Adds a new table only; nothing old changes.

create table if not exists islands (
  player_id  uuid primary key references players(id) on delete cascade,
  seed       bigint not null,                 -- island shape (same seed = same island)
  state      jsonb not null,                  -- { dust, inv, tiles }
  minds      int not null default 0,          -- Minds owned, re-checked on-chain every 10 min (more plots, faster crops)
  minds_at   timestamptz,
  pts_day    date,                            -- leaderboard points from selling crops: max 20 a day
  pts_n      int not null default 0,
  pts_carry  int not null default 0,          -- Dust sold toward the next point
  rev        int not null default 0,          -- bumps on every save (two tabs can't overwrite each other)
  updated_at timestamptz not null default now()
);
alter table islands enable row level security;   -- no public access
