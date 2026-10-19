// Appsmith 2.4.2 table titles are literal text; date cells must read timestamps, not URLs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
let tables=0;
function visit(dir) {
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())visit(full);
  else if(entry.name.endsWith('.json')&&full.includes('/widgets/')) {
   const widget=JSON.parse(fs.readFileSync(full,'utf8'));
   if(!widget.primaryColumns)continue;
   tables++;
   for(const [field,column] of Object.entries(widget.primaryColumns)) {
    assert.doesNotMatch(column.label||'',/{{|}}/,full+'/'+field+' literal title');
    if(column.columnType!=='url')assert.equal(column.displayText,undefined,full+'/'+field+' obsolete URL text');
   }
  }
 }
}
visit(fileURLToPath(new URL('pages/',root)));
const widget=JSON.parse(fs.readFileSync(new URL('pages/Agreement Templates/widgets/tblAgreementTemplates.json',root)));
for(const field of ['created_at','updated_at']) {
 const column=widget.primaryColumns[field];assert.equal(column.columnType,'text');
 assert.ok(widget.dynamicBindingPathList.some(p=>p.key==='primaryColumns.'+field+'.computedValue'));
 const evaluate=rows=>Array.from(vm.runInNewContext(column.computedValue.slice(2,-2),{tblAgreementTemplates:{processedTableData:rows}}));
 const timestamp='2026-01-02T03:04:05Z';
 assert.deepEqual(evaluate([]),[]);
 assert.deepEqual(evaluate([{[field]:timestamp,doc_url:'https://example.invalid/document'},{[field]:null},{[field]:''},{[field]:'invalid'}]),[new Date(timestamp).toLocaleString(),'','','']);
 assert.equal(evaluate([{[field]:timestamp}])[0],evaluate([{[field]:timestamp,doc_url:'https://example.invalid/other'}])[0]);
}
const removed=JSON.parse(fs.readFileSync(new URL('navigation/redundant-page-headings.json',root)));
for(const [page,names] of Object.entries(removed)) {
 assert.ok(fs.existsSync(new URL('pages/'+page+'/widgets/txtNavigationPage.json',root)));
 for(const name of names)assert.ok(!fs.existsSync(new URL('pages/'+page+'/widgets/'+name+'.json',root)));
}
console.log('PASS '+tables+' table title contracts; created/updated timestamp, empty/null/invalid vectors, document independence and retained-page redundant heading removals');
