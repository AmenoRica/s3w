#!/usr/bin/env python3
"""Local collision-mesh study, not a full reproduction of the game's minimap.
Uses existing numpy/byml and zstd. Original palette is transferred from map-demo.
"""
import argparse, bisect, collections, itertools, json, math, os, struct, subprocess, sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


def unpack(path):
    data = subprocess.check_output(['zstd', '-dc', str(path)])
    assert data[:4] == b'SARC'
    header = struct.unpack_from('<H', data, 4)[0]
    start = struct.unpack_from('<I', data, 12)[0]
    count = struct.unpack_from('<H', data, header + 6)[0]
    nodes = header + 12
    names = nodes + count * 16 + 8
    result = {}
    for i in range(count):
        _, name, lo, hi = struct.unpack_from('<4I', data, nodes + i * 16)
        name = names + (name & 0xffffff) * 4
        result[data[name:data.index(0, name)].decode()] = data[start + lo:start + hi]
    return result


def collision(data):
    """Decode the hknpMeshShape layout verified in the v11.2.0 stage actors."""
    assert data[:5] == b'Phive'
    tag, material, _, end, tag_size, material_size, _ = struct.unpack_from('<7I', data, 12)
    assert end == len(data) and data[tag + 4:tag + 8] == b'TAG0'
    p = tag + 8
    while p < tag + tag_size:
        size = struct.unpack_from('>I', data, p)[0] & 0x3fffffff
        assert size >= 8
        if data[p + 4:p + 8] == b'DATA':
            start, stop = p + 8, p + size
            break
        p += size
    else:
        raise ValueError('Missing Havok DATA')
    assert data[start + 0x18] == 8, 'Only the verified mesh shape layout is supported'
    def array(address):
        offset, count = struct.unpack_from('<iI', data, address)
        return address + offset, count
    tags_at, tags_n = array(start + 0x70)
    tags = [struct.unpack_from('<IHH', data, tags_at + i * 8) for i in range(tags_n)]
    keys = [t[0] for t in tags]
    assert keys == sorted(keys)
    materials = [struct.unpack_from('<IIQ', data, p) for p in range(material, material + material_size, 16)]
    sections, count = array(start + 0x90)
    scale = np.array(struct.unpack_from('<3f', data, start + 0x60))
    vertices, faces, materials_per_face = [], [], []
    for section in range(count):
        s = sections + section * 64
        v_at, v_n = array(s + 0x10)
        p_at, p_n = array(s + 8)
        assert v_at + v_n * 6 <= stop and p_at + p_n * 4 <= stop
        offset = np.array(struct.unpack_from('<3i', data, s + 0x20))
        vs = np.frombuffer(data, '<u2', v_n * 3, v_at).reshape(-1, 3)
        first = len(vertices)
        vertices.extend((vs + offset) * scale)
        for i in range(p_n):
            a, b, c, d = struct.unpack_from('<4B', data, p_at + i * 4)
            assert max(a, b, c, d) < v_n
            material_id = tags[bisect.bisect_right(keys, (section << 9) | (i << 1)) - 1][1] & 0x1fff
            assert material_id < len(materials)
            faces.append([first + a, first + b, first + c])
            materials_per_face.append(material_id)
            if c != d:
                faces.append([first + a, first + c, first + d])
                materials_per_face.append(material_id)
    return np.array(vertices), np.array(faces), np.array(materials_per_face), materials


def rotate(angles):
    x, y, z = angles
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])


def wall(triangle):
    normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
    normal /= np.linalg.norm(normal)
    adjusted = triangle.copy()
    adjusted[triangle[:, 1] > triangle[:, 1].mean(), 1] += .03
    front, back = adjusted + normal * .25, adjusted - normal * .25
    a, b, c = front
    d, e, f = back
    return np.array([[a, b, c], [d, f, e], [a, d, e], [a, e, b], [b, e, f], [b, f, c], [c, f, d], [c, d, a]])


