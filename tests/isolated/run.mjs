import {spawnSync} from 'node:child_process';
// Run from the repository root against an already running local PostgreSQL 17.
for(const name of ['setup','table-contract','regression','concurrency','live-workflow','rollback']){
 const args=[`tests/isolated/${name}.mjs`];
 if(name==='setup'&&process.argv.includes('--reset-local'))args.push('--reset-local');
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status||1);
}
