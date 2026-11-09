import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Pinned test-only dependency: npm install --prefix /tmp/travelpro-tests @electric-sql/pglite@0.3.14
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const sql=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const migration=fs.readdirSync('supabase/migrations').find(p=>p.endsWith('_production_ttl_security_reliability.sql'));
const id='00000000-0000-4000-8000-000000000003', owner='00000000-0000-4000-8000-000000000002';
const call=`select public.schedule_booking_ttl_reminders('${id}') n`;
async function setup(){
 const db=new PGlite(); await db.exec(sql('./fixtures/scheduler-schema.sql'));
 for(const f of ['schedule_booking_ttl_reminders','prevent_audit_change','prevent_proposal_snapshot_change','dispatch_due_ttl_reminders']) await db.exec(sql(`./fixtures/${f}.sql`));
 await db.exec(`grant execute on function schedule_booking_ttl_reminders(uuid),prevent_audit_change(),prevent_proposal_snapshot_change() to anon,authenticated,service_role;
 revoke execute on function dispatch_due_ttl_reminders(integer) from public,anon,authenticated; grant execute on function dispatch_due_ttl_reminders(integer) to service_role;
 create trigger audit_immutable before update or delete on audit_logs for each row execute function prevent_audit_change();
 create trigger proposal_immutable before update on proposal_versions for each row execute function prevent_proposal_snapshot_change();`);
 await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
 return db;
}
async function asOwner(db){await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);}
async function n(db){return (await db.query(call)).rows[0].n;}
async function fingerprint(db){return (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'')) f from reminders r`)).rows[0].f;}
test('scheduler permissions, idempotency and dispatcher compatibility on local PostgreSQL',async t=>{
 const db=await setup();try{
 await t.test('anon denied at EXECUTE and service-role direct scheduling revoked',async()=>{
 for(const role of ['anon','service_role']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query(call),e=>e.code==='42501');await db.exec('reset role');}
 });
 await t.test('authenticated missing identity and unmapped user denied',async()=>{
 await db.exec('set role authenticated');await assert.rejects(()=>db.query(call),/Authentication required/);
 await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false)");await assert.rejects(()=>db.query(call),/Owner access required/);await db.exec('reset role');
 });
 await asOwner(db);
 await t.test('owner creates four reminders and repeat preserves complete fingerprint',async()=>{assert.equal(await n(db),4);const before=await fingerprint(db);assert.equal(await n(db),0);assert.equal(await fingerprint(db),before);});
 await t.test('processing reminder aborts without mutation',async()=>{await db.exec("update reminders set status='processing' where id=(select id from reminders limit 1)");const before=await fingerprint(db);await assert.rejects(()=>db.query(call),e=>e.code==='55000');assert.equal(await fingerprint(db),before);await db.exec("update reminders set status='scheduled'");});
 await t.test('TTL change cancels obsolete rows and creates exactly four new schedules',async()=>{await db.exec("update bookings set ttl=ttl+interval '1 day'");assert.equal(await n(db),4);assert.equal((await db.query("select count(*)::int n from reminders where status='cancelled'")).rows[0].n,4);assert.equal(await n(db),0);});
 await t.test('ticketed booking cancels pending reminders, repeat is no-op',async()=>{await db.exec("update bookings set status='ticketed'");assert.equal(await n(db),0);assert.equal((await db.query("select count(*)::int n from reminders where status='scheduled'")).rows[0].n,0);const before=await fingerprint(db);assert.equal(await n(db),0);assert.equal(await fingerprint(db),before);});
 await t.test('future overdue repeat retains scheduled reminders and cron dispatcher runs without owner JWT',async()=>{
 await db.exec("update bookings set status='unticketed',ttl=now()+interval '3 hours'");assert.equal(await n(db),2);
 await db.exec("update reminders set due_at=now()-interval '1 minute',next_attempt_at=now()-interval '1 minute' where status='scheduled'; reset role; select set_config('request.jwt.claim.sub','',false)");
 assert.equal((await db.query('select dispatch_due_ttl_reminders(100) n')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from owner_alerts')).rows[0].n,2);
 assert.equal((await db.query('select dispatch_due_ttl_reminders(100) n')).rows[0].n,0);
 });
 await t.test('trigger EXECUTE revoked but immutability still enforced',async()=>{
 for(const role of ['anon','authenticated'])for(const f of ['prevent_audit_change()','prevent_proposal_snapshot_change()'])assert.equal((await db.query(`select has_function_privilege('${role}','${f}','EXECUTE') ok`)).rows[0].ok,false);
 await db.exec("insert into audit_logs values(gen_random_uuid(),'test')");await assert.rejects(()=>db.exec("delete from audit_logs"),/append-only/);
 });
 }finally{await db.close();}
});
test('overdue unchanged TTL and failed reminders are preserved, terminal history is not resurrected',async()=>{
 const db=await setup();try{
 await asOwner(db);
 await db.exec("update bookings set ttl=now()+interval '3 hours'");assert.equal(await n(db),2);
 // Add an already-overdue rule-consistent row, as if the clock passed after scheduling.
 await db.exec(`insert into reminders(rule_id,entity_type,entity_id,reminder_type,due_at,status,message,channel,audience,attempt_count,max_attempts,next_attempt_at,dedupe_key,user_id)
 select r.id,'booking',b.id,'ttl',b.ttl-r.threshold_minutes*interval '1 minute','scheduled','PNR REAL01','in_app','owner',0,3,b.ttl-r.threshold_minutes*interval '1 minute','overdue-fixture',b.user_id from bookings b cross join reminder_rules r where r.threshold_minutes=1440`);
 await db.exec("update reminders set status='failed',attempt_count=1 where id=(select id from reminders where status='scheduled' and due_at>now() limit 1)");
 const before=await fingerprint(db);assert.equal(await n(db),0);assert.equal(await fingerprint(db),before);
 await db.exec("update reminders set status='dismissed' where due_at>now()");const terminal=await fingerprint(db);assert.equal(await n(db),0);assert.equal(await fingerprint(db),terminal);
 }finally{await db.close();}
});
test('schema drift blocks the migration before grant changes',async()=>{
 const db=await setup();try{
 // A second application sees changed scheduler definition and must stop.
 await assert.rejects(()=>db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8')),/Reviewed function drift/);
 await db.exec('rollback');
 }finally{await db.close();}
});
