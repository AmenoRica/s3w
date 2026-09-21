"""Extract both teams' respawn launch positions from the stage geometry's RomFS."""
import argparse, importlib.util, json, sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--romfs', type=Path, required=True)
parser.add_argument('--python-libs', action='append', default=[])
args = parser.parse_args()
sys.path[:0] = args.python_libs
import byml

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mesh', BASE / 'tools/build-yunohana-minimap.py')
mesh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mesh)
result = {'version': '11.2.0', 'actor': 'LocatorSpawner', 'stages': {}}
for stage in json.loads((BASE / 'stages/data.json').read_text())['stages']:
    if stage['kind'] != 'versus':
        continue
    pack = mesh.unpack(args.romfs / f"Pack/Scene/{stage['key']}.pack.zs")
    scene = byml.Byml(next(v for k, v in pack.items() if k.startswith('Banc/'))).parse()
    modes = {}
    for mode in ['Pnt', 'Var', 'Vlf', 'Vgl', 'Vcl']:
        spawns = []
        for team in ['Alpha', 'Bravo']:
            candidates = [a for a in scene['Actors'] if a['Gyaml'] == 'LocatorSpawner'
                          and a.get('TeamCmp', {}).get('Team') == team]
            selected = [a for a in candidates if a.get('Layer') == mode]
            if not selected:
                selected = [a for a in candidates if a.get('Layer') == 'Cmn']
            assert len(selected) == 1, (stage['key'], mode, team)
            a = selected[0]
            spawns.append({'team': team, 'position': a['Translate'], 'source': str(a['Hash'])})
        modes[mode] = spawns
    result['stages'][stage['key']] = modes
(BASE / 'stages/respawns.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Exported respawns:', len(result['stages']), 'stages × 5 rules × 2 teams')
