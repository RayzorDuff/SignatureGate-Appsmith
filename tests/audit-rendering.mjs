import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c={qNavigationTerminology:{data:[]}};
c.navigationLabels=vm.runInNewContext(read('navigation/labels.js').replace(/^export default/m,'globalThis.labels='),c);
const f=vm.runInNewContext(read('pages/Audit Log/jsobjects/auditLogFlows/auditLogFlows.js').replace(/^export default/m,'globalThis.f='),c);
const result=f.formatDetails({detail_member_name:'Synthetic <img src=x onerror="example()">',details:{member_id:'synthetic-member',facilitator_id:'synthetic-practitioner',externalId:'<script>example()</script>',url:'javascript:example()',name:'Synthetic agreement <b>literal</b>',evidence:[null,{title:'Synthetic attachment "title"',url:'https://example.invalid/file?name="literal"'}],event:'transaction.synthetic',data:{id:'Synthetic/<id>',first_name:'Synthetic <strong>text</strong>',last_name:'Fixture & test',email:'synthetic@example.invalid',currency:'<code>ABC</code>',amount:1,contact_id:'Synthetic "contact"',campaign_id:'synthetic-campaign',campaign_title:'Synthetic <campaign>'}}});
assert.match(result,/Participant/);assert.match(result,/Spiritual Practitioner/);assert.doesNotMatch(result,/<img|<script>|<strong>|<code>|href="javascript:/);
assert.match(result,/&lt;img/);assert.match(result,/Fixture &amp; test/);assert.match(result,/rel="noopener noreferrer"/);assert.match(result,/name=&quot;literal&quot;/);
assert.match(result,/transactions\/Synthetic%2F%3Cid%3E/);
assert.equal(f.formatDetails({details_json:'{broken'}),'Audit details could not be parsed.');
assert.equal(f.formatDetails({details_json:'null'}),'Audit details are unavailable.');
assert.equal(f.formatDetails({}),'');
for(const url of ['javascript:example()','data:text/html,example','//example.invalid/file','https://user:password@example.invalid/file','https://example.invalid/line\nbreak']) {
 assert.doesNotMatch(f.formatDetails({details:{url,name:'Synthetic safe text'}}),/href=/,url);
}
c.qNavigationTerminology.data=[{concept_key:'member',singular_label:'Attendee',plural_label:'Attendees',is_active:true},{concept_key:'practitioner',singular_label:'Guide',plural_label:'Guides',is_active:true}];
const alt=f.formatDetails({detail_member_name:'Member & Participant are stored record values',details:{member_id:'synthetic',practitioner_person_id:'synthetic-guide'}});
assert.match(alt,/<b>Attendee:/);assert.match(alt,/<b>Guide:/);assert.match(alt,/Member &amp; Participant are stored record values/,'record wording must not be translated');
console.log('PASS audit rendering: configured headings, unchanged record words, escaped untrusted values, safe links, encoded IDs, malformed data and null attachment handling');
