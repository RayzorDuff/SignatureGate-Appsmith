// Isolated integration checks. All records and values below are artificial.
// Arguments: PGlite module path, uuid-ossp module path, canonical schema path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);
if(!modulePath||!extensionPath||!schemaPath)throw Error('Provide PGlite, uuid-ossp and canonical schema paths');
const {PGlite}=await import(pathToFileURL(modulePath));
const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const source=fs.readFileSync(new URL('../pages/Reports/queries/qReportTimeSeries/qReportTimeSeries.txt',import.meta.url),'utf8');
const actorSource=fs.readFileSync(new URL('../pages/Reports/queries/qCurrentFacilitator/qCurrentFacilitator.txt',import.meta.url),'utf8');
async function query(template,email,metrics=[]) {
 const bindings=[],values={
  "this.params?.bucket || 'month'":'day',"this.params?.periods || '12'":'1',
  "this.params?.start_date || ''":'',"this.params?.end_date || ''":'',
  "this.params?.metric_keys_json || '[]'":JSON.stringify(metrics),
  'appsmith.user.email':email,'this.params.email':email
 };
 const sql=template.replace(/{{(.*?)}}/gs,(_,expression)=>{
  const key=expression.trim();assert.ok(Object.hasOwn(values,key),'unexpected source binding '+key);
  bindings.push(values[key]);return '$'+bindings.length;
 });
 return (await db.query(sql,bindings)).rows;
}
async function person(label){return (await db.query('INSERT INTO public.people(display_name) VALUES ($1) RETURNING person_id',[label])).rows[0].person_id;}
async function actor(label,roles) {
 const id=await person('Synthetic Reports '+label),email='reports-'+label+'@example.invalid';
 await db.query('INSERT INTO public.person_app_accounts(person_id,email) VALUES ($1,$2)',[id,email]);
 for(const role of roles)await db.query('INSERT INTO public.person_roles(person_id,role_key,assigned_by) VALUES ($1,$2,$3)',[id,role,'synthetic_report_test']);
 return {id,email};
}
const value=(rows,key)=>Number(rows.find(row=>row.metric_key===key)?.value);
const financial=rows=>rows.filter(row=>/donations_(count|dollars)$/.test(row.metric_key));
try {
 await db.exec(fs.readFileSync(schemaPath,'utf8').replace(/^\\.*$/gm,''));
 await db.exec('BEGIN');
 const reviewer=await actor('reviewer',['donations_reviewer']);
 const documents=await actor('documents',['document_reviewer']);
 const practitioner=await actor('practitioner',['practitioner']);
 const directory=await actor('directory',['directory_manager']);
 const both=await actor('both',['document_reviewer','donations_reviewer']);
 const first=await person('Synthetic Assigned Participant'),second=await person('Synthetic Unassigned Participant'),donor=await person('Synthetic Individual Contributor');
 const member=(await db.query('INSERT INTO public.members(person_id) VALUES ($1) RETURNING member_id',[first])).rows[0].member_id;
 await db.query('INSERT INTO public.members(person_id) VALUES ($1)',[second]);
 await db.query('INSERT INTO public.member_practitioner_assignments(member_id,practitioner_person_id) VALUES ($1,$2)',[member,practitioner.id]);
 const organization=(await db.query("INSERT INTO public.organizations(organization_name) VALUES ('Synthetic Reporting Company') RETURNING organization_id")).rows[0].organization_id;
 const contributor1=(await db.query("INSERT INTO public.contributors(contributor_type,person_id) VALUES ('individual',$1) RETURNING contributor_id",[first])).rows[0].contributor_id;
 const contributor2=(await db.query("INSERT INTO public.contributors(contributor_type,person_id) VALUES ('individual',$1) RETURNING contributor_id",[donor])).rows[0].contributor_id;
 const contributor3=(await db.query("INSERT INTO public.contributors(contributor_type,organization_id) VALUES ('organization',$1) RETURNING contributor_id",[organization])).rows[0].contributor_id;
 for(const [id,cents] of [[contributor1,100],[contributor2,200],[contributor3,300]])await db.query("INSERT INTO public.donations(contributor_id,donor_kind,provider,amount_cents,status,donated_at) VALUES ($1,'identified','cash',$2,'verified',now())",[id,cents]);
 await db.exec("INSERT INTO public.donations(donor_kind,provider,amount_cents,status,donated_at) VALUES ('anonymous','cash',400,'verified',now()),('unresolved','givebutter',500,'pending_review',now())");
 await db.query("INSERT INTO public.donations(contributor_id,donor_kind,provider,amount_cents,status,donated_at) VALUES ($1,'identified','cash',900,'rejected',now())",[contributor3]);
 for(const who of [reviewer,documents,practitioner,both]){
  const actors=await query(actorSource,who.email);assert.equal(actors.length,1);assert.equal(actors[0].member_id,null,'canonical actor needs no membership');assert.equal(actors[0].person_id,who.id);
 }
 const rows=await query(source,reviewer.email);
 assert.equal(value(rows,'donations_count'),5);assert.equal(value(rows,'donations_dollars'),15);
 assert.equal(value(rows,'individual_donations_count'),2);assert.equal(value(rows,'individual_donations_dollars'),3);
 assert.equal(value(rows,'organization_donations_count'),1);assert.equal(value(rows,'organization_donations_dollars'),3);
 assert.equal(value(rows,'anonymous_donations_count'),1);assert.equal(value(rows,'anonymous_donations_dollars'),4);
 assert.equal(value(rows,'unresolved_donations_count'),1);assert.equal(value(rows,'unresolved_donations_dollars'),5);
 assert.equal(value(rows,'member_donations_count'),1);assert.equal(value(rows,'member_donations_dollars'),1);
 assert.equal(value(rows,'members_created'),0,'financial reviewer alone receives no global participation metrics');
 for(const [who,count] of [[documents,2],[practitioner,1]]){
  const scoped=await query(source,who.email);assert.equal(value(scoped,'members_created'),count);assert.equal(financial(scoped).length,0);
  assert.equal((await query(source,who.email,['donations_dollars','unresolved_donations_count'])).length,0,'direct financial selection denied');
 }
 assert.equal(value(await query(source,both.email),'members_created'),2);
 for(const email of [directory.email,'unknown@example.invalid']){assert.equal((await query(actorSource,email)).length,0);assert.equal((await query(source,email)).length,0);}
 await db.query("UPDATE public.members SET status='inactive' WHERE member_id=$1",[member]);
 const ended=await query(source,reviewer.email);assert.equal(value(ended,'member_donations_count'),0);assert.equal(value(ended,'individual_donations_count'),2);assert.equal(value(ended,'donations_count'),5,'capacity change preserves historical attribution');
 await db.query("DELETE FROM public.person_roles WHERE person_id=$1 AND role_key='donations_reviewer'",[reviewer.id]);
 assert.equal((await query(source,reviewer.email)).length,0,'removed role cannot read financials');
 await db.query("UPDATE public.person_app_accounts SET status='disabled' WHERE person_id=$1",[both.id]);
 assert.equal((await query(source,both.email)).length,0,'disabled account denied');
 await db.exec('ROLLBACK');
 console.log('PASS source Reports SQL: six contribution groups, canonical actor/assignment scope, direct financial denial, capacity history and disabled-account denial');
} finally {await db.close();}
