// Native Menu Button contracts and capability menus; no backend mutations or external requests.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {compileAppsmithCollection} from '../scripts/appsmith-js-object.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),registry=JSON.parse(read('navigation/registry.json'));
const pages=fs.readdirSync(new URL('pages/',root)).sort();const dispositions=registry.groups.flatMap(g=>g.items.map(i=>i.page)).concat(registry.contextPages,registry.unlistedPages);
assert.deepEqual([...dispositions].sort(),pages);assert.equal(new Set(dispositions).size,pages.length);
function context(actor,terms=[]) {
 const c={appsmith:{user:{email:'synthetic-nav@example.invalid'},store:{},URL:{pathname:'/synthetic-page'},theme:{colors:{primaryColor:'#000'},borderRadius:{appBorderRadius:'0px'}}},qNavigationAccess:{data:actor?[actor]:[]},qNavigationTerminology:{data:terms},navigateTo:()=>{}};
 c.navigationLabels=compileAppsmithCollection(read('navigation/labels.js'),'navigation/labels.js').runInNewContext(c);return c;
}
function evaluate(value,c) {return typeof value==='string'&&value.startsWith('{{')?vm.runInNewContext(value.slice(2,-2),c):value;}
const base={email:'synthetic-nav@example.invalid',person_id:'synthetic-person',is_document_reviewer:false,is_donations_reviewer:false,is_practitioner:false,is_directory_manager:false,can_intake:false,can_member_functions:false,can_practitioner_admin:false,can_release:false,can_contributor_functions:false,can_cash_deposits:false};
const cases=[
 [null,['Directory']],
 [{...base,can_member_functions:true},['Directory','Member Functions']],
 [{...base,is_document_reviewer:true,can_intake:true,can_member_functions:true,can_practitioner_admin:true,can_contributor_functions:true},['Directory','Intake','Member Functions','Facilitator Functions','Contributor Functions','Reports','Agreement Templates','Audit Log']],
 [{...base,is_donations_reviewer:true,can_intake:true,can_cash_deposits:true,can_contributor_functions:true},['Directory','Intake','Contributor Functions','Cash Deposits','Reports','Audit Log']],
 [{...base,is_practitioner:true,can_member_functions:true,can_release:true,can_contributor_functions:true},['Directory','Member Functions','Sacrament Release','Contributor Functions','Reports','Audit Log']],
 [{...base,is_directory_manager:true},['Directory','Terminology Administration']],
 [{...base,email:'synthetic-other@example.invalid',is_donations_reviewer:true,can_intake:true,can_cash_deposits:true,can_contributor_functions:true},['Directory']]
];
for(const page of pages) {
 const p=JSON.parse(read('pages/'+page+'/'+page+'.json'));assert.equal(p.unpublishedPage.isHidden,page!=='Directory');
 for(const [actor,wanted] of cases) {
  const c=context(actor);const got=[];
  for(const group of registry.groups) {
   const menu=JSON.parse(read('pages/'+page+'/widgets/navMenu'+group.key[0].toUpperCase()+group.key.slice(1)+'.json'));
   assert.equal(menu.type,'MENU_BUTTON_WIDGET');assert.equal(menu.menuItemsSource,'STATIC');
   assert.equal(typeof evaluate(menu.isVisible,c),'boolean');if(!evaluate(menu.isVisible,c))continue;
   for(let n=0;n<group.items.length;n++) {
    const item=menu.menuItems['item'+(n+1)];assert.equal(typeof evaluate(item.isVisible,c),'boolean');if(evaluate(item.isVisible,c))got.push(group.items[n].page);
    const label=evaluate(item.label,c);assert.equal(typeof label,'string');assert.ok(label.trim().length>0,page+' visible menu caption');
    assert.ok(menu.dynamicTriggerPathList.some(p=>p.key==='menuItems.item'+(n+1)+'.onClick'));
   }
   assert.equal(menu.mobileRightColumn-menu.mobileLeftColumn,64);
  }
  assert.deepEqual(got,wanted,page+' capability menu');
 }
 for(const name of ['qNavigationAccess','qNavigationTerminology']) {
  const d=JSON.parse(read('pages/'+page+'/queries/'+name+'/metadata.json'));assert.equal(d.unpublishedAction.runBehaviour,'MANUAL');assert.equal(d.unpublishedAction.userSetOnLoad,true);assert.equal(d.pluginType,'DB');
  assert.doesNotMatch(read('pages/'+page+'/queries/'+name+'/'+name+'.txt'),/\b(?:INSERT|UPDATE|DELETE)\b|https?:\/\//i);
 }
 assert.equal(read('pages/'+page+'/jsobjects/navigationLabels/navigationLabels.js'),read('navigation/labels.js'));
 compileAppsmithCollection(read('pages/'+page+'/jsobjects/navigationLabels/navigationLabels.js'),page+' navigationLabels');
 const title=JSON.parse(read('pages/'+page+'/widgets/txtNavigationPage.json'));
 assert.ok(evaluate(title.text,context(base)).startsWith('Current page: '));
}
{
 const c=context(base);assert.equal(c.navigationLabels.text('Member Functions / Facilitator Functions'),'Participant Functions / Spiritual Practitioner Functions');
 c.qNavigationTerminology.data=[{concept_key:'member',singular_label:'Attendee',plural_label:'Attendees',is_active:true},{concept_key:'practitioner',singular_label:'Guide',plural_label:'Guides',is_active:true},{concept_key:'contributor',singular_label:'Supporter',plural_label:'Supporters',is_active:true}];
 assert.equal(c.navigationLabels.text('Members, Spiritual Practitioners and Contributors'),'Attendees, Guides and Supporters');
 assert.equal(c.navigationLabels.text('Membership contacts'),'Attendee enrollment contacts');
 c.qNavigationTerminology.data=[{concept_key:'member',singular_label:'Contributor',plural_label:'Contributors',is_active:true},{concept_key:'contributor',singular_label:'Supporter',plural_label:'Supporters',is_active:true}];
 assert.equal(c.navigationLabels.text('Participant'),'Contributor','configured labels must not be recursively retranslated');
 assert.equal(c.navigationLabels.text('member_id / facilitator_id'),'member_id / facilitator_id');
}
console.log('PASS generated navigation: all retained dispositions, seven authority/cache cases, retained Directory escape, guarded groups, registered triggers, mobile spans and alternate/colliding label configurations');
