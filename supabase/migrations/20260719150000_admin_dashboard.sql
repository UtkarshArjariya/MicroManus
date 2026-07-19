-- Admin authorization is deliberately stored on the server-owned profile row.
-- Profiles are OAuth-derived and are not edited by the current application, so
-- remove the existing client update path before exposing the admin marker.
alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Server-verified authorization marker for the MicroManus admin dashboard.';

drop policy if exists "profiles_update_own" on public.profiles;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges (
  id,
  email,
  display_name,
  avatar_url,
  created_at,
  updated_at,
  is_admin
) on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  credit_value integer not null check (credit_value > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint coupons_code_canonical_check check (
    char_length(code) > 0
    and code = upper(btrim(code))
    and code !~ '[[:space:]]'
  ),
  constraint coupons_redemption_limit_check check (
    max_redemptions is null or redemption_count <= max_redemptions
  )
);

comment on table public.coupons is
  'Server-managed coupon definitions. Clients redeem coupons only through the service-role RPC.';
comment on column public.coupons.code is
  'Canonical uppercase coupon code without whitespace.';
comment on column public.coupons.max_redemptions is
  'Maximum successful redemptions, or null for unlimited redemptions.';

create index coupons_active_created_idx
  on public.coupons(active, created_at desc);

insert into public.coupons (
  code,
  credit_value,
  max_redemptions,
  active,
  created_by
)
values ('SID_DRDROID', 5, null, true, null);

alter table public.coupon_redemptions
  add column coupon_id uuid references public.coupons(id);

update public.coupon_redemptions as redemption
set coupon_id = coupon.id
from public.coupons as coupon
where redemption.coupon_id is null
  and coupon.code = 'SID_DRDROID'
  and upper(btrim(redemption.code)) = coupon.code;

update public.coupons as coupon
set redemption_count = (
  select count(*)::integer
  from public.coupon_redemptions as redemption
  where redemption.coupon_id = coupon.id
)
where coupon.code = 'SID_DRDROID';

create unique index coupon_redemptions_user_coupon_unique
  on public.coupon_redemptions(user_id, coupon_id)
  where coupon_id is not null;

create index coupon_redemptions_coupon_idx
  on public.coupon_redemptions(coupon_id)
  where coupon_id is not null;

comment on column public.coupon_redemptions.coupon_id is
  'Coupon definition used for this redemption; nullable only for unmatched historical rows.';

-- Successful saved-key connection tests update metadata only. The encrypted
-- credential remains inaccessible through authenticated SELECT privileges.
alter table public.provider_keys
  add column last_tested_at timestamptz;

comment on column public.provider_keys.last_tested_at is
  'Timestamp of the most recent successful saved-key connection test.';

grant select (last_tested_at) on public.provider_keys to authenticated;

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id),
  action text not null check (char_length(btrim(action)) > 0),
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Append-only audit trail for admin mutations performed by service-role RPCs.';

create index admin_audit_log_admin_created_idx
  on public.admin_audit_log(admin_user_id, created_at desc);
create index admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

alter table public.coupons enable row level security;
alter table public.admin_audit_log enable row level security;

-- These tables intentionally have no client policies or privileges. Admin
-- reads and writes are mediated by server routes using the service role.
revoke all privileges on table public.coupons from public, anon, authenticated;
revoke all privileges on table public.admin_audit_log from public, anon, authenticated;
revoke all privileges on table public.coupons from service_role;
revoke all privileges on table public.admin_audit_log from service_role;
grant select, insert, update on table public.coupons to service_role;
grant select, insert on table public.admin_audit_log to service_role;

-- Coupon redemptions remain client-readable only through the existing
-- coupon_redemptions_select_own policy, never client-writable.
revoke insert, update, delete on table public.coupon_redemptions from anon, authenticated;

-- Replace the launch-code RPC with a table-backed, race-safe implementation.
-- Locking the coupon row serializes redemptions at the cap; the insert, count
-- increment, and credit grant all participate in the RPC's single transaction.
revoke execute on function public.redeem_coupon_credit(uuid, text, integer)
from public, anon, authenticated;
drop function public.redeem_coupon_credit(uuid, text, integer);

