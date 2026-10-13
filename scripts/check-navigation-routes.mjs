// Check literal internal page targets; dynamic URLs and live SDK navigation need separate acceptance.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(new URL('../pages/',import.meta.url).pathname),pages=new Set(fs.readdirSync(root));let checked=0;const errors=[];
function scan(value,file) {
 if(Array.isArray(value))value.forEach(v=>scan(v,file));
 else if(value&&typeof value==='object')Object.values(value).forEach(v=>scan(v,file));
 else if(typeof value==='string') {
  const source=value.replace(/^\s*\/\/.*$/gm,'');
  for(const match of source.matchAll(/navigateTo\(\s*(["'])(.*?)\1/g)) {
   const target=match[2];if(/^https?:\/\/|^mailto:|^\//.test(target))continue;
   checked++;if(!pages.has(target))errors.push(file+': '+target);
  }
 }
}
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.name.endsWith('.json'))scan(JSON.parse(fs.readFileSync(full,'utf8')),full);else if(item.name.endsWith('.js'))scan(fs.readFileSync(full,'utf8'),full);}}
walk(root);if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('PASS '+checked+' literal internal navigation targets resolve to retained pages');
