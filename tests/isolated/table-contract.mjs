import fs from 'node:fs';
import assert from 'node:assert/strict';
const {Client}=await import(process.env.PG_MODULE || 'pg');
const db=new Client({host:'127.0.0.1',port:55432,user:'postgres',database:'travelpro_regression'});await db.connect();
try{const actual=(await db.query(fs.readFileSync('tests/isolated/table-contract.sql','utf8'))).rows;const expected=JSON.parse(fs.readFileSync('tests/fixtures/production-table-contract.json','utf8'));
 for(const table of expected){const local=actual.find(x=>x.table_name===table.table_name);for(const field of ['columns','constraints','rls','policies']){try{assert.deepEqual(local[field],table[field]);console.log('PASS',table.table_name,field);}catch{console.log('MISMATCH',table.table_name,field,JSON.stringify({local:local[field],production:table[field]}));process.exitCode=1;}}}
}finally{await db.end();}
