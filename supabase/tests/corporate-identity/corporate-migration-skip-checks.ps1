$ErrorActionPreference = 'Stop'

$migrationPath = 'supabase\migrations\20261008201359_corporate_client_identity_enforcement.sql'
$migrationSql = Get-Content -LiteralPath $migrationPath -Raw
$skipSql = $migrationSql

$reviewedIds = @(
  'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'
  '7f9ea86e-13b1-4a23-8e28-970f8a741af2'
  '16c950ac-895c-4bde-9534-3f69f7acdd59'
  'f528c626-f42b-42f9-b280-8b81cd6309c3'
  '00000000-0000-0000-0000-000000000001'
)

foreach ($reviewedId in $reviewedIds) {
  $skipSql = $skipSql.Replace(
    $reviewedId,
    [guid]::NewGuid().ToString()
  )
}
$beforeSql = @'
create temporary table corporate_skip_snapshot (
  table_name text primary key,
  rows_before jsonb not null
);

do $$
declare
  v_table text;
  v_rows jsonb;
begin
  foreach v_table in array array[
    'clients', 'travellers', 'cases',
    'passport_extraction_drafts', 'inquiries',
    'case_travellers', 'audit_logs'
  ] loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.id),
       ''[]''::jsonb) from public.%I t',
      v_table
    ) into v_rows;

    insert into corporate_skip_snapshot
    values (v_table, v_rows);
  end loop;
end;
$$;

drop index public.clients_corporate_name_unique;
'@
$afterSql = @'
do $$
declare
  v_snapshot record;
  v_rows jsonb;
begin
  for v_snapshot in
    select * from corporate_skip_snapshot
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.id),
       ''[]''::jsonb) from public.%I t',
      v_snapshot.table_name
    ) into v_rows;

    if v_rows is distinct from v_snapshot.rows_before then
      raise exception 'TEST FAILED: skip changed %',
        v_snapshot.table_name;
    end if;
  end loop;

  if to_regclass('public.clients_corporate_name_unique') is null then
    raise exception 'TEST FAILED: corporate unique index missing';
  end if;

  if to_regprocedure(
    'public.lookup_corporate_traveller(uuid,text)'
  ) is null then
    raise exception 'TEST FAILED: lookup function missing';
  end if;
end;
$$;

select
  'Absent reviewed IDs skipped maintenance; records unchanged; index and lookup preserved'
  as result;
'@
$testPath = Join-Path $env:TEMP (
  "travelpro-corporate-skip-" + [guid]::NewGuid() + ".sql"
)

try {
  @(
    'BEGIN;'
    $migrationSql
    $beforeSql
    $skipSql
    $afterSql
    'ROLLBACK;'
  ) -join "`n" |
    Set-Content -LiteralPath $testPath -Encoding utf8

  npx --yes supabase@2.119.0 db query --linked --file $testPath
  $testExit = $LASTEXITCODE

  if ($testExit -ne 0) {
    throw "Migration skip test failed: $testExit"
  }

  Write-Host "Migration skip test exit code: $testExit"
}
finally {
  Remove-Item -LiteralPath $testPath -ErrorAction SilentlyContinue
}