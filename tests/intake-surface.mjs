// Guard the single transactional enrollment boundary after retiring duplicate writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
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
 if(d.pluginType==='API')assert.equal(name,'apiTriggerDocumenso','unreviewed external Intake surface');
 if(['qSubmitAtomicIntake','apiTriggerDocumenso'].includes(name)) {
  assert.equal(d.unpublishedAction.runBehaviour,'MANUAL');assert.equal(d.unpublishedAction.userSetOnLoad,true);
 }
}
const audit=read('pages/Intake/queries/qAuditLog/qAuditLog.txt');
assert.ok(!audit.includes("'intake.completed'"),'completion audit belongs to the enrollment transaction');
assert.ok(audit.includes("= 'member.create_blocked_duplicate'"));
console.log('PASS unified Intake surface: one native/menu entry, no retired partial-write/upload actions, one guarded transaction dispatch and server-owned completion audit');
