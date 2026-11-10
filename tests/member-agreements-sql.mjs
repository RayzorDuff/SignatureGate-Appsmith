// Actual Participant Functions controller + prepared source reads; synthetic data, no signing HTTP.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);
const {PGlite}=await import(pathToFileURL(modulePath));const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const page=new URL('../pages/Member%20Functions/',import.meta.url),read=p=>fs.readFileSync(new URL(p,page),'utf8');
async function actor(label,roles,participant=false){
 const id=(await db.query('INSERT INTO people(display_name) VALUES($1) RETURNING person_id',['Synthetic Catalog '+label])).rows[0].person_id;
 const email='synthetic-catalog-'+label+'@example.invalid';await db.query('INSERT INTO person_app_accounts(person_id,email) VALUES($1,$2)',[id,email]);
 for(const role of roles)await db.query('INSERT INTO person_roles(person_id,role_key,assigned_by) VALUES($1,$2,$3)',[id,role,'synthetic']);
 const memberId=participant?(await db.query('INSERT INTO members(person_id) VALUES($1) RETURNING member_id',[id])).rows[0].member_id:null;
 return {id,email,memberId};
}
function fixture(email,memberId,{lag=false,type='',failTypes=false}={}){
 const calls={alerts:[],selections:[],queries:[]};
 const c={appsmith:{user:{email},store:{member_id:memberId}},selAgreementType:{selectedOptionValue:type,setSelectedOption:async value=>{calls.selections.push(value);if(!lag)c.selAgreementType.selectedOptionValue=value;}},selAgreementTemplate:{selectedOptionValue:'stale-template',setSelectedOption:async value=>{c.selAgreementTemplate.selectedOptionValue=value;}},storeValue:async(k,v)=>c.appsmith.store[k]=v,showAlert:(m,l)=>calls.alerts.push({m,l})};
 for(const name of ['qMembersDirectory','qMemberById','qMemberAgreements','qMemberReleases','qListFacilitators','qMemberFacilitators','qMemberEmails'])c[name]={run:async()=>[]};
 for(const name of ['qAgreementTypesList','qAgreementTemplatesByType']){
  const body=read('queries/'+name+'/'+name+'.txt'),meta=JSON.parse(read('queries/'+name+'/metadata.json'));
  assert.equal(meta.unpublishedAction.actionConfiguration.body,body);
  c[name]={data:[],run:async(params={})=>{
   calls.queries.push({name,params});if(failTypes&&name==='qAgreementTypesList')throw Error('Synthetic catalog read failure');
   const values=[],context={...c,params};
   const sql=body.replace(/{{(.*?)}}/gs,(_,expression)=>{values.push(vm.runInNewContext(expression,context));return '$'+values.length;});
   const rows=(await db.query(sql,values)).rows;c[name].data=rows;return rows;
  }};
 }
 c.memberProfile=vm.runInNewContext(read('jsobjects/memberProfile/memberProfile.js').replace(/^export default/,'globalThis.f='),c);
 return {c,calls,f:c.memberProfile};
}
try{
 await db.exec(fs.readFileSync(schemaPath,'utf8').replace(/^\\.*$/gm,''));await db.exec('SET search_path=public,pg_temp;BEGIN');
 const participant=await actor('participant',[],true),other=await actor('other',[],true),reviewer=await actor('reviewer',['document_reviewer']),practitioner=await actor('practitioner',['practitioner']),unassigned=await actor('unassigned',['practitioner']);
 await db.query('INSERT INTO member_practitioner_assignments(member_id,practitioner_person_id) VALUES($1,$2)',[participant.memberId,practitioner.id]);
 await db.query("INSERT INTO agreement_types(type_key,display_name,sort_order) VALUES('synthetic_first','Synthetic First',-200),('synthetic_second','Synthetic Second',-100),('synthetic_empty','Synthetic Empty',-50),('synthetic_inactive','Synthetic Inactive',-300)");
 await db.query("UPDATE agreement_types SET active=false WHERE type_key='synthetic_inactive'");
 for(const [name,key,active] of [['First','synthetic_first',true],['Second','synthetic_second',true],['Inactive','synthetic_first',false]])await db.query('INSERT INTO agreement_templates(name,version,required_for,active) VALUES($1,$2,$3,$4)',['Synthetic '+name,'test',[key],active]);
 const typeWidget=JSON.parse(read('widgets/selAgreementType.json'));
 for(const [who,visible] of [[reviewer,true],[practitioner,true],[participant,false]]){
  assert.equal(vm.runInNewContext(typeWidget.isVisible.slice(2,-2),{qPageAccess:{data:[{email:who.email,can_member_functions:true,is_document_reviewer:who===reviewer,is_practitioner:who===practitioner}]},appsmith:{user:{email:who.email}}}),visible);
 }
 assert.ok(typeWidget.dynamicBindingPathList.some(p=>p.key==='isVisible'));
 const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM member_agreements)::int agreements,(SELECT count(*) FROM audit_log)::int audits')).rows[0];const before=await counts();
 for(const who of [reviewer,practitioner]){
  const x=fixture(who.email,participant.memberId,{lag:true,type:'retired_type'});await x.f.refresh();
  assert.equal(x.calls.selections[0],'synthetic_first');assert.equal(x.c.selAgreementType.selectedOptionValue,'retired_type','simulate delayed widget hydration');
  assert.equal(x.c.qAgreementTemplatesByType.data.length,1);assert.equal(x.c.qAgreementTemplatesByType.data[0].name,'Synthetic First','explicit new type wins over stale widget');
  assert.equal(x.c.selAgreementTemplate.selectedOptionValue,'','old template selection cleared');
  x.c.selAgreementTemplate.selectedOptionValue=x.c.qAgreementTemplatesByType.data[0].agreement_template_id;
  x.c.selAgreementType.selectedOptionValue='synthetic_first';assert.ok(x.f._requireAgreementTemplate(),'valid current template accepted');
  x.c.selAgreementType.selectedOptionValue='synthetic_second';assert.equal(x.f._requireAgreementTemplate(),null,'late previous-type rows cannot authorize sending the wrong document');
  await x.f.refreshAgreements();assert.equal(x.c.qAgreementTemplatesByType.data[0].name,'Synthetic Second');
  x.c.selAgreementType.selectedOptionValue='synthetic_empty';await x.f.refreshAgreements();assert.equal(x.c.qAgreementTemplatesByType.data.length,0);assert.match(x.calls.alerts.at(-1).m,/No active agreement templates/);
 }
 for(const [who,target] of [[participant,participant.memberId],[unassigned,participant.memberId],[practitioner,other.memberId]]){
  const x=fixture(who.email,target);await x.f.refresh();assert.equal(x.c.qAgreementTypesList.data.length,0);assert.equal(x.c.qAgreementTemplatesByType.data.length,0);
 }
 {const x=fixture(reviewer.email,participant.memberId,{type:'synthetic_second'});await x.f.refresh();assert.equal(x.calls.selections[0],'synthetic_second','retain a valid user selection');}
 {const x=fixture(reviewer.email,participant.memberId,{failTypes:true});await x.f.refresh();assert.match(x.calls.alerts[0].m,/could not be loaded/);assert.equal(x.calls.queries.length,1,'failed catalog read must not query using a stale type');}
 await db.query('UPDATE agreement_types SET active=false');
 {const x=fixture(reviewer.email,participant.memberId,{lag:true,type:'synthetic_first'});await x.f.refresh();assert.equal(x.calls.selections[0],'');assert.equal(x.c.qAgreementTemplatesByType.data.length,0,'empty catalog clears old results');}
 assert.deepEqual(await counts(),before,'loading choices never creates an agreement or audit');
 await db.exec('ROLLBACK');console.log('PASS actual Participant agreement controller/source SQL: visible staff controls, delayed widget hydration, explicit type precedence, assigned practitioner/reviewer scope, denied self/other targets, inactive/empty catalogs and read-failure feedback; no agreement writes or external calls');
}finally{await db.close();}
