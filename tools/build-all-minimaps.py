#!/usr/bin/env python3
"""Build audited versus rules or Salmon Run tides with the shared collision converter."""
import argparse, concurrent.futures, gzip, hashlib, json, os, subprocess, sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
MODES = {'Pnt': '영역 배틀', 'Var': '랭크 에어리어', 'Vlf': '랭크 타워', 'Vgl': '랭크 피시 배틀', 'Vcl': '랭크 바지락'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--romfs', required=True, type=Path)
    p.add_argument('--python-libs', action='append', default=[])
    p.add_argument('--resume', action='store_true')
    p.add_argument('--stage', action='append')
    p.add_argument('--salmon', action='store_true')
    p.add_argument('--dotnet')
    p.add_argument('--model-exporter')
    args = p.parse_args()
    modes = {'Low':'간조','Mid':'일반','High':'만조'} if args.salmon else MODES
    out = BASE / ('outputs/salmon-minimaps' if args.salmon else 'outputs/all-minimaps')
    stages = [s for s in json.loads((BASE / 'stages/data.json').read_text())['stages'] if (s['kind'] != 'versus') == args.salmon]
    assert len(stages) == (14 if args.salmon else 25)
    generator = BASE / 'tools/build-yunohana-minimap.py'
    generator_hash = hashlib.sha256(generator.read_bytes()).hexdigest()
    def build(job):
        stage, mode = job
        folder = out / 'data' / stage['key'] / mode
        folder.mkdir(parents=True, exist_ok=True)
        record = folder / 'complete.json'
        if args.resume and record.exists():
            info = json.loads(record.read_text())
            if all((folder / f).exists() for f in info['files']):
                info['railCount'] = json.loads((folder / 'collision.json').read_text())['inkRailActors']
                record.write_text(json.dumps(info, ensure_ascii=False, indent=2))
                return info
        command = [sys.executable, str(generator), '--romfs', str(args.romfs), '--stage', stage['key'], '--mode', mode, '--inventory', str(out / 'inventory.json'), '--output', str(folder)]
        for option in ('dotnet', 'model_exporter'):
            if getattr(args, option): command += ['--'+option.replace('_','-'),getattr(args,option)]
        for path in args.python_libs:
            command += ['--python-libs', path]
        with (folder / 'build.log').open('w') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=dict(os.environ, OPENBLAS_NUM_THREADS='1', VECLIB_MAXIMUM_THREADS='1'))
        if result.returncode:
            return {'stage': stage['key'], 'mode': mode, 'error': (folder / 'build.log').read_text()[-2000:]}
        info = {'stage': stage['key'], 'mode': mode, 'generator': generator_hash, 'files': []}
        for kind in ['collision', 'original', 'rails', 'details']:
            raw = folder / (kind + '.bin')
            if not raw.exists():
                continue
            meta = json.loads((folder / (kind + '.json')).read_text())
            assert raw.stat().st_size == meta['vertexCount'] * meta['stride'] and meta['vertexCount'] % 3 == 0
            compressed = raw.with_suffix('.bin.gz')
            with raw.open('rb') as source, compressed.open('wb') as target:
                with gzip.GzipFile(fileobj=target, mode='wb', mtime=0) as stream:
                    while data := source.read(1024 * 1024):
                        stream.write(data)
            raw.unlink()  # Only the just-created uncompressed build artifact; compressed copy is complete.
            info['files'] += [kind + '.json', kind + '.bin.gz']
            info[kind] = {'vertices': meta['vertexCount'], 'bytes': compressed.stat().st_size}
            if kind == 'collision':
                info.update(actors=len(meta['actors']), railCount=meta['inkRailActors'], boundsMin=meta['boundsMin'], boundsMax=meta['boundsMax'])
            if kind == 'details':
                info['sponges'] = len(meta['sponges'])
        assert 'collision' in info and 'original' in info
        temp = record.with_suffix('.tmp')
        temp.write_text(json.dumps(info, ensure_ascii=False, indent=2)); temp.replace(record)
        return info
    jobs = [(s, m) for s in stages if not args.stage or s['key'] in args.stage for m in modes]
    errors, results = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for info in pool.map(build, jobs):
            results.append(info)
            if 'error' in info:
                errors.append(info)
                print('FAILED', info['stage'], info['mode'], info['error'][-800:], flush=True)
            else:
                print('DONE', len(results), '/', len(jobs), info['stage'], info['mode'], info['collision']['vertices'] // 3, flush=True)
            (out / 'build-progress.json').write_text(json.dumps({'finished':len(results), 'total':len(jobs), 'errors':errors}, ensure_ascii=False, indent=2))
    (out / 'build-errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(f'{len(errors)} combinations need attention')
    manifest = {'version': '11.2.0', 'modes': modes, 'stages': []}
    for stage in stages:
        entries = {}
        for mode in modes:
            record = out / 'data' / stage['key'] / mode / 'complete.json'
            if record.exists():
                entries[mode] = json.loads(record.read_text())
        if entries:
            manifest['stages'].append({'key':stage['key'], 'name':stage['names']['KRko'], 'english':stage['names']['USen'], 'modes':entries})
    temp = out / 'manifest.tmp'
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)); temp.replace(out / 'manifest.json')
    print('MANIFEST', len(manifest['stages']), 'stages', sum(len(s['modes']) for s in manifest['stages']), 'combinations', flush=True)

if __name__ == '__main__':
    main()
