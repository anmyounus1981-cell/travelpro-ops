-- Owner profiles are provisioned through trusted administration.
-- Client roles may read their owner profile but cannot change it.

alter table public.app_users enable row level security;

revoke all privileges on table public.app_users
  from public, anon, authenticated;

grant select on table public.app_users to authenticated;

drop policy if exists owner_self_all
  on public.app_users;

drop policy if exists owner_self_select
  on public.app_users;

create policy owner_self_select
  on public.app_users
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and role = 'owner'
  );