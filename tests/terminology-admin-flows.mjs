import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const page=new URL('../pages/Terminology Administration/',import.meta.url);
const source=fs.readFileSync(new URL('jsobjects/terminologyAdminFlows/terminologyAdminFlows.js',page),'utf8');
function fixture(access={allowed:true,account_active:true}) {
 const calls={read:0,write:[],alerts:[]};
 const c={appsmith:{user:{email:'synthetic-manager@example.invalid'},store:{}},setTimeout:fn=>fn(),
 storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(message,level)=>calls.alerts.push({message,level}),
 qTerminologyAccess:{run:async()=>[access]},qTerminology:{run:async()=>{calls.read++;return [];}},qSetTerminology:{run:async p=>{calls.write.push(p);return [{changed:true}];}},
 selTerminologyConcept:{selectedOptionValue:'participant'},inpTermSingular:{text:'Participant'},inpTermPlural:{text:'Participants'},inpTermShort:{text:''},selTermActive:{selectedOptionValue:'true'},inpTermReason:{text:'Synthetic test'}};
 return {c,calls,f:vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),c)};
}
{
 const x=fixture();assert.equal(x.f.hasAccess(),false);await x.f.initialize();assert.equal(x.f.hasAccess(),true);assert.equal(x.calls.read,1);
 x.c.appsmith.user.email='synthetic-other@example.invalid';assert.equal(x.f.hasAccess(),false);
}
for(const [access,status] of [[{allowed:false,account_active:true},'denied'],[{allowed:false,account_active:false},'unlinked']]) {
 const x=fixture(access);await x.f.initialize();assert.equal(x.f.accessState().status,status);assert.equal(x.calls.read,0);await x.f.save();assert.equal(x.calls.write.length,0);
}
{
 const x=fixture();let attempts=0;x.c.qTerminologyAccess.run=async()=>{if(++attempts===1)throw Error('Synthetic transient');return [{allowed:true,account_active:true}];};
 await x.f.initialize();assert.equal(attempts,2);assert.equal(x.f.hasAccess(),true);
 x.c.qTerminologyAccess.run=async()=>{throw Error('Synthetic persistent');};await x.f.initialize();assert.equal(x.f.accessState().status,'error');assert.match(x.f.accessMessage(),/could not be checked/);
}
{
 const x=fixture();let resolve;x.c.qTerminologyAccess.run=()=>new Promise(r=>resolve=r);const prior=x.f.initialize();for(let i=0;i<8&&!resolve;i++)await Promise.resolve();assert.ok(resolve);
 x.c.appsmith.user.email='synthetic-other@example.invalid';resolve([{allowed:true,account_active:true}]);await prior;assert.equal(x.f.hasAccess(),false);assert.equal(x.calls.read,0);
}
{
 const x=fixture();await x.f.initialize();x.c.qTerminology.run=async()=>{throw Error('Synthetic refresh');};await x.f.save();assert.equal(x.calls.write.length,1);assert.equal(x.calls.alerts.at(-1).level,'warning');assert.match(x.calls.alerts.at(-1).message,/do not repeat/);
}
{
 const x=fixture();let attempts=0;x.c.qTerminology.run=async()=>{if(++attempts===1)throw Error('Synthetic cold label read');return [];};
 await x.f.initialize();assert.equal(attempts,2);assert.equal(x.f.hasAccess(),true);
 x.c.qTerminology.run=async()=>{throw Error('Synthetic persistent label failure');};await x.f.initialize();
 assert.equal(x.f.accessState().status,'data_error');assert.match(x.f.accessMessage(),/access is verified/);assert.equal(x.f.hasAccess(),false);
}
{
 const x=fixture();let finish;x.c.qTerminology.run=()=>new Promise(r=>finish=r);const pending=x.f.initialize();
 for(let i=0;i<12&&!finish;i++)await Promise.resolve();assert.ok(finish);assert.equal(x.f.accessState().status,'loading_terms');assert.equal(x.f.hasAccess(),false);
 x.c.appsmith.user.email='synthetic-different@example.invalid';finish([]);await pending;assert.equal(x.f.hasAccess(),false);
}
{
 const x=fixture();x.c.inpTermReason.text=' ';await x.f.save();assert.equal(x.calls.write.length,0);
 x.c.appsmith.store.terminology_busy=true;await x.f.save();assert.equal(x.calls.write.length,0);
}
for(const [name,mode] of [['terminologyAdminFlows-initialize','ON_PAGE_LOAD'],['qTerminologyAccess','MANUAL'],['qTerminology','MANUAL'],['qSetTerminology','MANUAL']]) {
 const a=JSON.parse(fs.readFileSync(new URL('queries/'+name+'/metadata.json',page),'utf8')).unpublishedAction;assert.equal(a.runBehaviour,mode);assert.equal(a.userSetOnLoad,true);
}
console.log('PASS Terminology: page-load execution, account-bound snapshots, bounded read retry, denial/error distinction, validation, denied writes and saved-refresh warning');
