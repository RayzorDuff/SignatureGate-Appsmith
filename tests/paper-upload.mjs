// Actual saved paper controller; synthetic files and stubbed external service only.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../pages/Member%20Functions/'+p,import.meta.url),'utf8');
const bodyExpression=read('queries/apiUploadEvidenceViaN8n/apiUploadEvidenceViaN8n.txt').trim().slice(2,-2);
const render=(context,params)=>JSON.parse(vm.runInNewContext(bodyExpression,{...context,params}));
const id='10000000-0000-4000-8000-000000000001',email='synthetic-paper@example.invalid';
function fixture({allowed=true,apiFail=false,refreshFail=false,receiptState='committed',checkpoint=null}={}){
 const calls={alerts:[],api:0,keys:0,reads:0,cancels:0,resets:[]};
 const c={appsmith:{user:{email},store:{paper_upload_checkpoint:checkpoint}},navigationLabels:{text:s=>s},selMember:{selectedOptionValue:id},inpFacilitator:{selectedOptionValue:id},selAgreementTemplate:{selectedOptionValue:''},selPaperStorageProvider:{selectedOptionValue:'google_drive'},FilePicker1:{files:[{name:'synthetic.pdf',type:'application/pdf',data:'JVBERi0xLjQgc3ludGhldGlj'}]},inpPaperUploadRecoveryReason:{text:'Synthetic cancelled after workflow inspection'},storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(m,l)=>calls.alerts.push({m,l}),resetWidget:async n=>calls.resets.push(n),closeModal:async()=>{},
 qMemberWriteAccess:{run:async()=>[{allowed}]},qNewPaperUploadRequest:{run:async()=>{calls.keys++;return [{request_id:id}];}},qPaperUploadReceipt:{run:async()=>{calls.reads++;return [{receipt:receiptState?{request_id:id,state:receiptState,member_agreement_id:id}:null}];}},qCancelPaperUploadRequest:{run:async p=>{calls.cancels++;assert.ok(p.reason);return [{receipt:{request_id:id,state:'cancelled'}}];}},qMemberAgreements:{run:async()=>{if(refreshFail)throw Error('Synthetic refresh');return [];}},apiUploadEvidenceViaN8n:{run:async p=>{calls.api++;const request=render(c,p);assert.equal(request.actor_email,email);assert.equal(Array.isArray(request.files),true);assert.equal(request.files.length,1);assert.equal(request.files[0].data,p.files[0].data);assert.equal(request.storage_provider,c.selPaperStorageProvider.selectedOptionValue);assert.ok(!('email' in p));if(apiFail)throw Error('Synthetic lost response');return {state:receiptState,request_id:id,member_agreement_id:id};}}};
 c.memberProfile=vm.runInNewContext(read('jsobjects/memberProfile/memberProfile.js').replace(/^export default/,'globalThis.f='),c);
 c.memberProfile._requireMemberId=()=>c.selMember.selectedOptionValue;c.memberProfile._requireFacilitator=()=>c.inpFacilitator.selectedOptionValue;
 return {c,f:c.memberProfile,calls};
}
{const x=fixture();await x.f.openPaperUpload();assert.equal(x.calls.api,1);assert.equal(x.c.appsmith.store.paper_upload_checkpoint.state,'committed');assert.equal(x.calls.alerts.at(-1).l,'success');assert.match(x.calls.alerts.at(-1).m,/No email was required or sent/);await x.f.openPaperUpload();assert.equal(x.calls.api,1,'same form cannot submit again after success');}
{const x=fixture({allowed:false});await x.f.openPaperUpload();assert.equal(x.calls.api,0);assert.equal(x.calls.keys,0);assert.equal(x.calls.alerts.at(-1).l,'error');}
for(const files of [[],[{name:'unsafe.html',type:'text/html',data:'synthetic'}]]){const x=fixture();x.c.FilePicker1.files=files;await x.f.openPaperUpload();assert.equal(x.calls.api,0);}
for(const options of [{apiFail:true},{receiptState:'pending_upload'}]){
 const x=fixture(options);await x.f.openPaperUpload();assert.equal(x.calls.api,1);assert.equal(x.c.appsmith.store.paper_upload_checkpoint.state,'uncertain');assert.equal(x.calls.alerts.at(-1).l,'warning');
 await x.f.openPaperUpload();assert.equal(x.calls.api,1,'uncertain outcome only reads receipt');assert.equal(x.calls.reads,1);
}
const pending={owner:email,member_id:id,practitioner_person_id:id,request_id:id,state:'uncertain'};
{const x=fixture({checkpoint:pending});await x.f.openPaperUpload(true);assert.equal(x.calls.api,0);assert.equal(x.c.appsmith.store.paper_upload_checkpoint.state,'committed');}
{const x=fixture({checkpoint:pending,receiptState:'cancelled'});await x.f.openPaperUpload(true);assert.equal(x.c.appsmith.store.paper_upload_checkpoint,null);assert.equal(x.calls.api,0);}
{const x=fixture({refreshFail:true});await x.f.openPaperUpload();assert.equal(x.c.appsmith.store.paper_upload_checkpoint.state,'committed');assert.equal(x.calls.alerts.at(-1).l,'warning');await x.f.openPaperUpload();assert.equal(x.calls.api,1);}
{const x=fixture();x.c.qNewPaperUploadRequest.run=async()=>{x.c.selMember.selectedOptionValue='different';return [{request_id:id}];};await x.f.openPaperUpload();assert.equal(x.calls.api,0,'selection drift before dispatch must stop upload');}
{const x=fixture();x.c.qMemberWriteAccess.run=async()=>{x.c.appsmith.user.email='other@example.invalid';return [{allowed:true}];};await x.f.openPaperUpload();assert.equal(x.calls.api,0,'account drift must stop upload');}
{const x=fixture();x.c.appsmith.store.paper_upload_busy=true;await x.f.openPaperUpload();assert.equal(x.calls.api,0);}
{const x=fixture({checkpoint:pending});x.c.inpPaperUploadRecoveryReason.text=' ';await x.f.openPaperUpload('cancel');assert.equal(x.calls.cancels,0);}
{const x=fixture({checkpoint:pending});await x.f.openPaperUpload('cancel');assert.equal(x.calls.cancels,1);assert.equal(x.c.appsmith.store.paper_upload_checkpoint,null);assert.equal(x.calls.api,0);}
{const x=fixture({checkpoint:{...pending,owner:'other@example.invalid'}});await x.f.openPaperUpload('cancel');assert.equal(x.calls.cancels,0);}
const button=JSON.parse(read('widgets/UploadRelease.json')),picker=JSON.parse(read('widgets/FilePicker1.json'));
assert.equal(picker.maxNumFiles,'1');assert.equal(picker.maxFileSize,'5');assert.equal(picker.fileDataType,'Base64');
assert.ok(button.dynamicBindingPathList.some(x=>x.key==='isDisabled'));
{const x=fixture();assert.equal(vm.runInNewContext(button.isDisabled.slice(2,-2),x.c),false,'missing email must not disable paper upload');}
const body=read('queries/apiUploadEvidenceViaN8n/apiUploadEvidenceViaN8n.txt');assert.ok(!body.includes('this.params.actor_email'));assert.ok(!body.includes('FilePicker1.files'));
assert.equal(JSON.parse(read('queries/apiUploadEvidenceViaN8n/metadata.json')).unpublishedAction.actionConfiguration.body,body);
{const x=fixture();const preview=render(x.c);assert.ok(Array.isArray(preview.files));assert.equal(preview.files.length,0);assert.equal(preview.request_id,'');}
{const x=fixture();const request=render(x.c,{actor_email:'forged@example.invalid',files:[{name:'quoted \"name\".pdf',type:'application/pdf',data:'JVBERi0xLjQgc3ludGhldGlj'}]});assert.equal(request.actor_email,email);assert.equal(request.files[0].name,'quoted \"name\".pdf');assert.ok(Array.isArray(request.files));}
{const x=fixture();x.c.selPaperStorageProvider.selectedOptionValue='nocodb';await x.f.openPaperUpload();assert.equal(x.calls.api,1);}
{const x=fixture();x.c.selPaperStorageProvider.selectedOptionValue='unknown';await x.f.openPaperUpload();assert.equal(x.calls.api,0);}
console.log('PASS no-email paper controller: stages, file/authority guards, saved-form double-submit block, uncertain no-replay/read recovery, selection/account drift, saved-refresh warning, reasoned cancellation and authenticated action bindings');

