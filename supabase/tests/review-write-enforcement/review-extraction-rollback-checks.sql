create function public.test_reject_extraction_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'passport_draft.extraction_saved' then
    raise exception 'Synthetic extraction audit failure';
  end if;

  return new;
end;
$$;

create trigger test_reject_extraction_audit
before insert on public.audit_logs
for each row
execute function public.test_reject_extraction_audit();

select set_config(
  'request.jwt.claim.sub',
  (
    select u.auth_user_id::text
    from public.app_users u
    join public.passport_extraction_drafts d
      on d.created_by = u.id
    where u.role = 'owner'
      and u.auth_user_id is not null
      and d.status in ('uploaded', 'extraction_failed')
      and d.confirmed_traveller_id is null
    order by d.created_at, d.id
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_after public.passport_extraction_drafts%rowtype;
  v_audits_before bigint;
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: owner with available draft required';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  select * into v_draft
  from public.passport_extraction_drafts
  where created_by = v_owner
    and status in ('uploaded', 'extraction_failed')
    and confirmed_traveller_id is null
  order by created_at, id
  limit 1;

  if not found then
    raise exception 'TEST FAILED: available draft not found';
  end if;

  select count(*) into v_audits_before
  from public.audit_logs;

  begin
    perform public.save_passport_draft_extraction(
      v_draft.id,
      v_draft.status,
      v_draft.updated_at,
      '{"given_name": "SYNTHETIC ROLLBACK TEST"}'::jsonb
    );

    raise exception 'TEST FAILED: extraction audit failure not triggered';
  exception when raise_exception then
    if sqlerrm <> 'Synthetic extraction audit failure' then
      raise;
    end if;
  end;

  select * into strict v_after
  from public.passport_extraction_drafts
  where id = v_draft.id;

  if to_jsonb(v_after) is distinct from to_jsonb(v_draft) then
    raise exception 'TEST FAILED: draft changed despite audit failure';
  end if;

  if (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: audit writes survived failure';
  end if;
end;
$$;

reset role;

select
  'Extraction audit failure rolled back all draft changes; no residual audit writes'
  as result;