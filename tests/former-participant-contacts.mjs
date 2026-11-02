// Exercise saved native widget bindings, including controls sharing the selector.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../pages/Individual%20Profile/widgets/manageContactsContainer/',import.meta.url);
const names=['btnReassignIndividualContact','selIndividualRoleContactToArchive','selIndividualContactReassignTarget','inpIndividualRoleContactReason','btnAddIndividualRoleContact','btnArchiveIndividualRoleContact','btnSetIndividualEmailPrimary','btnVerifyIndividualEmail','btnToggleIndividualEmailSubscription'];
const widgets=Object.fromEntries(names.map(name=>[name,JSON.parse(fs.readFileSync(new URL(name+'.json',root),'utf8'))]));
function context(status='inactive',manage=true,capacity='member') {
 const c={};
 for(const widget of Object.values(widgets))for(const value of Object.values(widget))if(typeof value==='string')for(const name of value.matchAll(/\bq[A-Z][A-Za-z0-9_]*/g))c[name[0]]={isLoading:false,data:[]};
 Object.assign(c,{qIndividualMemberOperationsState:{data:[{can_view:true,can_manage:manage,membership_status:status}]},qIndividualCanEditDonorContacts:{data:[{can_edit:false}]},qIndividualProfile:{data:[{party_id:'source'}]},selIndividualContactCapacity:{selectedOptionValue:capacity},selIndividualRoleContactKind:{selectedOptionValue:'email'},selIndividualRoleContactToArchive:{selectedOptionValue:'synthetic-contact'},selIndividualContactReassignTarget:{selectedOptionValue:'target'},inpIndividualRoleContactReason:{text:'Correct synthetic ownership'},qIndividualMembershipContacts:{data:[{contact_id:'synthetic-contact',contact_kind:'email',contact_value:'synthetic@example.invalid',is_primary:true,is_verified:false,mailing_subscription_status:'not_subscribed'}]}});
 return c;
}
function field(name,key,c){const expr=widgets[name][key];return typeof expr==='string'&&expr.startsWith('{{')?vm.runInNewContext(expr.slice(2,-2),c):expr;}
for(const status of ['active','inactive']) {
 const c=context(status);
 assert.equal(field('btnReassignIndividualContact','isDisabled',c),false,'reviewer can correct either source enrollment');
 assert.equal(field('selIndividualRoleContactToArchive','isDisabled',c),false,'reviewer can select retained contact');
 for(const [name,patch] of [['missing contact',{selIndividualRoleContactToArchive:{selectedOptionValue:''}}],['missing target',{selIndividualContactReassignTarget:{selectedOptionValue:''}}],['blank reason',{inpIndividualRoleContactReason:{text:' '}}],['busy',{qReassignIndividualContact:{isLoading:true}}]])assert.equal(field('btnReassignIndividualContact','isDisabled',{...c,...patch}),true,name);
}
for(const status of ['active','inactive']) {
 const c=context(status,false);
 assert.equal(field('btnReassignIndividualContact','isDisabled',c),true,'view-only actor cannot reassign');
 assert.equal(field('selIndividualRoleContactToArchive','isDisabled',c),true,'view-only actor cannot use maintenance selector');
}
for(const status of ['active','inactive']) {
 const c=context(status);
 assert.equal(field('selIndividualContactReassignTarget','isDisabled',c),false,'reviewer can choose an active target from either source enrollment');
 assert.equal(field('inpIndividualRoleContactReason','isDisabled',c),false,'reviewer can enter the required correction reason');
 assert.equal(field('selIndividualContactReassignTarget','isDisabled',{...c,selIndividualRoleContactToArchive:{selectedOptionValue:''}}),true,'target requires a selected source contact');
 const denied=context(status,false);
 assert.equal(field('selIndividualContactReassignTarget','isDisabled',denied),true,'view-only actor cannot select correction target');
 assert.equal(field('inpIndividualRoleContactReason','isDisabled',denied),true,'view-only actor cannot edit correction reason');
}
const inactive=context();
for(const name of ['btnAddIndividualRoleContact','btnArchiveIndividualRoleContact','btnSetIndividualEmailPrimary','btnVerifyIndividualEmail','btnToggleIndividualEmailSubscription'])assert.equal(field(name,'isDisabled',inactive),true,name+' remains disabled for ended enrollment');
assert.equal(field('btnReassignIndividualContact','isDisabled',context('active',false,'contributor')),true,'Participant reviewer does not gain Contributor authority');
const targets=context();targets.qIndividualReassignTargets={data:[{person_id:'target',member_id:'active',membership_status:'active',display_name:'Synthetic Target'},{person_id:'ended',member_id:'inactive',membership_status:'inactive'},{person_id:'source',member_id:'source-active',membership_status:'active'}]};
assert.deepEqual(Array.from(field('selIndividualContactReassignTarget','sourceData',targets),x=>x.value),['target'],'only a different active target is offered');
console.log('PASS former Participant contact correction: reviewer-only source selection, active targets, reason/busy guards and other ended-enrollment writes remain disabled');
