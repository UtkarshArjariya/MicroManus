alter type public.provider_api_format
  add value if not exists 'openai_responses';

alter table public.usage_events
  add column if not exists cache_write_tokens integer not null default 0
    check (cache_write_tokens >= 0),
  add column if not exists cache_write_cost_usd numeric(12, 6) not null default 0
    check (cache_write_cost_usd >= 0);

comment on column public.usage_events.cache_write_tokens is
  'Prompt tokens written to a provider cache during this request.';

comment on column public.usage_events.cache_write_cost_usd is
  'USD cost attributed to prompt-cache writes for this request.';
