// Bind native Select captions, and display configuration as read-only text cells.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const source=fs.readFileSync(new URL('navigation/labels.js',root),'utf8');
for(const [member,practitioner] of [['Participant','Spiritual Practitioner'],['Attendee','Guide'],['Member','Custom Practitioner']]) {
 const rows=[{concept_key:'member',singular_label:member,plural_label:member+'s',is_active:true},{concept_key:'practitioner',singular_label:practitioner,plural_label:practitioner+'s',is_active:true}];
 rows.push({concept_key:'contributor',singular_label:'Supporter',plural_label:'Supporters',is_active:true});
 const c={appsmith:{store:{}},qNavigationTerminology:{data:rows}};c.navigationLabels=vm.runInNewContext(source.replace(/^export default/,'globalThis.labels='),c);
 for(const [page,name,expected] of [['Facilitator Functions','selMember',practitioner],['Member Functions','selAssignedFacilitator',practitioner],['Member Functions','inpFacilitator',practitioner+' for Agreement'],['Sacrament Release','selFacilitator',practitioner],['Member Functions','selMember',member],['Sacrament Release','selMember',member],['Facilitator Functions','selParticipantToAssign','Select '+member]]) {
  const w=read('pages/'+page+'/widgets/'+name+'.json');
  assert.ok(w.dynamicBindingPathList.some(p=>p.key==='labelText'),page+'/'+name+' missing labelText binding');
  assert.equal(vm.runInNewContext(w.labelText.slice(2,-2),c),expected,page+'/'+name);
  if(name==='selParticipantToAssign')assert.equal(vm.runInNewContext(w.placeholderText.slice(2,-2),c),'Select '+member);
 }
 // Exercise the saved menu/title bindings, not just the shared formatter.
 const pageNames=fs.readdirSync(new URL('pages/',root));
 for(const page of pageNames) {
  const practice=read('pages/'+page+'/widgets/navMenuPractice.json');
  const contributions=read('pages/'+page+'/widgets/navMenuContributions.json');
  assert.equal(vm.runInNewContext(practice.menuItems.item1.label.slice(2,-2),c),member+' Functions',page+' Participant navigation');
  assert.equal(vm.runInNewContext(contributions.menuItems.item1.label.slice(2,-2),c),'Supporter Functions',page+' Contributor navigation');
  assert.ok(practice.menuItems.item1.onClick.includes('navigateTo("Member Functions"'),'stable route');
 }
 for(const [page,expected] of [['Member Functions',member+' Functions'],['Contributor Functions','Supporter Functions']]) {
  const title=read('pages/'+page+'/widgets/txtNavigationPage.json');
  assert.equal(vm.runInNewContext(title.text.slice(2,-2),c).split(' — ')[0],'Current page: '+expected);
 }
 const directory=read('pages/Directory/widgets/tblDirectory.json');
 for(const [key,expected] of [['customColumn3',member+' Functions'],['customColumn4','Supporter Functions']]) {
  assert.ok(directory.dynamicBindingPathList.some(p=>p.key==='primaryColumns.'+key+'.buttonLabel'));
  const expr=directory.primaryColumns[key].buttonLabel.slice(2,-2);
  assert.deepEqual(Array.from(vm.runInNewContext(expr,{...c,tblDirectory:{processedTableData:[]}})),[]);
  assert.deepEqual(Array.from(vm.runInNewContext(expr,{...c,tblDirectory:{processedTableData:[{},{}]}})),[expected,expected]);
 }
 const contact=read('pages/Individual Profile/widgets/manageContactsContainer/txtIndividualRoleContactsNote.json');
 assert.equal(vm.runInNewContext(contact.text.slice(2,-2),{...c,selIndividualContactCapacity:{selectedOptionValue:'member'}}),'Editing '+member+' enrollment contacts.');
 const choices=read('pages/Individual Profile/widgets/manageContactsContainer/selIndividualContactCapacity.json');
 const options=vm.runInNewContext(choices.sourceData.slice(2,-2),{...c,qIndividualMemberOperationsState:{data:[{can_view:true}]},qIndividualCanEditDonorContacts:{data:[{can_edit:true}]},qIndividualProfile:{data:[{contributor_id:'synthetic'}]}});
 assert.equal(options[0].label,member+' enrollment');assert.equal(options[0].value,'member');assert.equal(options[1].label,'Supporter');assert.equal(options[1].value,'contributor');
 const note=read('pages/Company Profile/widgets/companyContactsContainer/txtCompanyDonorContactsNote.json');
 assert.equal(vm.runInNewContext(note.text.slice(2,-2),c),'Company contacts are managed for Supporter capacity. '+member+' enrollment contacts belong to individual profiles.');
}
const table=read('pages/Terminology Administration/widgets/tblCurrentTerminology.json');
assert.equal(table.allowAddNewRow,false);assert.equal(table.dynamicTriggerPathList.length,0);
assert.ok(table.dynamicBindingPathList.some(p=>p.key==='isVisible'));assert.ok(table.dynamicBindingPathList.some(p=>p.key==='tableData'));
const rows=[{concept_key:'member',concept_kind:'entity',singular_label:'Participant',plural_label:'Participants',short_label:null,is_active:true},
 {concept_key:'facilitator',concept_kind:'appointment',singular_label:'<b>Literal label</b>',plural_label:'Reserved',is_active:false}];
for(const access of [false,true]) {
 const c={terminologyAdminFlows:{hasAccess:()=>access},qTerminology:{data:rows}};
 const data=vm.runInNewContext(table.tableData.slice(2,-2),c);assert.equal(data.length,access?2:0);
 assert.equal(vm.runInNewContext(table.isVisible.slice(2,-2),c),access);
 if(access) {assert.equal(data[0].short_label,'');assert.equal(data[0].presentation_state,'Active');assert.equal(data[1].presentation_state,'Inactive / reserved');assert.equal(data[1].singular_label,rows[1].singular_label);}
}
for(const [key,col] of Object.entries(table.primaryColumns)) {
 assert.equal(col.columnType,'text');assert.equal(col.isEditable,false);assert.equal(col.isCellEditable,false);assert.doesNotMatch(col.label,/{{/);
 assert.ok(table.dynamicBindingPathList.some(p=>p.key==='primaryColumns.'+key+'.computedValue'));
 assert.deepEqual(Array.from(vm.runInNewContext(col.computedValue.slice(2,-2),{tblCurrentTerminology:{processedTableData:[]}})),[]);
}
console.log('PASS Select labelText/placeholder bindings with default, alternate and preserved legacy terminology; manager-only read-only active/reserved terminology structure');
