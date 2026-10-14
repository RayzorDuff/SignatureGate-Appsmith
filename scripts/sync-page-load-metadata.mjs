// Keep the v2.4.2 page-load registration complete; never change action execution modes.
import fs from 'node:fs';
import {compileAppsmithCollection} from './appsmith-js-object.mjs';
const root=new URL('../pages/',import.meta.url),check=process.argv.includes('--check');let checked=0,changed=0;
export function actionBody(fn) {
  const source=fn.toString();
  // Page-load methods are async methods with simple argument lists (currently no args).
  const match=source.match(/^async\s+[A-Za-z_$][\w$]*\s*(\([^]*?\))\s*(\{[^]*\})$/);
  if(!match) throw Error('Page-load function must be an async method');
  return 'async '+match[1]+' => '+match[2];
}
for(const page of fs.readdirSync(root)) {
 const pageRoot=new URL(encodeURIComponent(page)+'/',root);
 for(const name of fs.readdirSync(new URL('queries/',pageRoot))) {
  const file=new URL('queries/'+encodeURIComponent(name)+'/metadata.json',pageRoot);
  if(!fs.existsSync(file))continue; // Removed actions can leave an empty directory locally.
  const d=JSON.parse(fs.readFileSync(file,'utf8')),a=d.unpublishedAction;
  if(d.pluginType!=='JS'||a.runBehaviour!=='ON_PAGE_LOAD')continue;
  const owner=a.fullyQualifiedName.split('.')[0];
  const source=fs.readFileSync(new URL('jsobjects/'+encodeURIComponent(owner)+'/'+encodeURIComponent(owner)+'.js',pageRoot),'utf8');
  const object=compileAppsmithCollection(source,page+'/'+owner).runInNewContext({});
  const body=actionBody(object[a.name]);checked++;
  const config=a.actionConfiguration;
  if(config.body!==body||config.isAsync!==true||a.clientSideExecution!==true) {
   if(check)throw Error(page+'/'+name+': incomplete or stale async page-load registration');
   config.body=body;config.isAsync=true;a.clientSideExecution=true;
   fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');changed++;
  }
 }
}
console.log('Page-load registrations: '+checked+' complete async functions; '+changed+' changed');
