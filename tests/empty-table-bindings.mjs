// Empty-column vectors must be arrays, with populated rows preserving their exact values.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(new URL('../pages/',import.meta.url).pathname);let checked=0,empty=0;
function visit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())visit(full);else if(item.name.endsWith('.json')&&full.includes('/widgets/')){
 const widget=JSON.parse(fs.readFileSync(full,'utf8'));
 for(const [field,column] of Object.entries(widget.primaryColumns||{})) {
  const source=column.computedValue;if(typeof source!=='string'||!source.includes('tableData.map'))continue;
  if(!source.startsWith('{{')||!source.endsWith('}}'))continue;
  assert.doesNotMatch(source,/:\s*(?!null\b|undefined\b|false\b|true\b)[A-Za-z_$][\w$]*\s*\}\)\(\)\s*}}/);
  const run=rows=>vm.runInNewContext(source.slice(2,-2),{[widget.widgetName]:{processedTableData:rows}});
  assert.deepEqual(Array.from(run([])),[],full+'/'+field+' empty');
  empty++;
  // Independent typed-value assertions apply to direct column vectors, not formatters.
  const direct=new RegExp('tableData\\.map\\(\\(currentRow, currentIndex\\) => \\(currentRow\\['+JSON.stringify(field).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\]\\)\\)');
  if(!direct.test(source))continue;
  const expected=[null,'Synthetic value',7,true];assert.deepEqual(Array.from(run(expected.map(value=>({[field]:value})))),expected,full+'/'+field+' populated');checked++;
 }
}}}
visit(root);assert.ok(checked>=175);console.log('PASS '+empty+' empty mapped column bindings and '+checked+' direct vectors with null/text/number/boolean rows; no bare field fallback');
