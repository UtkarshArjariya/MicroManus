alter table public.usage_events
  add column input_cost_usd numeric(12, 6) not null default 0 check (input_cost_usd >= 0),
  add column output_cost_usd numeric(12, 6) not null default 0 check (output_cost_usd >= 0),
  add column cached_cost_usd numeric(12, 6) not null default 0 check (cached_cost_usd >= 0),
  add column total_cost_usd numeric(12, 6) not null default 0 check (total_cost_usd >= 0);

create index usage_events_cost_idx on public.usage_events(chat_id, total_cost_usd desc);

create unique index credit_ledger_agent_turn_reference_unique
on public.credit_ledger(reference_id)
where reason = 'agent_turn_debit'::public.credit_ledger_reason
  and reference_id is not null;
