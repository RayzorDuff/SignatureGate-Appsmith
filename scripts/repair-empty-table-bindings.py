#!/usr/bin/env python3
"""Normalize empty column vectors while preserving their populated-row map expression."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
def map_end(value,start):
 depth=0;quote=None;escape=False
 for index in range(start,len(value)):
  char=value[index]
  if quote:
   if escape:escape=False
   elif char=='\\':escape=True
   elif char==quote:quote=None
   continue
  if char in ['"',"'",'`']:quote=char
  elif char=='(':depth+=1
  elif char==')':
   depth-=1
   if depth==0:return index+1
 raise ValueError('Mapped binding parentheses are incomplete')
count=0
for path in (root/'pages').rglob('*.json'):
 if '/widgets/' not in str(path):continue
 data=json.loads(path.read_text());changed=False
 for column in data.get('primaryColumns',{}).values():
  value=column.get('computedValue','')
  if not isinstance(value,str) or 'tableData.map' not in value:continue
  if not re.search(r'return\s+tableData\.length\s*>\s*0\s*\?',value):continue
  end=map_end(value,value.index('(',value.index('tableData.map')))
  match=re.fullmatch(r'\s*:\s*(.*?)\s*(\}\)\(\)\s*}}\s*)',value[end:],re.S)
  if not match:continue
  if match[1].strip()=='[]':continue
  column['computedValue']=value[:end]+' : [] '+match[2];changed=True;count+=1
 if changed:path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print(f'Repaired {count} empty-table column vectors; populated-row expressions are preserved')
