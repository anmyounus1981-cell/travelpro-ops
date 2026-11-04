import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { bookingMode, simulationReference } from '../lib/booking-mode.mjs';

const source = readFileSync(new URL('../app/actions.ts', import.meta.url),'utf8');
const action = source.slice(source.indexOf('export async function createBooking('),source.indexOf('export async function uploadPayment('));
const javascript = ts.transpileModule(action.replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function setup({denied=false,rpcError=null}={}) {
  const calls=[];
  const context=vm.createContext({bookingMode,simulationReference,
    process:{env:{NEXT_PUBLIC_OPS_ENV:'staging',NEXT_PUBLIC_SUPABASE_PROJECT_REF:'zkrpbcxukbtbsakcepxv'}},
    createClient:async()=>({from(){throw Error('Simulation must not use live insert path');},async rpc(name,args){calls.push({name,args});return {error:rpcError};}}),
    requireOwnerId:async()=>{if(denied)throw Error('Owner access required');return 'owner';},
    text:(fd,key)=>String(fd.get(key)||'').trim(),parseDhakaDateTime:s=>new Date(s+'+06:00'),
    revalidatePath:()=>{},audit:()=>{throw Error('Audit must remain atomic in RPC');},
  });
  vm.runInContext(javascript,context);
  const fd=new FormData();
  for(const [k,v] of Object.entries({case_id:'case',quotation_id:'quote',simulation_reference:'test99',pnr:'REALPNR',pnr_source:'gds',execution_mode:'live',quoted_amount:'117000',ttl:'2099-01-01T18:00'}))fd.set(k,v);
  return {calls,fd,run:()=>context.createBooking(fd)};
}
test('simulation action ignores forged live mode, PNR and supplier source',async()=>{
  const x=setup();await x.run();assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].name,'create_simulation_booking');
  assert.equal(x.calls[0].args.p_reference,'TEST99');
  assert.equal(x.calls[0].args.p_ttl,'2099-01-01T12:00:00.000Z');
  assert.equal('pnr' in x.calls[0].args,false);
});
test('non-owner stops before simulation RPC',async()=>{
  const x=setup({denied:true});await assert.rejects(x.run(),/Owner access/);assert.equal(x.calls.length,0);
});
test('RPC failure is not reported as booking success',async()=>{
  const x=setup({rpcError:new Error('Quotation mismatch')});await assert.rejects(x.run(),/Quotation mismatch/);
});
test('invalid deadline stops before RPC',async()=>{
  const x=setup();x.fd.set('ttl','invalid');await assert.rejects(x.run(),/deadline/);assert.equal(x.calls.length,0);
});
