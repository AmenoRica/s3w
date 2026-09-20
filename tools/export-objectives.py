"""Extract rule objectives from the same RomFS version as the stage geometry."""
import argparse, importlib.util, json, math, sys
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--romfs',type=Path,required=True)
parser.add_argument('--python-libs',action='append',default=[])
args=parser.parse_args();sys.path[:0]=args.python_libs
import byml
BASE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('mesh',BASE/'tools/build-yunohana-minimap.py')
mesh=importlib.util.module_from_spec(spec);spec.loader.exec_module(mesh)

def boundary(actor,cylinder=False):
    scale=actor.get('Scale',[1,1,1]);r=actor.get('Rotate',[0,0,0]);pos=actor.get('Translate',[0,0,0])
    points=([(math.cos(i*math.tau/64),math.sin(i*math.tau/64)) for i in range(64)] if cylinder else [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)])
    result=[]
    for x,z in points:
        x*=scale[0];z*=scale[2];y=0
        y,z=y*math.cos(r[0])-z*math.sin(r[0]),y*math.sin(r[0])+z*math.cos(r[0])
        x,z=x*math.cos(r[1])+z*math.sin(r[1]),-x*math.sin(r[1])+z*math.cos(r[1])
        x,y=x*math.cos(r[2])-y*math.sin(r[2]),x*math.sin(r[2])+y*math.cos(r[2])
        result.append([x+pos[0],y+pos[1],z+pos[2]])
    return result

def marker(a,kind,label):
    return {'kind':kind,'label':label,'position':a.get('Translate',[0,0,0]),'team':a.get('TeamCmp',{}).get('Team','Neutral'),'source':str(a['Hash'])}

result={'version':'11.2.0','stages':{}}
for stage in json.loads((BASE/'stages/data.json').read_text())['stages']:
    if stage['kind']!='versus':continue
    key=stage['key'];pack=mesh.unpack(args.romfs/f'Pack/Scene/{key}.pack.zs')
    scene=byml.Byml(next(v for k,v in pack.items() if k.startswith('Banc/'))).parse()
    info=byml.Byml(next(v for k,v in pack.items() if k.startswith('SceneComponent/VersusMapInfo/'))).parse()
    actors=scene['Actors'];by_hash={a['Hash']:a for a in actors}
    modes={mode:{'areas':[],'paths':[],'markers':[]} for mode in ['Var','Vgl','Vlf','Vcl']}
    for a in actors:
        mode=a.get('Layer');name=a['Gyaml']
        if mode=='Var' and name.startswith('PaintTargetArea_'):
            linked=a.get('spl__PaintTargetAreaBancParam',{}).get('SubAreaInstanceIds',[])
            for part in [a]+[by_hash[h] for h in linked]:
                modes[mode]['areas'].append({'points':boundary(part,'Cylinder' in name),'source':str(part['Hash'])})
            modes[mode]['markers'].append(marker(a,'zone','에어리어'))
        if mode=='Vgl' and name in ['Gachihoko','GachihokoCheckPoint','GachihokoGoal']:
            kind,label={'Gachihoko':('spawn','피시'),'GachihokoCheckPoint':('checkpoint','관문'),'GachihokoGoal':('goal','골')}[name]
            modes[mode]['markers'].append(marker(a,kind,label))
        if mode=='Vcl' and name=='GachiasariGoal':modes[mode]['markers'].append(marker(a,'goal','바지락 골'))
        if mode=='Vlf' and name.startswith('Gachiyagura_'):
            start=a['spl__GachiyaguraBancParam']['ToRailPoint']
            rail=next(r for r in scene['Rails'] if r.get('Layer')=='Vlf' and any(p['Hash']==start for p in r['Points']))
            assert rail['Gyaml']=='GachiyaguraRail' and rail['Points'][0]['Hash']==start
            modes[mode]['markers'].append(marker(a,'spawn','타워'))
            # The scene stores one half; the map's symmetry flag defines the opposite half.
            for side in range(2):
                def reflect(p):return [(-p[0] if info.get('IsPointSymmetry',True) else p[0]),p[1],-p[2]] if side else list(p)
                points=[reflect(p.get('Translate',[0,0,0])) for p in rail['Points']]
                team=['Alpha','Bravo'][side]
                modes[mode]['paths'].append({'points':points,'team':team,'source':str(rail['Hash']),'mirrored':bool(side)})
                number=0
                for p,position in zip(rail['Points'],points):
                    if p.get('spl__GachiyaguraRailNodeParam',{}).get('CheckPointHP',0)>0:
                        number+=1;modes[mode]['markers'].append({'kind':'checkpoint','label':str(number),'position':position,'team':team,'source':str(p['Hash'])})
    assert len(modes['Var']['areas'])>=1
    assert sum(m['kind']=='spawn' for m in modes['Vgl']['markers'])==1
    assert sum(m['kind']=='checkpoint' for m in modes['Vgl']['markers'])>=2
    assert len(modes['Vlf']['paths'])==2 and len(modes['Vcl']['markers'])==2
    result['stages'][key]=modes
(BASE/'stages/objectives.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Exported objectives:',len(result['stages']),'stages × 4 ranked rules')