def palette_sampler(path):
    source = np.fromfile(path, '<f4').reshape(-1, 3, 7).astype(float)
    # Collision Fence/RopeNet identifies nets. Visual grate inserts cannot classify a whole solid floor.
    source = source[source[:, 0, 6] != 2]
    triangles, normals, categories = source[:, :, :3], source[:, 0, 3:6], source[:, 0, 6]
    grid = collections.defaultdict(list)
    cell = 4.
    for i, tri in enumerate(triangles):
        lo, hi = np.floor(tri.min(0) / cell).astype(int), np.floor(tri.max(0) / cell).astype(int)
        for key in itertools.product(*(range(lo[j], hi[j] + 1) for j in range(3))):
            grid[key].append(i)
    def sample(point, normal):
        cell_key = np.floor(point / cell).astype(int)
        candidates = list(set(i for delta in itertools.product([-1, 0, 1], repeat=3) for i in grid.get(tuple(cell_key + delta), [])))
        if not candidates:
            return 0, False
        candidates = np.array(candidates)
        aligned = np.abs(normals[candidates] @ normal) > .9
        if aligned.any():
            candidates = candidates[aligned]
        tri, n = triangles[candidates], normals[candidates]
        a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
        ab, ac, ap = b - a, c - a, point - a
        dot = lambda x, y: np.einsum('ij,ij->i', x, y)
        d00, d01, d11 = dot(ab, ab), dot(ab, ac), dot(ac, ac)
        denominator = np.maximum(d00 * d11 - d01 * d01, 1e-20)
        v = (d11 * dot(ap, ab) - d01 * dot(ap, ac)) / denominator
        w = (d00 * dot(ap, ac) - d01 * dot(ap, ab)) / denominator
        inside = (v >= 0) & (w >= 0) & (v + w <= 1)
        distance = np.full(len(tri), np.inf)
        distance[inside] = dot(ap, n)[inside] ** 2
        for a, b in [(a, b), (b, c), (c, a)]:
            edge = b - a
            t = np.clip(dot(point - a, edge) / np.maximum(dot(edge, edge), 1e-20), 0, 1)
            delta = point - a - t[:, None] * edge
            distance = np.minimum(distance, dot(delta, delta))
        nearest = np.argmin(distance)
        return int(categories[candidates[nearest]]), bool(distance[nearest] < 1.)
    return sample


def actor_data(root, name):
    pack = unpack(root / ('Pack/Actor/' + name + '.pack.zs'))
    def resolve(path):
        path = path.removeprefix('Work/').replace('.gyml', '.bgyml')
        if path not in pack:
            parent_pack = root / ('Pack/Actor/' + Path(path).name.split('.')[0] + '.pack.zs')
            if parent_pack.exists():
                for key, value in unpack(parent_pack).items():
                    pack.setdefault(key, value)
        if path not in pack:
            return {}
        value = byml.Byml(pack[path]).parse()
        parent = resolve(value['$parent']) if '$parent' in value else {}
        if 'Components' in value:
            value['Components'] = {**parent.get('Components', {}), **value['Components']}
        return {**parent, **value}
    return pack, resolve, resolve('Actor/' + name + '.engine__actor__ActorParam.bgyml')


