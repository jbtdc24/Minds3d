-- 🤝 Referrals + admins you add in the game + multi-account checks. Safe to run twice.
-- Sign-up is open again (no invite codes). A player's link is https://www.mindsclash.games/?ref=<ref_code>; a NEW
-- WALLET account that signs up after opening it counts for them (trial accounts never count).
alter table players add column if not exists ref_code text;                       -- the player's own link code
alter table players add column if not exists referred_by uuid references players(id) on delete set null;
alter table players add column if not exists ref_void boolean not null default false;   -- an admin ruled this referral out
alter table players add column if not exists ip_key text;                         -- one-way hash of the IP at sign-up (never the IP)
alter table players add column if not exists last_ip_key text;                    -- the same, at the latest wallet login
alter table players add column if not exists is_admin boolean not null default false;   -- added by the owner in Admin → Admins
create unique index if not exists players_ref_code on players (ref_code) where ref_code is not null;
create index if not exists players_referred_by on players (referred_by) where referred_by is not null;
create index if not exists players_ip_key on players (ip_key) where ip_key is not null;
create index if not exists players_last_ip_key on players (last_ip_key) where last_ip_key is not null;

-- 𝕏 a player's linked X account (Settings → Connect X), shown on their profile, player card and invite posts
alter table players add column if not exists x_id text;
alter table players add column if not exists x_handle text;
alter table players add column if not exists x_name text;
create unique index if not exists players_x_id on players (x_id) where x_id is not null;
