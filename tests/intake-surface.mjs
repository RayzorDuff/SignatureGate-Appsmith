// Guard the single transactional enrollment boundary after retiring duplicate writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const application=JSON.parse(read('application.json'));
const pages=fs.readdirSync(new URL('pages/',root)).sort();
assert.deepEqual(application.pages.map(p=>p.id).sort(),pages,'native page list must match retained source');
assert.equal(application.pages.filter(p=>p.isDefault).length,1);
assert.equal(application.pages.find(p=>p.isDefault).id,'Directory');
assert.ok(!pages.includes('Members – Intake'),'duplicate Intake must not return');
const registry=JSON.parse(read('navigation/registry.json'));
const enrollment=registry.groups.flatMap(g=>g.items).filter(i=>/intake/i.test(i.page));
assert.equal(enrollment.length,1);assert.equal(enrollment[0].page,'Intake');
const retired=['apiUploadEvidenceViaN8n','qAddContributorAddress','qAddContributorEmailForDualCapacity','qAddMemberEmail','qAddMemberPhone','qAddMembershipAddress','qAssignIntakeContactRole','qAssignMemberPractitioner','qAssignPersonContactRole','qCheckContributorListmonkQueue','qCreateContributor','qCreateIntakeAgreement','qCreateMember','qEnablePersonContributor','qGetMemberPerson','qLinkContributorMember','qSetIntakeIdentityNotes'];
const actions=fs.readdirSync(new URL('pages/Intake/queries/',root));
for(const name of retired)assert.ok(!actions.includes(name),'retired partial-write/upload action: '+name);
const source=read('pages/Intake/jsobjects/intakeFlows/intakeFlows.js');
assert.equal((source.match(/qSubmitAtomicIntake\.run\(/g)||[]).length,1,'one enrollment write dispatch');
for(const name of actions) {
 const d=JSON.parse(read('pages/Intake/queries/'+name+'/metadata.json'));
 if(d.pluginType==='API')assert.ok(['apiTriggerDocumenso','apiIntakePaperUpload'].includes(name),'unreviewed external Intake surface');
 if(['qSubmitAtomicIntake','apiTriggerDocumenso','apiIntakePaperUpload','qIntakePaperRequest','qIntakePaperReceipt'].includes(name)) {
  assert.equal(d.unpublishedAction.runBehaviour,'MANUAL');assert.equal(d.unpublishedAction.userSetOnLoad,true);
 }
}
const audit=read('pages/Intake/queries/qAuditLog/qAuditLog.txt');
assert.ok(!audit.includes("'intake.completed'"),'completion audit belongs to the enrollment transaction');
assert.ok(audit.includes("= 'member.create_blocked_duplicate'"));
console.log('PASS unified Intake surface: one native/menu entry, no retired partial-write/upload actions, one guarded transaction dispatch and server-owned completion audit');

// The selected paper file is preflighted before enrollment and sent only once afterward.
assert.ok(source.includes('delivery === "Paper"'));
assert.ok(source.includes('agreement_delivery:delivery === "Paper" ? "Later"'));
assert.equal((source.match(/apiIntakePaperUpload\.run\(/g)||[]).length,1);
assert.equal((source.match(/qIntakePaperRequest\.run\(/g)||[]).length,1);
assert.ok(source.indexOf('qSubmitAtomicIntake.run(')<source.indexOf('apiIntakePaperUpload.run('));
assert.ok(source.includes('paper_upload_checkpoint'));
assert.ok(source.includes('qIntakePaperReceipt.run('));
const paperPicker=JSON.parse(read('pages/Intake/widgets/frmIntake/tabsMemberEnrollment/FilePickerAgreement.json'));
assert.ok(paperPicker.isVisible.includes("selAgreementDelivery.selectedOptionValue === 'Paper'"));
console.log('PASS Intake paper upload preflight, one dispatch and receipt recovery source guards');

// A completed previous paper upload must not block a different Participant's Intake.
// Unknown/pending states remain protected regardless of the current Participant selection.
for(const [state, blocked] of [['committed',false],['uncertain',true],['pending',true],['cancelled',true]]) {
  const context={appsmith:{store:{paper_upload_checkpoint:{owner:'reviewer@example.invalid',state}}}};
  const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.intake='),context);
  assert.equal(flows.paperUploadBlocked('reviewer@example.invalid'),blocked,'checkpoint state '+state);
  assert.equal(flows.paperUploadBlocked('different@example.invalid'),false,'owner-scoped checkpoint');
}
{
  const context={appsmith:{store:{paper_upload_checkpoint:null}}};
  const flows=vm.runInNewContext(source.replace(/^export default/,'globalThis.intake='),context);
  assert.equal(flows.paperUploadBlocked('reviewer@example.invalid'),false);
}
assert.equal((source.match(/this\.paperUploadBlocked\(submissionOwner\)/g)||[]).length,3,'all three pre-dispatch gates must share the same checkpoint rule');
console.log('PASS completed paper receipt allows new Intake; uncertain/unknown states still block dispatch');
