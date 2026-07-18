alter type public.agent_step_type add value 'artifact';

create table public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index report_artifacts_chat_created_idx on public.report_artifacts(chat_id, created_at desc);
create index report_artifacts_message_idx on public.report_artifacts(message_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-artifacts',
  'report-artifacts',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

alter table public.report_artifacts enable row level security;

create policy "report_artifacts_select_own_chat"
on public.report_artifacts for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = auth.uid()
  )
);

grant select on public.report_artifacts to authenticated;
