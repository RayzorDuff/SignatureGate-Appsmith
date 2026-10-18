#!/usr/bin/env python3
"""Protect Appsmith-assigned identities across generation and native Git normalization."""
from pathlib import Path
import json,re,shutil,subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[1]
def metadata(root):
 return {str(p.relative_to(root)):json.loads(p.read_text()) for p in (root/'pages').rglob('metadata.json')}
def run(root,*args):
 result=subprocess.run([sys.executable,str(root/'scripts/generate-navigation.py'),*args],text=True,capture_output=True)
 if result.returncode:raise AssertionError(result.stdout+result.stderr)
 return result.stdout
with tempfile.TemporaryDirectory(prefix='signaturegate-navigation-') as temp:
 root=Path(temp)
 for folder in ['navigation','pages']:shutil.copytree(ROOT/folder,root/folder)
 (root/'scripts').mkdir();shutil.copy(ROOT/'scripts/generate-navigation.py',root/'scripts/generate-navigation.py')
 # Reproduce the recreated Directory's synchronized wrong-hook state.
 init=root/'pages/Directory/queries/navigationLabels-initialize/metadata.json'
 label=root/'pages/Directory/queries/navigationLabels-label/metadata.json'
 d=json.loads(init.read_text());d['unpublishedAction']['runBehaviour']='MANUAL';d['unpublishedAction']['userSetOnLoad']=False;d['unpublishedAction']['actionConfiguration']['native_fixture_extension']='preserve';init.write_text(json.dumps(d))
 d=json.loads(label.read_text());d['unpublishedAction']['runBehaviour']='ON_PAGE_LOAD';d['unpublishedAction']['userSetOnLoad']=True;label.write_text(json.dumps(d))
 before=metadata(root);run(root);after=metadata(root)
 assert before.keys()==after.keys()
 assert all(before[path]['gitSyncId']==after[path]['gitSyncId'] for path in before),'Existing identities changed'
 assert json.loads((root/'pages/Directory/widgets/txtNavigationPage.json').read_text())['bottomRow']==json.loads((ROOT/'pages/Directory/widgets/txtNavigationPage.json').read_text())['bottomRow'],'Native title layout changed'
 a=after[str(init.relative_to(root))]['unpublishedAction'];assert a['runBehaviour']=='ON_PAGE_LOAD' and a['userSetOnLoad'] is True
 assert a['actionConfiguration']['native_fixture_extension']=='preserve'
 a=after[str(label.relative_to(root))]['unpublishedAction'];assert a['runBehaviour']=='MANUAL' and a['userSetOnLoad'] is True
 assert next(x for x in a['actionConfiguration']['jsArguments'] if x['name']=='plural')['value']=='{{false}}'
 snapshot={str(p.relative_to(root)):p.read_bytes() for p in (root/'pages').rglob('*') if p.is_file()}
 assert 'Generated 0 changed files' in run(root)
 run(root,'--check')
 assert all((root/path).read_bytes()==data for path,data in snapshot.items()),'Native Git files rewritten on reapplication'
 # Only genuinely new resources get fresh native-shaped identities, persisted once.
 fresh=root/'pages/Directory/queries/qNavigationTerminology/metadata.json';fresh.unlink();run(root)
 identity=json.loads(fresh.read_text())['gitSyncId']
 assert re.fullmatch(r'[0-9a-f]{24}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',identity)
 run(root);assert json.loads(fresh.read_text())['gitSyncId']==identity
 assert all(json.loads((root/path).read_text())['gitSyncId']==d['gitSyncId'] for path,d in after.items() if path!=str(fresh.relative_to(root)))
 # Reject a copied identity instead of silently importing two resources as one.
 d=json.loads(fresh.read_text());d['gitSyncId']=after['pages/Directory/queries/qNavigationAccess/metadata.json']['gitSyncId'];fresh.write_text(json.dumps(d))
 result=subprocess.run([sys.executable,str(root/'scripts/generate-navigation.py')],text=True,capture_output=True)
 assert result.returncode!=0 and 'Duplicate gitSyncId' in result.stderr
print('PASS navigation generation: recreated IDs retained, wrong hook corrected, native fields/defaults preserved, byte-stable reapplication and one-time identities for new resources')
