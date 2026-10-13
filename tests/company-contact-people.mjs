// Artificial SDK fixtures; company links do not enroll or grant system permissions.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Company Profile/jsobjects/CompanyProfileFlows/CompanyProfileFlows.js',import.meta.url),'utf8');
function fixture({allowed=true,reason='Synthetic company contact',writeFail=false,refreshFail=false,delay=false}={}) {
 let finish;const wait=delay?new Promise(resolve=>finish=resolve):Promise.resolve();
 const calls={writes:[],alerts:[]};const context={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},appsmith:{user:{email:'synthetic-company-editor@example.invalid'},URL:{queryParams:{organization_id:'synthetic-company'}},store:{company_contact_people_organization:'synthetic-company',company_profile_state:{id:'synthetic-company',email:'synthetic-company-editor@example.invalid',status:'ready'}}},
 qCompanyProfile:{data:[{party_id:'synthetic-company'}]},qCompanyContactPeopleAccess:{run:async()=>[{can_manage:allowed}]},
 qCompanyContactPeople:{data:[{organization_id:'synthetic-company',person_id:'synthetic-archived',status:'archived',updated_at:'synthetic-version'}],run:async()=>{if(refreshFail)throw Error('Synthetic refresh error');return [];}},
 qCompanyContactCandidates:{data:[{person_id:'synthetic-person'},{person_id:'synthetic-archived'}],run:async()=>[]},
 inpCompanyContactPersonReason:{text:reason},selCompanyContactPerson:{selectedOptionValue:'synthetic-person'},tblCompanyContactPeople:{selectedRow:{}},
 qSetCompanyContactPerson:{run:async params=>{calls.writes.push(params);await wait;if(writeFail)throw Error('Synthetic write error');return [{organization_contact_person_id:'synthetic-link'}];}},
 storeValue:async(k,v)=>{context.appsmith.store[k]=v;},resetWidget:async()=>{},showAlert:(message,level)=>calls.alerts.push({message,level})};
 const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.CompanyProfileFlows ='),context);return {flows,context,calls,finish};
}
{
 const f=fixture();await f.flows.linkContactPerson();assert.equal(f.calls.writes.length,1);assert.equal(f.calls.writes[0].expected_updated_at,'');assert.equal(f.calls.writes[0].active,true);assert.deepEqual(f.calls.alerts.map(x=>x.level),['success']);
}
{
 const f=fixture();f.context.selCompanyContactPerson.selectedOptionValue='synthetic-archived';await f.flows.linkContactPerson();assert.equal(f.calls.writes[0].expected_updated_at,'synthetic-version','reactivation carries optimistic version');
}
{
 const f=fixture();f.context.qCompanyContactPeople.data[0].status='active';f.context.tblCompanyContactPeople.selectedRow={person_id:'synthetic-archived'};await f.flows.archiveContactPerson();assert.equal(f.calls.writes[0].active,false);assert.equal(f.calls.writes[0].expected_updated_at,'synthetic-version');
}
for(const kind of ['role','blank','route','profile','candidate','missingload','account-change']) {
 const f=fixture({allowed:kind!=='role',reason:kind==='blank'?'  ':'Synthetic'});
 if(kind==='route')f.context.appsmith.URL.queryParams.organization_id='synthetic-other-company';
 if(kind==='profile')f.context.qCompanyProfile.data[0].party_id='synthetic-other-company';
 if(kind==='candidate')f.context.selCompanyContactPerson.selectedOptionValue='synthetic-forged-person';
 if(kind==='missingload')f.context.appsmith.store.company_contact_people_organization=null;
 if(kind==='account-change')f.context.qCompanyContactPeopleAccess.run=async()=>{f.context.appsmith.user.email='synthetic-changed@example.invalid';return [{can_manage:true}];};
 await f.flows.linkContactPerson();assert.equal(f.calls.writes.length,0,'no write: '+kind);
}
for(const kind of ['write','refresh']) {
 const f=fixture({writeFail:kind==='write',refreshFail:kind==='refresh'});await f.flows.linkContactPerson();assert.equal(f.calls.writes.length,1);assert.deepEqual(f.calls.alerts.map(x=>x.level),[kind==='write'?'error':'warning']);
}
{
 const f=fixture({delay:true});const first=f.flows.linkContactPerson();await f.flows.linkContactPerson();f.finish();await first;assert.equal(f.calls.writes.length,1,'in-flight duplicate click suppressed');
}
console.log('PASS company contact controller: link/archive/reactivate version, role/route/profile/account guards, reasons, duplicate click and single write/refresh outcome');
