// Isolated source-query integration tests; every fixture is artificial.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const [modulePath,extensionPath,schemaPath]=process.argv.slice(2);
const {PGlite}=await import(pathToFileURL(modulePath));const {uuid_ossp}=await import(pathToFileURL(extensionPath));
const db=new PGlite({extensions:{uuid_ossp}});await db.waitReady;
const source=(page,name)=>fs.readFileSync(new URL('../pages/'+page+'/queries/'+name+'/'+name+'.txt',import.meta.url),'utf8');
let target,actorId,donationId,selectedContributor,currentAction;
async function action(page,name,email,params={}) {
 const values=[],context={navigationLabels:{text:copy=>copy},navigationLabels:{text:copy=>copy},params:{email,member_id:target,donation_id:donationId,contributor_choice:'__anonymous__',is_anonymous:true,amount_cents:100,donated_at:'2026-01-01',notes:'Synthetic',selection_value:'__anonymous__',show_rejected:false,new_status:'verified',review_notes:'Synthetic review',first_name:'Synthetic',last_name:'Denied',phone:'5550109001',date_of_birth:'',...params},
 appsmith:{user:{email},store:{member_id:target,facilitator_id:actorId,facilitator_is_donations_reviewer:true,cash_deposit_hide_ineligible:false,selected_facilitator_id:actorId}},selCashDepositStatus:{selectedOptionValue:'ALL'},selIndividualRoleContactToArchive:{selectedOptionValue:params.contact_id},qIndividualProfile:{data:[{party_id:params.person_id}]},Boolean,String,JSON};
 const sql=source(page,name).replace(/{{(.*?)}}/gs,(_,e)=>{values.push(vm.runInNewContext(e,context));return '$'+values.length;});
 currentAction=page+'/'+name;
 await db.exec('SAVEPOINT source_action');
 try {const result=await db.query(sql,values);await db.exec('RELEASE SAVEPOINT source_action');return result.rows;}
 catch(error){await db.exec('ROLLBACK TO SAVEPOINT source_action');await db.exec('RELEASE SAVEPOINT source_action');throw error;}
}
async function make(label,roles,member=false) {
 const id=(await db.query('INSERT INTO public.people(display_name) VALUES ($1) RETURNING person_id',['Synthetic Query '+label])).rows[0].person_id;
 const email='query-'+label+'@example.invalid';await db.query('INSERT INTO public.person_app_accounts(person_id,email) VALUES ($1,$2)',[id,email]);
 for(const role of roles)await db.query('INSERT INTO public.person_roles(person_id,role_key,assigned_by) VALUES ($1,$2,$3)',[id,role,'synthetic']);
 let memberId;if(member)memberId=(await db.query('INSERT INTO public.members(person_id,email,is_facilitator,is_document_reviewer,is_donations_reviewer) VALUES ($1,$2,true,true,true) RETURNING member_id',[id,email])).rows[0].member_id;
 return {id,email,memberId};
}
try {
 await db.exec(fs.readFileSync(schemaPath,'utf8').replace(/^\\.*$/gm,''));await db.exec('BEGIN');
 const self=await make('self',[],true),other=await make('other',[],true),doc=await make('documents',['document_reviewer']),don=await make('donations',['donations_reviewer']),practitioner=await make('practitioner',['practitioner']);
 actorId=don.id;target=self.memberId;
 await db.query('INSERT INTO public.member_practitioner_assignments(member_id,practitioner_person_id) VALUES ($1,$2)',[target,practitioner.id]);
 donationId=(await db.query("SELECT (public.application_record_cash($1,'__anonymous__',true,100,now(),'Synthetic')).donation_id",[doc.email])).rows[0].donation_id;
 for(const name of ['qCashDepositCashOnHand','qCashDepositBatches','qCashDepositBatchPrint'])assert.equal((await action('Cash Deposits',name,self.email,{deposit_batch_id:null})).length,0,'Participant/stale flags deny '+name);
 assert.equal((await action('Cash Deposits','qCashDepositCashOnHand',don.email)).length,1);
 assert.equal((await action('Contributor Functions','qPendingGivebutterDonations',doc.email)).length,0);
 assert.equal((await action('Contributor Functions','qPendingGivebutterDonations',don.email)).length,1);
 assert.equal((await action('Contributor Functions','qMembersDirectory',doc.email)).length,2);
 assert.equal((await action('Contributor Functions','qMembersDirectory',practitioner.email)).length,1);
 assert.equal((await action('Contributor Functions','qMembersDirectory',self.email)).length,0);
 assert.equal((await action('Contributor Functions','qMemberDonations',doc.email)).length,1,'document reviewer sees own recorded cash');
 assert.equal((await action('Contributor Functions','qMemberDonations',self.email)).length,0,'Participant cannot read staff contribution history');
 for(const name of ['qMembersDirectory','qMemberById','qMemberEmails','qMemberAgreements','qMemberReleases','qMemberFacilitators'])await action('Member Functions',name,self.email);
 assert.equal((await action('Member Functions','qMembersDirectory',self.email)).length,1);
 assert.equal((await action('Member Functions','qMembersDirectory',doc.email)).length,2);
 target=other.memberId;assert.equal((await action('Member Functions','qMemberById',self.email)).length,0,'forged target denied');
 target=self.memberId;
 const count=Number((await db.query('SELECT count(*) AS count FROM public.donations')).rows[0].count);
 await assert.rejects(action('Contributor Functions','qInsertCashDonation',self.email));
 assert.equal(Number((await db.query('SELECT count(*) AS count FROM public.donations')).rows[0].count),count);
 assert.equal((await action('Intake','qCheckMemberDuplicate',self.email)).length,0,'unauthorized duplicate search returns no identities');
 await assert.rejects(action('Member Functions','qAuditLogInsert',self.email,{action:'synthetic.event',entity_type:'member',entity_id:target}));
 const audit=(await action('Member Functions','qAuditLogInsert',doc.email,{actor_email:'forged@example.invalid',action:'synthetic.event',entity_type:'member',entity_id:target}))[0];
 assert.equal((await db.query('SELECT actor FROM public.audit_log WHERE audit_log_id=$1',[audit.audit_log_id])).rows[0].actor,doc.email,'audit actor is signed account, not caller parameter');
 target=other.memberId;
 await assert.rejects(action('Member Functions','qAuditLogInsert',practitioner.email,{action:'synthetic.event',entity_type:'member',entity_id:target}));
 target=self.memberId;
 const intakeRequest=(await db.query('SELECT public.uuid_generate_v4() AS id')).rows[0].id;
 const intakePayload=JSON.stringify({kind:'individual',participant:true,contributor:false,first_name:'Synthetic',last_name:'Canonical Intake',email:'synthetic-intake@example.invalid',phone:'5550109292',agreement_delivery:'Later',practitioner_person_id:practitioner.id});
 const intakeParams={owner:doc.email,request_id:intakeRequest,payload_json:intakePayload};
 await assert.rejects(action('Intake','qSubmitAtomicIntake',self.email,{...intakeParams,owner:self.email}));
 assert.equal((await action('Intake','qSubmitAtomicIntake',self.email,intakeParams))[0].receipt,null,'forged owner cannot enroll');
 assert.equal((await action('Intake','qSubmitAtomicIntake',doc.email,intakeParams))[0].receipt.state,'committed','canonical nonmember reviewer enrolls through the atomic API');
 const duplicate=await action('Intake','qCheckMemberDuplicate',doc.email,{email:'synthetic-intake@example.invalid',phone:'5550109292'});
 assert.ok(duplicate.some(row=>row.is_accessible===true),'canonical nonmember reviewer sees authorized duplicate');
 assert.equal((await action('Contributor Functions','qInsertCashDonation',doc.email)).length,1,'nonmember document reviewer records anonymous');
 actorId=practitioner.id;
 for(const name of ['qListFacilitators','qMemberById','qMemberStorageLocations','qAssignedParticipants','qParticipantCandidates','qLocationNameSuggestions','qDistinctStorageLocationNames'])await action('Facilitator Functions',name,doc.email);
 assert.equal((await action('Facilitator Functions','qListFacilitators',doc.email)).length,1);
 assert.equal((await action('Facilitator Functions','qListFacilitators',self.email)).length,0);
 await assert.rejects(action('Facilitator Functions','qAuditLogInsert',self.email,{action:'synthetic.practitioner',entity_type:'person',entity_id:practitioner.id}));
 await assert.rejects(action('Facilitator Functions','qAuditLogInsert',practitioner.email,{action:'synthetic.practitioner',entity_type:'person',entity_id:practitioner.id}));
 const practitionerAudit=(await action('Facilitator Functions','qAuditLogInsert',doc.email,{actor_email:'forged@example.invalid',action:'synthetic.practitioner',entity_type:'person',entity_id:practitioner.id}))[0];
 assert.equal((await db.query('SELECT actor FROM public.audit_log WHERE audit_log_id=$1',[practitionerAudit.audit_log_id])).rows[0].actor,doc.email);
 for(const who of [self,doc,don,practitioner])await action('Audit Log','qAuditLogList',who.email);
 assert.equal((await action('Audit Log','qAuditLogList',self.email)).length,0);
 assert.equal((await action('Audit Log','qAuditLogList',doc.email)).filter(r=>r.entity_type==='donation').length,0,'document reviewer cannot browse financial audits');
 assert.ok((await action('Audit Log','qAuditLogList',don.email)).some(r=>r.entity_type==='donation'));
 await db.query("SELECT public.application_review_donation($1,$2,'verified','Synthetic revival source test')",[don.email,donationId]);
 await action('Cash Deposits','qExcludeCashDonation',don.email,{reason:'Synthetic source exclusion'});
 await assert.rejects(action('Cash Deposits','qReviveCashDonation',self.email,{reason:'Synthetic denied revival'}));
 await assert.rejects(action('Cash Deposits','qReviveCashDonation',don.email,{reason:'   '}));
 assert.equal((await action('Cash Deposits','qReviveCashDonation',don.email,{reason:'Synthetic source recovery'})).length,1);
 assert.equal((await db.query("SELECT details->>'revival_reason' AS reason FROM public.audit_log WHERE entity_id=$1 AND action='cash_donation.deposit_reconciliation_revived'",[donationId])).rows[0].reason,'Synthetic source recovery');
 const providerId=(await db.query("INSERT INTO public.donations(provider,donor_kind,status,amount_cents) VALUES('givebutter','unresolved','pending_review',137) RETURNING donation_id")).rows[0].donation_id;
 await db.query("INSERT INTO public.audit_log(action,entity_type,entity_id,details) VALUES('synthetic.provider','donation',$1,$2)",[providerId,JSON.stringify({raw:{organization_name:'Synthetic Source Company',email:'provider-source@example.invalid',contact_id:601}})]);
 await assert.rejects(action('Contributor Functions','qLinkDonationToMember',self.email,{donation_id:providerId,contributor_choice:'__new_organization__'}));
 const providerResolved=(await action('Contributor Functions','qLinkDonationToMember',don.email,{donation_id:providerId,contributor_choice:'__new_organization__'}))[0];
 assert.ok(providerResolved.contributor_id);assert.equal(providerResolved.member_id,null);
 await assert.rejects(action('Contributor Functions','qReassignDonationMember',self.email,{donation_id:providerId,contributor_choice:'member:'+target,reason:'Synthetic correction'}));
 assert.equal((await action('Contributor Functions','qReassignDonationMember',don.email,{donation_id:providerId,contributor_choice:'member:'+target,reason:'Synthetic correction'}))[0].member_id,target);
 await assert.rejects(action('Contributor Functions','qAuditLogInsert',self.email,{action:'synthetic',entity_type:'donation',entity_id:providerId}));
 const combined=await make('provider-admin',['directory_manager','document_reviewer','donations_reviewer']);
 const enrollmentId=(await db.query("INSERT INTO public.donations(provider,donor_kind,status,amount_cents) VALUES('givebutter','unresolved','pending_review',137) RETURNING donation_id")).rows[0].donation_id;
 await db.query("INSERT INTO public.audit_log(action,entity_type,entity_id,details) VALUES('synthetic.provider','donation',$1,$2)",[enrollmentId,JSON.stringify({raw:{first_name:'Synthetic',last_name:'Source Enrollment',email:'provider-enrollment-source@example.invalid',phone:'5550109477',contact_id:'source-enrollment'}})]);
 await assert.rejects(action('Contributor Functions','qCreateMemberFromDonation',don.email,{donation_id:enrollmentId,subscribe_to_mailing_list:false}));
 const enrolled=(await action('Contributor Functions','qCreateMemberFromDonation',combined.email,{donation_id:enrollmentId,subscribe_to_mailing_list:false}))[0];
 assert.ok(enrolled.member_id);
 assert.equal((await db.query('SELECT mailing_subscription_status FROM public.member_emails WHERE member_id=$1',[enrolled.member_id])).rows[0].mailing_subscription_status,'not_subscribed');
 const organization=(await db.query("INSERT INTO public.organizations(organization_name) VALUES('Synthetic Source Contact Company') RETURNING organization_id")).rows[0].organization_id;
 await db.query("INSERT INTO public.contributors(contributor_type,organization_id) VALUES('organization',$1)",[organization]);
 await db.query("INSERT INTO public.contributors(contributor_type,person_id) VALUES('individual',$1)",[other.id]);
 const companyParams={organization_id:organization,person_id:other.id,active:true,expected_updated_at:'',reason:'Synthetic source link'};
 assert.equal((await action('Company Profile','qCompanyContactPeopleAccess',don.email,companyParams))[0].can_manage,true);
 assert.ok((await action('Company Profile','qCompanyContactCandidates',don.email,companyParams)).some(row=>row.person_id===other.id));
 await assert.rejects(action('Company Profile','qSetCompanyContactPerson',self.email,companyParams));
 const companyLink=(await action('Company Profile','qSetCompanyContactPerson',don.email,companyParams))[0];assert.equal(companyLink.person_id,other.id);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM public.audit_log WHERE action='organization_contact_person.changed' AND entity_id=$1",[organization])).rows[0].n,1,'prepared composite-returning action must write exactly once');
 assert.equal((await action('Company Profile','qCompanyContactPeople',self.email,companyParams)).length,0);
 assert.equal((await action('Company Profile','qCompanyContactPeople',don.email,companyParams)).length,1);
 assert.equal((await action('Company Profile','qSetCompanyContactPerson',don.email,{...companyParams,active:false,expected_updated_at:companyLink.relationship_version}))[0].status,'archived');
 const diagnostic=(await action('Cash Deposits','qCashDepositAccessDiagnostic',don.email))[0];
 assert.equal(diagnostic.cash_deposits_allowed,true);assert.equal(diagnostic.account_active,true);assert.ok(!('email' in diagnostic));
 assert.equal((await action('Cash Deposits','qCashDepositAccessDiagnostic',self.email))[0].cash_deposits_allowed,false);
 assert.equal((await action('Cash Deposits','qCashDepositAccessDiagnostic','synthetic-unlinked@example.invalid'))[0].account_registered,false);

 const mailingEmail=(await db.query("INSERT INTO public.member_emails(member_id,email,status,mailing_subscription_status) VALUES($1,'synthetic-profile-mailing@example.invalid','active','not_subscribed') RETURNING member_email_id",[self.memberId])).rows[0].member_email_id;
 const mailParams={contact_id:mailingEmail,person_id:self.id};
 assert.equal((await action('Individual Profile','qSubscribeIndividualEmail',self.email,mailParams)).length,0,'Participant cannot write own mailing preference through staff profile action');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM public.listmonk_sync_queue WHERE member_email_id=$1',[mailingEmail])).rows[0].n,0,'denial cannot enqueue');
 assert.equal((await action('Individual Profile','qSubscribeIndividualEmail',doc.email,{...mailParams,person_id:other.id})).length,0,'forged profile selection cannot update contact');
 assert.equal((await action('Individual Profile','qSubscribeIndividualEmail',doc.email,mailParams))[0].member_email_id,mailingEmail);
 assert.equal((await action('Individual Profile','qUnsubscribeIndividualEmail',doc.email,mailParams))[0].mailing_subscription_status,'unsubscribed');
 assert.equal((await action('Terminology Administration','qTerminologyAccess',combined.email))[0].allowed,true);
 assert.equal((await action('Terminology Administration','qTerminologyAccess',self.email))[0].allowed,false);
 await assert.rejects(action('Intake','qAuditLog',self.email,{actor_email:combined.email,action:'member.create_blocked_duplicate',entity_type:'individual',entity_id:'synthetic',details_json:'{}'}));
 assert.equal((await action('Intake','qAuditLog',doc.email,{action:'intake.completed',entity_type:'individual',entity_id:'synthetic',details_json:'{}'})).length,0,'only the atomic transaction may write completion audit');
 const intakeAudit=(await action('Intake','qAuditLog',doc.email,{actor_email:combined.email,action:'member.create_blocked_duplicate',entity_type:'individual',entity_id:'synthetic',details_json:'{}'}))[0];
 assert.equal((await db.query('SELECT actor FROM public.audit_log WHERE audit_log_id=$1',[intakeAudit.audit_log_id])).rows[0].actor,doc.email,'signed actor overrides forged parameters');

 for(const [who,expected] of [[self,false],[doc,true],[don,false],[practitioner,true]]) {
  const row=(await action('Directory','qNavigationAccess',who.email))[0];assert.equal(row.email,who.email);assert.equal(row.can_member_functions,who===self?true:expected);
  assert.equal(row.can_cash_deposits,who===don);assert.equal(row.can_release,who===practitioner);
 }
 await db.exec('ROLLBACK');console.log('PASS actual source queries: authorization, self/forged targets, canonical reviewers, cash/audit/Intake guards and reason-aware reconciliation bindings');
} catch(error){console.error(JSON.stringify({action:currentAction,message:error.message,code:error.code}));process.exitCode=1;} finally {await db.close();}
