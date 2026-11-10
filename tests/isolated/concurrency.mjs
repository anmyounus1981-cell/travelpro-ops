import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const config={host:'127.0.0.1',port:55432,user:'postgres',database:'travelpro_regression'};
const clients=await Promise.all(['scheduler','dispatcher','observer'].map(async name=>{const c=new Client({...config,application_name:`isolated-${name}`});await c.connect();await c.query("set statement_timeout='8s'; set lock_timeout='5s'");return c;}));
const [s,d,o]=clients,owner='00000000-0000-4000-8000-000000000002';
const call=(c,id)=>c.query('select schedule_booking_ttl_reminders($1) n',[id]);
async function beginOwner(){await s.query('begin; set local role authenticated');await s.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);}
async function fixture(label){
 const b=(await o.query("insert into bookings(case_id,pnr,pnr_source,quoted_amount,ttl,ttl_source,user_id) select id,$1,'gds',1,now()+interval '3 hours','isolated fixture','00000000-0000-0000-0000-000000000001' from cases order by id limit 1 returning id",[label])).rows[0].id;
 await beginOwner();await call(s,b);await s.query('commit');
 await o.query("insert into reminders(rule_id,entity_type,entity_id,reminder_type,due_at,message,channel,audience,dedupe_key,user_id) select r.id,'booking',b.id,'ttl',b.ttl-r.threshold_minutes*interval '1 minute','ISOLATED overdue','in_app','owner','ttl:'||b.id::text||':'||r.threshold_minutes||':in_app:owner:'||extract(epoch from b.ttl)::bigint,b.user_id from bookings b cross join reminder_rules r where b.id=$1 and r.threshold_minutes=1440 and r.channel='in_app' and r.audience='owner'",[b]);return b;
}
async function waitBlocked(pid){for(let i=0;i<80;i++){const r=await o.query('select wait_event_type from pg_stat_activity where pid=$1',[pid]);if(r.rows[0]?.wait_event_type==='Lock')return;await delay(25);}throw Error('Expected actual PostgreSQL lock wait was not observed');}
try{
 const reversal=await fixture('REV001');
 await beginOwner();const original=(await s.query("select id,dedupe_key from reminders where entity_id=$1 and due_at>now() order by id",[reversal])).rows;
 await s.query("update bookings set ttl=ttl+interval '1 day' where id=$1",[reversal]);await call(s,reversal);
 await s.query("update bookings set ttl=ttl-interval '1 day' where id=$1",[reversal]);assert.equal((await call(s,reversal)).rows[0].n,original.length);
 assert.deepEqual((await s.query("select id,dedupe_key from reminders where entity_id=$1 and status='scheduled' order by id",[reversal])).rows,original);
 assert.equal((await call(s,reversal)).rows[0].n,0);await s.query('commit');
 console.log('PASS TTL A-B-A restores original cancelled IDs in production-shaped PostgreSQL');
 const a=await fixture('LCK001');await beginOwner();await call(s,a);
 assert.equal((await d.query('select dispatch_due_ttl_reminders(100) n')).rows[0].n,0);
 await s.query('commit');assert.equal((await d.query('select dispatch_due_ttl_reminders(100) n')).rows[0].n,1);
 console.log('PASS scheduler holds reminder locks; dispatcher SKIP LOCKED; delivery resumes once');
 const b=await fixture('LCK002');await d.query('begin');assert.equal((await d.query('select dispatch_due_ttl_reminders(100) n')).rows[0].n,1);
 await beginOwner();const pid=(await s.query('select pg_backend_pid() pid')).rows[0].pid;
 const pending=call(s,b);await waitBlocked(pid);await d.query('commit');await pending;await s.query('commit');
 assert.equal((await o.query("select count(*)::int n from reminders where entity_id=$1 and status='delivered'",[b])).rows[0].n,1);
 console.log('PASS dispatcher holds lock; scheduler waits, then preserves committed delivery');
 const c=await fixture('LCK003');await beginOwner();await call(s,c);
 await d.query('begin; set local role authenticated');await d.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
 const dp=(await d.query('select pg_backend_pid() pid')).rows[0].pid;const pending2=call(d,c);await waitBlocked(dp);await s.query('commit');assert.equal((await pending2).rows[0].n,0);await d.query('commit');
 console.log('PASS concurrent same-booking schedulers serialize with no duplicate insert');
 // Genuine simultaneous dispatcher calls on separate connections.
 const results=await Promise.all([s.query('select dispatch_due_ttl_reminders(100) n'),d.query('select dispatch_due_ttl_reminders(100) n')]);
 assert.equal(results.reduce((sum,r)=>sum+r.rows[0].n,0),1);
 for(const id of [a,b,c]){
  assert.equal((await o.query("select count(*)::int n from owner_alerts where entity_id=$1 and dedupe_key like 'ttl-reminder:%'",[id])).rows[0].n,1);
  assert.equal((await o.query("select count(*)::int n from reminder_attempts a join reminders r on r.id=a.reminder_id where r.entity_id=$1",[id])).rows[0].n,1);
 }
 console.log('PASS concurrent dispatchers create exactly one alert/attempt per due reminder');
}finally{for(const c of clients){await c.query('rollback').catch(()=>{});await c.end();}}
