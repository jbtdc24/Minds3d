-- MINDS CLASH: one copy of each island a day (kept 7 days), so support can put a player's island back
-- after a bug or a bad trade. Run once in Supabase → SQL Editor. Safe to run again. Nothing old is lost.
-- Until this runs, the game simply skips the copies.
create table if not exists island_snaps (
  player_id  uuid not null references players(id) on delete cascade,
  day        date not null,
  state      jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);
create index if not exists island_snaps_day on island_snaps (day);
alter table island_snaps enable row level security;   -- only the server (secret key) reads and writes it
