// Dispatch registered page-load actions with synthetic reads. This does not run Appsmith's server scheduler.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {compileAppsmithCollection} from '../scripts/appsmith-js-object.mjs';
const root=new URL('../pages/',import.meta.url),email='synthetic-startup@example.invalid';
const person='10000000-0000-4000-8000-000000000001',member='20000000-0000-4000-8000-000000000001';
const actor={person_id:person,member_id:member,email,first_name:'Synthetic',last_name:'Fixture',is_directory_manager:true,is_document_reviewer:true,is_donations_reviewer:true,is_practitioner:true,can_intake:true,can_member_functions:true,can_practitioner_admin:true,can_release:true,can_contributor_functions:true,can_cash_deposits:true,can_page:true};
let registrations=0;
for(const page of fs.readdirSync(root)) {
 const pageRoot=new URL(encodeURIComponent(page)+'/',root),calls=[],alerts=[];
 const c={console:{log(){},error(){}},appsmith:{user:{email:''},store:{},URL:{pathname:'/synthetic/'+page,queryParams:{person_id:person,organization_id:person}},mode:'DEPLOYED'},showAlert:(text,type)=>alerts.push({text,type}),storeValue:async(k,v)=>{c.appsmith.store[k]=v;},setTimeout:fn=>{c.appsmith.user.email=email;fn();},resetWidget:async()=>{},navigateTo:()=>{},selAgreementType:{selectedOptionValue:''}};
 function widgets(directory) {
  for(const item of fs.readdirSync(directory,{withFileTypes:true})) {
   const file=new URL(encodeURIComponent(item.name)+(item.isDirectory()?'/':''),directory);
   if(item.isDirectory())widgets(file);
   else if(item.name.endsWith('.json')) {
    const widget=JSON.parse(fs.readFileSync(file,'utf8'));
    if(widget.widgetName)c[widget.widgetName]={selectedOptionValue:'',selectedOptionValues:[],selectedRow:{},selectedRows:[],files:[],formData:{},text:'',isChecked:false,selectedDate:null};
   }
  }
 }
 widgets(new URL('widgets/',pageRoot));
 const actions=[];
 for(const folder of fs.readdirSync(new URL('queries/',pageRoot))) {
  const file=new URL('queries/'+encodeURIComponent(folder)+'/metadata.json',pageRoot);if(!fs.existsSync(file))continue;
  const d=JSON.parse(fs.readFileSync(file,'utf8')),a=d.unpublishedAction;actions.push(d);
  if(['qPageAccess','qCurrentFacilitator','qNavigationAccess','qNavigationTerminology'].includes(a.name)) {
   assert.equal(a.runBehaviour,'MANUAL',page+' authority read must wait for its initializer');
   assert.equal(a.userSetOnLoad,true,page+' deliberate authority-read mode');
  }
  if(d.pluginType==='JS')continue;
  c[a.name]={data:[],run:async()=>{
   calls.push(a.name);
   let rows=[];
   if(['qNavigationAccess','qPageAccess','qCurrentFacilitator','qTerminologyAccess'].includes(a.name))rows=[{...actor}];
   else if(['qIndividualProfile','qCompanyProfile'].includes(a.name))rows=[{party_id:person}];
   else if(a.name==='qPartyDirectory')rows=[{party_id:person,party_kind:'individual',member_id:member,display_name:'Synthetic fixture'}];
   else if(a.name==='qCashDepositCashOnHand')rows=[{donation_id:person,operational_status:'cash_on_hand'}];
   c[a.name].data=rows;return rows;
  }};
 }
 const collections=new Map();
 for(const folder of fs.readdirSync(new URL('jsobjects/',pageRoot))) {
  const metaFile=new URL('jsobjects/'+encodeURIComponent(folder)+'/metadata.json',pageRoot);if(!fs.existsSync(metaFile))continue;
  const meta=JSON.parse(fs.readFileSync(metaFile,'utf8')),name=meta.unpublishedCollection.name;
  const source=fs.readFileSync(new URL('jsobjects/'+encodeURIComponent(folder)+'/'+encodeURIComponent(name)+'.js',pageRoot),'utf8');
  c[name]=compileAppsmithCollection(source,page+'/'+name).runInNewContext(c);collections.set(meta.id,{name,object:c[name]});
 }
 const pageLoads=actions.filter(d=>d.pluginType==='JS'&&d.unpublishedAction.runBehaviour==='ON_PAGE_LOAD');
 const deniedFile=new URL('widgets/txtAccessDenied.json',pageRoot);
 if(c.qPageAccess && fs.existsSync(deniedFile) && JSON.parse(fs.readFileSync(deniedFile,'utf8')).isVisible.includes('qPageAccess.data')) {
  const visibility=JSON.parse(fs.readFileSync(deniedFile,'utf8')).isVisible;
  const evaluate=()=>vm.runInNewContext(visibility.slice(2,-2),c);
  assert.equal(evaluate(),false,page+' missing response is loading, not denied');
  c.appsmith.user.email=email;
  c.qPageAccess.data=[{...actor,is_document_reviewer:false,is_donations_reviewer:false,is_practitioner:false,is_directory_manager:false,can_page:false,can_intake:false,can_cash_deposits:false,can_contributor_functions:false,can_member_functions:false,can_practitioner_admin:false,can_release:false}];
  assert.equal(evaluate(),true,page+' completed denied response remains denied');
  c.qPageAccess.data=[];c.appsmith.user.email='';
 }
 assert.ok(pageLoads.some(d=>d.unpublishedAction.fullyQualifiedName==='navigationLabels.initialize'),page+' navigation initializer registered');
 await Promise.all(pageLoads.map(async d=>{
  const a=d.unpublishedAction,collection=collections.get(a.collectionId);
  assert.ok(collection,page+' collection lookup');assert.equal(a.fullyQualifiedName,collection.name+'.'+a.name);
  assert.equal(a.userSetOnLoad,true);assert.equal(a.clientSideExecution,true);assert.equal(a.actionConfiguration.isAsync,true);
  assert.ok(a.actionConfiguration.body.startsWith('async '));new vm.Script('('+a.actionConfiguration.body+')');
  assert.equal(typeof collection.object[a.name],'function');registrations++;
  await collection.object[a.name]();
 }));
 await Promise.resolve();await Promise.resolve();
 assert.equal(c.navigationLabels.accessState().status,'ready',page+' cold sign-in menu readiness');
 assert.equal(c.qNavigationAccess.data[0].is_directory_manager,true);
 assert.ok(!alerts.some(a=>a.type==='error'),page+' startup errors: '+JSON.stringify(alerts));
 if(page==='Directory'){assert.ok(calls.includes('qPartyDirectory'));assert.equal(c.qPartyDirectory.data.length,1);}
 if(page==='Cash Deposits'){assert.ok(calls.includes('qCashDepositCashOnHand'));assert.equal(c.qCashDepositCashOnHand.data.length,1);}
 if(page==='Reports')assert.ok(calls.includes('qCurrentFacilitator'),'Reports authority must run automatically');
 if(c.qPageAccess)assert.ok(calls.includes('qPageAccess'),page+' current page authority loaded');
 if(page==='Individual Profile')assert.equal(c.IndividualProfileFlows.isReady(),true);
 if(page==='Company Profile')assert.equal(c.CompanyProfileFlows.isReady(),true);
 console.log('PASS registered cold startup: '+page);
}
// Bound retries, degraded labels, persistent access failure and stale accounts/routes.
function navFixture() {
 const calls=[];const c={appsmith:{user:{email},store:{},URL:{pathname:'/synthetic'}},storeValue:async(k,v)=>{c.appsmith.store[k]=v;},setTimeout:fn=>fn(),qNavigationAccess:{data:[],run:async()=>{calls.push('access');c.qNavigationAccess.data=[actor];return [actor];}},qNavigationTerminology:{data:[],run:async()=>{calls.push('labels');return [];}}};
 c.navigationLabels=compileAppsmithCollection(fs.readFileSync(new URL('../navigation/labels.js',import.meta.url),'utf8')).runInNewContext(c);return {c,calls,f:c.navigationLabels};
}
{const x=navFixture(),run=x.c.qNavigationAccess.run;let n=0;x.c.qNavigationAccess.run=async()=>{if(++n===1)throw Error('synthetic cold lookup');return run();};await x.f.initialize();assert.equal(n,2);assert.equal(x.f.accessState().status,'ready');}
{const x=navFixture();let n=0;x.c.qNavigationAccess.run=async()=>{n++;throw Error('synthetic persistent lookup');};await x.f.initialize();assert.equal(n,2);assert.equal(x.f.accessState().status,'error');assert.equal(x.calls.length,0);}
{const x=navFixture();x.c.qNavigationTerminology.run=async()=>{throw Error('synthetic label lookup');};await x.f.initialize();assert.equal(x.f.accessState().status,'ready');assert.equal(x.f.text('Member Functions'),'Participant Functions');}
{const x=navFixture();x.c.qNavigationAccess.run=async()=>[];await x.f.initialize();assert.equal(x.f.accessState().status,'unlinked');}
for(const change of ['account','route']) {const x=navFixture();let resolve;x.c.qNavigationAccess.run=()=>new Promise(r=>resolve=r);const pending=x.f.initialize();for(let i=0;i<12&&!resolve;i++)await Promise.resolve();assert.ok(resolve);if(change==='account')x.c.appsmith.user.email='other-synthetic@example.invalid';else x.c.appsmith.URL.pathname='/another';resolve([actor]);await pending;assert.equal(x.f.accessState().status,'loading');assert.equal(x.calls.length,0);}
console.log('PASS '+registrations+' registered startup dispatches; transient/persistent read failure, default labels, unlinked account and account/route isolation; deployed scheduling remains unverified');
