#!/usr/bin/env python3
"""Build the gear calculator's read-only snapshot from pinned game data. No packages."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('weapon_data', ROOT / 'update-data.py')
upstream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upstream)
PREFIX = f'data/parameter/{upstream.VERSION}/'
SENDOU = '7e95ae2eb3fd8ca8857372566c79e9937cb5e8f2'


def read(path):
    return upstream.read_json(path)


def walk(value, path=''):
    if isinstance(value, dict):
        if set(value) >= {'Low', 'Mid', 'High'}:
            yield path, value
        else:
            for key, child in value.items():
                if key != '$type':
                    yield from walk(child, f'{path}.{key}'.strip('.'))
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from walk(child, f'{path}.{i}')


def at(data, path):
    for part in path.split('.'):
        data = data[int(part)] if isinstance(data, list) else data[part]
    return data


LABELS = {
    'SpawnSpeedZSpecUp': ('투척 초기 속도', 'speed'),
    'PeriodFirst': ('강한 분사 지속', 'frames'),
    'PeriodSecond': ('중간 분사 지속', 'frames'),
    'MarkingFrameSubSpec': ('마킹 지속', 'frames'),
    'MarkingFrame': ('마킹 지속', 'frames'),
    'SensorRadius': ('감지 반지름', 'distance'),
    'Distance': ('마킹 범위 반지름', 'distance'),
    'MaxHP': ('장치 내구도', 'hp'),
    'MaxFieldHP': ('배리어 내구도', 'hp'),
    'SpecialTotalFrame': ('지속 시간', 'frames'),
    'SpecialDurationFrame': ('지속 시간', 'frames'),
    'PowerUpFrame': ('드링크 효과 지속', 'frames'),
    'RainyFrame': ('비 지속 시간', 'frames'),
    'LaserFrame': ('레이저 지속', 'frames'),
    'MoveSpeed': ('전진 속도', 'speed'),
    'RadiusMax': ('흡입 범위 · 바깥 반지름', 'distance'),
    'RadiusMin': ('흡입 범위 · 안쪽 반지름', 'distance'),
    'TargetInCircleRadius': ('조준 원 반지름', 'screen'),
    'ChargeRateAutoPerFrame': ('자동 충전 속도', 'charge'),
    'MaxFrame': ('파동 지속', 'frames'),
    'MaxRadius': ('파동 최대 반지름', 'distance'),
    'InkConsume_Hook': ('팔 뻗기 잉크 소비', 'percent'),
    'InkConsume_PerSec': ('초당 잉크 소비', 'percentPerSecond'),
    'PaintRadius': ('폭발 칠 반지름', 'distance'),
    'DistanceDamageDistanceRate': ('폭발 피해 범위 배율', 'ratio'),
    'CrossPaintCheckLength': ('십자 칠 길이', 'distance'),
    'CrossPaintRadius': ('십자 칠 반지름', 'distance'),
    'SplashAroundVelocityMin': ('주변 잉크 초기 속도 · 최소', 'speed'),
    'SplashAroundVelocityMax': ('주변 잉크 초기 속도 · 최대', 'speed'),
    'SplashAroundPaintRadius': ('주변 잉크 칠 반지름', 'distance'),
}


def effects(params):
    result = []
    seen = set()
    for path, triple in walk(params):
        if triple['Low'] == triple['Mid'] == triple['High']:
            continue
        leaf = path.split('.')[-1]
        if leaf == 'Value' and '.SubSpecialSpecUpList.' in path:
            # The omitted enum value in this game dump means PaintRadius.
            leaf = at(params, path.rsplit('.', 1)[0]).get('SpecUpType', 'PaintRadius')
        if leaf not in LABELS:
            raise ValueError(f'Unclassified stat: {path}')
        label, kind = LABELS[leaf]
        curve = [triple[k] for k in ['Low', 'Mid', 'High']]
        signature = (leaf, tuple(curve))
        if signature in seen:
            continue
        seen.add(signature)
        result.append(dict(id=path, label=label, kind=kind, curve=curve, source=path))
    return result


def main():
    source_text = (ROOT / 'data.js').read_text()
    weapons = json.loads(source_text[source_text.index('{'):source_text.rfind('}') + 1])
    assert weapons['version'] == upstream.VERSION and weapons['commit'] == upstream.COMMIT
    curves = read(PREFIX + 'misc/params.json')
    keys = ['ConsumeRt_Main', *[f'ConsumeRt_Sub_Lv{i}' for i in range(5)],
            'IncreaseRt_Special', 'SpecialGaugeRt_Restart', 'MoveVelRt_Shot',
            *[f'MoveVel_{form}{suffix}' for form in ['Human', 'Stealth'] for suffix in ['', '_Fast', '_Slow']],
            'SuperJump_ChargeFrm', 'SuperJump_MoveFrm', 'ReduceJumpSwerveRate', 'InkRecoverFrm_Stealth', 'Dying_ChaseFrm', 'Dying_AroundFrm', 'OpInk_MoveVel', 'DamageRt_BombH', 'DamageRt_BombL', 'DamageRt_LineMarker', 'MarkingTimeRt', 'MarkingTimeRt_Trap', 'MoveDownRt_PoisonMist']
    player = read(PREFIX + 'misc/SplPlayer.game__GameParameterTable.json')['GameParameters']
    traits = read(PREFIX + 'misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json')['Traits']
    names = read('data/language/KRko_full_unicode.json')['CommonMsg/Gear/GearPowerName']
    dataset = {
        'schemaVersion': 1, 'version': upstream.VERSION, 'commit': upstream.COMMIT,
        'sources': {
            'game': upstream.BASE,
            'curves': PREFIX + 'misc/params.json',
            'player': PREFIX + 'misc/SplPlayer.game__GameParameterTable.json',
            'abilities': 'ability.html',
            'supplement': f'https://github.com/sendou-ink/sendou.ink/tree/{SENDOU}/app/features/build-analyzer',
            'units': 'https://wikiwiki.jp/splatoon3mix/システム詳細仕様',
        },
        'defense': {},
        'curves': {**{key: list(reversed(curves[key])) for key in keys},
                   'WallJumpChargeFrm': [player['spl__PlayerGearSkillParam_ActionSpecUp_Squid']['WallJumpChargeFrm_' + level] for level in ['Low', 'Mid', 'High']]},
        'gear': {key: {'name': names[key], 'slot': value['KindLimit']} for key, value in traits.items()},
        'conditions': {
            'StartAllUp': {'add': {'HumanMove_Up': 30, 'SquidMove_Up': 30, 'OpInkEffect_Reduction': 30, 'Action_Up': 30}},
            'ComeBack': {'add': {key: 10 for key in ['MainInk_Save', 'SubInk_Save', 'InkRecovery_Up', 'HumanMove_Up', 'SquidMove_Up', 'SpecialIncrease_Up']}},
            'SomersaultLanding': {'add': {'HumanMove_Up': 30, 'SquidMove_Up': 30, 'OpInkEffect_Reduction': 30}},
            'EndAllUp': {'maxBonus': 18, 'stages': 21, 'targets': ['MainInk_Save', 'SubInk_Save', 'InkRecovery_Up']},
            'Tacticooler': {'minimum': {'HumanMove_Up': 29, 'SquidMove_Up': 29, **{k: 57 for k in ['JumpTime_Save', 'RespawnTime_Save', 'RespawnSpecialGauge_Save', 'Action_Up', 'OpInkEffect_Reduction']}}},
        },
        'defaults': {'speedType': 'Normal', 'subSaveLevel': 2, 'bombInkFraction': 0.7},
        'rules': {
            'fps': 60, 'distancePerCell': 5, 'mainAP': 10, 'subAP': 3, 'maxAP': 57,
            'largeTankRatio': 1.1, 'largeTankWeaponIds': [10, 11], 'ninjaSpeedRatio': 0.9,
            'respawnPunisherLoss': 0.225,
            # Fixed reference: sendou core/stats.ts respawnTime and specialLost.
            'respawnFixedFrames': 90, 'ownRespawnPenaltyFrames': 68,
            'enemyRespawnPenaltyFrames': 45, 'enemyRespawnAPRate': 0.15, 'enemySpecialLoss': 0.15,
            'stealthExtraMaxFrames': player['spl__PlayerGearSkillParam_SuperJumpSignHide']['ExtraMove_FrmMax'],
            'beaconMidAP': player['spl__PlayerBeaconSubSpecUpParam']['SubSpecUpParam']['Mid'],
            'beaconMaxAP': player['spl__PlayerBeaconSubSpecUpParam']['SubSpecUpParam']['High'],
            'beaconMidInput': 17.8,
            'tenacityRates': [0, 3.26, 5.44, 7.59],
        },
        'subs': {}, 'specials': {},
    }
    for field, file, key in [('subs', 'Sub', 'sub'), ('specials', 'Special', 'special')]:
        needed = {w[key] for w in weapons['weapons']}
        rows = read(f'data/mush/{upstream.VERSION}/WeaponInfo{file}.json')
        for row in rows:
            name = row['__RowId']
            if row['Type'] != 'Versus' or name not in needed:
                continue
            actor = upstream.stem(row['SpecActor'])
            source = PREFIX + f'weapon/{actor}.game__GameParameterTable.json'
            params = read(source)['GameParameters']
            entry = {'source': source, 'effects': effects(params)}
            if field == 'subs':
                ink = params.get('WeaponParam', {}).get('InkConsume')
                if ink is None:
                    assert name in ['Bomb_Splash', 'Bomb_Suction'], name
                    ink = dataset['defaults']['bombInkFraction']
                entry.update(inkFraction=ink, saveLevel=params.get('SubWeaponSetting', {}).get('SubInkSaveLv', 2))
                move = params.get('MoveParam', {})
                entry['throwModel'] = None
                if any(effect['id'].endswith('SpawnSpeedZSpecUp') for effect in entry['effects']):
                    # Approximate preview only: explicit simulation assumptions, not engine defaults.
                    entry['throwModel'] = dict(mode='slide' if name == 'Bomb_Curling' else 'line' if name == 'LineMarker' else 'arc',
                        gravity=move.get('FlyGravity', 0.016), drag=move.get('FlyPositionAirResist', 0.05866),
                        vertical=move.get('SpawnSpeedY', 0.24), flightFrames=move.get('FlyingFrame', 0))
            if field == 'subs' and name not in ['Beacon', 'Shield', 'Sprinkler']:
                profiles = []
                paths = [('폭발', 'BlastParam')]
                if name == 'Bomb_Curling':
                    paths = [('최소 차지', 'BlastParamMinCharge'), ('최대 차지', 'BlastParamMaxCharge')]
                elif name == 'Bomb_Fizzy':
                    paths = [(f'폭발 {i+1}', f'MoveParam.BlastParamArray.{i}') for i in range(3)]
                elif name == 'Bomb_Torpedo':
                    paths = [('본체 폭발', 'BlastParamChase'), ('작은 폭발', 'BlastParamChase.SplashBlastParam')]
                for label, path in paths:
                    try:
                        blast = at(params, path)
                    except KeyError:
                        continue
                    if blast.get('DistanceDamage'):
                        profiles.append(dict(label=label, source=path+'.DistanceDamage', rings=[dict(radius=r['Distance'], damage=r['Damage']/10) for r in blast['DistanceDamage']]))
                direct = params.get('MoveParam', {}).get('DirectDamage', params.get('MoveParam', {}).get('DamageDirectHit', 0))/10
                dataset['defense'][name] = dict(blasts=profiles, direct=direct,
                    damageCurve='DamageRt_BombL' if name in ['Bomb_Quick', 'Bomb_Fizzy'] else 'DamageRt_LineMarker' if name == 'LineMarker' else 'DamageRt_BombH',
                    mistLevels=[dict(startFrames=0,human=0.65,swim=0.55),dict(startFrames=78,human=0.43,swim=0.32),dict(startFrames=156,human=0.20,swim=0.10)] if name == 'PoisonMist' else [],
                    mistSource='User-provided table, 2026-09-21; not verified engine parameters' if name == 'PoisonMist' else '',
                    directSource='MoveParam.DirectDamage' if name == 'LineMarker' else 'MoveParam.DamageDirectHit' if direct else '')
            dataset[field][name] = entry
        assert set(dataset[field]) == needed, (field, needed - set(dataset[field]))
    output = ROOT / 'gear/data.json'
    text = json.dumps(dataset, ensure_ascii=False, indent=2) + '\n'
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(text)
    temporary.replace(output)
    names = {code: read(f'data/language/{code}_full_unicode.json')['CommonMsg/Gear/GearPowerName'] for code in upstream.LANGUAGES}
    (ROOT / 'gear/gear-names.json').write_text(json.dumps(names, ensure_ascii=False, indent=2) + '\n')
    icons = ROOT / 'gear/icons'
    icons.mkdir(exist_ok=True)
    for key in [*dataset['gear'], 'Unknown']:
        if key != 'None':
            destination = icons / f'{key}.png'
            if not destination.exists():
                destination.write_bytes(upstream.download(f'images/skill/{key}.png'))
    print(f'{output}: {len(dataset["subs"])} subs, {len(dataset["specials"])} specials, {len(dataset["gear"])} abilities')


if __name__ == '__main__':
    main()
