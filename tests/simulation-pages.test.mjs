import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {bookingReference} from '../lib/booking-reference.mjs';
const require=createRequire(import.meta.url);
function loadPage(path,db){
 const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,process:{env:{NEXT_PUBLIC_OPS_ENV:'staging'}},require:(name)=>{
  if(name==='next/link') return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
  if(name==='@/lib/supabase/server') return {createClient:async()=>{if(!db)throw Error('Financial page queried DB');return db;}};
  if(name==='@/app/actions')return {createReminder:()=>{},updateOwnerAlert:()=>{}};
  if(name==='@/lib/booking-reference.mjs')return {bookingReference};
  return require(name);
 }});
 return module.exports.default;
}
for(const page of ['payments','tickets'])test(`${page} staging page has notice and no actionable form`,async()=>{
 const html=renderToStaticMarkup(await loadPage(`app/${page}/page.tsx`)());
 assert.match(html,/SIMULATION ONLY/);assert.doesNotMatch(html,/<form|<select|<input|<button/);
});
test('reminder selector and card render simulation reference, channel and audience',async()=>{
 const rows={cases:[{id:'case',case_number:'SIM-TEST99',origin:'DAC',destination:'BKK'}],bookings:[{id:'booking',case_id:'case',pnr:null,status:'unticketed',execution_mode:'simulation',simulation_reference:'TEST99'}],reminders:[{id:'reminder',entity_type:'booking',entity_id:'booking',reminder_type:'ttl',channel:'in_app',audience:'owner',due_at:'2026-11-07T15:00:00Z',message:'SIMULATION TEST99',status:'scheduled'}],owner_alerts:[]};
 const db={from(table){const query={select(){return query},order(){return query},in(){return query},limit(){return query},then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve)}};return query;}};
 const html=renderToStaticMarkup(await loadPage('app/reminders/page.tsx',db)());
 assert.match(html,/SIMULATION TEST99/);assert.match(html,/Channel: in_app/);assert.match(html,/Audience: owner/);
 assert.doesNotMatch(html,/PNR null|> —/);
});
