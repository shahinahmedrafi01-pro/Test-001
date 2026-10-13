-- ============================================================
-- GitHub Games — Diamond Shop database (Supabase / Postgres)
-- Run this ONCE in the SQL Editor. Safe to re-run.
-- Tables: profiles (username accounts), packages (server prices),
--         orders (bKash orders). All writes go through functions.
-- ============================================================

-- ---------- tables ----------
create table if not exists public.profiles (
  username text primary key,
  diamonds integer not null default 30,
  owned text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.packages (
  id text primary key,
  diamonds integer not null,
  amount integer not null
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null references public.profiles(username),
  pkg text not null references public.packages(id),
  diamonds integer not null,
  amount integer not null,
  trxid text not null unique,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'rejected'))
);

-- package prices: the ONLY price list that matters (server-side)
insert into public.packages (id, diamonds, amount) values
  ('p90', 90, 90),
  ('p180', 180, 160),
  ('p270', 270, 250),
  ('p449', 449, 400)
on conflict (id) do update
  set diamonds = excluded.diamonds, amount = excluded.amount;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.orders enable row level security;

-- anyone can READ profiles (balance + owned games) — needed for username-only login
drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles" on public.profiles for select using (true);

-- anyone can READ package prices
drop policy if exists "public read packages" on public.packages;
create policy "public read packages" on public.packages for select using (true);

-- only the logged-in ADMIN can read orders (buyers never list orders)
drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders" on public.orders for select to authenticated using (true);

-- no direct insert/update/delete policies: all writes go through the functions below.

-- ---------- functions ----------
-- helper: normalize a username (lowercase, trimmed)
create or replace function public.norm_username(p_username text)
returns text language sql immutable as $$
  select lower(trim(p_username));
$$;

-- create a profile: first save of a username -> +30 diamonds. Errors if taken.
create or replace function public.create_profile(p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare
  u text := norm_username(p_username);
  r public.profiles%rowtype;
begin
  if u is null or length(u) < 2 or length(u) > 24 then
    raise exception 'invalid username';
  end if;
  insert into public.profiles (username, diamonds, owned)
  values (u, 30, '{}')
  returning * into r;
  return json_build_object('ok', true, 'username', r.username, 'diamonds', r.diamonds, 'owned', r.owned);
exception when unique_violation then
  raise exception 'username taken';
end;
$$;

-- buy a game: one-time unlock, deducts price, adds to owned. Atomic.
create or replace function public.buy_game(p_username text, p_game text, p_price integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  u text := norm_username(p_username);
  r public.profiles%rowtype;
begin
  if p_price is null or p_price < 0 then raise exception 'invalid price'; end if;
  select * into r from public.profiles where username = u for update;
  if not found then raise exception 'profile not found'; end if;
  if r.owned @> array[p_game] then raise exception 'already owned'; end if;
  if r.diamonds < p_price then raise exception 'not enough diamonds'; end if;
  update public.profiles
  set diamonds = diamonds - p_price,
      owned = array_append(owned, p_game)
  where username = u
  returning * into r;
  return json_build_object('ok', true, 'username', r.username, 'diamonds', r.diamonds, 'owned', r.owned);
end;
$$;

-- place an order: buyer already sent money manually (bKash app / *247#).
-- Prices come from the packages table — client-sent amounts are ignored.
-- A brand-new username gets its +30 welcome bonus here too.
create or replace function public.place_order(
  p_username text, p_pkg text, p_trxid text, p_phone text
)
returns json language plpgsql security definer set search_path = public as $$
declare
  u text := norm_username(p_username);
  t text := upper(trim(p_trxid));
  ph text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
  pk public.packages%rowtype;
  oid uuid;
begin
  if u is null or length(u) < 2 or length(u) > 24 then
    raise exception 'invalid username';
  end if;
  if t is null or length(t) < 6 or length(t) > 24 or t !~ '^[A-Z0-9]+$' then
    raise exception 'invalid trxid';
  end if;
  if ph !~ '^(\+8801[3-9][0-9]{8}|01[3-9][0-9]{8})$' then
    raise exception 'invalid phone';
  end if;
  select * into pk from public.packages where id = p_pkg;
  if not found then raise exception 'unknown package'; end if;

  -- create the profile if this username is brand new (+30 welcome bonus)
  insert into public.profiles (username, diamonds, owned)
  values (u, 30, '{}')
  on conflict (username) do nothing;

  insert into public.orders (username, pkg, diamonds, amount, trxid, phone, status)
  values (u, pk.id, pk.diamonds, pk.amount, t, ph, 'pending')
  returning id into oid;
  return json_build_object('ok', true, 'orderId', oid);
exception when unique_violation then
  raise exception 'duplicate trxid';
end;
$$;

-- admin: approve an order -> auto-credit diamonds EXACTLY ONCE.
-- Only a logged-in admin (Supabase Auth) can call this. Pending -> complete only.
create or replace function public.complete_order(p_order_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  if auth.role() <> 'authenticated' then raise exception 'not admin'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'pending' then raise exception 'order not pending'; end if;
  update public.orders set status = 'complete' where id = p_order_id;
  update public.profiles set diamonds = diamonds + o.diamonds where username = o.username;
  return json_build_object('ok', true, 'username', o.username, 'diamonds', o.diamonds);
end;
$$;

-- admin: reject an order -> no diamonds, final.
create or replace function public.reject_order(p_order_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
begin
  if auth.role() <> 'authenticated' then raise exception 'not admin'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'pending' then raise exception 'order not pending'; end if;
  update public.orders set status = 'rejected' where id = p_order_id;
  return json_build_object('ok', true);
end;
$$;

-- ---------- permissions ----------
grant execute on function public.create_profile(text) to anon, authenticated;
grant execute on function public.buy_game(text, text, integer) to anon, authenticated;
grant execute on function public.place_order(text, text, text, text) to anon, authenticated;
grant execute on function public.complete_order(uuid) to authenticated;
grant execute on function public.reject_order(uuid) to authenticated;

grant select on public.profiles to anon, authenticated;
grant select on public.packages to anon, authenticated;
grant select on public.orders to authenticated;
