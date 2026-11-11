const fs=require('fs');const assert=require('assert');
assert.equal(process.env.VERCEL_ENV,'preview');
assert.equal(process.env.NEXT_PUBLIC_OPS_ENV,'staging');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,'zkrpbcxukbtbsakcepxv');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://zkrpbcxukbtbsakcepxv.supabase.co');
function edit(path,old,value){let s=fs.readFileSync(path,'utf8');assert.equal(s.split(old).length,2,path);fs.writeFileSync(path,s.replace(old,value));}
const helper="\nexport function temporaryStagingWindow() { return process.env.NEXT_PUBLIC_OPS_ENV === 'staging' && process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF === 'zkrpbcxukbtbsakcepxv' && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://zkrpbcxukbtbsakcepxv.supabase.co' && Date.now() < Date.parse('2026-11-11T20:30:00Z'); }\n";
fs.appendFileSync('lib/environment.mjs',helper);
edit('lib/environment.mjs',"if (mode !== 'production') throw","if (mode !== 'production' && !temporaryStagingWindow()) throw");
for(const p of ['app/payments/page.tsx','app/tickets/page.tsx']){
edit(p,'import { isPracticeEnvironment }','import { isPracticeEnvironment, temporaryStagingWindow }');
edit(p,'if (isPracticeEnvironment(process.env.NEXT_PUBLIC_OPS_ENV))','if (isPracticeEnvironment(process.env.NEXT_PUBLIC_OPS_ENV) && !temporaryStagingWindow())');
}
edit('app/layout.tsx','SIMULATION — NOT A CONFIRMED BOOKING. No payments, ticketing or client messaging.','TEMPORARY SYNTHETIC E2E — STAGING ONLY. No real funds, tickets or client messaging. Window expires 2026-11-11 20:30 UTC.');

