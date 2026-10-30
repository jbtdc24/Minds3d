-- Mindclash Gem purchases (crypto on Robinhood Chain). One row per paid transaction: the primary key on the tx hash
-- makes it impossible to credit the same payment twice. Only the game server reads/writes it.
-- Run once in Supabase → SQL Editor. Safe to run again. Nothing old changes.

create table if not exists payments (
  tx         text primary key,                   -- transaction hash (lowercase)
  player_id  uuid references players(id) on delete set null,
  address    text not null,                      -- wallet that paid
  pack       text not null,                      -- which gem pack
  gems       int not null,
  wei        numeric not null,                   -- amount paid (wei)
  created_at timestamptz not null default now()
);
create index if not exists payments_player on payments (player_id, created_at desc);
alter table payments enable row level security;   -- no public access
