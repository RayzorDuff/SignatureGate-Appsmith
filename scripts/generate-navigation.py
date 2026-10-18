#!/usr/bin/env python3
"""Generate v2.4.2 Menu Button navigation and shared presentation copies. --check never writes."""
from pathlib import Path
import argparse,copy,json,re,uuid
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');ARGS=parser.parse_args()
def read(path):return json.loads((ROOT/path).read_text())
pending={}
def comparable(value):
 # Native Git can reorder binding paths and remove a redundant static label binding.
 # Function arguments, menus and other ordered lists must keep their order.
 if isinstance(value,dict):
  result={key:comparable(item) for key,item in value.items()}
  for key in ['dynamicBindingPathList','dynamicTriggerPathList','dynamicPropertyPathList']:
   if isinstance(result.get(key),list):
    paths=result[key]
    if key=='dynamicBindingPathList' and '{{' not in str(value.get('label','')):
     paths=[item for item in paths if item!={'key':'label'}]
    result[key]=sorted(paths,key=lambda item:json.dumps(item,sort_keys=True))
  return result
 if isinstance(value,list):return [comparable(item) for item in value]
 return value

def emit(path,value):
 file=ROOT/path
 if isinstance(value,(dict,list)):
  if file.exists() and comparable(json.loads(file.read_text()))==comparable(value):return
  pending[path]=json.dumps(value,indent=2,ensure_ascii=False)+'\n'
 else:pending[path]=value

def existing_metadata(path,fallback):
 # gitSyncId is a persistent resource identity, not a generated display name.
 # In particular, never replace an Appsmith-recreated resource's identity.
 if (ROOT/path).exists():
  value=read(path)
  if not value.get('gitSyncId'):raise SystemExit('Existing resource lacks gitSyncId: '+path)
  return value
 value=copy.deepcopy(fallback)
 prefix=read('pages/Directory/Directory.json')['gitSyncId'].split('_')[0]
 value['gitSyncId']=prefix+'_'+str(uuid.uuid4())
 return value
registry=read('navigation/registry.json')
pages=sorted(p.name for p in (ROOT/'pages').iterdir() if p.is_dir())
registered=[i['page'] for g in registry['groups'] for i in g['items']]+registry['contextPages']+registry['unlistedPages']
assert len(set(registered))==len(registered) and set(registered)==set(pages),'Every page must have exactly one navigation disposition'
db_template=read('pages/Terminology Administration/queries/qTerminologyAccess/metadata.json')
js_template=read('pages/Terminology Administration/queries/terminologyAdminFlows-save/metadata.json')
label_source=(ROOT/'navigation/labels.js').read_text()
if not re.search(r'^export default[\s]*?({[\s\S]*?})',label_source):
 raise SystemExit('Navigation label source must start with export default for Appsmith 2.4.2; put comments inside the object')
actor="""qNavigationAccess.data?.[0]"""
linked=f"Boolean({actor}?.person_id && String({actor}?.email || '').trim().toLowerCase() === String(appsmith.user?.email || '').trim().toLowerCase())"
def allowed(permission):
 if permission is None:return 'true'
 if permission in ['reports','audit']:check=f"({actor}?.is_document_reviewer === true || {actor}?.is_donations_reviewer === true || {actor}?.is_practitioner === true)"

 else:check=f'{actor}?.{permission} === true'
 return linked+' && '+check
sql_access="""-- Read-only canonical menu authority; no operational identity/contact/financial rows.
SELECT person_id,member_id,email,is_directory_manager,is_document_reviewer,is_donations_reviewer,is_practitioner,
 can_intake,can_member_functions,can_practitioner_admin,can_release,can_contributor_functions,can_cash_deposits
FROM public.application_access({{ appsmith.user?.email || '' }}::text);
"""
sql_terms='SELECT * FROM public.issue20_organization_terminology();\n'
def query(page,name,body):
 path=f'pages/{page}/queries/{name}/metadata.json'
 d=existing_metadata(path,db_template);d['id']=page+'_'+name
 a=d['unpublishedAction'];a['name']=name;a['pageId']=page;a['actionConfiguration']['body']=body;a['runBehaviour']='MANUAL';a['userSetOnLoad']=True
 a['dynamicBindingPathList']=[{'key':'body'}] if '{{' in body else []
 emit(f'pages/{page}/queries/{name}/metadata.json',d);emit(f'pages/{page}/queries/{name}/{name}.txt',body)
