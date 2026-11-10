import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compileAppsmithCollection} from '../scripts/appsmith-js-object.mjs';

const valid='export default {\n // Presentation comments belong here.\n label() { return "Participant"; }\n};';
assert.equal(compileAppsmithCollection(valid).runInNewContext({}).label(),'Participant');
for (const prefix of ['// Comment before export\n','/* Comment before export */\n','\n','\uFEFF']) {
  const source=prefix+valid;
  // These are valid JavaScript, so an ordinary VM syntax check missed the defect.
  assert.doesNotThrow(()=>new vm.Script(source.replace('export default','globalThis.collection=')));
  assert.throws(()=>compileAppsmithCollection(source,'synthetic collection'),/must start with export default/);
}
assert.throws(()=>compileAppsmithCollection('export default 42;'),/must start with export default/);
assert.throws(()=>compileAppsmithCollection('export default { broken( }'),SyntaxError);
console.log('PASS v2.4.2 JS object entry: reject JS-valid leading comments/whitespace/BOM and non-object exports; accept internal comments and check syntax');
