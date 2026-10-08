select set_config(
  'request.jwt.claim.sub',
  (
    select u.auth_user_id::text
    from public.app_users u
    join public.payments p
      on p.user_id = u.id
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
  v_payment uuid;
  v_owner uuid;
  v_document uuid;
  v_retry uuid;
  v_documents_before bigint;
  v_audits_before bigint;
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: synthetic upload owner not found';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  select id into strict v_payment
  from public.payments
  where user_id = v_owner
    and evidence_file_path =
      'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png';

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  if not exists (
    select 1
    from public.documents
    where entity_type = 'payment'
      and entity_id = v_payment
      and file_type = 'payment_evidence'
      and user_id = v_owner
      and file_path =
        'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png'
  ) then
    raise exception 'TEST FAILED: uploaded document link missing';
  end if;

  v_document := public.link_operational_document(
    'payment', v_payment
  );

  v_retry := public.link_operational_document(
    'payment', v_payment
  );

  if v_document is null
    or v_retry is distinct from v_document then
    raise exception 'TEST FAILED: retry returned a different document';
  end if;

  if not exists (
    select 1
    from public.documents
    where id = v_document
      and entity_type = 'payment'
      and entity_id = v_payment
      and file_type = 'payment_evidence'
      and user_id = v_owner
      and file_path =
        'df28cfde-8c8c-48f6-b6a0-6b3cca024cdb-travelpro-synthetic-evidence.png'
  ) then
    raise exception 'TEST FAILED: returned document is incorrect';
  end if;

  if (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: retry created additional writes';
  end if;

  if not exists (
    select 1
    from public.payments
    where id = v_payment
      and status = 'pending_verification'
  ) then
    raise exception 'TEST FAILED: payment status changed';
  end if;
end;
$$;

reset role;

select
  'Existing payment document reused; no duplicate writes; payment remains pending'
  as result;