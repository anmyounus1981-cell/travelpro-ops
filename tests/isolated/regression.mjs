import fs from 'node:fs';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const db=new Client({host:'127.0.0.1',port:55432,user:'postgres',database:'travelpro_regression'});await db.connect();
const root='supabase/tests';
const grouped=[
 ['returning-traveller/individual-account-checks.sql','returning-traveller/individual-multitrip-checks.sql'],
 ['returning-traveller/returning-individual-draft-checks.sql','returning-traveller/returning-individual-draft-negative-checks.sql','returning-traveller/returning-individual-draft-audit-rollback-checks.sql'],
 ['returning-traveller/returning-corporate-draft-checks.sql','returning-traveller/returning-corporate-draft-negative-checks.sql','returning-traveller/returning-corporate-draft-audit-rollback-checks.sql'],
 ['returning-traveller/linked-nonowner-checks.sql']
];
for(const dir of ['review-write-enforcement','client-selection','corporate-identity'])for(const file of fs.readdirSync(`${root}/${dir}`).filter(x=>x.endsWith('.sql') && x!=='review-preparation-compatibility-checks.sql'))grouped.push([`${dir}/${file}`]);
let passed=0,failed=0;
try{for(const files of grouped){
 await db.query('begin');
 try{for(const file of files)await db.query(fs.readFileSync(`${root}/${file}`,'utf8'));console.log('PASS',files.join(' + '));passed++;}
 catch(e){console.log('FAIL',files.join(' + '),e.message);failed++;}
 finally{await db.query('rollback');}
}console.log(JSON.stringify({passed,failed,groups:grouped.length}));process.exitCode=failed?1:0;}finally{await db.end();}
