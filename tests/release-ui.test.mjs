import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {bookingReference} from '../lib/booking-reference.mjs';
import * as environment from '../lib/environment.mjs';
const require=createRequire(import.meta.url);
function loadPage(path,db,mode='staging'){
 const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,process:{env:{NEXT_PUBLIC_OPS_ENV:mode}},require:(name)=>{
  if(name==='next/link') return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
  if(name==='@/lib/supabase/server') return {createClient:async()=>{if(!db)throw Error('Financial page queried DB');return db;}};
  if(name==='@/app/actions')return new Proxy({}, {get:()=>()=>{}});
  if(name==='@/lib/environment.mjs')return environment;
  if(name==='@/lib/booking-reference.mjs')return {bookingReference};
  return require(name);
 }});
 return module.exports.default;
}
for(const page of ['payments','tickets'])test(`${page} staging page has notice and no actionable form`,async()=>{
 const html=renderToStaticMarkup(await loadPage(`app/${page}/page.tsx`)());
 assert.match(html,/SIMULATION ONLY/);assert.doesNotMatch(html,/<form|<select|<input|<button/);
});
test('reminder selector and card render null fallback, channel and audience',async()=>{
 const rows={cases:[{id:'case',case_number:'SIM-TEST99',origin:'DAC',destination:'BKK'}],bookings:[{id:'booking',case_id:'case',pnr:null,status:'unticketed',}],reminders:[{id:'reminder',entity_type:'booking',entity_id:'booking',reminder_type:'ttl',channel:'in_app',audience:'owner',due_at:'2026-11-07T15:00:00Z',message:'SIMULATION TEST99',status:'scheduled'}],owner_alerts:[]};
 const db={from(table){const query={select(){return query},order(){return query},in(){return query},limit(){return query},then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve)}};return query;}};
 const html=renderToStaticMarkup(await loadPage('app/reminders/page.tsx',db)());
 assert.match(html,/Booking reference unavailable/);assert.match(html,/Channel: in_app/);assert.match(html,/Audience: owner/);
 assert.doesNotMatch(html,/PNR null|> —/);
});
function database(rows={}){return {from(table){const q={select(columns){assert.doesNotMatch(columns,/execution_mode|is_simulation|simulation_reference/);return q},order(){return q},eq(){return q},in(){return q},limit(){return q},then(resolve){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve)}};return q}};}
for(const page of ['payments','tickets','bookings','reminders'])test(`${page}: production retains operational forms without simulation columns`,async()=>{
 const html=renderToStaticMarkup(await loadPage(`app/${page}/page.tsx`,database(),'production')());
 assert.doesNotMatch(html,/SIMULATION ONLY/);assert.match(html,/<form/);
});
test('explicit modes only activate practice UI; unknown mode cannot authorize live actions',()=>{
 assert.equal(environment.isPracticeEnvironment(undefined),false);assert.equal(environment.isPracticeEnvironment('production'),false);
 for(const mode of ['staging','development'])assert.equal(environment.isPracticeEnvironment(mode),true);
 assert.doesNotThrow(()=>environment.assertLiveOperations('production'));
 for(const mode of [undefined,'staging','development','garbage'])assert.throws(()=>environment.assertLiveOperations(mode));
});
test('app origin rejects credentials, paths, queries and HTTP, and normalizes host',()=>{
 assert.equal(environment.normalizeAppOrigin('https://EXAMPLE.com/'),'https://example.com');
 for(const url of ['http://example.com','https://example.com/path','https://a:b@example.com','https://example.com/?q=a','https://example.com/#x',''])assert.throws(()=>environment.normalizeAppOrigin(url));
});
