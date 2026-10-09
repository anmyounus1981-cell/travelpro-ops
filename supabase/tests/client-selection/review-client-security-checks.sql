do $$
declare
  v_function regprocedure :=
    'public.create_client_with_review(uuid,text,text,text,text,text)'::regprocedure;
begin
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'TEST FAILED: anonymous RPC access allowed';
  end if;

  if not has_function_privilege(
    'authenticated', v_function, 'EXECUTE'
  ) then
    raise exception 'TEST FAILED: authenticated RPC access missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_function
      and prosecdef
      and 'search_path=""' = any(proconfig)
  ) then
    raise exception 'TEST FAILED: definer model or fixed search_path missing';
  end if;
end;
$$;

-- Use an identity with no app_users profile.
select set_config(
  'request.jwt.claim.sub',
  (
    select candidate::text
    from (
      select gen_random_uuid() as candidate
    ) identities
    where not exists (
      select 1 from public.app_users
      where auth_user_id = identities.candidate
    )
  ),
  true
);

set local role authenticated;

do $$
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: non-owner identity missing';
  end if;

  begin
    perform public.create_client_with_review(
      gen_random_uuid(), 'corporate',
      'SYNTHETIC UNAUTHORIZED COMPANY',
      'SYNTHETIC CONTACT', null, null
    );
    raise exception 'TEST FAILED: non-owner creation accepted';
  exception when raise_exception then
    if sqlerrm <> 'Owner access required' then
      raise;
    end if;
  end;
end;
$$;

reset role;

-- An authenticated database role without a user identity.
select set_config('request.jwt.claim.sub', '', true);

set local role authenticated;

do $$
begin
  if auth.uid() is not null then
    raise exception 'TEST FAILED: identity was not cleared';
  end if;

  begin
    perform public.create_client_with_review(
      gen_random_uuid(), 'individual', null,
      'SYNTHETIC UNAUTHENTICATED CLIENT', null, null
    );
    raise exception 'TEST FAILED: missing identity accepted';
  exception when raise_exception then
    if sqlerrm <> 'Authentication required' then
      raise;
    end if;
  end;
end;
$$;

reset role;

select
  'RPC permissions, fixed search_path, non-owner and missing identity checks passed'
  as result;