-- Mindclash Mind Energy: each Mind (the NFT, not the wallet) has daily ranked energy; it refills at 00:00 UTC.
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists mind_energy (
  token_id int primary key,              -- on-chain Mind id: energy follows the NFT if it is transferred
  day      date not null,                -- UTC day the "used" count belongs to
  used     int not null default 0
);
alter table mind_energy enable row level security;   -- no public access, only the game server

-- Spend 1 energy from every listed Mind, all or nothing. caps[i] = that Mind's daily energy.
-- Returns false (and spends nothing) if any Mind is out of energy today.
create or replace function spend_energy(ids int[], caps int[])
returns boolean language plpgsql security definer as $$
declare d date := (now() at time zone 'utc')::date; u int;
begin
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    insert into mind_energy as e (token_id, day, used) values (ids[i], d, 0)
      on conflict (token_id) do update set used = case when e.day = d then e.used else 0 end, day = d;
    select used into u from mind_energy where token_id = ids[i] for update;
    if u >= caps[i] then raise exception 'out of energy'; end if;
    update mind_energy set used = used + 1 where token_id = ids[i];
  end loop;
  return true;
exception when raise_exception then
  return false;                          -- the block is rolled back: nothing was spent
end $$;

revoke all on function spend_energy(int[], int[]) from public, anon, authenticated;
