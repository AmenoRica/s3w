#!/usr/bin/env python3
"""Validate every generated mesh and the stage/rule placement coverage."""
import argparse, collections, gzip, json, sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--python-libs',action='append',default=[])
p.add_argument('--salmon',action='store_true')
args=p.parse_args();sys.path[:0]=args.python_libs
import numpy as np
base=Path(__file__).resolve().parent.parent/('outputs/salmon-minimaps' if args.salmon else 'outputs/all-minimaps')
inventory=json.loads((base/'inventory.json').read_text())
manifest=json.loads((base/'manifest.json').read_text())
assert len(manifest['stages'])==(14 if args.salmon else 25)
assert set(manifest['modes'])==({'Low','Mid','High'} if args.salmon else {'Pnt','Var','Vlf','Vgl','Vcl'})
selected={name for name,row in inventory['actors'].items() if name.startswith(('Fld_','Mpt_','Lft_','DObj_','Obj_YagaraBox')) and row.get('model',{}).get('Fmdb') and any(s['data'].get('PhshMesh') or s['data'].get('Box') for s in row.get('shapes',[]))}
report=[];total_bytes=0;total_triangles=0;total_original=0
for stage in manifest['stages']:
 expected=next(s for s in inventory['stages'] if s['key']==stage['key'])
 assert set(stage['modes'])==set(manifest['modes'])
 for mode,entry in stage['modes'].items():
  folder=base/'data'/stage['key']/mode
  rows=expected['placements']['Cmn']+expected['placements'][mode]
  omitted={'DObj_SalmonBouySausage','DObj_SalmonBouyAsparagus','DObj_SalmonBouyCorn'} if stage['key'] in ('Cop_Shakeup','Cop_Shakeship','Cop_Shakelift') else set()
  geometry={r['hash'] for r in rows if r['name'] in selected and r['name'] not in omitted}
  rails={r['hash'] for r in rows if r['name']=='InkRailOnline' or r['name']=='InkRailOnlineCoopKeepOn' and mode in r['activeTides']}
  sponges={r['hash'] for r in rows if r['name'].startswith('Sponge')}
  meta=json.loads((folder/'collision.json').read_text())
  assert {a['hash'] for a in meta['actors']}==geometry,(stage['key'],mode,'terrain coverage')
  assert len(meta['actors'])==len(geometry) and all(a['layer'] in ('Cmn',mode) for a in meta['actors'])
  assert meta['inkRailActors']==len(rails)
  assert meta['triangles']==sum(a['keptSourceTriangles']+7*a['wallTriangles'] for a in meta['actors'])
  assert meta['triangles']>0
  assert bool(rails)==bool(entry.get('rails'))
  assert bool(sponges)==bool(entry.get('details'))
  if rails:
   rm=json.loads((folder/'rails.json').read_text())
   assert {r['actorHash'] for r in rm['rails']}==rails
   assert all(r['segments']==len(r['points'])-1 for r in rm['rails'])
   assert len({r['railHash'] for r in rm['rails']})==len(rails)
  if sponges:
   sm=json.loads((folder/'details.json').read_text())
   assert {s['actorHash'] for s in sm['sponges']}==sponges
  for kind in ['collision','original','rails','details']:
   if not isinstance(entry.get(kind),dict):continue
   data=json.loads((folder/(kind+'.json')).read_text())
   raw=gzip.decompress((folder/(kind+'.bin.gz')).read_bytes())
   assert len(raw)==data['vertexCount']*data['stride'] and data['stride']==28 and data['vertexCount']%3==0
   mesh=np.frombuffer(raw,'<f4').reshape(-1,7)
   assert np.isfinite(mesh).all()
   assert np.allclose(np.linalg.norm(mesh[:,3:6],axis=1),1,atol=2e-6)
   assert np.allclose(mesh[:,:3].min(0),data['boundsMin']) and np.allclose(mesh[:,:3].max(0),data['boundsMax'])
   assert set(np.unique(mesh[:,6])).issubset({3} if kind=='rails' else {0,1,2})
   total_bytes+=(folder/(kind+'.bin.gz')).stat().st_size
  total_triangles+=meta['triangles'];total_original+=entry['original']['vertices']//3
  report.append({'stage':stage['key'],'mode':mode,'actors':len(geometry),'rails':len(rails),'sponges':len(sponges),'triangles':meta['triangles'],'invisibleLimitsRemoved':meta['excluded'].get('InvisibleKeepOut',0)})
assert len(report)==(42 if args.salmon else 125)
result={'combinations':len(report),'stages':len(manifest['stages']),'meshBytes':total_bytes,'triangles':total_triangles,'originalTriangles':total_original,'reductionPercent':round((1-total_triangles/total_original)*100,1),'checks':'gzip size, finite coordinates, unit normals, categories, bounds, exact placement hashes, rule layers, rail links, sponge coverage, wall triangle counts','results':report}
(base/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='results'},ensure_ascii=False,indent=2))
