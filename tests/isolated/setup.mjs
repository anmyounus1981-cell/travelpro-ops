import fs from 'node:fs';
import assert from 'node:assert/strict';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const config={host:'127.0.0.1',port:55432,user:'postgres',database:'postgres'};
const admin=new Client(config);await admin.connect();
// Fixed local-only endpoint and database; never accept a hosted connection string.
const exists=await admin.query("select 1 from pg_database where datname='travelpro_regression'");
if(exists.rowCount) { assert.ok(process.argv.includes('--reset-local'),'Existing local fixture requires --reset-local'); await admin.query('drop database travelpro_regression with (force)'); }
await admin.query("create database travelpro_regression encoding 'UTF8' template template0");await admin.end();
const db=new Client({...config,database:'travelpro_regression'});await db.connect();
try{
 await db.query(fs.readFileSync('tests/isolated/platform.sql','utf8'));
 for(const name of fs.readdirSync('supabase/migrations').sort()){
  if(name.includes('production_ttl_security'))continue;
  if(name.startsWith('20261007191905')) { await db.query('begin'); await db.query(fs.readFileSync('supabase/tests/review-write-enforcement/review-preparation-compatibility-checks.sql','utf8')); await db.query('rollback'); console.log('PASS preparation compatibility at its intended pre-cutover checkpoint'); }
  if(name.startsWith('20261008201359')) await db.query(fs.readFileSync('tests/isolated/historical-prerequisites.sql','utf8'));
  let sql=fs.readFileSync(`supabase/migrations/${name}`,'utf8');
  // Only the local cron extension is substituted by a schedule-recording contract.
  sql=sql.replace(/create extension if not exists pg_cron;/ig,'-- local cron contract');
  await db.query(sql);console.log('APPLIED',name);
  if(name.startsWith('20260924163450')) await db.query("insert into auth.users values('00000000-0000-4000-8000-000000000002','isolated-owner@example.invalid'); update app_users set auth_user_id='00000000-0000-4000-8000-000000000002' where id='00000000-0000-0000-0000-000000000001'");
 }
 await db.query(fs.readFileSync('tests/isolated/operational-prerequisites.sql','utf8'));
 const catalog=JSON.parse(fs.readFileSync('tests/fixtures/production-function-catalog.json','utf8'));
 for(const f of catalog){
  await db.query(f.definition);
  await db.query(`revoke execute on function public.${f.signature} from public,anon,authenticated,service_role`);
  for(const grant of f.acl.slice(1,-1).split(',')){
   const [role,right]=grant.split('=');assert.match(right,/^X\/postgres$/);
   await db.query(`grant execute on function public.${f.signature} to ${role||'public'}`);
  }
  assert.equal((await db.query('select md5(pg_get_functiondef($1::regprocedure)) hash',[f.signature])).rows[0].hash,f.definition_md5);
 }
 await db.query(fs.readFileSync('supabase/migrations/20261109174031_production_ttl_security_reliability.sql','utf8'));
 console.log('PASS exact candidate migration on complete application migration chain');
 console.log('PostgreSQL', (await db.query('select version()')).rows[0].version);
}finally{await db.end();}