create function public.redeem_coupon_credit(
  p_user_id uuid,
  p_code text
)
returns table(
  wallet_balance integer,
  ledger_id uuid,
  coupon_id uuid,
  credit_value integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_coupon public.coupons%rowtype;
begin
  if p_user_id is null or v_code = '' then
    raise exception 'coupon_wrong_code';
  end if;

  select coupon.*
  into v_coupon
  from public.coupons as coupon
  where coupon.code = v_code
  for update;

  if not found or not v_coupon.active then
    raise exception 'coupon_wrong_code';
  end if;

  if exists (
    select 1
    from public.coupon_redemptions as redemption
    where redemption.user_id = p_user_id
      and redemption.coupon_id = v_coupon.id
  ) then
    raise exception 'coupon_already_redeemed';
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    raise exception 'coupon_expired';
  end if;

  if v_coupon.max_redemptions is not null
    and v_coupon.redemption_count >= v_coupon.max_redemptions then
    raise exception 'coupon_fully_redeemed';
  end if;

  begin
    insert into public.coupon_redemptions (user_id, code, coupon_id)
    values (p_user_id, v_coupon.code, v_coupon.id);
  exception
    when unique_violation then
      raise exception 'coupon_already_redeemed';
  end;

  update public.coupons as coupon
  set redemption_count = coupon.redemption_count + 1
  where coupon.id = v_coupon.id;

  select applied.wallet_balance, applied.ledger_id
  into wallet_balance, ledger_id
  from public.apply_credit(
    p_user_id,
    v_coupon.credit_value,
    'coupon_redeem'::public.credit_ledger_reason,
    v_coupon.id::text
  ) as applied;

  coupon_id := v_coupon.id;
  credit_value := v_coupon.credit_value;
  return next;
end;
$$;

comment on function public.redeem_coupon_credit(uuid, text) is
  'Atomically validates and redeems a canonical coupon, increments its use count, and grants its configured credits.';

revoke execute on function public.redeem_coupon_credit(uuid, text)
from public, anon, authenticated;
grant execute on function public.redeem_coupon_credit(uuid, text) to service_role;

create function public.admin_adjust_credits(
  p_admin_user_id uuid,
  p_target_user_id uuid,
  p_delta integer,
  p_reason_text text
)
returns table(
  wallet_balance integer,
  ledger_id uuid,
  audit_log_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason_text, ''));
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_user_id
      and profile.is_admin
  ) then
    raise exception 'admin_forbidden';
  end if;

  if p_target_user_id is null then
    raise exception 'admin_adjustment_target_required';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_target_user_id
  ) then
    raise exception 'admin_target_not_found';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'credit_delta_cannot_be_zero';
  end if;

  if v_reason = '' then
    raise exception 'admin_adjustment_reason_required';
  end if;

  audit_log_id := gen_random_uuid();

  select applied.wallet_balance, applied.ledger_id
  into wallet_balance, ledger_id
  from public.apply_credit(
    p_target_user_id,
    p_delta,
    'admin_adjustment'::public.credit_ledger_reason,
    audit_log_id::text
  ) as applied;

  insert into public.admin_audit_log (
    id,
    admin_user_id,
    action,
    target,
    details
  )
  values (
    audit_log_id,
    p_admin_user_id,
    'manual_credit_adjustment',
    p_target_user_id::text,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'amount', p_delta,
      'reason', v_reason,
      'ledger_id', ledger_id,
      'wallet_balance', wallet_balance
    )
  );

  return next;
end;
$$;

comment on function public.admin_adjust_credits(uuid, uuid, integer, text) is
  'Atomically applies an admin credit adjustment and records exactly one linked audit row.';

revoke execute on function public.admin_adjust_credits(uuid, uuid, integer, text)
from public, anon, authenticated;
grant execute on function public.admin_adjust_credits(uuid, uuid, integer, text) to service_role;

