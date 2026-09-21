"""Assemble only runtime files for GitHub Pages; never publish the working folder."""
from pathlib import Path
import hashlib
import json
import re
import shutil

root = Path(__file__).resolve().parents[1]
out = root / '_site'
files = set('index.html style.css site-header.css tokens.css data.js ui.js guides.js random.js localization.js share-copy.js app.js sources.json .nojekyll'.split())
stage_files = '''index.html stages.css stages.js viewer.js geometry.js edges.js i18n.js
objectives.js weapons.js range-math.js range-occlusion.js range-renderer.js
marker-share.js marker-settings.js marker-visibility.js utility-markers.js
data.json minimaps.json objectives.json respawns.json stealth-jump.js weapon-ranges.json'''.split()
files.update('stages/' + name for name in stage_files)
files.update('gear/' + name for name in ['index.html', 'style.css', 'app.js', 'core.js', 'ink-test.js', 'respawn-jump.js', 'export-image.js', 'share.js', 'i18n.js', 'messages.json', 'gear-names.json', 'data.json'])
files.update(str(p.relative_to(root)) for p in (root / 'gear/icons').glob('*.png'))
files.update(str(p.relative_to(root)) for p in (root / 'assets').rglob('*') if p.is_file() and not p.name.startswith('.'))
data = json.loads((root / 'stages/data.json').read_text())
minimaps = json.loads((root / 'stages/minimaps.json').read_text())
for stage in data['stages']:
    files.add('stages/' + stage['image'])
    modes = ['Pnt', 'Var', 'Vlf', 'Vgl', 'Vcl'] if stage['kind'] == 'versus' else ['Low', 'Mid', 'High']
    if set(minimaps['stages'][stage['key']]) != set(modes):
        raise ValueError('Incomplete minimap: ' + stage['key'])
    # Keep the renderer's existing fallback terrain, but omit unreferenced export files.
    for info in [*stage['layers'].values(), *minimaps['stages'][stage['key']].values()]:
        if info:
            files.add('stages/' + info['file'])
for name in files:
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Missing or invalid runtime file: ' + name)
# Validate before replacing a previous local build. _site is disposable output only.
if out.exists():
    shutil.rmtree(out)
for name in sorted(files):
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, target)
# One deterministic release id for HTML entrypoints, JS imports/fetches and CSS URLs.
release = hashlib.sha256(b''.join(name.encode() + (root / name).read_bytes() for name in sorted(files) if Path(name).suffix in {'.js', '.css', '.html', '.json'})).hexdigest()[:12]
pattern = re.compile(r'''(?P<quote>["'])(?P<path>(?:\.?\.?/)?[A-Za-z0-9_./-]+\.(?:js|css|json))(?:\?v=[A-Za-z0-9_-]+)?(?P=quote)''')
for name in sorted(files):
    if Path(name).suffix not in {'.js', '.css', '.html'}:
        continue
    target = out / name
    def version(match):
        relative = match['path']
        if (target.parent / relative).is_file():
            return f"{match['quote']}{relative}?v={release}{match['quote']}"
        return match[0]
    target.write_text(pattern.sub(version, target.read_text()))
print(f'GitHub Pages: {len(files)} files, {sum(p.stat().st_size for p in out.rglob("*") if p.is_file()) / 1e6:.1f} MB, release {release}')
