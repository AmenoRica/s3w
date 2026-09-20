#!/usr/bin/env python3
"""Export local RomFS stages. No network access; see stages/README.md."""
import argparse,sys,subprocess,json,struct
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--romfs',required=True,type=Path)
parser.add_argument('--cache',required=True,type=Path)
parser.add_argument('--dotnet',required=True)
parser.add_argument('--model-exporter',required=True)
parser.add_argument('--texture-decoder',required=True)
parser.add_argument('--python-libs',action='append',default=[])
args=parser.parse_args()
root=args.romfs;temp=args.cache;temp.mkdir(parents=True,exist_ok=True)
sys.path[:0]=args.python_libs+[args.texture_decoder]
import byml
def unpack(rel):
 b=subprocess.check_output(['zstd','-dc',str(root/rel)])
 assert b[:4]==b'SARC'
 h=struct.unpack_from('<H',b,4)[0];dataoff=struct.unpack_from('<I',b,12)[0]
 n=struct.unpack_from('<H',b,h+6)[0]; nodes=h+12;names=nodes+n*16+8
 d={}
 for i in range(n):
  _,a,start,end=struct.unpack_from('<4I',b,nodes+i*16)
  off=names+(a&0xffffff)*4;name=b[off:b.index(0,off)].decode()
  d[name]=b[dataoff+start:dataoff+end]
 return d
import os,re,math,gzip,hashlib,collections,struct
import numpy as np
from PIL import Image

import bntx_extract,texture2ddecoder
out=Path(__file__).resolve().parent.parent/'stages';(out/'assets').mkdir(parents=True,exist_ok=True);(out/'geometry').mkdir(exist_ok=True)
modelcache={};actorcache={};issues=[]
def msbt(b):
 sections={};p=32
 while p+16<=len(b):
  tag=b[p:p+4].decode();n=struct.unpack_from('<I',b,p+4)[0];sections[tag]=b[p+16:p+16+n];p=(p+16+n+15)//16*16
 labels={};s=sections['LBL1']
 for i in range(struct.unpack_from('<I',s)[0]):
  n,p=struct.unpack_from('<II',s,4+i*8)
  for _ in range(n):
   l=s[p];key=s[p+1:p+1+l].decode();idx=struct.unpack_from('<I',s,p+1+l)[0];labels[key]=idx;p+=l+5
 s=sections['TXT2'];n=struct.unpack_from('<I',s)[0];offs=list(struct.unpack_from('<'+'I'*n,s,4))+[len(s)]
 return {k:s[offs[i]:offs[i+1]].decode('utf-16-le').rstrip('\0') for k,i in labels.items()}
langs={}
for f in (root/'Mals').glob('*.sarc.zs'):
 d=unpack(str(f.relative_to(root)));langs[f.name.split('.')[0]]={**msbt(d['CommonMsg/VS/VSStageName.msbt']),**msbt(d['CommonMsg/Coop/CoopStageName.msbt'])}
print('NAMES',str(langs['KRko'])[:1500],flush=True)
def rot(a):
 x,y,z=a;cx,sx,cy,sy,cz,sz=math.cos(x),math.sin(x),math.cos(y),math.sin(y),math.cos(z),math.sin(z)
 return np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
def actor(name):
 if name in actorcache:return actorcache[name]
 path='Pack/Actor/'+name+'.pack.zs'
 if not (root/path).exists():return None
 d=unpack(path)
 def resolve(n):
  n=n.removeprefix('Work/').replace('.gyml','.bgyml')
  b=d.get(n)
  if b is None and (root/n).exists():b=(root/n).read_bytes()
  if b is None:return {}
  val=byml.Byml(b).parse()
  if '$parent' in val:
   parent=resolve(val['$parent']);val['Components']={**parent.get('Components',{}),**val.get('Components',{})};parent.update(val);return parent
  return val
 a=resolve('Actor/'+name+'.engine__actor__ActorParam.bgyml');ref=a.get('Components',{}).get('ModelInfoRef');info=resolve(ref) if ref else {};f=info.get('Fmdb')
 result=(f.split('/output/')[0].split('/')[-1],f.split('/')[-1].split('.')[0]) if f else None
 actorcache[name]=result;return result

