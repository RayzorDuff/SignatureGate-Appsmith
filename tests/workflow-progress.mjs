import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../pages/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
function memberFixture({allowed=true,fail=false,refreshFail=false,response={ok:true}}={}) {
 const calls={alerts:[],writes:0,api:0};
 const c={appsmith:{store:{},user:{email:'synthetic-reviewer@example.invalid'}},storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(m,l)=>calls.alerts.push({m,l}),
 qMemberWriteAccess:{run:async()=>[{allowed}]},inpEmailAgreementTo:{selectedOptionValue:'synthetic-email'},qMemberEmails:{data:[{member_email_id:'synthetic-email',email:'synthetic-recipient@example.invalid',status:'active'}]},
 qCreatePendingAgreement:{run:async()=>{calls.writes++;return [{member_agreement_id:'synthetic-agreement'}];}},qMemberAgreements:{run:async()=>{if(refreshFail)throw Error('Synthetic refresh');}},
 apiTriggerDocumenso:{run:async()=>{calls.api++;if(fail)throw Error('Synthetic service');return response;}}};
 const f=vm.runInNewContext(read('Member Functions/jsobjects/memberProfile/memberProfile.js').replace(/^export default/,'globalThis.f='),c);
 f._requireMemberId=()=> 'synthetic-member';f._requireFacilitator=()=> 'synthetic-practitioner';f._requireAgreementTemplate=()=> 'synthetic-template';f.auditLog=async()=>{};
 return {f,c,calls};
}
for(const options of [{},{response:{data:{email_sent:true}}},{fail:true},{refreshFail:true},{response:{ok:false}}]) {
 const x=memberFixture(options);await x.f.sendDigitalAgreement();assert.equal(x.calls.writes,1);assert.equal(x.calls.api,1);
 assert.ok(x.calls.alerts.some(a=>/Creating/.test(a.m)));assert.ok(x.calls.alerts.some(a=>/Agreement created/.test(a.m)));
 if(options.fail||options.refreshFail||options.response?.ok===false){assert.equal(x.calls.alerts.at(-1).l,'warning');assert.match(x.calls.alerts.at(-1).m,/do not create another/);}
 else {assert.equal(x.calls.alerts.at(-1).l,'success');assert.equal(x.calls.alerts.some(a=>/email sent/.test(a.m)),options.response?.data?.email_sent===true);}
}
{const x=memberFixture({allowed:false});await x.f.sendDigitalAgreement();assert.equal(x.calls.writes,0);assert.equal(x.calls.api,0);}
{const x=memberFixture();x.c.appsmith.store.member_signing_busy=true;await x.f.sendDigitalAgreement();assert.equal(x.calls.writes,0);}
for(const page of ['Individual Profile','Company Profile']) {
 const path=page==='Individual Profile'?'manageContactsContainer/btnToggleIndividualEmailSubscription.json':'companyContactsContainer/btnToggleCompanyEmailSubscription.json';
 const widget=JSON.parse(read(page+'/widgets/'+path));const code=widget.onClick.slice(2,-2);
 for(const fail of [false,true]) {
  const row={contact_id:'synthetic-email',contact_kind:'email',mailing_subscription_status:'not_subscribed'};const calls=[];
  const c={appsmith:{store:{}},storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(m,l)=>calls.push({m,l}),
  selIndividualContactCapacity:{selectedOptionValue:'member'},selIndividualRoleContactToArchive:{selectedOptionValue:row.contact_id},selCompanyDonorContactToArchive:{selectedOptionValue:row.contact_id},
  qIndividualMembershipContacts:{data:[row],run:async()=>{if(fail)throw Error('Synthetic refresh');}},qIndividualContacts:{run:async()=>[]},qSubscribeIndividualEmail:{run:async()=>[{member_email_id:row.contact_id}]},
  qCompanyDonorContacts:{data:[row],run:async()=>{if(fail)throw Error('Synthetic refresh');}},qCompanyContacts:{run:async()=>[]},qToggleCompanyEmailSubscription:{run:async()=>[{queue_id:'synthetic-queue'}]}};
  await vm.runInNewContext(code,c);assert.ok(calls.some(a=>a.l==='info'&&/queued/.test(a.m)));assert.equal(calls.at(-1).l,fail?'warning':'success');
  assert.ok(calls.every(a=>!/(subscribed successfully|subscription completed)/i.test(a.m)));
 }
}
assert.doesNotMatch(read('Members – Intake/jsobjects/memberFlows/memberFlows.js'),/showAlert\("Email sent\./);
{
 const source=read('Members – Intake/jsobjects/memberFlows/memberFlows.js');assert.doesNotMatch(source,/apiUploadEvidenceViaN8n\.run/);
 const alerts=[];const c={inpUploadRelease:{isChecked:true},showAlert:(m,l)=>alerts.push({m,l})};
 const f=vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),c);await f.submitMember();
 assert.equal(alerts.length,1);assert.equal(alerts[0].l,'warning');assert.match(alerts[0].m,/No record or file was sent/);
 for(const name of ['inpUploadRelease','FilePicker1'])assert.equal(JSON.parse(read('Members – Intake/widgets/Members_IntakeForm/'+name+'.json')).isDisabled,true);
}

for(const status of ['succeeded','test_skipped','failed']) {
 const calls=[];const c={appsmith:{store:{}},storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(m,l)=>calls.push({m,l}),
 inpCashDepositActualAmount:{text:'1'},inpCashDepositDate:{selectedDate:null},inpCashDepositSlipNumber:{text:'Synthetic reference'},moment:()=>({format:()=> '2026-01-01'}),
 qConfirmCashDepositBatch:{run:async()=>calls.push({write:true})},apiSyncCashDepositToERPNext:{run:async params=>{assert.equal(params.mode,'test');calls.push({sync:true});return {data:{ok:status!=='failed',status}};}}};
 const f=vm.runInNewContext(read('Cash Deposits/jsobjects/cashDepositFlows/cashDepositFlows.js').replace(/^export default/,'globalThis.f='),c);
 f.selectedBatch=()=>({deposit_batch_id:'synthetic-batch',status:'prepared',deposit_date:'2026-01-01'});f.requireDonationsReviewer=()=> 'synthetic-reviewer';f.refresh=async()=>{};
 await f.confirmBatch();assert.match(calls[0].m,/Saving deposit confirmation/);assert.equal(calls[1].write,true);assert.match(calls[2].m,/confirmation saved/);assert.equal(calls[3].sync,true);
 assert.equal(calls.at(-1).l,status==='succeeded'?'success':status==='test_skipped'?'info':'warning');
}
assert.match(read('Cash Deposits/queries/apiSyncCashDepositToERPNext/apiSyncCashDepositToERPNext.txt'),/this.params.mode \|\| "test"/);
console.log('PASS workflow feedback: signing stages, confirmed-delivery-only claim, denied/busy writes, partial-save warnings and Listmonk queued/refresh outcomes');
