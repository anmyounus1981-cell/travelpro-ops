import fs from 'node:fs';
import assert from 'node:assert/strict';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const db=new Client({host:'127.0.0.1',port:55432,user:'postgres',database:'travelpro_regression'});await db.connect();
const rows=JSON.parse(fs.readFileSync('tests/fixtures/production-function-catalog.json','utf8'));
const sig='schedule_booking_ttl_reminders(uuid)';
const literal=s=>"E'"+s.replaceAll('\\','\\\\').replaceAll("'","''").replaceAll('\r','\\r').replaceAll('\n','\\n')+"'";
try{
 const candidate=(await db.query('select md5(pg_get_functiondef($1::regprocedure)) hash',[sig])).rows[0].hash;
 assert.notEqual(candidate,rows.find(x=>x.signature===sig).definition_md5);
 let sql=`-- Captured from production zhqdssbysdebgeijscvm, read-only, 2026-11-10.\n-- NOT APPLIED TO PRODUCTION. Separate authorization required.\n-- One-step function/grant rollback only; this does not undo reminder data changes.\n-- Restores the old scheduler behavior and grants, including its known defects.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\nDO $rollback$ BEGIN\n`;
 for(const row of rows){
  const expectedAcl=(await db.query('select proacl::text acl from pg_proc where oid=$1::regprocedure',[row.signature])).rows[0].acl;
  sql+=` IF (select array_agg(a::text order by a::text) from pg_proc p, unnest(p.proacl) a where p.oid='public.${row.signature}'::regprocedure) IS DISTINCT FROM (select array_agg(a::text order by a::text) from unnest('${expectedAcl}'::aclitem[]) a) THEN RAISE EXCEPTION 'Rollback refused: grant drift ${row.signature}'; END IF;\n`;
  const hash=row.signature===sig?candidate:row.definition_md5;sql+=` IF md5(pg_get_functiondef('public.${row.signature}'::regprocedure)) <> '${hash}' THEN RAISE EXCEPTION 'Rollback refused: function drift ${row.signature}'; END IF;\n`;}
 sql+='END $rollback$;\n';
 for(const row of rows.filter(x=>!x.signature.startsWith('dispatch_'))){
  sql+=`DO $restore$ BEGIN EXECUTE ${literal(row.definition)}; END $restore$;\n`;
  sql+=`REVOKE EXECUTE ON FUNCTION public.${row.signature} FROM PUBLIC, anon, authenticated, service_role;\n`;
  for(const grant of row.acl.slice(1,-1).split(',')){const [role,right]=grant.split('=');assert.match(right,/^X\/postgres$/);sql+=`GRANT EXECUTE ON FUNCTION public.${row.signature} TO ${role||'PUBLIC'};\n`;}
 }
 sql+='COMMIT;\n';fs.mkdirSync('supabase/rollback',{recursive:true});fs.writeFileSync('supabase/rollback/20261110_restore_pre_pr18_functions.sql',sql);
 // Exercise the exact artifact, then compare definitions and effective grants.
 await db.query(sql);
 for(const row of rows){
  assert.equal((await db.query('select md5(pg_get_functiondef($1::regprocedure)) hash',[row.signature])).rows[0].hash,row.definition_md5);
  for(const role of ['anon','authenticated','service_role','postgres']){
   const expected=row.acl.includes(`${role}=X/`)||row.acl.includes('{=X/')||row.acl.includes(',=X/');
   assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,row.signature])).rows[0].ok,expected);
  }
 }
 // Reapplying a rollback to the old function must refuse drift.
 await assert.rejects(()=>db.query(sql),/Rollback refused/);await db.query('rollback');
 console.log('PASS exact rollback restores all four function hashes and original effective grants');
 await db.query(fs.readFileSync('supabase/migrations/20261109174031_production_ttl_security_reliability.sql','utf8'));
 assert.equal((await db.query('select md5(pg_get_functiondef($1::regprocedure)) hash',[sig])).rows[0].hash,candidate);
 console.log('PASS candidate reapplication after rollback; candidate scheduler MD5',candidate);
}finally{await db.end();}