word=re.compile(r'\b(?:Members?|Membership|Participants?|Facilitators?|Spiritual Practitioners?|Contributors?)\b',re.I)
quoted=re.compile(r'''(["'])(?:\\.|(?!\1)[^\\])*?\1''')
def presentation(value):
 if not word.search(value):return value
 if '{{' not in value:return '{{ navigationLabels.text('+json.dumps(value,ensure_ascii=False)+') }}'
 # Replace static UI text only, preserving enum keys, property keys and operational values.
 def replace(match):
  literal=match.group()[1:-1]
  if literal.lower() in ['member','contributor','participant','practitioner','membership']:return match.group()
  if not word.search(literal) or re.match(r'^[a-z]+[_.:][\w.:-]+$',literal):return match.group()
  if 'navigationLabels.text' in value:return match.group()
  return 'navigationLabels.text('+match.group()+')'
 return quoted.sub(replace,value)
def transform_widget(d):
 bindings=[]
 def walk(v,path=''):
  if isinstance(v,dict):
   for key,value in list(v.items()):
    prop=f'{path}.{key}' if path else key
    if key in ['text','label','tooltip','placeholderText'] and isinstance(value,str):
     changed=presentation(value)
     if changed!=value:v[key]=changed;bindings.append(prop)
    else:walk(value,prop)
  elif isinstance(v,list):
   for i,x in enumerate(v):walk(x,f'{path}.{i}')
 walk(d)
 for key in bindings:
  if not any(x.get('key')==key for x in d.get('dynamicBindingPathList',[])):d.setdefault('dynamicBindingPathList',[]).append({'key':key})
 return d
for page in pages:
 query(page,'qNavigationAccess',sql_access);query(page,'qNavigationTerminology',sql_terms)
 collection_path=f'pages/{page}/jsobjects/navigationLabels/metadata.json'
 collection=existing_metadata(collection_path,{'id':page+'_navigationLabels','unpublishedCollection':{'name':'navigationLabels','pageId':page,'pluginId':'js-plugin','pluginType':'JS','variables':[]}})
 emit(f'pages/{page}/jsobjects/navigationLabels/metadata.json',collection);emit(f'pages/{page}/jsobjects/navigationLabels/navigationLabels.js',label_source)
 for method,args in [('label',['concept','plural']),('text',['copy']),('accessState',[]),('accessMessage',[]),('initialize',[])]:
  path=f'pages/{page}/queries/navigationLabels-{method}/metadata.json'
  d=existing_metadata(path,js_template);d['id']=page+'_navigationLabels.'+method
  a=d['unpublishedAction'];a['collectionId']=page+'_navigationLabels';a['name']=method;a['fullyQualifiedName']='navigationLabels.'+method;a['pageId']=page;a['runBehaviour']='MANUAL';a['userSetOnLoad']=True;a['actionConfiguration']['jsArguments']=[next((item for item in a['actionConfiguration'].get('jsArguments',[]) if item.get('name')==name),{'name':name}) for name in args]
  if method=='initialize':
   a['runBehaviour']='ON_PAGE_LOAD'
   a['actionConfiguration']['timeoutInMillisecond']=60000
  emit(f'pages/{page}/queries/navigationLabels-{method}/metadata.json',d)
 first=not (ROOT/f'pages/{page}/widgets/navMenuPeople.json').exists()
 for widget in (ROOT/f'pages/{page}/widgets').rglob('*.json'):
  if widget.name.startswith('navMenu') or widget.name=='txtNavigationPage.json':continue
  d=json.loads(widget.read_text())
  original=copy.deepcopy(d)
  if first and d.get('parentId')=='0' and d.get('type')!='MODAL_WIDGET':
   for field in ['topRow','bottomRow','originalTopRow','originalBottomRow']:
    if isinstance(d.get(field),(int,float)):d[field]+=12
   for field in ['mobileTopRow','mobileBottomRow']:
    if isinstance(d.get(field),(int,float)):d[field]+=24
  if page!='Terminology Administration':d=transform_widget(d)
  if d!=original:emit(str(widget.relative_to(ROOT)),d)
 p=f'pages/{page}/{page}.json';d=read(p);d['unpublishedPage']['isHidden']=page!='Directory'
 if first:
  for layout in d['unpublishedPage']['layouts']:
   canvas=layout['dsl'];canvas['bottomRow']=canvas.get('bottomRow',450)+120;canvas['minHeight']=canvas.get('minHeight',450)+120;canvas['snapRows']=canvas.get('snapRows',43)+12
 emit(p,d)
 for index,group in enumerate(registry['groups']):
  name='navMenu'+group['key'].title();menu={};bindings=[{'key':'label'},{'key':'menuColor'},{'key':'borderRadius'},{'key':'isVisible'}];triggers=[]
  for pos,item in enumerate(group['items']):
   key='item'+str(pos+1);expr=allowed(item['permission']);params='{}'
   if item['page']=='Member Functions':params="{member_id:(qNavigationAccess.data?.[0]?.is_document_reviewer || qNavigationAccess.data?.[0]?.is_practitioner)?'':qNavigationAccess.data?.[0]?.member_id || ''}"
   menu[key]={'id':key,'widgetId':name,'index':pos,'label':'{{ navigationLabels.text('+json.dumps(item['label'])+') }}','isVisible':'{{ '+expr+' }}','isDisabled':False,'onClick':'{{ navigateTo('+json.dumps(item['page'],ensure_ascii=False)+','+params+',"SAME_WINDOW") }}'}
   bindings.extend([{'key':f'menuItems.{key}.label'},{'key':f'menuItems.{key}.isVisible'}]);triggers.append({'key':f'menuItems.{key}.onClick'})
  if index==0:
   menu['refresh']={'id':'refresh','widgetId':name,'index':len(menu),'label':'Refresh access','isVisible':True,'isDisabled':False,'onClick':'{{ navigationLabels.initialize() }}'};triggers.append({'key':'menuItems.refresh.onClick'})
  visible='true' if index==0 else '('+' || '.join('('+allowed(i['permission'])+')' for i in group['items'])+')'
  d={'widgetName':name,'widgetId':name,'key':name,'parentId':'0','type':'MENU_BUTTON_WIDGET','version':1,'menuItemsSource':'STATIC','menuItems':menu,
   'label':group['label'],'menuVariant':'SECONDARY','menuColor':'{{appsmith.theme.colors.primaryColor}}','borderRadius':'{{appsmith.theme.borderRadius.appBorderRadius}}','boxShadow':'none',
   'isCompact':False,'isDisabled':False,'isVisible':'{{ '+visible+' }}','animateLoading':True,'placement':'CENTER','renderMode':'CANVAS','responsiveBehavior':'hug','minWidth':120,
   'topRow':0,'bottomRow':4,'originalTopRow':0,'originalBottomRow':4,'leftColumn':index*16,'rightColumn':(index+1)*16,'parentRowSpace':10,'parentColumnSpace':19.125,
   'mobileTopRow':index*5,'mobileBottomRow':index*5+4,'mobileLeftColumn':0,'mobileRightColumn':64,
   'dynamicBindingPathList':bindings,'dynamicTriggerPathList':triggers,'dynamicPropertyPathList':triggers}
  emit(f'pages/{page}/widgets/{name}.json',d)
 titles={i['page']:i['label'] for g in registry['groups'] for i in g['items']};title=titles.get(page,page)
 d=read('pages/Terminology Administration/widgets/txtTerminologyDenied.json');d.update(widgetName='txtNavigationPage',widgetId='navigation-current-page',key='navigation-current-page',parentId='0',isVisible=True,topRow=5,bottomRow=9,originalTopRow=5,originalBottomRow=9,mobileTopRow=20,mobileBottomRow=24,mobileLeftColumn=0,mobileRightColumn=64,minWidth=120,text='{{ "Current page: " + navigationLabels.text('+json.dumps(title,ensure_ascii=False)+') + (navigationLabels.accessMessage() ? " — " + navigationLabels.accessMessage() : "") }}')
 d['dynamicBindingPathList']=[{'key':'text'},{'key':'fontFamily'}]
 title_path=f'pages/{page}/widgets/txtNavigationPage.json'
 if (ROOT/title_path).exists():
  existing_title=read(title_path)
  for key in ['topRow','bottomRow','leftColumn','rightColumn','originalTopRow','originalBottomRow','mobileTopRow','mobileBottomRow','mobileLeftColumn','mobileRightColumn']:
   if key in existing_title:d[key]=existing_title[key]
 emit(title_path,d)
