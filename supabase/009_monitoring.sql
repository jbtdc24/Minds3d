-- MINDS CLASH: error log, payment ledger marks and the daily payment check.
-- Run once in Supabase → SQL Editor. Safe to run again. No Gems or payments are changed.

create table if not exists errors (                   -- grouped failures, read in the admin screen
  id          bigserial primary key,
  fingerprint text not null,
  feature     text not null,
  severity    text not null default 'error',          -- critical, error, warning
  code        text not null default '',
  message     text not null default '',
  stack       text not null default '',
  count       int not null default 1,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index if not exists errors_open on errors (resolved, last_at desc);
create index if not exists errors_finger on errors (fingerprint, resolved);

-- payments made before this file was run have no ledger mark, so they are kept out of the credit check
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'payments' and column_name = 'legacy') then
    alter table payments add column legacy boolean not null default false;
    update payments set legacy = true;                -- only the first time, so running this file again changes nothing
  end if;
end $$;

create table if not exists payment_intents (          -- a claim was started; survives a closed browser
  tx        text primary key,
  player_id uuid references players(id) on delete cascade,
  pack      text not null,
  at        timestamptz not null default now()
);

create table if not exists recon_findings (           -- one row per problem; a rerun updates it instead of adding another
  key       text primary key,
  tx        text not null,
  kind      text not null,
  severity  text not null,
  player_id uuid references players(id) on delete set null,
  pack      text,
  gems      int,
  wei       numeric,
  detail    text,
  action    text,
  status    text not null default 'open',             -- open, reviewed, fixed, resolved
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now()
);
create index if not exists recon_open on recon_findings (status, last_at desc);

create table if not exists recon_runs (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  checked  int not null default 0,
  intents  int not null default 0,
  findings int not null default 0,
  critical int not null default 0,
  partial  boolean not null default false,
  ms       int not null default 0
);

alter table errors          enable row level security;
alter table payment_intents enable row level security;
alter table recon_findings  enable row level security;
alter table recon_runs      enable row level security;
