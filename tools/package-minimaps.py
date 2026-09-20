"""Package validated minimap triangles as the site's indexed STG1 assets."""
import gzip
import hashlib
import json
from pathlib import Path
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'outputs/all-minimaps'
target = ROOT / 'stages'
folder = target / 'minimap-geometry'
folder.mkdir(exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text())
salmon = ROOT / 'outputs/salmon-minimaps'
if (salmon / 'manifest.json').exists():
    manifest['stages'] += json.loads((salmon / 'manifest.json').read_text())['stages']
result = {'version': manifest['version'], 'format': 'STG1', 'stages': {}}
for stage in manifest['stages']:
    source = salmon if stage['key'].startswith('Cop_') else ROOT / 'outputs/all-minimaps'
    modes = {}
    for mode, entry in stage['modes'].items():
        directory = source / 'data' / stage['key'] / mode
        merged = ROOT / 'outputs/simplified-minimaps/data' / stage['key'] / f'{mode}.bin.gz'
        parts = [np.frombuffer(gzip.decompress((merged if part == 'collision' and merged.exists() else directory / f'{part}.bin.gz').read_bytes()), dtype='<f4').reshape(-1, 7)
                 for part in ('collision', 'rails', 'details') if f'{part}.bin.gz' in entry['files']]
        mesh = np.concatenate(parts)
        vertices, indices = np.unique(mesh, axis=0, return_inverse=True)
        packed = np.zeros((len(vertices), 4), dtype='<i4')
        packed[:, :3] = np.rint(vertices[:, :3] * 1000).astype('<i4')
        octets = packed.view('u1').reshape(-1, 16)
        octets[:, 12:15] = np.rint(vertices[:, 3:6] * 127).astype('i1').view('u1')
        octets[:, 15] = vertices[:, 6].astype('u1')
        raw = b'STG1' + struct.pack('<II', len(vertices), len(indices)) + packed.tobytes() + indices.astype('<u4').tobytes()
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        filename = hashlib.sha256(compressed).hexdigest()[:20] + '.bin.gz'
        (folder / filename).write_bytes(compressed)
        modes[mode] = {'file': 'minimap-geometry/' + filename, 'bytes': len(compressed), 'vertices': len(mesh),
                       'boundsMin': mesh[:, :3].min(axis=0).tolist(), 'boundsMax': mesh[:, :3].max(axis=0).tolist(),
                       'railCount': entry.get('railCount', 0), 'sponges': entry.get('sponges', 0)}
    result['stages'][stage['key']] = modes
(target / 'minimaps.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
files = {v['file']: v['bytes'] for modes in result['stages'].values() for v in modes.values()}
print(json.dumps({'stages': len(result['stages']), 'combinations': sum(map(len, result['stages'].values())), 'files': len(files), 'bytes': sum(files.values())}))
