// Validate native Git declarations against JS object source; never write runtime-only bodies.
import fs from 'node:fs';
import {compileAppsmithCollection} from './appsmith-js-object.mjs';
const root=new URL('../pages/',import.meta.url);let checked=0;
for(const page of fs.readdirSync(root)) {
 const pageRoot=new URL(encodeURIComponent(page)+'/',root);
 for(const name of fs.readdirSync(new URL('queries/',pageRoot))) {
  const file=new URL('queries/'+encodeURIComponent(name)+'/metadata.json',pageRoot);
  if(!fs.existsSync(file))continue;
  const d=JSON.parse(fs.readFileSync(file,'utf8')),a=d.unpublishedAction;
  if(d.pluginType!=='JS'||a.runBehaviour!=='ON_PAGE_LOAD')continue;
  const owner=a.fullyQualifiedName?.split('.')[0];
  const metaFile=new URL('jsobjects/'+encodeURIComponent(owner)+'/metadata.json',pageRoot);
  const collection=JSON.parse(fs.readFileSync(metaFile,'utf8'));
  if(a.userSetOnLoad!==true||a.collectionId!==collection.id||a.fullyQualifiedName!==collection.unpublishedCollection.name+'.'+a.name)throw Error(page+'/'+name+': inconsistent page-load declaration');
  const source=fs.readFileSync(new URL('jsobjects/'+encodeURIComponent(owner)+'/'+encodeURIComponent(owner)+'.js',pageRoot),'utf8');
  const object=compileAppsmithCollection(source,page+'/'+owner).runInNewContext({});
  if(typeof object[a.name]!=='function'||object[a.name].constructor.name!=='AsyncFunction')throw Error(page+'/'+name+': missing async source method');
  // v2.4.2 CommonGitFileUtilsCE removes JS function bodies on serialization.
  // ActionConfiguration.isAsync is deprecated and must not determine acceptance.
  if(Object.hasOwn(a.actionConfiguration,'body'))throw Error(page+'/'+name+': keep JS body in the JS object source, not function metadata');
  checked++;
 }
}
console.log('PASS '+checked+' declared async page-load functions; native Git representation checked, deployed schedule unverified');
