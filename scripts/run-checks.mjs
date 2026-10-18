// Reproducible source/controller checks and disposable in-memory PostgreSQL fixtures.
// Never connects to Docker, Appsmith, operational databases or external services.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const allowed=new Set(['--source-only','--sql-only','--schema']);
let schema=path.resolve(root,'../SignatureGate/db/schema.sql');
for(let i=0;i<args.length;i++) {
 if(!allowed.has(args[i]))throw Error('Unknown option: '+args[i]);
 if(args[i]==='--schema') {if(!args[++i])throw Error('--schema requires a file');schema=path.resolve(args[i]);}
}
if(args.includes('--source-only')&&args.includes('--sql-only'))throw Error('Choose source-only or sql-only, not both');
function run(command,args) {
 const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
const sqlTests=new Set(['atomic-intake-sql.mjs','application-authorization-sql.mjs','intake-flows.mjs','reporting-sql.mjs']);
if(!args.includes('--sql-only')) {
 run('python3',['tests/navigation-generation.py']);
 run('python3',['scripts/generate-navigation.py','--check']);
 for(const script of ['check-binding-syntax.mjs','check-page-load-registration.mjs','check-navigation-routes.mjs'])run(process.execPath,['scripts/'+script]);
 for(const name of fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.mjs')&&!sqlTests.has(n)).sort())run(process.execPath,['tests/'+name]);
}
if(!args.includes('--source-only')) {
 if(!fs.existsSync(schema))throw Error('Canonical schema not found; check out SignatureGate beside this repository or pass --schema /path/to/schema.sql');
 const runtime=path.join(root,'node_modules/@electric-sql/pglite/dist');
 if(!fs.existsSync(runtime))throw Error('Run npm ci --ignore-scripts before SQL checks');
 for(const name of sqlTests)run(process.execPath,['tests/'+name,path.join(runtime,'index.js'),path.join(runtime,'contrib/uuid_ossp.js'),schema]);
}
console.log('PASS requested automated checks; deployed renderer, PostgreSQL 16 upgrade and external delivery remain separate gates');
