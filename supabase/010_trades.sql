-- MINDS CLASH round 12: trades in Mind Town and gifts to friends.
-- Run once in Supabase → SQL Editor. Safe to run again. Nothing old is lost.
create table if not exists trades (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'trade',            -- trade (both agree, Mind Town) | gift (one way, to a friend)
  a          uuid not null references players(id) on delete cascade,   -- who started it
  b          uuid not null references players(id) on delete cascade,
  give_a     jsonb not null default '{}',              -- what a gives b: { dust, gems, wood, potion, seed_bean, ... }
  give_b     jsonb not null default '{}',
  ok_a       boolean not null default false,           -- agreed to this exact version of both offers
  ok_b       boolean not null default false,
  ver        int not null default 0,                   -- goes up on every change to an offer; agreeing names the version
  status     text not null default 'open',             -- open | locked (both agreed, moving the goods) | done | cancelled
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_a on trades (a, status);
create index if not exists trades_b on trades (b, status);
alter table trades enable row level security;           -- only the server (secret key) reads and writes it
