// Artificial browser fixtures. No real identities, contacts, provider records or amounts.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../pages/Contributor Functions/jsobjects/cashDonationFlows/cashDonationFlows.js',import.meta.url),'utf8');
const actor='synthetic-reviewer@example.invalid';
function fixture({allowed=true,enroll=true,writeFail=false,refreshFail=false,delayWrite=false}={}) {
 const calls={writes:[],alerts:[],modal:[],nav:[],text:[]};let release;
 const hold=delayWrite?new Promise(resolve=>{release=resolve;}):Promise.resolve();
 const context={appsmith:{user:{email:actor},store:{facilitator_is_donations_reviewer:true}},
 qPageAccess:{run:async()=>[{email:actor,is_donations_reviewer:allowed,is_document_reviewer:enroll,is_directory_manager:enroll}]},
 tblPendingGivebutterDonations:{selectedRow:{donation_id:'synthetic-provider',provider:'givebutter',donor_kind:'unresolved'}},
 inpDonationNotes:{text:'Synthetic review'},chkGivebutterSubscribeListmonk:{isChecked:false},chkShowRejectedDonations:{isChecked:false},
 selDonationMember:{selectedOptionValue:'contributor:synthetic-target'},
 DonationsTable:{selectedRow:{donation_id:'synthetic-other'},processedTableData:[{donation_id:'synthetic-clicked',contributor_id:'synthetic-old',provider:'cash',amount_cents:137,currency:'USD',donated_at:'2026-01-01',status:'verified'}]},
 selReassignDonationMember:{selectedOptionValue:'contributor:synthetic-target',setSelectedOption:async()=>{}},inpDonationReassignReason:{text:'Synthetic correction'},
 txtReassignDonationID:{setText:async value=>calls.text.push(value)},txtReassignDonationContent:{setText:async value=>calls.text.push(value)},
 qMembersDirectory:{data:[],run:async()=>{if(refreshFail)throw Error('Synthetic refresh failure');return [];}},
 qPendingGivebutterDonations:{run:async()=>[]},qMemberDonations:{run:async()=>[]},
 storeValue:async(k,v)=>{context.appsmith.store[k]=v;},resetWidget:async()=>{},
 showModal:async name=>calls.modal.push(['open',name]),closeModal:async name=>calls.modal.push(['close',name]),
 navigateTo:async(...args)=>calls.nav.push(args),showAlert:(message,level)=>calls.alerts.push({message,level})};
 for(const name of ['qLinkDonationToMember','qCreateMemberFromDonation','qReassignDonationMember','qIgnorePendingDonation','qVerifyDonation'])context[name]={run:async params=>{
  calls.writes.push({name,params});await hold;if(writeFail)throw Error('Synthetic write failure');
  return name==='qCreateMemberFromDonation'?[{member_id:'synthetic-created'}]:[{donation_id:params.donation_id}];
 }};
 const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.cashDonationFlows ='),context);
 return {calls,context,flows,release};
}
{
 const f=fixture({allowed:false});await f.flows.linkPendingGivebutterDonation();assert.equal(f.calls.writes.length,0,'stale cached reviewer flag does not authorize');assert.deepEqual(f.calls.alerts.map(x=>x.level),['error']);
}
for(const choice of ['contributor:synthetic-target','member:synthetic-participant','__new_individual__','__new_organization__']) {
 const f=fixture();f.context.selDonationMember.selectedOptionValue=choice;
 await f.flows.linkPendingGivebutterDonation();assert.equal(f.calls.writes.length,1);assert.equal(f.calls.writes[0].params.contributor_choice,choice);assert.deepEqual(f.calls.alerts.map(x=>x.level),['success']);
}
{
 const f=fixture({enroll:false});await f.flows.createMemberFromPendingDonation();assert.equal(f.calls.writes.length,0);assert.equal(f.calls.nav.length,0);
}
{
 const f=fixture();await f.flows.createMemberFromPendingDonation();assert.equal(f.calls.writes[0].params.subscribe_to_mailing_list,false);assert.equal(f.calls.nav[0][0],'Member Functions');assert.deepEqual(f.calls.alerts.map(x=>x.level),['success']);
}
for(const provider of ['givebutter','cash']) {
 const f=fixture();f.context.tblPendingGivebutterDonations.selectedRow.provider=provider;await f.flows.ignorePendingDonation();assert.equal(f.calls.writes[0].params.new_status,provider==='cash'?'rejected':'ignored');assert.equal(f.calls.alerts.length,1);
}
{
 const f=fixture({refreshFail:true});await f.flows.linkPendingGivebutterDonation();assert.equal(f.calls.writes.length,1);assert.deepEqual(f.calls.alerts.map(x=>x.level),['warning']);assert.match(f.calls.alerts[0].message,/do not repeat/i);
}
{
 const f=fixture({writeFail:true});await f.flows.linkPendingGivebutterDonation();assert.equal(f.calls.writes.length,1);assert.deepEqual(f.calls.alerts.map(x=>x.level),['error']);
}
{
 const f=fixture();await f.flows.openReassignModal('synthetic-clicked');assert.equal(f.context.appsmith.store.donation_reassign_row.donation_id,'synthetic-clicked');assert.ok(f.calls.text.some(value=>value.includes('1.37 USD')),'display keeps exact cents');
 await f.flows.reassignDonation();assert.equal(f.calls.writes[0].params.donation_id,'synthetic-clicked');assert.equal(f.calls.writes[0].params.reason,'Synthetic correction');assert.equal(f.context.appsmith.store.donation_reassign_row,null);assert.deepEqual(f.calls.alerts.map(x=>x.level),['success']);
}
for(const failure of ['blank','cancel','account']) {
 const f=fixture();await f.flows.openReassignModal('synthetic-clicked');
 if(failure==='blank')f.context.inpDonationReassignReason.text='   ';
 if(failure==='cancel')await f.flows.clearReassign();
 if(failure==='account')f.context.appsmith.user.email='synthetic-other@example.invalid';
 await f.flows.reassignDonation();assert.equal(f.calls.writes.length,0,failure+' cannot reassign');
}
{
 const f=fixture({delayWrite:true});const first=f.flows.linkPendingGivebutterDonation();await f.flows.linkPendingGivebutterDonation();f.release();await first;assert.equal(f.calls.writes.length,1,'double click cannot duplicate an in-flight review');
}
console.log('PASS fresh review roles, resolution modes, explicit enrollment consent, exact clicked row/cents, reason/cancel/account guards and singular write/refresh outcomes');
