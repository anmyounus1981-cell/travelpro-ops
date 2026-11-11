import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {assertLiveOperations} from '../../lib/environment.mjs';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const pg=new Client({host:'127.0.0.1',port:55432,user:'postgres',database:'travelpro_regression'});await pg.connect();
const identity='00000000-0000-4000-8000-000000000002';
const ident=s=>{assert.match(s,/^[a-z_][a-z_0-9]*$/);return '"'+s+'"';};
const value=v=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
// Replace only the transport with PostgreSQL queries; all app writes, RPC bodies,
// table constraints, triggers, RLS and immutable audit operations execute for real.
const db={auth:{getUser:async()=>({data:{user:{id:identity}},error:null})},
 from(table){let columns='*',op='select',payload,filters=[],order='',limit='',result;
 const q={select(c='*'){columns=c.split(',').map(x=>x.trim()==='*'?'*':ident(x.trim())).join(',');return q;},insert(v){op='insert';payload=v;return q;},update(v){op='update';payload=v;return q;},delete(){op='delete';return q;},eq(k,v){filters.push([k,'=',v]);return q;},in(k,v){filters.push([k,'in',v]);return q;},order(k,{ascending=true}={}){order=` order by ${ident(k)} ${ascending?'asc':'desc'}`;return q;},limit(n){assert.ok(Number.isInteger(n));limit=` limit ${n}`;return q;},single(){return run(true,true);},maybeSingle(){return run(true,false);},then(a,b){return run(false,false).then(a,b);}};
 async function run(single,required){if(result)return result;result=(async()=>{try{
 const params=[],bind=v=>{params.push(value(v));return '$'+params.length;};
 let sql;
 if(op==='insert'){const entries=Object.entries(payload).filter(([,v])=>v!==undefined);sql=`insert into public.${ident(table)} (${entries.map(([k])=>ident(k)).join(',')}) values (${entries.map(([,v])=>bind(v)).join(',')})`;}
 else if(op==='update')sql=`update public.${ident(table)} set `+Object.entries(payload).filter(([,v])=>v!==undefined).map(([k,v])=>`${ident(k)}=${bind(v)}`).join(',');
 else sql=`${op==='delete'?'delete':'select '+columns} from public.${ident(table)}`;
 if(filters.length)sql+=' where '+filters.map(([k,kind,v])=>kind==='in'?`${ident(k)} in (${v.map(bind).join(',')})`:`${ident(k)}=${bind(v)}`).join(' and ');
 sql+=op==='select'?order+limit:' returning '+columns;
 const r=await pg.query(sql,params);if(single&&(r.rowCount>1||(required&&r.rowCount!==1)))throw Error('Single-row contract failed');return {data:single?r.rows[0]??null:r.rows,error:null};
 }catch(error){return {data:null,error};}})();return result;}return q;
 },async rpc(name,args){try{const entries=Object.entries(args);const r=await pg.query(`select public.${ident(name)}(${entries.map(([k],i)=>`${ident(k)} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>value(v)));return {data:r.rows[0].value,error:null};}catch(error){return {data:null,error};}}
};
const source=fs.readFileSync('app/actions.ts','utf8');
const ast=ts.createSourceFile('actions.ts',source,ts.ScriptTarget.Latest,true);
const names=['createCase','createQuotation','transitionQuotation','requireOwnerId','createBooking','uploadPayment','verifyPayment','recordTicket','parseDhakaDateTime'];
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,''));
assert.equal(functions.length,names.length);
const countsModule={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/passenger-counts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:countsModule,exports:countsModule.exports});
let redirected='';
const ctx=vm.createContext({process:{env:{NEXT_PUBLIC_OPS_ENV:'production'}},assertLiveOperations,createClient:async()=>db,text:(fd,k)=>String(fd.get(k)??'').trim(),readPassengerCounts:countsModule.exports.readPassengerCounts,crypto:{randomUUID},parseGdsItinerary:()=>[],revalidatePath:()=>{},redirect:url=>{redirected=url;},
 // Storage HTTP is outside this SQL integration; insert owned metadata for document RPC checks.
 upload:async(fd,key,bucket)=>{if(key==='e_ticket')return null;const path=`isolated-${randomUUID()}.pdf`;await pg.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',[bucket,path,identity,{mimetype:'application/pdf'}]);return path;},
 audit:async(action,type,id,details={})=>{const r=await db.rpc('record_operational_audit',{p_action:action,p_entity_type:type,p_entity_id:id,p_details:details});if(r.error)throw r.error;assert.match(r.data,/^[a-f0-9-]{36}$/);},Date,Number,Error});
vm.runInContext(ts.transpileModule(functions.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
const form=v=>{const f=new FormData();for(const[k,val]of Object.entries(v))f.set(k,val);return f;};
try{
 await pg.query('begin; set local role authenticated');await pg.query("select set_config('request.jwt.claim.sub',$1,true)",[identity]);
 const client=await db.rpc('create_client_with_review',{p_request_id:randomUUID(),p_client_type:'corporate',p_company_name:'ISOLATED WORKFLOW '+randomUUID(),p_contact_name:'Synthetic Owner',p_contact_email:null,p_contact_phone:null});if(client.error)throw client.error;
 await ctx.createCase(form({client_id:client.data,client_type:'corporate',origin:'DAC',destination:'BKK',departure_date:'2099-12-01',trip_type:'oneway',adult_count:'1',child_count:'0',infant_count:'0',cabin_class:'Economy',intake_source:'manual'}));
 const caseId=new URL(redirected,'https://example.invalid').searchParams.get('case');assert.ok(caseId);
 await ctx.createQuotation(form({case_id:caseId,itinerary_text:'SYNTHETIC FIXTURE',base_fare:'100000',taxes:'15000',service_fee:'2000',expiry_date:'2099-11-30T12:00:00Z'}));
 const quote=(await pg.query('select id from quotations where case_id=$1',[caseId])).rows[0].id;
 await ctx.transitionQuotation(form({id:quote,status:'approved'}));
 assert.equal((await pg.query('select approved_by from quotations where id=$1',[quote])).rows[0].approved_by,'00000000-0000-0000-0000-000000000001');
 await ctx.createBooking(form({case_id:caseId,quotation_id:quote,pnr:'OWN123',pnr_source:'gds',ttl:'2099-11-30T18:00',ttl_source:'synthetic GDS reference',quoted_amount:'117000'}));
 const booking=(await pg.query("select id from bookings where pnr='OWN123'")).rows[0].id;
 assert.ok((await pg.query("select count(*)::int n from reminders where entity_id=$1 and status='scheduled'",[booking])).rows[0].n>0);
 await assert.rejects(()=>ctx.recordTicket(form({booking_id:booking,ticket_number:'9990000000001',issue_date:'2099-11-01',final_amount:'117000'})),/Payment must be verified/);
 await ctx.uploadPayment(form({booking_id:booking,amount:'117000'}));
 const payment=(await pg.query('select id from payments where booking_id=$1',[booking])).rows[0].id;
 await ctx.verifyPayment(form({id:payment,status:'verified',verification_note:'SYNTHETIC TEST ONLY'}));
 await ctx.recordTicket(form({booking_id:booking,ticket_number:'9990000000001',issue_date:'2099-11-01',final_amount:'117000'}));
 assert.equal((await pg.query('select status from bookings where id=$1',[booking])).rows[0].status,'ticketed');
 assert.equal((await pg.query('select status from cases where id=$1',[caseId])).rows[0].status,'ticketed');
 assert.equal((await pg.query("select count(*)::int n from reminders where entity_id=$1 and status='scheduled'",[booking])).rows[0].n,0);
 assert.equal((await pg.query('select issued_by from tickets where booking_id=$1',[booking])).rows[0].issued_by,'00000000-0000-0000-0000-000000000001');
 assert.ok((await pg.query('select count(*)::int n from audit_logs where entity_id=any($1::uuid[])',[[caseId,quote,booking,payment]])).rows[0].n>=5);
 console.log('PASS owner Client -> Case -> Quotation Approval -> non-null PNR Booking -> TTL -> Payment Evidence -> Verification -> Ticket Record using actual Server Actions and PostgreSQL');
 console.log('PASS unverified payment cannot issue ticket record; ticketed booking cancels reminders; owner attribution and audit persisted within test transaction');
}finally{await pg.query('rollback');await pg.end();}
