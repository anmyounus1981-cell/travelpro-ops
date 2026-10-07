do $$
declare
  v_auth_user uuid;
begin
  select auth_user_id into v_auth_user
  from public.app_users
  where role = 'owner' and auth_user_id is not null
  order by id
  limit 1;

  if v_auth_user is null then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  perform set_config(
    'request.jwt.claim.sub', v_auth_user::text, true
  );
end;
$$;

set local role authenticated;
do $$
declare
  v_event record;
  v_owner uuid;
  v_client uuid;
  v_audit uuid;
  v_entity uuid := gen_random_uuid();
  v_before bigint;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid() and role = 'owner';

  select count(*) into v_before from public.audit_logs;

  for v_event in
    select *
    from (values
      ('traveller.client_confirmed', 'traveller'),
      ('traveller.details_corrected', 'traveller'),
      ('traveller.unusual_dates_confirmed', 'traveller'),
      ('passport_draft.uploaded', 'passport_draft'),
      ('passport_draft.extraction_saved', 'passport_draft'),
      ('passport_draft.confirmed', 'passport_draft'),
      ('case.passenger_assigned', 'case'),
      ('case.passenger_removed', 'case'),
      ('document.linked', 'payment'),
      ('document.linked', 'ticket'),
      ('client.created', 'traveller')
    ) as events(action, entity_type)
  loop
    begin
      perform public.record_operational_audit(
        v_event.action,
        v_event.entity_type,
        v_entity,
        '{}'::jsonb
      );

      raise exception 'TEST FAILED: protected or mismatched event accepted: %',
        v_event.action;
    exception when raise_exception then
      if sqlerrm <> 'Unsupported operational audit event' then
        raise;
      end if;
    end;
  end loop;

  if (select count(*) from public.audit_logs) <> v_before then
    raise exception 'TEST FAILED: rejected events left audit rows';
  end if;

  -- Exercise one allowed event without changing the client record.
  select id into strict v_client
  from public.clients order by id limit 1;

  v_audit := public.record_operational_audit(
    'client.updated',
    'client',
    v_client,
    '{"synthetic_rollback_test": true}'::jsonb
  );

  if not exists (
    select 1 from public.audit_logs
    where id = v_audit
      and actor_id = v_owner
      and user_id = v_owner
      and action = 'client.updated'
      and entity_type = 'client'
      and entity_id = v_client
      and details = '{"synthetic_rollback_test": true}'::jsonb
  ) then
    raise exception 'TEST FAILED: allowed audit event incorrect';
  end if;

  if (select count(*) from public.audit_logs) <> v_before + 1 then
    raise exception 'TEST FAILED: allowed event created unexpected audit rows';
  end if;
end;
$$;

reset role;

select 'Protected audit events rejected; allowed event and actor attribution passed'
  as result;