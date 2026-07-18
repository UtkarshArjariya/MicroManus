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

  -- Insert a neutral row first so a negative delta is never checked as the
  -- proposed INSERT value before ON CONFLICT can run. PostgreSQL validates
  -- CHECK constraints before conflict resolution, which made every debit fail
  -- even when an existing wallet had enough credits.
  insert into public.credit_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.credit_wallets
  set balance = balance + p_delta,
      updated_at = now()
  where user_id = p_user_id
    and balance + p_delta >= 0
  returning balance into wallet_balance;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, reference_id)
  values (p_user_id, p_delta, p_reason, p_reference_id)
  returning id into ledger_id;

  return next;
end;
$$;

revoke execute on function public.apply_credit(uuid, integer, public.credit_ledger_reason, text)
from public, anon, authenticated;

grant execute on function public.apply_credit(uuid, integer, public.credit_ledger_reason, text)
to service_role;
