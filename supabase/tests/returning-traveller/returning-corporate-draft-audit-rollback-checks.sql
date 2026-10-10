-- Run after the positive and negative checks.
-- The outer transaction must end with ROLLBACK.

create function pg_temp.reject_returning_draft_test_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'passport_draft.confirmed'
    and new.details ->> 'workflow'
      = 'returning_corporate_passport_review'
    and exists (
      select 1
      from pg_temp.returning_draft_fixture f
      where f.draft_id = new.entity_id
    )
  then
    raise exception 'SYNTHETIC returning draft audit failure';
  end if;

  return new;
end;
$$;

create trigger returning_draft_test_audit_failure
before insert on public.audit_logs
for each row
execute function pg_temp.reject_returning_draft_test_audit();
set local role authenticated;

do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_rejected boolean := false;
  v_draft_before jsonb;
  v_documents_before bigint;
  v_audits_before bigint;
  v_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  select to_jsonb(d) into strict v_draft_before
  from public.passport_extraction_drafts d
  where d.id = v_fixture.draft_id;

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  begin
    perform public.confirm_returning_corporate_passport_draft(
      v_fixture.draft_id,
      v_fixture.traveller_id,
      'SYNTHETIC',
      'RETURNING DRAFT',
      v_fixture.passport_number,
      v_fixture.dob,
      v_fixture.expiry_date,
      'TEST',
      v_checks,
      false,
      false
    );
  exception
    when others then
      if sqlerrm is distinct from
        'SYNTHETIC returning draft audit failure'
      then
        raise;
      end if;

      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'TEST FAILED: audit failure was not triggered';
  end if;

  if (
    select to_jsonb(d)
    from public.passport_extraction_drafts d
    where d.id = v_fixture.draft_id
  ) is distinct from v_draft_before then
    raise exception 'TEST FAILED: draft changes survived audit failure';
  end if;

  if (select count(*) from public.documents)
      <> v_documents_before
    or exists (
      select 1
      from public.documents d
      where d.file_path = v_fixture.image_path
    )
  then
    raise exception 'TEST FAILED: document survived audit failure';
  end if;

  if (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: residual audit writes';
  end if;

  if (
    select to_jsonb(t)
    from public.travellers t
    where t.id = v_fixture.traveller_id
  ) is distinct from v_fixture.profile_before then
    raise exception 'TEST FAILED: traveller profile changed';
  end if;
end;
$$;

reset role;

drop trigger returning_draft_test_audit_failure
  on public.audit_logs;

drop function pg_temp.reject_returning_draft_test_audit();

select
  'Audit failure rolled back draft confirmation and document link; profile unchanged; no residual audit writes'
  as result;