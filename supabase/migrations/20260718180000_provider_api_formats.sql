alter type public.provider_key_provider add value if not exists 'google';

do $$
begin
  create type public.provider_api_format as enum ('openai', 'anthropic', 'google');
exception
  when duplicate_object then null;
end
$$;

alter table public.provider_keys
  add column if not exists api_format public.provider_api_format not null default 'openai';

update public.provider_keys
set api_format = case
  when provider = 'anthropic' then 'anthropic'::public.provider_api_format
  else 'openai'::public.provider_api_format
end;

grant select (api_format) on public.provider_keys to authenticated;
grant insert (api_format) on public.provider_keys to authenticated;
grant update (api_format) on public.provider_keys to authenticated;

comment on column public.provider_keys.api_format is
  'Wire protocol used for provider calls. Built-ins set this automatically; custom endpoints choose a compatible API format.';
