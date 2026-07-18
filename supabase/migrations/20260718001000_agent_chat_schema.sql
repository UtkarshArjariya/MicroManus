create type public.provider_key_provider as enum (
  'openai',
  'anthropic',
  'kimi',
  'openai_compatible'
);

create type public.message_role as enum (
  'user',
  'assistant',
  'tool',
  'system'
);

create type public.agent_step_type as enum (
  'thought',
  'tool_call',
  'tool_result',
  'final_answer'
);

create table public.provider_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.provider_key_provider not null,
  label text not null check (char_length(trim(label)) > 0),
  base_url text,
  encrypted_key text not null,
  key_last4 text not null check (char_length(key_last4) between 4 and 12),
  default_model text not null check (char_length(trim(default_model)) > 0),
  created_at timestamptz not null default now()
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  provider_key_id uuid references public.provider_keys(id) on delete set null,
  model text not null check (char_length(trim(model)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role public.message_role not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  seq integer not null check (seq > 0),
  unique (chat_id, seq)
);

create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  step_index integer not null check (step_index > 0),
  type public.agent_step_type not null,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  created_at timestamptz not null default now(),
  unique (message_id, step_index)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  provider public.provider_key_provider not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  created_at timestamptz not null default now()
);

create index provider_keys_user_created_idx on public.provider_keys(user_id, created_at desc);
create index chats_user_updated_idx on public.chats(user_id, updated_at desc);
create index chats_provider_key_idx on public.chats(provider_key_id);
create index messages_chat_seq_idx on public.messages(chat_id, seq);
create index agent_steps_message_idx on public.agent_steps(message_id, step_index);
create index usage_events_chat_created_idx on public.usage_events(chat_id, created_at desc);
create index usage_events_message_idx on public.usage_events(message_id);

create trigger chats_set_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

alter table public.provider_keys enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.agent_steps enable row level security;
alter table public.usage_events enable row level security;

create policy "provider_keys_select_own"
on public.provider_keys for select
to authenticated
using (auth.uid() = user_id);

create policy "provider_keys_insert_own"
on public.provider_keys for insert
to authenticated
with check (auth.uid() = user_id);

create policy "provider_keys_update_own"
on public.provider_keys for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "provider_keys_delete_own"
on public.provider_keys for delete
to authenticated
using (auth.uid() = user_id);

create policy "chats_select_own"
on public.chats for select
to authenticated
using (auth.uid() = user_id);

create policy "chats_insert_own"
on public.chats for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.provider_keys pk
    where pk.id = provider_key_id
      and pk.user_id = auth.uid()
  )
);

create policy "chats_update_own"
on public.chats for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "messages_select_own_chat"
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
);

create policy "messages_insert_own_chat"
on public.messages for insert
to authenticated
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
);

create policy "messages_update_own_chat"
on public.messages for update
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
);

create policy "agent_steps_select_own_message"
on public.agent_steps for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.chats c on c.id = m.chat_id
    where m.id = message_id
      and c.user_id = auth.uid()
  )
);

create policy "usage_events_select_own_chat"
on public.usage_events for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
);

revoke all on public.provider_keys from anon, authenticated;
grant select (
  id,
  user_id,
  provider,
  label,
  base_url,
  key_last4,
  default_model,
  created_at
) on public.provider_keys to authenticated;
grant insert (
  user_id,
  provider,
  label,
  base_url,
  encrypted_key,
  key_last4,
  default_model
) on public.provider_keys to authenticated;
grant update (
  provider,
  label,
  base_url,
  encrypted_key,
  key_last4,
  default_model
) on public.provider_keys to authenticated;
grant delete on public.provider_keys to authenticated;

grant select, insert, update on public.chats to authenticated;
grant select, insert, update on public.messages to authenticated;
grant select on public.agent_steps to authenticated;
grant select on public.usage_events to authenticated;
