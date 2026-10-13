-- Daily Diamond Claim migration (Patch: Daily Claim System).
-- Run this in the Supabase SQL Editor (same project as schema.sql).
-- Adds +10 Diamonds every 12 hours, enforced server-side so the
-- cooldown is the same on every device and cannot be skipped by
-- clearing storage or switching devices.

alter table public.profiles
  add column if not exists last_daily_claim timestamptz;

create or replace function public.claim_daily(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := public.norm_username(p_username);
  r public.profiles;
begin
  select * into r from public.profiles where username = v_user for update;
  if not found then
    raise exception 'profile not found';
  end if;
  -- One claim per 12 hours. The check and the credit happen in the
  -- same transaction, so a double-click / double request can never
  -- credit twice.
  if r.last_daily_claim is not null
     and now() < r.last_daily_claim + interval '12 hours' then
    raise exception 'daily claim not ready';
  end if;
  update public.profiles
    set diamonds = diamonds + 10,
        last_daily_claim = now()
    where username = v_user
    returning * into r;
  return json_build_object(
    'username', r.username,
    'diamonds', r.diamonds,
    'owned', r.owned,
    'last_daily_claim', r.last_daily_claim
  );
end;
$$;

grant execute on function public.claim_daily(text) to anon, authenticated;