for (const name of ['mdlPaperUploadRecovery','txtPaperUploadRecovery','inpPaperUploadRecoveryReason','btnPaperUploadRecoveryClose','btnPaperUploadRecoveryConfirm']) {
 const widget=JSON.parse(read('widgets/mdlPaperUploadRecovery/'+name+'.json'));
 assert.ok(!JSON.stringify(widget).includes('cashDepositFlows'),'paper recovery must not depend on another page controller');
}

{const x=fixture();x.c.appsmith.store.NC_PUBLIC_URL='';const ev=[{storage_provider:'google_drive',drive_file_id:'synthetic_drive_file_01',web_url:'https://outside.example.invalid/forged',title:'Synthetic <paper>'}];const html=x.f.evidenceLinks(JSON.stringify(ev));assert.match(html,/https:\/\/drive.google.com\/file\/d\/synthetic_drive_file_01\/view/);assert.ok(!html.includes('outside.example.invalid'));assert.ok(html.includes('&lt;paper&gt;'));assert.equal(x.f.evidenceLinks([{storage_provider:'google_drive',drive_file_id:'bad/id'}]),'');x.c.appsmith.store.NC_PUBLIC_URL='https://storage.example.invalid';assert.match(x.f.evidenceLinks([{path:'nc/uploads/synthetic.pdf'}]),/https:\/\/storage.example.invalid\/nc\/uploads\/synthetic.pdf/);}
console.log('PASS actual API-body JSON round trip, array/base64 preservation, missing-parameter preview, provider selection and controlled Drive/legacy evidence links');

{const code=fs.readFileSync(new URL('../pages/Audit%20Log/jsobjects/auditLogFlows/auditLogFlows.js',import.meta.url),'utf8');const audit=vm.runInNewContext(code.replace(/^export default/,'globalThis.f='),{navigationLabels:{label:s=>s}});const html=audit.formatDetails({details:{evidence:[{storage_provider:'google_drive',drive_file_id:'synthetic_drive_file_01',web_url:'https://outside.example.invalid/forged',title:'Synthetic <paper>'}]}});assert.ok(html.includes('https://drive.google.com/file/d/synthetic_drive_file_01/view'));assert.ok(!html.includes('outside.example.invalid'));assert.ok(html.includes('&lt;paper&gt;'));}
