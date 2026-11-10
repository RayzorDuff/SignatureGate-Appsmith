// Actual saved widget expressions, synthetic row states; no browser or database.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const widget=JSON.parse(fs.readFileSync(new URL('../pages/Member%20Functions/widgets/AgreementsTable.json',import.meta.url),'utf8'));
const columns=widget.primaryColumns;
const rows=[
 {status:'pending_review',signature_method:'paper',review_notes:'Synthetic review'},
 {status:'pending_review',signature_method:'paper',review_notes:' '},
 {status:'signed',signature_method:'paper',review_notes:'Synthetic review'},
 {status:'pending_signature',signature_method:'documenso',documenso_document_id:'synthetic-document',review_notes:'Synthetic cancellation'},
 {status:'pending_signature',signature_method:'documenso',documenso_document_id:'',review_notes:'Synthetic cancellation'}
];
function evaluate(column,property,data,reviewer=true) {
 const binding=columns[column][property];
 return Array.from(vm.runInNewContext(binding.slice(2,-2),{AgreementsTable:{processedTableData:data},appsmith:{store:{facilitator_is_reviewer:reviewer}}}));
}
for(const data of [undefined,null,[]]) {
 for(const name of ['customColumn1','customColumn2','customColumn3'])assert.deepEqual(evaluate(name,'isDisabled',data),[]);
 assert.deepEqual(evaluate('review_notes','isCellEditable',data),[]);
}
for(const name of ['customColumn1','customColumn2'])assert.deepEqual(evaluate(name,'isDisabled',rows),[false,true,true,true,true]);
assert.deepEqual(evaluate('customColumn3','isDisabled',rows),[true,true,true,false,true]);
assert.deepEqual(evaluate('review_notes','isCellEditable',rows),[true,true,false,true,true]);
assert.deepEqual(evaluate('review_notes','isCellEditable',rows,false),[false,false,false,false,false]);
assert.deepEqual(evaluate('customColumn1','isDisabled',[]),[],'refresh from populated to empty must be safe');
console.log('PASS saved agreement-table bindings: missing/empty/cleared data without global currentRow; pending/reason/reviewer/cancellation rules retained');