def pack_triangles(surface, category):
    normals = np.cross(surface[:, 1] - surface[:, 0], surface[:, 2] - surface[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    assert (lengths > 1e-10).all()
    packed = np.empty((len(surface), 3, 7), dtype='<f4')
    packed[:, :, :3], packed[:, :, 3:6], packed[:, :, 6] = surface, (normals / lengths[:, None])[:, None, :], category
    return packed


def box(lo, hi):
    v = np.array(list(itertools.product(*zip(lo, hi))))
    return v[np.array([[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]])]


def sphere(center, radius):
    signs = np.array(list(itertools.product([-1., 1.], repeat=3)))
    surface = np.array([np.diag(s) for s in signs])
    inward = np.prod(signs, axis=1) < 0
    surface[inward] = surface[inward][:, [0, 2, 1]]
    for _ in range(2):
        a, b, c = surface[:, 0], surface[:, 1], surface[:, 2]
        ab, bc, ca = a + b, b + c, c + a
        ab, bc, ca = [v / np.linalg.norm(v, axis=1)[:, None] for v in (ab, bc, ca)]
        surface = np.concatenate([np.stack(tri, axis=1) for tri in [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]])
    assert np.allclose(np.linalg.norm(surface, axis=2), 1)
    return surface * radius + center


def ink_rails(scene, actors, layers=('Cmn', 'Pnt')):
    blocks, audit = [], []
    for actor in actors:
        target = actor['spl__InkRailBancParam']['LinkToPoint']
        matches = [(rail, i) for rail in scene['Rails'] if rail.get('Layer') in layers for i, point in enumerate(rail['Points']) if point['Hash'] == target]
        assert len(matches) == 1, 'Ambiguous or missing ink rail link'
        rail, index = matches[0]
        assert index == 0 and not rail['IsClosed'] and not rail.get('game__GraphRailWithParentParam')
        # Placement coordinates are already world coordinates; Rotation is not reapplied.
        # LinkToPoint selects the deployed rail start; actor placement is not an extra rail node.
        points = np.array([p['Translate'] for p in rail['Points']])
        for a, b in zip(points, points[1:]):
            direction = b - a
            assert np.linalg.norm(direction) > .001
            direction /= np.linalg.norm(direction)
            side = np.cross(direction, [0, 1, 0])
            if np.linalg.norm(side) < .01:
                side = np.cross(direction, [1, 0, 0])
            side /= np.linalg.norm(side)
            up = np.cross(direction, side)
            ring = np.array([(.25 * math.cos(t) * side + .25 * math.sin(t) * up) for t in np.arange(8) * math.pi / 4])
            triangles = []
            for i in range(8):
                j = (i + 1) % 8
                triangles.extend([[a + ring[i], b + ring[i], b + ring[j]], [a + ring[i], b + ring[j], a + ring[j]], [a, a + ring[j], a + ring[i]], [b, b + ring[i], b + ring[j]]])
            blocks.append(pack_triangles(np.array(triangles), 3))
        # InkRailShapeSphere core: coincident capsule endpoints, radius 0.8.
        blocks.append(pack_triangles(sphere(points[0], .8), 3))
        audit.append({'actorHash': str(actor['Hash']), 'railHash': str(rail['Hash']), 'linkedPoint': str(target), 'actorPlacement': actor.get('Translate', [0, 0, 0]), 'points': points.tolist(), 'segments': len(points) - 1})
    return blocks, audit


def stage_original(root, out, actors, args):
    """Same material palette as the existing exporter, including placed terrain objects."""
    output, cache = [], {}
    for actor in actors:
        name = actor['Gyaml'].split('/')[-1].split('.')[0]
        _, resolve, params = actor_data(root, name)
        model = resolve(params['Components']['ModelInfoRef'])['Fmdb']
        archive, model_name = model.split('/output/')[0].split('/')[-1], Path(model).stem
        if archive not in cache:
            target = args.model_cache / (archive + '.v2.json')
            if not target.exists():
                assert args.dotnet and args.model_exporter, 'Model exporter required for ' + archive
                source = args.model_cache / (archive + '.bfres')
                source.write_bytes(subprocess.check_output(['zstd', '-dc', str(root / ('Model/' + archive + '.bfres.zs'))]))
                subprocess.run([args.dotnet, args.model_exporter, str(source), str(target)], check=True, stdout=subprocess.DEVNULL, env=dict(os.environ, DOTNET_CLI_HOME=str(args.model_cache / 'dotnet-home'), DOTNET_CLI_TELEMETRY_OPTOUT='1'))
            cache[archive] = json.loads(target.read_text())
        meshes = [m for m in cache[archive] if m['model'] == model_name]
        assert meshes, model
        for m in meshes:
            v = (np.array(m['vertices']) * m['boneScale']) @ rotate(m['boneRotation'][:3]).T + m['bonePosition']
            v = (v * actor.get('Scale', [1, 1, 1])) @ rotate(actor.get('Rotate', [0, 0, 0])).T + actor.get('Translate', [0, 0, 0])
            surface = v[np.array(m['indices']).reshape(-1, 3)]
            lengths = np.linalg.norm(np.cross(surface[:, 1] - surface[:, 0], surface[:, 2] - surface[:, 0]), axis=1)
            category = 2 if 'grate' in m['material'].lower() else int(m['paintType'] in ('1', '5'))
            output.append(pack_triangles(surface[lengths > 1e-10], category))
    packed = np.concatenate(output).reshape(-1, 7)
    (out / 'original.bin').write_bytes(packed.tobytes())
    (out / 'original.json').write_text(json.dumps({'vertexCount': len(packed), 'stride': 28, 'boundsMin': packed[:, :3].min(0).tolist(), 'boundsMax': packed[:, :3].max(0).tolist(), 'actors': len(actors)}))


def build(root, out, stage='Vss_Yunohana', args=None):
    mode = getattr(args, 'mode', 'Pnt')
    inventory_path = getattr(args, 'inventory', None)
    inventory = json.loads(inventory_path.read_text()) if inventory_path else None
    config = byml.Byml(subprocess.check_output(['zstd', '-dc', str(root / 'Phive/Config/PhiveConfig.byml.zs')])).parse()
    flags = {r['ComponentName']: int(r['MaskValue']) for r in config['UserShapeTagMaskCollection']}
    material_names = [r['ComponentName'] for r in config['MaterialCollection']]
    scene = byml.Byml(next(v for k, v in unpack(root / ('Pack/Scene/' + stage + '.pack.zs')).items() if k.startswith('Banc/'))).parse()
    actors = [a for a in scene['Actors'] if a.get('Layer') in ('Cmn', mode)]
    inks = [a for a in actors if a['Gyaml'].split('/')[-1].split('.')[0] in ('InkRailOnline', 'InkRailOnlineCoopKeepOn')]
    if mode in ('Low','Mid','High'):
        inks = [a for a in inks if a.get('spl__InkRailCoopBancParam', {}).get('IsActiveIn'+mode, False)]
    if inventory:
        stage_inventory = next(s for s in inventory['stages'] if s['key'] == stage)
        counts = collections.Counter(stage_inventory['actors']['Cmn']) + collections.Counter(stage_inventory['actors'][mode])
        selected = {name for name, row in inventory['actors'].items() if name.startswith(('Fld_', 'Mpt_', 'Lft_', 'DObj_', 'Obj_YagaraBox')) and row.get('model', {}).get('Fmdb') and any(s['data'].get('PhshMesh') or s['data'].get('Box') for s in row.get('shapes', []))}
        geometry_actors = [a for a in actors if a['Gyaml'].split('/')[-1].split('.')[0] in selected]
        assert len(geometry_actors) == sum(count for name, count in counts.items() if name in selected)
        if mode not in ('Low','Mid','High'): assert len(inks) == counts['InkRailOnline']
    else:
        assert len(inks) == (2 if stage == 'Vss_Propeller00' else 0)
        geometry_actors = [a for a in actors if a['Gyaml'].split('/')[-1].split('.')[0].startswith(('Fld_', 'Mpt_FldObj', 'Mpt_GeneralCube', 'DObj_', 'Lft_FldObj'))]
    # Animated scenery without its own terrain collision.
    scenery = {'DObj_FldObj_Propeller00StandardPlaneFar', 'DObj_FldObj_Propeller00StandardPlane', 'DObj_FldObj_Propeller00Vehicle', 'DObj_FldObj_Crank02Vehicle'}
    if stage in ('Cop_Shakeup', 'Cop_Shakeship', 'Cop_Shakelift'):
        scenery.update(('DObj_SalmonBouySausage', 'DObj_SalmonBouyAsparagus', 'DObj_SalmonBouyCorn'))
    geometry_actors = [a for a in geometry_actors if a['Gyaml'].split('/')[-1].split('.')[0] not in scenery]
    if not inventory:
        assert len(geometry_actors) == (12 if stage == 'Vss_Propeller00' else 16)
    out.mkdir(exist_ok=True, parents=True)
    if inventory or stage != 'Vss_Yunohana':
        stage_original(root, out, geometry_actors, args)
    sample = palette_sampler(BASE / 'map-demo/yunohana.bin' if not inventory and stage == 'Vss_Yunohana' else out / 'original.bin')
    output, audit, excluded, cache = [], [], collections.Counter(), {}
    for actor in geometry_actors:
        name = actor['Gyaml'].split('/')[-1].split('.')[0]
        pack, resolve, params = actor_data(root, name)
        physics = resolve(params['Components']['PhysicsRef'])
        controller = resolve(physics['ControllerSetPath'])
        report = {'name': name, 'layer': actor['Layer'], 'hash': str(actor['Hash']), 'shapes': [], 'keptSourceTriangles': 0, 'wallTriangles': 0, 'paletteUnmatched': 0}
        for shape_ref in controller['ShapeNamePathAry']:
            shape = resolve(shape_ref['FilePath'])
            for part in shape.get('PhshMesh', []) + shape.get('Box', []):
                if 'PhshMeshPath' in part:
                    path = part['PhshMeshPath'].removeprefix('Work/').replace('.phsh', '.Nin_NX_NVN.bphsh')
                    if path not in cache:
                        cache[path] = collision(pack[path])
                    vertices, faces, ids, materials = cache[path]
                else:
                    # Vending machines and Yagara crates use explicit boxes instead of Havok meshes.
                    assert part['MaterialPresets'] in (['Plastic_Undefined'], ['Rubber_Undefined'], ['Undefined_Undefined'])
                    center, half = [np.array([part[key][axis] for axis in 'XYZ']) for key in ('Center', 'HalfExtents')]
                    assert not any(part.get('OffsetRotation', {}).values())
                    center += np.array([part.get('OffsetTranslation', {}).get(axis, 0) for axis in 'XYZ'])
                    vertices = box(center - half, center + half).reshape(-1, 3)
                    faces, ids = np.arange(36).reshape(-1, 3), np.zeros(12, dtype=int)
                    materials = [(material_names.index(part['MaterialPresets'][0].split('_')[0]), 0, 0)]
                    path = shape_ref['FilePath'] + '#Box'
                expected = shape['AutoCalc']
                assert np.allclose(vertices.min(0), [expected['Min'][a] for a in 'XYZ'], atol=2e-5, rtol=0), path
                assert np.allclose(vertices.max(0), [expected['Max'][a] for a in 'XYZ'], atol=2e-5, rtol=0), path
                world = (vertices * actor.get('Scale', [1, 1, 1])) @ rotate(actor.get('Rotate', [0, 0, 0])).T + actor.get('Translate', [0, 0, 0])
                report['shapes'].append({'path': path, 'triangles': len(faces), 'boundsVerified': True})
                for face, mid in zip(faces, ids):
                    kind, _, mask = materials[mid]
                    if mask & flags['IgnoredByMiniMap']:
                        excluded['IgnoredByMiniMap'] += 1
                        continue
                    if kind in (0, 2, 28, 31):
                        excluded[material_names[kind]] += 1
                        continue
                    tri = world[face]
                    n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
                    length = np.linalg.norm(n)
                    if length < 1e-10:
                        excluded['degenerate'] += 1
                        continue
                    n /= length
                    samples = None
                    if inventory and mask & flags['KeepOut'] and not mask & flags['MiniMapOnly']:
                        samples = [sample(tri.mean(0) * .6 + vertex * .4, n) for vertex in tri]
                        # Batch-view heuristic: invisible arena limits can lack IgnoredByMiniMap.
                        # Require render support across the face, not just where a huge limit intersects scenery.
                        if not all(matched for _, matched in samples):
                            excluded['InvisibleKeepOut'] += 1
                            continue
                    if kind in (21, 22):
                        category = 2
                    elif mask & (flags['MiniMapOnly'] | flags['ForceColPaintNotPaintable']):
                        category = 0
                    elif mask & flags['ForceColPaintPaintable']:
                        category = 1
                    else:
                        if samples is None:
                            samples = [sample(tri.mean(0) * .6 + vertex * .4, n) for vertex in tri]
                        category = int(sum(value for value, _ in samples) >= 2)
                        matched = all(matched for _, matched in samples)
                        report['paletteUnmatched'] += not matched
                    # ponytail: the exact 42-bucket producer is unresolved; extrude only near-vertical faces,
                    # keep slopes and short walls unchanged until the original classification is recovered.
                    is_wall = abs(n[1]) < .01 and np.ptp(tri[:, 1]) >= .5 and category != 2
                    surface = wall(tri) if is_wall else tri[None, :, :]
                    report['wallTriangles'] += int(is_wall)
                    report['keptSourceTriangles'] += 1
                    normals = np.cross(surface[:, 1] - surface[:, 0], surface[:, 2] - surface[:, 0])
                    normals /= np.linalg.norm(normals, axis=1)[:, None]
                    packed = np.empty((len(surface), 3, 7), dtype='<f4')
                    packed[:, :, :3], packed[:, :, 3:6], packed[:, :, 6] = surface, normals[:, None, :], category
                    output.append(packed)
        assert report['shapes'], 'Missing collision shape for ' + name
        audit.append(report)
        print(name, report['keptSourceTriangles'], flush=True)
    packed = np.concatenate(output).reshape(-1, 7)
    assert np.isfinite(packed).all() and len(audit) == len(geometry_actors)
    # Compare ported thickness calculation with original-instruction emulation from the research pass.
    validation = json.loads((BASE / 'outputs/minimap-template/wall-extrusion-validation.json').read_text())
    for example in validation['samples']:
        assert np.allclose(wall(np.array(example['input'], dtype=float)), example['output'], atol=2e-6, rtol=0)
    meta = {'vertexCount': len(packed), 'stride': 28, 'boundsMin': packed[:, :3].min(0).tolist(), 'boundsMax': packed[:, :3].max(0).tolist(), 'version': '11.2.0', 'actors': audit, 'excluded': excluded, 'inkRailActors': len(inks), 'sourceTriangles': sum(a['keptSourceTriangles'] for a in audit), 'triangles': len(packed) // 3, 'approximation': 'Confirmed collision exclusions, original wall extrusion on near-vertical faces; unresolved paint buckets use original render-material palette. Short walls and slopes retained.'}
    out.mkdir(exist_ok=True)
    (out / 'collision.bin').write_bytes(packed.tobytes())
    (out / 'collision.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    rail_blocks, rail_audit = ink_rails(scene, inks, ('Cmn', mode))
    if inks:
        rail_mesh = np.concatenate(rail_blocks).reshape(-1, 7)
        (out / 'rails.bin').write_bytes(rail_mesh.tobytes())
        (out / 'rails.json').write_text(json.dumps({'vertexCount': len(rail_mesh), 'stride': 28, 'boundsMin': rail_mesh[:, :3].min(0).tolist(), 'boundsMax': rail_mesh[:, :3].max(0).tolist(), 'rails': rail_audit, 'approximation': 'Deployed path: linked graph points only; device centered on the linked first point, not the actor placement. Tube width is illustrative; device sphere uses the original core collision radius 0.8, not the full device model.'}, indent=2))
    sponge_actors = [a for a in actors if a['Gyaml'].split('/')[-1].split('.')[0].startswith('Sponge')]
    if sponge_actors:
        details, sponge_audit = [], []
        for actor in actors:
            name = actor['Gyaml'].split('/')[-1].split('.')[0]
            if not name.startswith('Sponge'):
                continue
            _, resolve, params = actor_data(root, name)
            controller = resolve(resolve(params['Components']['PhysicsRef'])['ControllerSetPath'])
            shape = resolve(next(s['FilePath'] for s in controller['ShapeNamePathAry'] if s['Name'] == 'Main'))
            half = np.array([shape['Box'][0]['HalfExtents'][axis] for axis in 'XYZ'])
            # Show the verified base collision box as a location marker; expansion is runtime state.
            surface = box(-half, half) @ rotate(actor.get('Rotate', [0, 0, 0])).T + actor['Translate']
            details.append(pack_triangles(surface, 1))
            sponge_audit.append({'actorHash': str(actor['Hash']), 'name': name, 'position': actor['Translate'], 'baseHalfExtents': half.tolist()})
        assert len(sponge_audit) == len(sponge_actors)
        if inventory:
            assert len(sponge_audit) == sum(count for name, count in counts.items() if name.startswith('Sponge'))
        detail_mesh = np.concatenate(details).reshape(-1, 7)
        (out / 'details.bin').write_bytes(detail_mesh.tobytes())
        (out / 'details.json').write_text(json.dumps({'vertexCount': len(detail_mesh), 'stride': 28, 'boundsMin': detail_mesh[:, :3].min(0).tolist(), 'boundsMax': detail_mesh[:, :3].max(0).tolist(), 'sponges': sponge_audit, 'approximation': 'Sponge location markers use base collision box dimensions, not a simulated ink or expansion state.'}, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k != 'actors'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--romfs', required=True, type=Path)
    parser.add_argument('--python-libs', action='append', default=[])
    parser.add_argument('--stage', default='Vss_Yunohana')
    parser.add_argument('--mode', choices=['Pnt', 'Var', 'Vlf', 'Vgl', 'Vcl', 'Low', 'Mid', 'High'], default='Pnt')
    parser.add_argument('--inventory', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--model-cache', type=Path, default=Path('/private/tmp/splatoon-map-render'))
    parser.add_argument('--dotnet')
    parser.add_argument('--model-exporter')
    args = parser.parse_args()
    sys.path[:0] = args.python_libs
    import numpy as np
    import byml
    folder = {'Vss_Yunohana': 'yunohana-minimap', 'Vss_Propeller00': 'airport-minimap', 'Vss_Crank02': 'urchin-minimap'}.get(args.stage)
    assert args.output or folder, 'Specify --output for additional stages'
    assert args.mode == 'Pnt' or args.inventory, 'Audit the mode using --inventory first'
    build(args.romfs, args.output or BASE / 'outputs' / folder, args.stage, args)
