create function public.test_reject_document_link_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'document.linked' then
    raise exception 'Synthetic document audit failure';
  end if;

  return new;
end;
$$;

create trigger test_reject_document_link_audit
before insert on public.audit_logs
for each row
execute function public.test_reject_document_link_audit();

select set_config(
  'request.jwt.claim.sub',
  (
    select u.auth_user_id::text
    from public.app_users u
    join public.payments p on p.user_id = u.id
    join storage.objects o
      on o.bucket_id = 'payment-evidence'
      and o.name = p.evidence_file_path
      and o.owner_id = u.auth_user_id::text
    where u.role = 'owner'
      and p.evidence_file_path =
        'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png'
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_owner uuid;
  v_payment uuid;
  v_documents_before bigint;
  v_audits_before bigint;
  v_path text :=
    'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png';
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: synthetic upload owner not found';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  insert into public.payments (
    booking_id, amount, evidence_file_path, status, user_id
  )
  select booking_id, 1, evidence_file_path,
    'pending_verification', v_owner
  from public.payments
  where user_id = v_owner
    and evidence_file_path = v_path
  order by created_at
  limit 1
  returning id into v_payment;

  if v_payment is null then
    raise exception 'TEST FAILED: temporary payment not created';
  end if;

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;
  begin
    perform public.link_operational_document(
      'payment', v_payment
    );

    raise exception 'TEST FAILED: audit failure not triggered';
  exception when raise_exception then
    if sqlerrm <> 'Synthetic document audit failure' then
      raise;
    end if;
  end;

  if exists (
    select 1
    from public.documents
    where entity_type = 'payment'
      and entity_id = v_payment
  ) then
    raise exception 'TEST FAILED: document survived audit failure';
  end if;

  if (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: writes survived audit failure';
  end if;

  if not exists (
    select 1
    from public.payments
    where id = v_payment
      and status = 'pending_verification'
  ) then
    raise exception 'TEST FAILED: payment fixture changed';
  end if;
end;
$$;

reset role;

select
  'Document link rolled back after audit failure; no residual document or audit writes'
  as result;