def model(archive):
 if archive in modelcache:return modelcache[archive]
 target=temp/(archive+'.v2.json')
 if not target.exists():
  src=temp/(archive+'.bfres');src.write_bytes(subprocess.check_output(['zstd','-dc',str(root/('Model/'+archive+'.bfres.zs'))]))
  env=dict(os.environ,DOTNET_CLI_HOME=str(temp/'dotnet-home'),DOTNET_CLI_TELEMETRY_OPTOUT='1')
  dotnet=args.dotnet
  r=subprocess.run([dotnet,args.model_exporter,str(src),str(target)],env=env,capture_output=True,text=True)
  (temp/(archive+'.log')).write_text(r.stdout+r.stderr)
  if r.returncode:raise RuntimeError(archive+': '+r.stderr[:200])
 result=collections.defaultdict(list)
 for m in json.loads(target.read_text()):
  v=np.array(m['vertices']);v=(v*m['boneScale'])@rot(m['boneRotation'][:3]).T+m['bonePosition']
  result[m['model']].append((v,np.array(m['indices']).reshape(-1,3),2 if 'grate' in m['material'].lower() else 1 if m['paintType'] in ('1','5') else 0))
 # Bound the conversion cache; JSON stays on disk.
 if len(modelcache)>6:modelcache.clear()
 modelcache[archive]=result;return result

def write(tris):
 if not len(tris):return None
 a=tris.view('<f4').reshape(-1,7);v,ix=np.unique(a,axis=0,return_inverse=True)
 # 0.001 world unit positions, int8 normals.
 # Fixed precision independent of chunk bounds avoids cracks between layers.
 packed=np.zeros((len(v),4),dtype='<i4');packed[:,:3]=np.round(v[:,:3]*1000).astype('<i4')
 bytes_=packed.view('u1').reshape(-1,16);bytes_[:,12:15]=np.round(v[:,3:6]*127).astype('i1').view('u1');bytes_[:,15]=v[:,6].astype('u1')
 raw=b'STG1'+struct.pack('<II',len(v),len(ix))+packed.tobytes()+ix.astype('<u4').tobytes()
 z=gzip.compress(raw,9,mtime=0);name=hashlib.sha256(z).hexdigest()[:20]+'.bin.gz';(out/'geometry'/name).write_bytes(z)
 return {'file':'geometry/'+name,'bytes':len(z),'vertices':len(a),'boundsMin':a[:,:3].min(0).tolist(),'boundsMax':a[:,:3].max(0).tolist()}

def preview(key):
 imgkey=re.sub(r'\d+$','',key)
 if key.startswith('Cop_') and not key.startswith('Cop_Shake'):imgkey=imgkey.replace('Cop_','Vss_')
 source=root/('UI/Icon/StageL/'+imgkey+'.bntx.zs');target=out/'assets'/(imgkey+'.webp')
 if not target.exists():
  textures=bntx_extract.readBNTX(subprocess.check_output(['zstd','-dc',str(source)]));t=next(iter(textures.values())) if isinstance(textures,dict) else textures[0]
  bw,bh=bntx_extract.blk_dims[t.format>>8];data=bntx_extract.swizzle.deswizzle(t.width,t.height,bw,bh,bntx_extract.bpps[t.format>>8],1-t.tileMode,t.alignment,t.sizeRange,t.data)
  pixels=texture2ddecoder.decode_astc(bytes(data),t.width,t.height,bw,bh);Image.frombytes('RGBA',(t.width,t.height),pixels,'raw','BGRA').convert('RGB').save(target,quality=82)
 return 'assets/'+target.name

