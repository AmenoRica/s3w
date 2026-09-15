#!/usr/bin/env python3
"""Download the pinned Leanny/splat3 snapshot. Python standard library only."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request

COMMIT = '7280ff9cde8bb1c5dcef46c700c326471584d2e6'
VERSION = '1130'
ROOT = Path(__file__).resolve().parent
CACHE = Path(tempfile.gettempdir()) / ('weapon-browser-' + COMMIT)
BASE = f'https://raw.githubusercontent.com/Leanny/splat3/{COMMIT}/'
LANGUAGES = {
    'KRko': ['한국어', 'ko'], 'JPja': ['日本語', 'ja'],
    'USen': ['English (US)', 'en-US'], 'EUen': ['English (Europe)', 'en-GB'],
    'EUde': ['Deutsch', 'de'], 'EUes': ['Español (España)', 'es-ES'],
    'USes': ['Español (América)', 'es-MX'], 'EUfr': ['Français (Europe)', 'fr-FR'],
    'USfr': ['Français (Canada)', 'fr-CA'], 'EUit': ['Italiano', 'it'],
    'EUnl': ['Nederlands', 'nl'], 'EUru': ['Русский', 'ru'],
    'CNzh': ['简体中文', 'zh-Hans'], 'TWzh': ['繁體中文', 'zh-Hant'],
}
# 11 language/script choices, 14 regional files in the upstream repository.


def download(path):
    cached = CACHE / path
    if cached.exists():
        return cached.read_bytes()
    with urllib.request.urlopen(BASE + path, timeout=45) as response:
        body = response.read()
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(body)
    return body


def read_json(path):
    return json.loads(download(path))


def stem(value):
    return value.rsplit('/', 1)[-1].split('.')[0]


def field(obj, path):
    try:
        for key in path.split('.'):
            obj = obj[int(key)] if isinstance(obj, list) else obj[key]
        return obj if isinstance(obj, (float, int)) and not isinstance(obj, bool) else None
    except (KeyError, IndexError, TypeError):
        return None


def statistics(kind, p):
    """Only explicit fields: do not turn absent engine defaults into zero."""
    output = []

    def add(label, path, unit='damage', scale=0.1):
        value = field(p, path)
        if value is not None:
            output.append({'label': label, 'value': round(value * scale, 6),
                           'unit': unit, 'source': path})

    if kind in ('Shooter', 'Blaster', 'Maneuver', 'Spinner'):
        add('damageMax', 'DamageParam.ValueMax')
        add('damageMin', 'DamageParam.ValueMin')
        if kind == 'Spinner':
            add('fullDamage', 'DamageParam.ValueFullChargeMax')
        if kind == 'Blaster':
            for i in range(len(p.get('BlastParam', {}).get('DistanceDamage', []))):
                add('blastDamage', f'BlastParam.DistanceDamage.{i}.Damage')
    elif kind == 'Charger':
        for label, key in [('fullDamage', 'ValueFullCharge'), ('partialDamage', 'ValueMaxCharge'),
                           ('unchargedDamage', 'ValueMinCharge')]:
            add(label, 'DamageParam.' + key)
        add('travelFull', 'MoveParam.DistanceFullCharge', 'internal', 1)
    elif kind in ('Roller', 'Brush'):
        group = 'WideSwingUnitGroupParam' if kind == 'Roller' else 'SwingUnitGroupParam'
        add('horizontalDamage', group + '.DamageParam.Inside.DamageMaxValue')
        add('verticalDamage', 'VerticalSwingUnitGroupParam.DamageParam.Inside.DamageMaxValue')
        add('rollDamage', 'BodyParam.Damage')
    elif kind == 'Saber':
        add('horizontalDamage', 'BulletSaberHorizontalParam.DamageParam.HitDamage')
        add('verticalDamage', 'BulletSaberVerticalParam.DamageParam.HitDamage')
        add('horizontalContact', 'BulletSaberSlashHorizontalParam.DamageParam.DamageValue')
        add('verticalContact', 'BulletSaberSlashVerticalParam.DamageParam.DamageValue')
    elif kind == 'Shelter':
        add('shotTotal', 'spl__BulletShelterShotgunParam.DamageEffectiveTotalMax')
        add('pelletDamage', 'spl__BulletShelterShotgunParam.GroupParams.0.DamageParam.ValueMax')
    elif kind == 'Stringer':
        add('fullArrow', 'spl__BulletStringerParam.DamageParam.DirectHitDamageMax')
        add('unchargedArrow', 'spl__BulletStringerParam.DamageParam.DirectHitDamageMin')
        add('blastDamage', 'spl__BulletStringerParam.DetonationParam.BlastParam.DistanceDamage.0.Damage')
    elif kind == 'Slosher':
        for i in range(len(p.get('UnitGroupParam', {}).get('Unit', []))):
            add('unitDamage', f'UnitGroupParam.Unit.{i}.DamageParam.ValueMax')
        # Explosher and Bloblobber have additional explicit projectile forms.
        def walk_damage(value, path=''):
            if isinstance(value, dict):
                for key, child in value.items():
                    target = f'{path}.{key}'.strip('.')
                    if key == 'ValueMax' and path.endswith('DamageParam'):
                        if not any(x['source'] == target for x in output):
                            add('unitDamage', target)
                    if key == 'Damage' and '.DistanceDamage.' in path:
                        add('blastDamage', target)
                    walk_damage(child, target)
            elif isinstance(value, list):
                for i, child in enumerate(value):
                    walk_damage(child, f'{path}.{i}')
        walk_damage(p)

    weapon = {'Shelter': 'spl__WeaponShelterShotgunParam',
              'Roller': 'WeaponWideSwingParam', 'Brush': 'WeaponSwingParam',
              'Saber': 'spl__WeaponSaberParam.SwingParam',
              'Stringer': 'spl__WeaponStringerParam.ChargeParam'}.get(kind, 'WeaponParam')
    add('ink', weapon + '.InkConsume', 'percent', 100)
    add('inkFull', weapon + '.InkConsumeFullCharge', 'percent', 100)
    add('inkMin', weapon + '.InkConsumeMinCharge', 'percent', 100)
    add('repeat', weapon + '.RepeatFrame', 'frames', 1)
    add('recovery', weapon + '.InkRecoverStop', 'frames', 1)
    add('charge', weapon + '.ChargeFrameFullCharge', 'frames', 1)
    if kind == 'Saber':
        add('charge', 'spl__WeaponSaberParam.ChargeParam.ChargeFrameFullCharge', 'frames', 1)
        add('inkFull', 'spl__WeaponSaberParam.ChargeParam.InkConsumeFullCharge', 'percent', 100)
    if kind == 'Spinner':
        add('chargeFirst', 'WeaponParam.ChargeFrame_First', 'frames', 1)
        add('chargeSecond', 'WeaponParam.ChargeFrame_Second', 'frames', 1)
    if kind == 'Maneuver':
        add('slideInk', 'SideStepParam.InkConsume', 'percent', 100)
        add('slideRepeat', 'WeaponParam.LapOver_RepeatFrame', 'frames', 1)
    return output


def language(code, weapons):
    data = read_json(f'data/language/{code}_full_unicode.json')
    take = lambda key: data['CommonMsg/Weapon/' + key]
    return code, {
        'label': LANGUAGES[code][0], 'locale': LANGUAGES[code][1],
        'names': {w['key']: take('WeaponName_Main')[w['key']] for w in weapons},
        'sub': take('WeaponName_Sub'), 'special': take('WeaponName_Special'),
        'types': take('WeaponTypeName'), 'paramNames': take('WeaponParamName'),
        'sheldon': data['CommonMsg/Glossary']['WeaponShop'],
        'descriptions': {w['key']: data['CommonMsg/Talk/TalkShopWeaponExp'].get(w['key'], '') for w in weapons},
    }


def main():
    rows = read_json(f'data/mush/{VERSION}/WeaponInfoMain.json')
    base_rows = {r['Id']: r for r in rows}
    # These seven SpecActor names have no parameter file in this snapshot.
    missing_actors = {'WeaponShelterCompact_Cstm', 'WeaponShelterCompact_Cstm2',
                      'WeaponShelterFocus_Cstm', 'WeaponShelterNormal_Cstm',
                      'WeaponShelterNormal_O', 'WeaponShelterWide_Cstm', 'WeaponShelterWide_Cstm2'}
    weapons = []
    for row in sorted(rows, key=lambda r: (r['DebugDispOrder'], r['DebugDispColumn'], r['Id'])):
        if row['Type'] != 'Versus':
            continue
        key = row['__RowId']
        actor = stem(row['SpecActor'])
        reference = None
        if actor in missing_actors:
            base = base_rows[row['MatchingId']]
            actor, reference = stem(base['SpecActor']), base['__RowId']
        weapons.append({'key': key, 'id': row['Id'], 'type': key.split('_')[0],
                        'sub': stem(row['SubWeapon']), 'special': stem(row['SpecialWeapon']),
                        'sp': row['SpecialPoint'], 'rank': row['ShopUnlockRank'],
                        'matchRange': row['Range'], 'bars': row['UIParam'],
                        'actor': actor, 'reference': reference})
    actors = sorted({w['actor'] for w in weapons})
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        parameters = dict(zip(actors, pool.map(
            lambda a: read_json(f'data/parameter/{VERSION}/weapon/{a}.game__GameParameterTable.json')['GameParameters'], actors)))
        locales = dict(pool.map(lambda c: language(c, weapons), LANGUAGES))
    for w in weapons:
        w['stats'] = statistics(w['type'], parameters[w['actor']])
    paths = {f'images/weapon_flat/Path_Wst_{w["key"]}.png' for w in weapons}
    paths |= {f'images/subspe/Wsb_{w["sub"]}00.png' for w in weapons}
    paths |= {f'images/subspe/Wsp_{w["special"]}00.png' for w in weapons}
    paths.add('images/npc/IconNPCWeaponShop.png')

    def save_asset(path):
        body = download(path)
        if not body.startswith(b'\x89PNG'):
            raise ValueError('Not a PNG: ' + path)
        target = ROOT / 'assets' / path.rsplit('/', 1)[-1]
        target.write_bytes(body)
    (ROOT / 'assets').mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(save_asset, sorted(paths)))

    payload = {'commit': COMMIT, 'version': VERSION, 'weapons': weapons,
               'languages': locales, 'parameters': parameters}
    serialized = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    (ROOT / 'data.js').write_text('window.WEAPON_DATA = ' + serialized + ';\n', encoding='utf-8')
    manifest = {'repository': 'Leanny/splat3', 'commit': COMMIT, 'version': VERSION,
                'weapons': len(weapons), 'parameterFiles': len(parameters), 'locales': list(locales),
                'descriptionCounts': {c: sum(bool(x) for x in l['descriptions'].values()) for c, l in locales.items()},
                'assets': len(paths), 'dataSha256': hashlib.sha256(serialized.encode()).hexdigest()}
    (ROOT / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
