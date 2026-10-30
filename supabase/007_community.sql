-- MINDS CLASH round 8: friend chat, mail, reports, AI player keys, Daily Siege Cup, Mind Town.
-- Run once in Supabase → SQL Editor. Safe to run again. Nothing old is lost.

-- friends can type anything now; old preset lines keep working
alter table messages alter column phrase drop not null;
alter table messages add column if not exists text text;
create index if not exists messages_at on messages (created_at);

create table if not exists mail (                     -- announcements (to_id null = everyone) and personal mail
  id         bigserial primary key,
  to_id      uuid references players(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  gift       jsonb,                                   -- { dust, gems, items: { potion: 2 } }
  created_at timestamptz not null default now()
);
create index if not exists mail_to on mail (to_id, created_at desc);

create table if not exists mail_claims (              -- one row = this gift was taken, so it can only be taken once
  mail_id    bigint not null references mail(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  at         timestamptz not null default now(),
  primary key (mail_id, player_id)
);

create table if not exists reports (                  -- bug and player reports, read in the admin screen
  id         bigserial primary key,
  player_id  uuid references players(id) on delete set null,
  kind       text not null default 'bug',             -- bug, player
  target     uuid references players(id) on delete set null,
  text       text not null,
  place      text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reports_open on reports (done, created_at desc);

create table if not exists agent_keys (               -- private keys for AI players; only the hash is stored
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  name       text not null default 'My AI',
  hash       text not null unique,
  gems       boolean not null default false,          -- may this AI spend Gems? off unless the player turns it on
  log        jsonb not null default '[]',
  revoked    boolean not null default false,
  created_at timestamptz not null default now(),
  last_used  timestamptz
);
create index if not exists agent_keys_player on agent_keys (player_id);

create table if not exists cups (                     -- Daily Siege Cup: everyone attacks the same village
  day        text primary key,                        -- UTC date
  seed       bigint not null,
  entry      int not null,
  settled    boolean not null default false,
  winners    jsonb,
  created_at timestamptz not null default now()
);
create table if not exists cup_entries (
  day        text not null references cups(day) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  name       text not null,
  tries      int not null default 0,
  best       int not null default 0,
  stars      int not null default 0,
  pct        int not null default 0,
  primary key (day, player_id)
);

create table if not exists town_now (                 -- who is in Mind Town right now
  player_id  uuid primary key references players(id) on delete cascade,
  name       text not null,
  mind       int not null,
  x          int not null,
  y          int not null,
  since      timestamptz not null default now(),
  at         timestamptz not null default now()
);
create index if not exists town_now_at on town_now (at desc);

create table if not exists town_chat (                -- town chat + the Town Board news
  id         bigserial primary key,
  player_id  uuid references players(id) on delete set null,
  name       text not null default '',
  text       text not null,
  kind       text not null default 'chat',            -- chat, news
  created_at timestamptz not null default now()
);
create index if not exists town_chat_at on town_chat (created_at desc);

-- same as every other table: no public access, only the game server (secret key) can read/write
alter table mail        enable row level security;
alter table mail_claims enable row level security;
alter table reports     enable row level security;
alter table agent_keys  enable row level security;
alter table cups        enable row level security;
alter table cup_entries enable row level security;
alter table town_now    enable row level security;
alter table town_chat   enable row level security;