# Catch cloned persistent identities before writing any generated changes.
identities={}
metadata_paths={str(path.relative_to(ROOT)) for path in (ROOT/'pages').rglob('metadata.json')}
metadata_paths.update(path for path in pending if path.endswith('/metadata.json'))
for path in sorted(metadata_paths):
 parts=Path(path).parts
 if len(parts)!=5 or parts[2] not in ['queries','jsobjects']:continue
 value=json.loads(pending[path]) if path in pending else read(path)
 for key in ['id','gitSyncId']:
  identity=value.get(key)
  if not isinstance(identity,str) or not identity:raise SystemExit('Missing '+key+': '+path)
  scoped=(parts[2],key,identity)
  if scoped in identities:raise SystemExit('Duplicate '+key+': '+path+' and '+identities[scoped])
  identities[scoped]=path
changed=[path for path,content in pending.items() if not (ROOT/path).exists() or (ROOT/path).read_text()!=content]
if ARGS.check:
 if changed:raise SystemExit('Navigation generation differs: '+', '.join(changed[:12]))
 print('Navigation generation is current: all 18 pages, four groups and shared label source')
else:
 for path in changed:(ROOT/path).parent.mkdir(parents=True,exist_ok=True);(ROOT/path).write_text(pending[path])
 print(f'Generated {len(changed)} changed files from one menu registry and label source')