create function public.admin_create_coupon(
  p_admin_user_id uuid,
  p_code text,
  p_credit_value integer,
  p_max_redemptions integer,
  p_expires_at timestamptz,
  p_active boolean
)
returns table(
  coupon_id uuid,
  audit_log_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_active boolean := coalesce(p_active, true);
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_user_id
      and profile.is_admin
  ) then
    raise exception 'admin_forbidden';
  end if;

  if v_code = '' then
    raise exception 'coupon_code_required';
  end if;

  if v_code ~ '[[:space:]]' then
    raise exception 'coupon_code_cannot_contain_spaces';
  end if;

  if p_credit_value is null or p_credit_value <= 0 then
    raise exception 'coupon_credit_value_invalid';
  end if;

  if p_max_redemptions is not null and p_max_redemptions <= 0 then
    raise exception 'coupon_max_redemptions_invalid';
  end if;

  begin
    insert into public.coupons (
      code,
      credit_value,
      max_redemptions,
      expires_at,
      active,
      created_by
    )
    values (
      v_code,
      p_credit_value,
      p_max_redemptions,
      p_expires_at,
      v_active,
      p_admin_user_id
    )
    returning id into coupon_id;
  exception
    when unique_violation then
      raise exception 'coupon_code_already_exists';
  end;

  audit_log_id := gen_random_uuid();

  insert into public.admin_audit_log (
    id,
    admin_user_id,
    action,
    target,
    details
  )
  values (
    audit_log_id,
    p_admin_user_id,
    'coupon_create',
    coupon_id::text,
    jsonb_build_object(
      'code', v_code,
      'credit_value', p_credit_value,
      'max_redemptions', p_max_redemptions,
      'expires_at', p_expires_at,
      'active', v_active
    )
  );

  return next;
end;
$$;

comment on function public.admin_create_coupon(uuid, text, integer, integer, timestamptz, boolean) is
  'Creates a canonical coupon and its audit row in one service-role transaction.';

revoke execute on function public.admin_create_coupon(uuid, text, integer, integer, timestamptz, boolean)
from public, anon, authenticated;
grant execute on function public.admin_create_coupon(uuid, text, integer, integer, timestamptz, boolean)
to service_role;

create function public.admin_update_coupon(
  p_admin_user_id uuid,
  p_coupon_id uuid,
  p_credit_value integer,
  p_max_redemptions integer,
  p_expires_at timestamptz,
  p_active boolean
)
returns table(
  coupon_id uuid,
  audit_log_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_action text;
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_user_id
      and profile.is_admin
  ) then
    raise exception 'admin_forbidden';
  end if;

  if p_coupon_id is null then
    raise exception 'coupon_id_required';
  end if;

  if p_credit_value is null or p_credit_value <= 0 then
    raise exception 'coupon_credit_value_invalid';
  end if;

  if p_max_redemptions is not null and p_max_redemptions <= 0 then
    raise exception 'coupon_max_redemptions_invalid';
  end if;

  if p_active is null then
    raise exception 'coupon_active_required';
  end if;

  select coupon.*
  into v_coupon
  from public.coupons as coupon
  where coupon.id = p_coupon_id
  for update;

  if not found then
    raise exception 'coupon_not_found';
  end if;

  if p_max_redemptions is not null
    and p_max_redemptions < v_coupon.redemption_count then
    raise exception 'coupon_max_below_redemptions';
  end if;

  if v_coupon.active and not p_active then
    v_action := 'coupon_deactivate';
  elsif not v_coupon.active and p_active then
    v_action := 'coupon_reactivate';
  else
    v_action := 'coupon_edit';
  end if;

  update public.coupons as coupon
  set credit_value = p_credit_value,
      max_redemptions = p_max_redemptions,
      expires_at = p_expires_at,
      active = p_active
  where coupon.id = p_coupon_id;

  coupon_id := p_coupon_id;
  audit_log_id := gen_random_uuid();

  insert into public.admin_audit_log (
    id,
    admin_user_id,
    action,
    target,
    details
  )
  values (
    audit_log_id,
    p_admin_user_id,
    v_action,
    p_coupon_id::text,
    jsonb_build_object(
      'code', v_coupon.code,
      'before', jsonb_build_object(
        'credit_value', v_coupon.credit_value,
        'max_redemptions', v_coupon.max_redemptions,
        'expires_at', v_coupon.expires_at,
        'active', v_coupon.active
      ),
      'after', jsonb_build_object(
        'credit_value', p_credit_value,
        'max_redemptions', p_max_redemptions,
        'expires_at', p_expires_at,
        'active', p_active
      )
    )
  );

  return next;
end;
$$;

comment on function public.admin_update_coupon(uuid, uuid, integer, integer, timestamptz, boolean) is
  'Updates mutable coupon fields and records edit, deactivation, or reactivation in the audit trail atomically.';

revoke execute on function public.admin_update_coupon(uuid, uuid, integer, integer, timestamptz, boolean)
from public, anon, authenticated;
grant execute on function public.admin_update_coupon(uuid, uuid, integer, integer, timestamptz, boolean)
to service_role;
