do $$
declare
  v_role text;
  v_function text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_function in array array[
      'public.prevent_reminder_attempt_change()',
      'public.rls_auto_enable()'
    ] loop
      if has_function_privilege(
        v_role, v_function, 'EXECUTE'
      ) then
        raise exception
          'TEST FAILED: % can execute %',
          v_role, v_function;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1
    from pg_proc
    where oid =
      'public.prevent_reminder_attempt_change()'::regprocedure
      and 'search_path=""' = any(proconfig)
  ) then
    raise exception 'TEST FAILED: fixed search_path missing';
  end if;
end;
$$;

-- Temporary fixture to verify trigger enforcement.
create temporary table reminder_trigger_test (
  id integer primary key,
  note text
);

insert into reminder_trigger_test
values (1, 'Synthetic rollback test');

create trigger reminder_trigger_test_guard
before update or delete on reminder_trigger_test
for each row
execute function public.prevent_reminder_attempt_change();

grant select, update, delete on reminder_trigger_test
to authenticated;

set local role authenticated;

do $$
begin
  begin
    update pg_temp.reminder_trigger_test
    set note = 'Attempted change'
    where id = 1;

    raise exception 'TEST FAILED: trigger allowed UPDATE';
  exception when raise_exception then
    if sqlerrm <> 'Reminder attempts are append-only' then
      raise;
    end if;
  end;

  begin
    delete from pg_temp.reminder_trigger_test
    where id = 1;

    raise exception 'TEST FAILED: trigger allowed DELETE';
  exception when raise_exception then
    if sqlerrm <> 'Reminder attempts are append-only' then
      raise;
    end if;
  end;

  if not exists (
    select 1 from pg_temp.reminder_trigger_test
    where id = 1
      and note = 'Synthetic rollback test'
  ) then
    raise exception 'TEST FAILED: fixture changed';
  end if;
end;
$$;

reset role;

select
  'Internal function access blocked; reminder trigger still rejects updates and deletes'
  as result;