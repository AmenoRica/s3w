import sys,json,collections,importlib.util,argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Inventory versus rules or Salmon Run tide layers before conversion.')
parser.add_argument('--romfs',required=True,type=Path)
parser.add_argument('--python-libs',action='append',default=[])
parser.add_argument('--salmon',action='store_true')
args=parser.parse_args()
sys.path[:0]=args.python_libs
import byml,numpy as np
base=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('m',base/'tools/build-yunohana-minimap.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.byml=byml;m.np=np
root=args.romfs
rows=[];names=collections.Counter();scenes={}
for stage in json.load(open(base/'stages/data.json'))['stages']:
 if (stage['kind']!='versus') != args.salmon:continue
 scene=byml.Byml(next(v for k,v in m.unpack(root/('Pack/Scene/'+stage['key']+'.pack.zs')).items() if k.startswith('Banc/'))).parse();scenes[stage['key']]=scene
 counts={}
 for layer in (['Cmn','Low','Mid','High'] if args.salmon else ['Cmn','Pnt','Var','Vlf','Vgl','Vcl']):
  actors=[a for a in scene['Actors'] if a.get('Layer')==layer];counts[layer]=dict(collections.Counter(a['Gyaml'].split('/')[-1].split('.')[0] for a in actors))
  names.update(counts[layer])
 placements={layer:[{'name':a['Gyaml'].split('/')[-1].split('.')[0],'hash':str(a['Hash']),**({'activeTides':[t for t in ('Low','Mid','High') if a.get('spl__InkRailCoopBancParam',{}).get('IsActiveIn'+t,False)]} if a['Gyaml']=='InkRailOnlineCoopKeepOn' else {})} for a in scene['Actors'] if a.get('Layer')==layer] for layer in counts}
 rows.append({'key':stage['key'],'name':stage['names']['KRko'],'actors':counts,'placements':placements})
actors={}
for name in names:
 if name.startswith(('Locator','GeneralLocator','Npc','ChangePaint','Mpt_KeepOut','Lft_KeepOut')):continue
 try:
  p,r,params=m.actor_data(root,name);physics=r(params.get('Components',{}).get('PhysicsRef',''));controller=r(physics.get('ControllerSetPath',''))
  shapes=[{'ref':v,'data':r(v['FilePath'])} for v in controller.get('ShapeNamePathAry',[])]
  actors[name]={'count':names[name],'model':r(params.get('Components',{}).get('ModelInfoRef','')),'shapes':shapes}
 except Exception as e:actors[name]={'error':str(e)}
result={'stages':rows,'actors':actors}
out=base/('outputs/salmon-minimaps' if args.salmon else 'outputs/all-minimaps');out.mkdir(parents=True,exist_ok=True)
(out/'inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))

for name,row in actors.items():
 shapes=row.get('shapes',[]);types=sorted({k for s in shapes for k in s['data'] if k not in ('AutoCalc','$parent')})
 print(name,row.get('count'),types,'MODEL' if row.get('model',{}).get('Fmdb') else 'NO_MODEL',row.get('error',''))
