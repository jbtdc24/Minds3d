-- Mindclash database. Paste this whole file into Supabase -> SQL Editor -> Run (once).
-- Every table has Row Level Security ON with NO public policies: browsers can't read or write
-- anything directly. Only the game server (Vercel, using the secret key) can.

create extension if not exists pgcrypto;

create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  address      text unique,                       -- checksummed wallet; null for guests
  is_guest     boolean not null default false,
  name         text not null,
  name_key     text unique not null,              -- lower-case name, for uniqueness
  pfp          int,                               -- token id of an owned Mind
  rating       int not null default 1000,
  points       int not null default 0,            -- leaderboard points (wins x rarity bonus)
  wins         int not null default 0,
  losses       int not null default 0,
  draws        int not null default 0,
  bot_wins     int not null default 0,
  bot_losses   int not null default 0,
  streak       int not null default 0,
  best_streak  int not null default 0,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists players_rating on players (rating desc) where not is_guest;
create index if not exists players_points on players (points desc) where not is_guest;

create table if not exists nonces (
  address    text primary key,
  nonce      text not null,
  created_at timestamptz not null default now()
);

create table if not exists queue (
  player_id  uuid primary key references players(id) on delete cascade,
  rating     int not null,
  is_guest   boolean not null default false,
  minds      int[] not null,
  loadout    text[] not null,
  joined_at  timestamptz not null default now(),
  match_id   uuid
);

create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  p0          uuid not null references players(id),
  p1          uuid references players(id),        -- null = bot
  bot_level   text,
  ranked      boolean not null default true,
  state       jsonb not null,                     -- full engine state (secret picks live here, never sent raw)
  bot         jsonb,                              -- bot memory
  status      text not null default 'live',       -- live | done | abandoned
  winner      int,                                -- 0 / 1 / null (draw)
  version     int not null default 0,             -- optimistic locking
  deadline    timestamptz,
  idle0       int not null default 0,
  idle1       int not null default 0,
  delta0      int,
  delta1      int,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index if not exists matches_p0 on matches (p0, created_at desc);
create index if not exists matches_p1 on matches (p1, created_at desc);
create index if not exists matches_live on matches (status) where status = 'live';

create table if not exists ratelimit (
  key        text primary key,
  hits       int not null default 0,
  window_at  timestamptz not null default now()
);

alter table players   enable row level security;
alter table nonces    enable row level security;
alter table queue     enable row level security;
alter table matches   enable row level security;
alter table ratelimit enable row level security;

-- Pair two waiting players atomically (no double-matching). Returns the opponent's queue row or nothing.
create or replace function claim_opponent(me uuid, my_rating int, my_guest boolean, max_gap int)
returns setof queue language plpgsql security definer as $$
declare opp queue;
begin
  select * into opp from queue
   where player_id <> me and match_id is null and is_guest = my_guest
     and abs(rating - my_rating) <= max_gap
   order by abs(rating - my_rating), joined_at
   limit 1 for update skip locked;
  if not found then return; end if;
  delete from queue where player_id = opp.player_id;
  return next opp;
end $$;

-- Simple fixed-window rate limit: returns true if the call is allowed.
create or replace function hit_rate(k text, max_hits int, window_s int)
returns boolean language plpgsql security definer as $$
declare r ratelimit;
begin
  insert into ratelimit as t (key, hits, window_at) values (k, 1, now())
  on conflict (key) do update set
    hits = case when t.window_at < now() - make_interval(secs => window_s) then 1 else t.hits + 1 end,
    window_at = case when t.window_at < now() - make_interval(secs => window_s) then now() else t.window_at end
  returning * into r;
  return r.hits <= max_hits;
end $$;

revoke all on function claim_opponent(uuid, int, boolean, int) from public, anon, authenticated;
revoke all on function hit_rate(text, int, int) from public, anon, authenticated;
