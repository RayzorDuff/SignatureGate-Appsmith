// Actual controller and prepared source SQL, synthetic records only; signing HTTP is stubbed.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);
const {PGlite}=await import(pathToFileURL(modulePath));const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const page=new URL('../pages/Intake/',import.meta.url);
const source=fs.readFileSync(new URL('jsobjects/intakeFlows/intakeFlows.js',page),'utf8');
let serial=0,practitioner,template;
async function actor(label,roles) {
 const id=(await db.query('INSERT INTO people(display_name) VALUES($1) RETURNING person_id',['Synthetic Intake '+label])).rows[0].person_id;
 const email='synthetic-intake-'+label+'@example.invalid';await db.query('INSERT INTO person_app_accounts(person_id,email) VALUES($1,$2)',[id,email]);
 for(const role of roles) await db.query('INSERT INTO person_roles(person_id,role_key,assigned_by) VALUES($1,$2,$3)',[id,role,'synthetic']);
 return {id,email};
}
function fixture({kind='member',contacts='email_phone',memberOpt=false,contributorOpt=false,email,delivery='Digital',apiFail=false,fault=null}={}) {
 const n=++serial,hasEmail=contacts.includes('email'),hasPhone=contacts.includes('phone'),hasAddress=contacts.includes('address');
 const calls={alerts:[],actions:[],api:0,resets:[]};const c={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},appsmith:{user:{email},store:{}},showAlert:(message,level)=>calls.alerts.push({message,level}),storeValue:async(k,v)=>c.appsmith.store[k]=v,console:{log:()=>{}},resetWidget:async name=>calls.resets.push(name),setTimeout:fn=>fn()};
 for(const [name,text] of Object.entries({inpIntakeFirstName:'Synthetic',inpIntakeLastName:'Intake'+n,inpIntakeCompanyName:'Synthetic Intake Company '+n,
 inpIntakeEmail:hasEmail?'synthetic-intake-'+n+'@example.invalid':'',inpIntakePhone:hasPhone?'555010'+String(n).padStart(4,'0'):'',inpIntakeIdentityNotes:'',inpContributorReason:'Synthetic intake reason',
 inpIntakeAddress:hasAddress?'Synthetic Street':'',inpIntakeCity:hasAddress?'Synthetic City':'',inpIntakeState:hasAddress?'CO':'',inpIntakePostalCode:hasAddress?'00000':''})) c[name]={text};
 c.chkIntakeRecoveryReviewed={isChecked:false};
 c.dateIntakeBirthDate={selectedDate:n%2?'1990-01-01':''};c.FilePickerAgreement={files:[{name:'synthetic.pdf',data:'synthetic'}]};
 for(const [name,value] of Object.entries({selIntakeEntityType:kind==='company'?'Company':'Individual',selAgreementDelivery:delivery,selIntakePractitioner:practitioner,selAgreementType:'synthetic_intake',selAgreementTemplate:template}))c[name]={selectedOptionValue:value};
 for(const [name,value] of Object.entries({chkIntakeMember:['member','dual'].includes(kind),chkIntakeContributor:['contributor','dual'].includes(kind),chkCompanyContributor:kind==='company',chkIntakeSubscribeMemberListmonk:memberOpt,chkIntakeSubscribeContributorListmonk:contributorOpt}))c[name]={isChecked:value};
 for(const name of fs.readdirSync(new URL('queries/',page))) {
  const p=new URL('queries/'+name+'/'+name+'.txt',page);if(!fs.existsSync(p))continue;
  const body=fs.readFileSync(p,'utf8');c[name]={run:async(params={})=>{
   calls.actions.push(name);if(fault?.name===name&&fault.when==='before')throw Error('Synthetic request failure');const values=[];const context={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},...c,params};
   const sql=body.replace(/{{(.*?)}}/gs,(_,expr)=>{values.push(vm.runInNewContext(expr,context));return '$'+values.length;});
   await db.exec('SAVEPOINT intake_action');
   let rows;
   try{rows=(await db.query(sql,values)).rows;await db.exec('RELEASE SAVEPOINT intake_action');}
   catch(error){await db.exec('ROLLBACK TO SAVEPOINT intake_action');await db.exec('RELEASE SAVEPOINT intake_action');throw new Error(name+': '+error.message);}
   // Lose the response after the real source SQL committed its action savepoint.
   if(fault?.name===name&&fault.when==='after')throw Error('Synthetic lost response');
   return rows;
  }};
 }
 c.apiTriggerDocumenso={run:async()=>{calls.api++;if(apiFail)throw Error('Synthetic signing failure');return {ok:true};}};
 c.apiUploadEvidenceViaN8n={run:async()=>{throw Error('Paper upload must be blocked');}};
 c.qNavigationTerminology.data=[{concept_key:'member',singular_label:'Attendee',plural_label:'Attendees',is_active:true},{concept_key:'practitioner',singular_label:'Guide',plural_label:'Guides',is_active:true},{concept_key:'contributor',singular_label:'Sponsor',plural_label:'Sponsors',is_active:true}];
 c.navigationLabels=vm.runInNewContext(fs.readFileSync(new URL('../navigation/labels.js',import.meta.url),'utf8').replace(/^export default/m,'globalThis.labels='),c);
 const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),c);return {flows,c,calls};
}
try {
 await db.exec(fs.readFileSync(schemaPath,'utf8').replace(/^\\.*$/gm,''));await db.exec('SET search_path TO public,pg_temp; BEGIN');
 const admin=await actor('admin',['directory_manager','document_reviewer','donations_reviewer']);const doc=await actor('doc',['document_reviewer']);const don=await actor('don',['donations_reviewer']);const participant=await actor('participant',[]);
 practitioner=(await actor('practitioner',['practitioner'])).id;
 await db.query("INSERT INTO agreement_types(type_key,display_name) VALUES('synthetic_intake','Synthetic Intake')");
 template=(await db.query("INSERT INTO agreement_templates(name,version,required_for) VALUES('Synthetic Intake','synthetic',ARRAY['synthetic_intake']) RETURNING agreement_template_id")).rows[0].agreement_template_id;
 let completed=0;
 for(const kind of ['member','dual','contributor','company']) {
  const combinations=kind==='dual'?[[false,false],[true,false],[false,true],[true,true]]:[[false,false],[true,true]];
  for(const contacts of kind==='member'||kind==='dual'?['email_phone','email_address']:['email_phone','email_address','phone_address']) for(const [memberOpt,contributorOpt] of combinations) {
   const x=fixture({kind,contacts,memberOpt,contributorOpt,email:kind==='member'?doc.email:kind==='dual'?admin.email:don.email});
   const result=await x.flows.submit();assert.ok(result,JSON.stringify({kind,contacts,memberOpt,contributorOpt,alerts:x.calls.alerts}));
   assert.equal(x.flows.recovery().state,'completed');
   const actionsAfterSuccess=x.calls.actions.length;await x.flows.submit();assert.equal(x.calls.actions.length,actionsAfterSuccess,'completed intake replayed');
   await x.flows.reset();assert.equal(x.flows.recovery(),null);
   assert.equal(x.calls.alerts.find(a=>a.level==='success').level,'success');if(kind==='member'||kind==='dual')assert.match(x.calls.alerts.find(a=>a.level==='success').message,/Attendee/);if(kind!=='member')assert.match(x.calls.alerts.find(a=>a.level==='success').message,/Sponsor/);assert.equal(x.calls.api,kind==='member'||kind==='dual'?1:0);completed++;
   if(result.memberId) {
    const emails=(await db.query('SELECT * FROM member_emails WHERE member_id=$1',[result.memberId])).rows;assert.equal(emails[0].mailing_subscription_status,memberOpt?'subscribed':'not_subscribed');
    const q=(await db.query('SELECT count(*)::int AS n FROM listmonk_sync_queue WHERE member_email_id=$1',[emails[0].member_email_id])).rows[0];assert.equal(q.n,memberOpt?1:0);
   }
   if(result.contributorId) {
    const emails=(await db.query('SELECT * FROM contributor_emails WHERE contributor_id=$1',[result.contributorId])).rows;
    assert.equal(emails.length,contacts.includes('email')?1:0);if(emails[0])assert.equal(emails[0].mailing_subscription_status,contributorOpt?'subscribed':'not_subscribed');
    if(kind==='dual') {
     const person=(await db.query('SELECT person_id FROM members WHERE member_id=$1',[result.memberId])).rows[0].person_id;
     assert.equal((await db.query('SELECT person_id FROM contributors WHERE contributor_id=$1',[result.contributorId])).rows[0].person_id,person);
     const table=contacts.includes('phone')?'contributor_phones':'contributor_addresses';assert.equal((await db.query('SELECT count(*)::int AS n FROM '+table+' WHERE contributor_id=$1',[result.contributorId])).rows[0].n,1);
    }
   }
  }
 }
 assert.equal(completed,24);
 for(const options of [{email:participant.email},{email:doc.email,kind:'dual'},{email:doc.email,delivery:'Paper'},{email:doc.email,contacts:'phone_address'},{email:doc.email,contacts:'email'}]) {
  const x=fixture(options);assert.equal(await x.flows.submit(),undefined);assert.ok(x.calls.actions.every(n=>['qPageAccess','qCurrentFacilitator','qIntakeActorRoles'].includes(n)),'preflight must block before identity writes');
 }
 {const x=fixture({email:doc.email,apiFail:true});assert.equal(await x.flows.submit(),null);assert.equal(x.calls.api,1);assert.equal(x.calls.actions.filter(a=>a==='qSubmitAtomicIntake').length,1);assert.equal(x.calls.alerts.at(-1).level,'warning');assert.match(x.calls.alerts.at(-1).message,/do not submit another/);}
 let faults=0;
 for(const kind of ['member','dual','contributor','company'])for(const when of ['before','after']) {
  const x=fixture({kind,contacts:'email_address',email:admin.email,fault:{name:'qSubmitAtomicIntake',when}});
  x.c.inpIntakeIdentityNotes.text='Synthetic private intake note';
  const before=(await db.query('SELECT count(*)::int AS n FROM application_intake_requests')).rows[0].n;
  assert.equal(await x.flows.submit(),null);const receipt=x.flows.recovery();assert.ok(receipt?.request_id,'missing request key');assert.equal(receipt.state,'needs_review');
  assert.ok(Object.keys(receipt).every(k=>['owner','version','state','phase','request_id','member_id','person_id','organization_id','contributor_id','agreement_id'].includes(k)),'form data leaked into checkpoint');
  assert.doesNotMatch(JSON.stringify(receipt),/Synthetic private|Synthetic Street/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM application_intake_requests')).rows[0].n,before+(when==='after'?1:0));
  const count=x.calls.actions.length;
  await x.flows.submit();assert.equal(x.calls.actions.length,count,'uncertain submission replayed');
  await x.flows.reset();assert.ok(x.flows.recovery());assert.equal(x.calls.resets.length,0);
  const reloaded=vm.runInNewContext(source.replace(/^export default/,'globalThis.f='),x.c);
  await reloaded.submit();assert.equal(x.calls.actions.length,count,'reload replayed submission');
  const known=await reloaded.inspectRecovery();assert.equal(Boolean(known),when==='after');
  assert.equal(x.calls.api,0,'receipt lookup sent signing');
  assert.equal(x.calls.actions.filter(n=>n==='qSubmitAtomicIntake').length,1,'receipt lookup resubmitted intake');
  if(when==='after')assert.ok(reloaded.recovery().person_id||reloaded.recovery().organization_id);
  const originalEmail=x.c.appsmith.user.email;x.c.appsmith.user.email='synthetic-other@example.invalid';assert.equal(reloaded.recovery(),null);x.c.appsmith.user.email=originalEmail;
  assert.ok(reloaded.recovery());x.c.chkIntakeRecoveryReviewed.isChecked=true;await reloaded.reset();assert.equal(reloaded.recovery(),null);faults++;
 }
 {const x=fixture({email:doc.email,apiFail:true});await x.flows.submit();assert.ok(x.flows.recovery().agreement_id);const count=x.calls.api;await x.flows.submit();await x.flows.inspectRecovery();assert.equal(x.calls.api,count,'signing request replayed');}
 {const x=fixture({email:doc.email});x.c.storeValue=async(k,v)=>{if(k.startsWith('intake_submission:'))throw Error('Synthetic storage failure');x.c.appsmith.store[k]=v;};assert.equal(await x.flows.submit(),null);assert.ok(!x.calls.actions.includes('qSubmitAtomicIntake'),'write occurred before durable checkpoint');}
 {const x=fixture({email:doc.email,fault:{name:'qNewIntakeRequest',when:'after'}});assert.equal(await x.flows.submit(),null);assert.equal(x.flows.recovery(),null);assert.ok(!x.calls.actions.includes('qSubmitAtomicIntake'),'read failure dispatched creation');}
 {const x=fixture({email:doc.email});x.c.appsmith.store['intake_submission:'+doc.email]={version:1,owner:doc.email,state:'needs_review'};await x.flows.inspectRecovery();assert.equal(x.calls.actions.length,0,'legacy checkpoint should not perform a lookup');}
 console.log('PASS '+faults+' atomic request/lost-response guards, read-only receipt recovery, legacy checkpoint, account isolation, acknowledged reset and signing no-replay');
 {const x=fixture({email:doc.email});x.c.appsmith.store.intake_busy=true;await x.flows.submit();assert.equal(x.calls.actions.length,0);}
 console.log('PASS Intake: 24 controller/prepared-SQL enrollment cases, independent mailing consent, shared contact roles, optional DOB, pre-write denial/paper/contact checks and atomic persistence and signing recovery');
 await db.exec('ROLLBACK');
} catch(error) {console.error(error.message);process.exitCode=1;} finally {await db.close();}
