// Syntax and v2.4.2 collection-entry preflight; runtime/linter scope and SDK remain separate.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {compileAppsmithCollection} from './appsmith-js-object.mjs';
const root=path.resolve(new URL('../pages/',import.meta.url).pathname);const expressions=new Map();let collections=0;
function values(value,file) {
 if(Array.isArray(value))value.forEach(v=>values(v,file));
 else if(value&&typeof value==='object')Object.values(value).forEach(v=>values(v,file));
 else if(typeof value==='string') {
  const text=value.trim();
  if(text.startsWith('{{')&&text.endsWith('}}')&&(text.match(/{{/g)||[]).length===1)expressions.set(text.slice(2,-2),file);
 }
}
function walk(dir) {
 for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
  const full=path.join(dir,item.name);
  if(item.isDirectory())walk(full);
  else if(item.name.endsWith('.json')) {const d=JSON.parse(fs.readFileSync(full,'utf8'));if(full.includes('/widgets/'))values(d,full);}
  else if(item.name.endsWith('.js')&&full.includes('/jsobjects/')){compileAppsmithCollection(fs.readFileSync(full,'utf8'),full);collections++;}
 }
}
try {
 walk(root);
 for(const [expression,file] of expressions) {
  try{new vm.Script('('+expression+')');}
  catch(error){try{new vm.Script('(async()=>{'+expression+'})');}catch(bodyError){throw Error(file+': '+bodyError.message);}}
 }
 console.log('PASS syntax/collection entry: '+collections+' JS collections and '+expressions.size+' unique widget expressions/action bodies; runtime scope is not certified');
}catch(error){console.error(error.message);process.exitCode=1;}
