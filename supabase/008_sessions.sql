-- MINDS CLASH: "log out everywhere". Sessions issued before this time stop working.
-- Run once in Supabase → SQL Editor. Safe to run again. Nothing old changes.
alter table players add column if not exists sessions_after timestamptz;
