-- 🎟️ Early access: new accounts need an invite code (lib/invite.js). Players who already have an account keep playing.
-- Codes are made in the admin screen (🎟️ Invites). Safe to run twice.
create table if not exists invites (
  code text primary key,                      -- e.g. MC-7K3P-Q9XA (stored upper case)
  note text,                                  -- who it is for
  max_uses int not null default 1,
  uses int not null default 0,
  off boolean not null default false,         -- switched off by the admin
  created_at timestamptz not null default now()
);
alter table invites enable row level security;   -- only the server (service key) reads it
alter table players add column if not exists invite text;

-- one use of a code, counted safely even when two people sign up at the same moment
create or replace function use_invite(c text) returns boolean language plpgsql security definer as $$
begin
  update invites set uses = uses + 1 where code = upper(trim(c)) and not off and uses < max_uses;
  return found;
end $$;
revoke all on function use_invite(text) from public, anon, authenticated;
