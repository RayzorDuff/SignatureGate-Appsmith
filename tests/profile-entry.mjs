import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const first='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
for(const [page,collection,param,stateKey,query] of [['Individual Profile','IndividualProfileFlows','person_id','individual_profile_state','qIndividualProfile'],['Company Profile','CompanyProfileFlows','organization_id','company_profile_state','qCompanyProfile']]) {
 const root=new URL('../pages/'+page+'/',import.meta.url),source=fs.readFileSync(new URL('jsobjects/'+collection+'/'+collection+'.js',root),'utf8');
 function fixture(id=first) {
  const calls=[];const c={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},appsmith:{user:{email:'synthetic-profile@example.invalid'},URL:{queryParams:id?{[param]:id}:{}},store:{selected_individual_profile_id:first,selected_organization_profile_id:first}},setTimeout:fn=>fn(),showAlert:()=>{},storeValue:async(k,v)=>c.appsmith.store[k]=v};
  for(const name of fs.readdirSync(new URL('queries/',root)))c[name]={data:[],run:async p=>{calls.push({name,p});return [];}};
  c[query].run=async p=>{calls.push({name:query,p});const rows=[{party_id:p.party_id}];c[query].data=rows;return rows;};
  const f=vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),c);return {f,c,calls};
 }
 {const x=fixture();await x.f.load();assert.equal(x.f.isReady(),true);assert.equal(x.c.appsmith.store[stateKey].id,first);assert.ok(x.calls.length>2);assert.equal(x.calls[0].p.party_id,first);}
 for(const [id,status] of [[null,'missing'],['not-a-uuid','invalid']]) {const x=fixture(id);await x.f.load();assert.equal(x.calls.length,0);assert.equal(x.f.state().status,status);assert.equal(x.f.isReady(),false);}
 {const x=fixture();x.c[query].run=async()=>[];await x.f.load();assert.equal(x.f.state().status,'denied');assert.equal(x.calls.length,0);assert.equal(x.f.isReady(),false);}
 {const x=fixture();const run=x.c[query].run;let n=0;x.c[query].run=async p=>{if(++n===1)throw Error('Synthetic cold read');return run(p);};await x.f.load();assert.equal(n,2);assert.equal(x.f.isReady(),true);}
 {const x=fixture();x.c[page==='Individual Profile'?'qIndividualContacts':'qCompanyContacts'].run=async()=>{throw Error('Synthetic secondary read');};await x.f.load();assert.equal(x.f.state().status,'error');assert.equal(x.f.isReady(),false);}
 for(const mode of ['route','account']) {
  const x=fixture();let finish;x.c[query].run=()=>new Promise(r=>finish=r);const pending=x.f.load();for(let i=0;i<10&&!finish;i++)await Promise.resolve();assert.ok(finish);
  if(mode==='route')x.c.appsmith.URL.queryParams[param]=second;else x.c.appsmith.user.email='synthetic-other@example.invalid';
  finish([{party_id:first}]);await pending;assert.equal(x.calls.length,0);assert.equal(x.f.isReady(),false);
 }
 {const x=fixture();let finish;x.c[query].run=p=>p.party_id===first?new Promise(r=>finish=rows=>{x.c[query].data=rows;r(rows);}):Promise.resolve(x.c[query].data=[{party_id:second}]);
  const prior=x.f.load();for(let i=0;i<10&&!finish;i++)await Promise.resolve();assert.ok(finish);x.c.appsmith.URL.queryParams[param]=second;await x.f.load();assert.equal(x.f.isReady(),true);
  finish([{party_id:first}]);await prior;assert.equal(x.c.appsmith.store[stateKey].id,second);assert.equal(x.f.isReady(),false,'late query data must not expose a different selected identity');assert.match(x.f.statusMessage(),/selection changed/);
 }
 assert.equal(JSON.parse(fs.readFileSync(new URL(page+'.json',root),'utf8')).unpublishedPage.isHidden,true);
 for(const p of fs.readdirSync(new URL('queries/',root))) {
  if(!p.startsWith(collection+'-'))continue;const a=JSON.parse(fs.readFileSync(new URL('queries/'+p+'/metadata.json',root),'utf8')).unpublishedAction;
  if(p===collection+'-load')assert.equal(a.runBehaviour,'ON_PAGE_LOAD');
 }
 assert.doesNotMatch(fs.readFileSync(new URL('queries/'+query+'/'+query+'.txt',root),'utf8'),/selected_(individual|organization)_profile_id/);
 console.log('PASS '+page+': explicit/missing/invalid links, no saved-selection fallback, accessible/denied/cold/secondary reads, stale account/route and late A-to-B result isolation');
}
