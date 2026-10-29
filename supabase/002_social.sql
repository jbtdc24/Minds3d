-- Mindclash social update: profile showcase, friends, friend chat (preset lines), in-match quick chat.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table players add column if not exists showcase int[] not null default '{}';   -- up to 3 Minds shown in the lobby
alter table players add column if not exists last_seen timestamptz;
alter table matches add column if not exists chat jsonb not null default '[]';      -- last quick-chat lines [{seat, phrase, at}]

create table if not exists friends (
  a          uuid not null references players(id) on delete cascade,   -- who asked
  b          uuid not null references players(id) on delete cascade,   -- who was asked
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b)
);
create index if not exists friends_b on friends(b);

create table if not exists messages (
  id         bigserial primary key,
  from_id    uuid not null references players(id) on delete cascade,
  to_id      uuid not null references players(id) on delete cascade,
  phrase     smallint not null,                                        -- index into the preset lines
  created_at timestamptz not null default now()
);
create index if not exists messages_to on messages(to_id, created_at desc);
create index if not exists messages_from on messages(from_id, created_at desc);

-- same as every other table: no public access, only the game server (secret key) can read/write
alter table friends  enable row level security;
alter table messages enable row level security;
