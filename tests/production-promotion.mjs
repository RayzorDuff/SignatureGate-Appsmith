// Source-only promotion checks; API calls below are synthetic stubs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const baseline=JSON.parse(read('config/v120_promotion_baseline.json'));
const identities={};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(fileURLToPath(new URL('pages',root)))) {
 if(!file.endsWith('.json'))continue;
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 const identity=Object.fromEntries(['id','gitSyncId','widgetId','widgetName','parentId'].filter(k=>k in d).map(k=>[k,d[k]]));
 if(Object.keys(identity).length)identities[path.relative(fileURLToPath(root),file)]=identity;
}
// Python's sorted compact JSON spelling, shared with the pinned baseline.
const canonical=Object.fromEntries(Object.keys(identities).sort().map(k=>[k,Object.fromEntries(Object.entries(identities[k]).sort(([a],[b])=>a.localeCompare(b)))]));
assert.equal(Object.keys(canonical).length,baseline.identityCount);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),baseline.identitySHA256,'Native identities changed');
const target=JSON.parse(read('config/internal_service_routing.json')).application_target;
assert.equal(target.erp_mode,'production');assert.equal(target.live_binding_verified,false);
assert.equal(fs.existsSync(new URL('datasources/signaturegate-postgres-test.json',root)),false);
const body=read('pages/Cash Deposits/queries/apiSyncCashDepositToERPNext/apiSyncCashDepositToERPNext.txt');
assert.match(body,/this.params.mode \|\| "production"/);
assert.equal(JSON.parse(read('pages/Cash Deposits/queries/apiSyncCashDepositToERPNext/metadata.json')).unpublishedAction.actionConfiguration.body,body);
const source=read('pages/Cash Deposits/jsobjects/cashDepositFlows/cashDepositFlows.js');
assert.equal((source.match(/mode: "production"/g)||[]).length,2);
for(const status of ['succeeded','failed']) {
 const sync=[];const c={showAlert:()=>{},storeValue:async()=>{},appsmith:{store:{}},
 apiSyncCashDepositToERPNext:{run:async p=>{sync.push(p);return {data:{ok:status==='succeeded',status}};}}};
 const f=vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),c);
 f.selectedBatch=()=>({deposit_batch_id:'synthetic',status:'confirmed',erp_sync_status:status});
 f.requireDonationsReviewer=()=> 'synthetic';f.refresh=async()=>{};
 await f.retryERPSync();assert.equal(sync.length,status==='succeeded'?0:1);
 if(sync.length)assert.equal(sync[0].mode,'production');
}
console.log('PASS production candidate: native identities retained, exclusive production SQL descriptor, confirm/retry/fallback modes, succeeded retry guard; no network calls');
