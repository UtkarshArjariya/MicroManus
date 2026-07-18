create extension if not exists "pgcrypto";

create type public.credit_ledger_reason as enum (
  'coupon_redeem',
  'stripe_purchase',
  'agent_turn_debit',
  'admin_adjustment'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.credit_ledger_reason not null,
  reference_id text,
  created_at timestamptz not null default now()
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  redeemed_at timestamptz not null default now(),
  unique (user_id, code)
);

create table public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null,
  created_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles(email);
create index credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create index credit_ledger_reference_idx on public.credit_ledger(reference_id) where reference_id is not null;
create index coupon_redemptions_user_idx on public.coupon_redemptions(user_id);
create index stripe_payments_user_created_idx on public.stripe_payments(user_id, created_at desc);
create index stripe_payments_payment_intent_idx on public.stripe_payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger credit_wallets_set_updated_at
before update on public.credit_wallets
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.apply_credit(
  p_user_id uuid,
  p_delta integer,
  p_reason public.credit_ledger_reason,
  p_reference_id text default null
)
returns table(wallet_balance integer, ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_delta = 0 then
    raise exception 'credit_delta_cannot_be_zero';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, reference_id)
  values (p_user_id, p_delta, p_reason, p_reference_id)
  returning id into ledger_id;

  insert into public.credit_wallets (user_id, balance)
  values (p_user_id, p_delta)
  on conflict (user_id) do update
    set balance = public.credit_wallets.balance + excluded.balance,
        updated_at = now()
  returning balance into wallet_balance;

  if wallet_balance < 0 then
    raise exception 'insufficient_credits';
  end if;

  return next;
end;
$$;

create or replace function public.redeem_coupon_credit(
  p_user_id uuid,
  p_code text,
  p_delta integer
)
returns table(wallet_balance integer, ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.coupon_redemptions where user_id = p_user_id) then
    raise exception 'coupon_already_redeemed';
  end if;

  begin
    insert into public.coupon_redemptions (user_id, code)
    values (p_user_id, upper(trim(p_code)));
  exception
    when unique_violation then
      raise exception 'coupon_already_redeemed';
  end;

  return query
    select * from public.apply_credit(
      p_user_id,
      p_delta,
      'coupon_redeem'::public.credit_ledger_reason,
      upper(trim(p_code))
    );
end;
$$;

create or replace function public.grant_stripe_purchase_credit(
  p_user_id uuid,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_status text,
  p_delta integer
)
returns table(wallet_balance integer, credited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_balance integer;
  v_payment_id uuid;
begin
  insert into public.stripe_payments (
    user_id,
    stripe_session_id,
    stripe_payment_intent_id,
    amount_cents,
    currency,
    status
  )
  values (
    p_user_id,
    p_stripe_session_id,
    p_stripe_payment_intent_id,
    p_amount_cents,
    lower(p_currency),
    p_status
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select balance into v_wallet_balance
    from public.credit_wallets
    where user_id = p_user_id;

    wallet_balance := coalesce(v_wallet_balance, 0);
    credited := false;
    return next;
    return;
  end if;

  select ac.wallet_balance into v_wallet_balance
  from public.apply_credit(
    p_user_id,
    p_delta,
    'stripe_purchase'::public.credit_ledger_reason,
    p_stripe_session_id
  ) as ac;

  wallet_balance := v_wallet_balance;
  credited := true;
  return next;
end;
$$;

revoke execute on function public.apply_credit(uuid, integer, public.credit_ledger_reason, text) from public, anon, authenticated;
revoke execute on function public.redeem_coupon_credit(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.grant_stripe_purchase_credit(uuid, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_credit(uuid, integer, public.credit_ledger_reason, text) to service_role;
grant execute on function public.redeem_coupon_credit(uuid, text, integer) to service_role;
grant execute on function public.grant_stripe_purchase_credit(uuid, text, text, integer, text, text, integer) to service_role;

alter table public.profiles enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.stripe_payments enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "credit_wallets_select_own"
on public.credit_wallets for select
to authenticated
using (auth.uid() = user_id);

create policy "credit_ledger_select_own"
on public.credit_ledger for select
to authenticated
using (auth.uid() = user_id);

create policy "coupon_redemptions_select_own"
on public.coupon_redemptions for select
to authenticated
using (auth.uid() = user_id);

create policy "stripe_payments_select_own"
on public.stripe_payments for select
to authenticated
using (auth.uid() = user_id);
