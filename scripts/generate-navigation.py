#!/usr/bin/env python3
"""Generate v2.4.2 Menu Button navigation and shared presentation copies. --check never writes."""
from pathlib import Path
import argparse,copy,json,re
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');ARGS=parser.parse_args()
def read(path):return json.loads((ROOT/path).read_text())
pending={}
def emit(path,value):pending[path]=json.dumps(value,indent=2,ensure_ascii=False)+'\n' if isinstance(value,(dict,list)) else value
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
 d=copy.deepcopy(db_template);d['id']=page+'_'+name;d['gitSyncId']='navigation-'+page+'-'+name
 a=d['unpublishedAction'];a['name']=name;a['pageId']=page;a['actionConfiguration']['body']=body;a['runBehaviour']='AUTOMATIC';a['userSetOnLoad']=True
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
 collection={'gitSyncId':'navigation-labels-'+page,'id':page+'_navigationLabels','unpublishedCollection':{'name':'navigationLabels','pageId':page,'pluginId':'js-plugin','pluginType':'JS','variables':[]}}
 emit(f'pages/{page}/jsobjects/navigationLabels/metadata.json',collection);emit(f'pages/{page}/jsobjects/navigationLabels/navigationLabels.js',label_source)
 for method,args in [('label',['concept','plural']),('text',['copy'])]:
  d=copy.deepcopy(js_template);d['id']=page+'_navigationLabels.'+method;d['gitSyncId']='navigation-labels-'+page+'-'+method
  a=d['unpublishedAction'];a['collectionId']=page+'_navigationLabels';a['name']=method;a['fullyQualifiedName']='navigationLabels.'+method;a['pageId']=page;a['runBehaviour']='MANUAL';a['userSetOnLoad']=True;a['actionConfiguration']['jsArguments']=[{'name':name} for name in args]
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
   menu['refresh']={'id':'refresh','widgetId':name,'index':len(menu),'label':'Refresh access','isVisible':True,'isDisabled':False,'onClick':'{{ Promise.all([qNavigationAccess.run(),qNavigationTerminology.run()]) }}'};triggers.append({'key':'menuItems.refresh.onClick'})
  visible='true' if index==0 else '('+' || '.join('('+allowed(i['permission'])+')' for i in group['items'])+')'
  d={'widgetName':name,'widgetId':name,'key':name,'parentId':'0','type':'MENU_BUTTON_WIDGET','version':1,'menuItemsSource':'STATIC','menuItems':menu,
   'label':group['label'],'menuVariant':'SECONDARY','menuColor':'{{appsmith.theme.colors.primaryColor}}','borderRadius':'{{appsmith.theme.borderRadius.appBorderRadius}}','boxShadow':'none',
   'isCompact':False,'isDisabled':False,'isVisible':'{{ '+visible+' }}','animateLoading':True,'placement':'CENTER','renderMode':'CANVAS','responsiveBehavior':'hug','minWidth':120,
   'topRow':0,'bottomRow':4,'originalTopRow':0,'originalBottomRow':4,'leftColumn':index*16,'rightColumn':(index+1)*16,'parentRowSpace':10,'parentColumnSpace':19.125,
   'mobileTopRow':index*5,'mobileBottomRow':index*5+4,'mobileLeftColumn':0,'mobileRightColumn':64,
   'dynamicBindingPathList':bindings,'dynamicTriggerPathList':triggers,'dynamicPropertyPathList':triggers}
  emit(f'pages/{page}/widgets/{name}.json',d)
 titles={i['page']:i['label'] for g in registry['groups'] for i in g['items']};title=titles.get(page,page)
 d=read('pages/Terminology Administration/widgets/txtTerminologyDenied.json');d.update(widgetName='txtNavigationPage',widgetId='navigation-current-page',key='navigation-current-page',parentId='0',isVisible=True,topRow=5,bottomRow=9,originalTopRow=5,originalBottomRow=9,mobileTopRow=20,mobileBottomRow=24,mobileLeftColumn=0,mobileRightColumn=64,minWidth=120,text='{{ "Current page: " + navigationLabels.text('+json.dumps(title,ensure_ascii=False)+') }}')
 d['dynamicBindingPathList']=[{'key':'text'},{'key':'fontFamily'}];emit(f'pages/{page}/widgets/txtNavigationPage.json',d)
changed=[path for path,content in pending.items() if not (ROOT/path).exists() or (ROOT/path).read_text()!=content]
if ARGS.check:
 if changed:raise SystemExit('Navigation generation differs: '+', '.join(changed[:12]))
 print('Navigation generation is current: all 18 pages, four groups and shared label source')
else:
 for path in changed:(ROOT/path).parent.mkdir(parents=True,exist_ok=True);(ROOT/path).write_text(pending[path])
 print(f'Generated {len(changed)} changed files from one menu registry and label source')
