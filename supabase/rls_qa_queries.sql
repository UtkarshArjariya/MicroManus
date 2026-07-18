-- RLS QA helper for a Supabase SQL console or psql session with enough
-- privilege to impersonate authenticated users. Replace the UUIDs with two
-- real test users after OAuth signup. Each block should only return that
-- user's own rows, and the cross-user insert/update attempts should fail.

-- User A read isolation. Expected count for every query: 0.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select 'profiles_a' as check_name, count(*) from public.profiles where id <> auth.uid();
select 'wallets_a' as check_name, count(*) from public.credit_wallets where user_id <> auth.uid();
select 'keys_a' as check_name, count(*) from public.provider_keys where user_id <> auth.uid();
select 'chats_a' as check_name, count(*) from public.chats where user_id <> auth.uid();
select 'messages_a' as check_name, count(*)
from public.messages m
join public.chats c on c.id = m.chat_id
where c.user_id <> auth.uid();
select 'reports_a' as check_name, count(*)
from public.report_artifacts r
join public.chats c on c.id = r.chat_id
where c.user_id <> auth.uid();
rollback;

-- User B read isolation. Expected count for every query: 0.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select 'profiles_b' as check_name, count(*) from public.profiles where id <> auth.uid();
select 'wallets_b' as check_name, count(*) from public.credit_wallets where user_id <> auth.uid();
select 'keys_b' as check_name, count(*) from public.provider_keys where user_id <> auth.uid();
select 'chats_b' as check_name, count(*) from public.chats where user_id <> auth.uid();
select 'messages_b' as check_name, count(*)
from public.messages m
join public.chats c on c.id = m.chat_id
where c.user_id <> auth.uid();
select 'reports_b' as check_name, count(*)
from public.report_artifacts r
join public.chats c on c.id = r.chat_id
where c.user_id <> auth.uid();

-- Expected failure: authenticated clients cannot read encrypted provider keys.
select encrypted_key from public.provider_keys limit 1;
rollback;
