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
  v_document uuid;
  v_retry uuid;
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

  -- Temporary fixture only. The outer transaction will roll back.
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

  v_document := public.link_operational_document(
    'payment', v_payment
  );

  if v_document is null or not exists (
    select 1 from public.documents
    where id = v_document
      and entity_type = 'payment'
      and entity_id = v_payment
      and file_type = 'payment_evidence'
      and file_path = v_path
      and user_id = v_owner
  ) then
    raise exception 'TEST FAILED: new document link incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where action = 'document.linked'
      and entity_type = 'payment'
      and entity_id = v_payment
      and actor_id = v_owner
      and user_id = v_owner
      and details ->> 'document_id' = v_document::text
      and details ->> 'file_type' = 'payment_evidence'
  ) <> 1 then
    raise exception 'TEST FAILED: document audit incorrect';
  end if;

  v_retry := public.link_operational_document(
    'payment', v_payment
  );

  if v_retry is distinct from v_document
    or (select count(*) from public.documents)
      <> v_documents_before + 1
    or (select count(*) from public.audit_logs)
      <> v_audits_before + 1 then
    raise exception 'TEST FAILED: duplicate or unexpected writes';
  end if;

  if not exists (
    select 1 from public.payments
    where id = v_payment
      and status = 'pending_verification'
  ) then
    raise exception 'TEST FAILED: payment status changed';
  end if;
end;
$$;

reset role;

select
  'New payment document and audit created; retry reused link; payment remains pending'
  as result;