rows=[]
for table,kind in [('VersusSceneInfo','versus'),('CoopSceneInfo','coop')]:
 f=next(root.glob('RSDB/'+table+'*'));records=byml.Byml(subprocess.check_output(['zstd','-dc',str(f)])).parse()
 for row in records:
  if kind=='versus' and not row.get('IsDisplayInStageList'):continue
  row['kind']='bigrun' if row.get('IsBigRun') else kind;rows.append(row)
rows.sort(key=lambda r:({'versus':0,'coop':1,'bigrun':2}[r['kind']],r['DisplayOrder'],r['Id']))
stages=[]
for row in rows:
 key=row['__RowId'];print('STAGE',key,flush=True)
 d=unpack('Pack/Scene/'+key+'.pack.zs');scene=byml.Byml(d[next(n for n in d if n.startswith('Banc/'))]).parse()
 layers=['Cmn','Pnt','Var','Vlf','Vgl','Vcl'] if row['kind']=='versus' else ['Cmn','Low','Mid','High'];parts={l:[] for l in layers};water={}
 for a in scene['Actors']:
  layer=a.get('Layer');name=a['Gyaml'].split('/')[-1].split('.')[0]
  if layer not in parts:continue
  if name=='CoopWaterLevelLocator':water[layer]=a.get('Translate',[0,0,0])[1]
  if not name.startswith(('Fld_','Mpt_FldObj','Mpt_GeneralCube','DObj_','CoopPolaris','CoopLift')):continue
  info=actor(name)
  if not info:issues.append([key,name,'no model']);continue
  archive,mname=info
  try:meshes=model(archive)[mname]
  except Exception as e:issues.append([key,name,str(e)]);continue
  if not meshes:raise RuntimeError('Missing model '+str(info))
  for v,ix,category in meshes:
   v=(v*a.get('Scale',[1,1,1]))@rot(a.get('Rotate',[0,0,0])).T+a.get('Translate',[0,0,0]);tri=v[ix];n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);norm=np.linalg.norm(n,axis=1);keep=norm>1e-10;tri=tri[keep];n=n[keep]/norm[keep,None]
   block=np.empty((len(tri),3,7),np.float32);block[:,:,:3]=tri;block[:,:,3:6]=n[:,None,:];block[:,:,6]=category;parts[layer].append(block.reshape(-1,7))
 triangles={l:np.unique(np.round(np.concatenate(p),4).astype('<f4').reshape(-1,21).copy().view('V84').reshape(-1)) if p else np.empty(0,dtype='V84') for l,p in parts.items()}
 common=triangles.pop('Cmn');shared=None
 for t in triangles.values():shared=t if shared is None else np.intersect1d(shared,t,assume_unique=True)
 common=np.union1d(common,shared)
 chunks={'Cmn':write(common),**{l:write(np.setdiff1d(t,common,assume_unique=True)) for l,t in triangles.items()}};assert chunks['Cmn'],key
 namekey=re.sub(r'\d+$','',key.split('_',1)[1]);names={code:pack.get(namekey,pack.get(key,key)) for code,pack in langs.items()}
 paint_heights=np.concatenate([block[block[:,6]==1,1] for group in parts.values() for block in group])
 ceiling_height=float(paint_heights.max()+max(3.,float(np.ptp(paint_heights))*.2))
 stages.append({'ceilingHeight':ceiling_height,'key':key,'kind':row['kind'],'names':names,'image':preview(key),'layers':chunks,'water':water})
 print('DONE',key,names.get('KRko'),sum(c['bytes'] for c in chunks.values() if c),flush=True)
(temp/'stage-issues.json').write_text(json.dumps(issues,indent=2));print('ISSUES',issues,flush=True)

if issues:raise RuntimeError("Unresolved actors: "+str(issues))
manifest=out/'data.json.tmp'
manifest.write_text(json.dumps({'version':'11.2.0','format':'STG1','stages':stages},ensure_ascii=False,separators=(',',':')))
manifest.replace(out/'data.json')
used={c['file'] for stage in stages for c in stage['layers'].values() if c}
for f in (out/'geometry').glob('*.bin.gz'):
 if 'geometry/'+f.name not in used:f.unlink()
