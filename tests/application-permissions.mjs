// Artificial browser fixtures; no operational names, contacts or amounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
{
 const alerts=[],context={qMemberWriteAccess:{run:async()=>[{allowed:true}]},showAlert:(message,level)=>alerts.push(level)};
 const flows=vm.runInNewContext(text('pages/Member Functions/jsobjects/memberProfile/memberProfile.js').replace(/^export default/,'globalThis.memberProfile ='),context);
 await flows.openPaperUpload();
 assert.deepEqual(alerts,['warning'],'unvalidated upload sends no file and invokes no API');
 assert.equal(JSON.parse(text('pages/Member Functions/widgets/UploadRelease.json')).isDisabled,true);
}
const email=JSON.parse(text('pages/Intake/widgets/frmIntake/inpIntakeEmail.json')).validation.slice(2,-2);
for(const address of ['sample.s@example.invalid','sample+tag@sub.example.invalid','user_name@sub-domain.example.invalid',''])assert.equal(vm.runInNewContext(email,{inpIntakeEmail:{text:address}}),true,address);
for(const address of ['not-an-address','a@@example.invalid','a b@example.invalid','a@example'])assert.equal(vm.runInNewContext(email,{inpIntakeEmail:{text:address}}),false,address);
{
 const alerts=[],context={appsmith:{store:{}},storeValue:async(k,v)=>context.appsmith.store[k]=v,qPageAccess:{run:async()=>[{can_intake:false}]},showAlert:(m,l)=>alerts.push(l)};
 const intake=vm.runInNewContext(text('pages/Intake/jsobjects/intakeFlows/intakeFlows.js').replace(/^export default/,'globalThis.intakeFlows ='),context);
 await intake.submit();assert.deepEqual(alerts,['info','error'],'Participant denied before form access or mutation');
}
async function cashCase({allowed=true,reviewer=false,refreshFail=false,writeFail=false}={}){
 const calls={writes:0,alerts:[],queue:0};
 const context={appsmith:{user:{email:'synthetic@example.invalid'},store:{}},
 qPageAccess:{run:async()=>[{can_contributor_functions:allowed,is_document_reviewer:allowed,is_donations_reviewer:reviewer}]},
 selDonationMember:{selectedOptionValue:'__anonymous__'},inpDonationAmount:{text:'1'},inpDonationDate:{selectedDate:'2026-01-01'},inpDonationNotes:{text:''},
 qInsertCashDonation:{run:async()=>{calls.writes++;if(writeFail)throw Error('Synthetic write error');return [{donation_id:'synthetic-donation'}];}},
 qMemberDonations:{run:async()=>{if(refreshFail)throw Error('Synthetic refresh error');return [];}},
 qPendingGivebutterDonations:{run:async()=>{calls.queue++;return [];}},
 showAlert:(message,level)=>calls.alerts.push({message,level}),console:{error:()=>{},log:()=>{}}};
 const flows=vm.runInNewContext(text('pages/Contributor Functions/jsobjects/cashDonationFlows/cashDonationFlows.js').replace(/^export default/,'globalThis.cashDonationFlows ='),context);
 const id=await flows.submitDonation();return {id,calls};
}
{
 const {id,calls}=await cashCase();assert.equal(id,'synthetic-donation');assert.equal(calls.writes,1);assert.equal(calls.queue,0);assert.equal(calls.alerts.length,1);assert.equal(calls.alerts[0].level,'success');
}
{
 const {id,calls}=await cashCase({refreshFail:true});assert.equal(id,'synthetic-donation');assert.equal(calls.writes,1);assert.equal(calls.alerts.length,1);assert.equal(calls.alerts[0].level,'warning');assert.match(calls.alerts[0].message,/do not record it again/i);
}
{
 const {id,calls}=await cashCase({writeFail:true});assert.equal(id,'');assert.equal(calls.alerts.length,1);assert.equal(calls.alerts[0].level,'error');
}
{
 const {calls}=await cashCase({allowed:false});assert.equal(calls.writes,0);assert.equal(calls.alerts.length,1);assert.equal(calls.alerts[0].level,'error');
}
{
 const own='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 const actor={person_id:'synthetic-person',member_id:own,email:'synthetic@example.invalid',can_member_functions:true,is_document_reviewer:false,is_donations_reviewer:false};
 const context={appsmith:{user:{email:actor.email},store:{member_id:other,facilitator_is_donations_reviewer:true},URL:{queryParams:{member_id:other}},mode:'PUBLISHED'},
 qPageAccess:{data:[actor],run:async()=>[actor]},qCurrentFacilitator:{run:async()=>[actor]},qMembersDirectory:{run:async()=>[{member_id:own}]},
 qMemberAccessCheck:{run:async()=>[{allowed:true}]},qMemberWriteAccess:{run:async()=>[{allowed:false}]},
 storeValue:async(k,v)=>{context.appsmith.store[k]=v;},showAlert:()=>{},navigateTo:()=>{throw Error('Permission denial navigated away');},console,setTimeout};
 const flows=vm.runInNewContext(text('pages/Member Functions/jsobjects/memberProfile/memberProfile.js').replace(/^export default/,'globalThis.memberProfile ='),context);
 flows.refresh=async()=>[];await flows.init();assert.equal(context.appsmith.store.member_id,own);assert.equal(context.appsmith.store.facilitator_is_donations_reviewer,false);
}
const releaseAction=JSON.parse(text('pages/Sacrament Release/queries/apiListAvailableProducts/metadata.json')).unpublishedAction;
assert.equal(releaseAction.runBehaviour,'MANUAL');assert.equal(releaseAction.userSetOnLoad,true,'explicit Manual choice must persist before authorized scope load');
console.log('PASS email validation, Participant Intake denial/self scope, singular cash alerts and release on-load isolation');
