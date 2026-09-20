"""Refresh only rail geometry from source scenes, preserving converted terrain."""
import argparse,gzip,importlib.util,json,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--romfs',type=Path,required=True);p.add_argument('--python-libs',action='append',default=[]);args=p.parse_args();sys.path[:0]=args.python_libs
import numpy as np,byml
base=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('m',base/'tools/build-yunohana-minimap.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.np=np;m.byml=byml
out=base/'outputs/all-minimaps';manifest=json.loads((out/'manifest.json').read_text());checked=[]
for stage in manifest['stages']:
 scene=byml.Byml(next(v for k,v in m.unpack(args.romfs/f"Pack/Scene/{stage['key']}.pack.zs").items() if k.startswith('Banc/'))).parse()
 for mode,entry in stage['modes'].items():
  actors=[a for a in scene['Actors'] if a['Gyaml']=='InkRailOnline' and a.get('Layer') in ('Cmn',mode)]
  if not actors:continue
  blocks,audit=m.ink_rails(scene,actors,('Cmn',mode));mesh=np.concatenate(blocks).reshape(-1,7)
  for rail in audit:
   source=next(r for r in scene['Rails'] if str(r['Hash'])==rail['railHash'])
   assert rail['points']==[p['Translate'] for p in source['Points']]
   assert rail['linkedPoint']==str(source['Points'][0]['Hash'])
  meta={'vertexCount':len(mesh),'stride':28,'boundsMin':mesh[:,:3].min(0).tolist(),'boundsMax':mesh[:,:3].max(0).tolist(),'rails':audit,'approximation':'Linked graph points only; sphere at linked first point. Straight segments, illustrative diameter 0.5, core radius 0.8.'}
  folder=out/'data'/stage['key']/mode;compressed=gzip.compress(mesh.tobytes(),mtime=0)
  (folder/'rails.bin.gz').write_bytes(compressed);(folder/'rails.json').write_text(json.dumps(meta,indent=2))
  entry['rails']={'vertices':len(mesh),'bytes':len(compressed)};entry['railRevision']=2
  (folder/'complete.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2))
  checked.append({'stage':stage['key'],'mode':mode,'rails':len(audit),'removedExtraSegments':len(audit)})
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(out/'rail-validation.json').write_text(json.dumps({'revision':2,'checks':checked},indent=2))
print(json.dumps({'combinations':len(checked),'rails':sum(r['rails'] for r in checked)}))
