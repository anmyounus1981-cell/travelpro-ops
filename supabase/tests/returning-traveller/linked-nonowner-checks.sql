-- BEGIN ... ROLLBACK only. Creates a synthetic linked consultant identity.
do $$
declare
  v_auth uuid := gen_random_uuid();
  v_email text := 'synthetic-returning-' || v_auth::text || '@example.invalid';
begin
  insert into auth.users (id, email) values (v_auth, v_email);
  insert into public.app_users (name, email, role, auth_user_id)
  values ('SYNTHETIC RETURNING CONSULTANT', v_email, 'consultant', v_auth);
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
end; $$;

set local role authenticated;
do $$
declare v_type text;
begin
  foreach v_type in array array['individual', 'corporate'] loop
    begin
      execute format('select public.lookup_%I_traveller(null, null)', v_type);
      raise exception 'TEST FAILED: linked consultant lookup accepted';
    exception when raise_exception then
      if sqlerrm <> 'Owner access required' then raise; end if;
    end;
    begin
      execute format('select public.confirm_returning_%I_passport_draft(null, null, null, null, null, null, null, null, null, null, null)', v_type);
      raise exception 'TEST FAILED: linked consultant confirmation accepted';
    exception when raise_exception then
      if sqlerrm <> 'Owner access required' then raise; end if;
    end;
  end loop;
end; $$;
reset role;
select 'Linked consultant rejected by individual and corporate lookup and confirmation functions' as result;
