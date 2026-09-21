// Pure calculations. All balance numbers come from the versioned data snapshot.
export const SLOT_TYPES = ['Head', 'Clothes', 'Shoes'];
const STACKABLE = 'None';
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const exactKeys = (object, keys, path) => {
  assert(object && typeof object === 'object' && !Array.isArray(object), `${path}: 객체 필요`);
  assert(Object.keys(object).sort().join('|') === [...keys].sort().join('|'), `${path}: 알 수 없거나 누락된 필드`);
};

export function validateData(data, catalogue) {
  exactKeys(data, ['schemaVersion', 'version', 'commit', 'sources', 'curves', 'gear', 'conditions', 'defaults', 'rules', 'subs', 'specials', 'defense'], 'data');
  assert(data.schemaVersion === 1, '지원하지 않는 데이터 형식');
  assert(data.version === catalogue.version && data.commit === catalogue.commit, '무기·계산 데이터 버전 불일치');
  exactKeys(data.sources, ['game', 'curves', 'player', 'abilities', 'supplement', 'units'], 'sources');
  assert(Object.values(data.sources).every(v => typeof v === 'string' && v.length), '출처 누락');
  const curveKeys = ['ConsumeRt_Main', ...Array.from({length:5}, (_, i) => `ConsumeRt_Sub_Lv${i}`), 'IncreaseRt_Special', 'SpecialGaugeRt_Restart', 'MoveVelRt_Shot', ...['Human', 'Stealth'].flatMap(form => ['', '_Fast', '_Slow'].map(suffix => `MoveVel_${form}${suffix}`)), 'SuperJump_ChargeFrm', 'SuperJump_MoveFrm', 'ReduceJumpSwerveRate', 'InkRecoverFrm_Stealth', 'WallJumpChargeFrm', 'Dying_ChaseFrm', 'Dying_AroundFrm', 'OpInk_MoveVel', 'DamageRt_BombH', 'DamageRt_BombL', 'DamageRt_LineMarker', 'MarkingTimeRt', 'MarkingTimeRt_Trap', 'MoveDownRt_PoisonMist'];
  exactKeys(data.curves, curveKeys, 'curves');
  const curve = (values, path) => {
    assert(Array.isArray(values) && values.length === 3 && values.every(isNumber), `${path}: 유한수 3개 필요`);
    assert(values.every(n => n >= 0) && values[1] >= Math.min(values[0], values[2]) && values[1] <= Math.max(values[0], values[2]), `${path}: 잘못된 곡선`);
  };
  for (const [key, value] of Object.entries(data.curves)) curve(value, key);
  assert(data.gear.None, '빈 슬롯 정의 누락');
  for (const [key, ability] of Object.entries(data.gear)) {
    exactKeys(ability, ['name', 'slot'], key);
    assert(key && typeof ability.name === 'string' && [STACKABLE, ...SLOT_TYPES].includes(ability.slot), `${key}: 기어 정의 오류`);
  }
  exactKeys(data.conditions, ['StartAllUp', 'ComeBack', 'SomersaultLanding', 'EndAllUp', 'Tacticooler'], 'conditions');
  for (const key of ['StartAllUp', 'ComeBack', 'SomersaultLanding', 'Tacticooler']) {
    const type = key === 'Tacticooler' ? 'minimum' : 'add';
    exactKeys(data.conditions[key], [type], key);
    for (const [ability, n] of Object.entries(data.conditions[key][type])) {
      assert(data.gear[ability]?.slot === STACKABLE && Number.isInteger(n) && n >= 0 && n <= 57, `${key}: 효과 정의 오류`);
    }
  }
  exactKeys(data.conditions.EndAllUp, ['maxBonus', 'stages', 'targets'], 'EndAllUp');
  assert(data.conditions.EndAllUp.maxBonus === 18 && data.conditions.EndAllUp.stages === 21, '라스트 스퍼트 버전 오류');
  assert(data.conditions.EndAllUp.targets.length === 3 && new Set(data.conditions.EndAllUp.targets).size === 3 && data.conditions.EndAllUp.targets.every(k => data.gear[k]?.slot === STACKABLE), '라스트 스퍼트 참조 오류');
  exactKeys(data.defaults, ['speedType', 'subSaveLevel', 'bombInkFraction'], 'defaults');
  assert(data.defaults.speedType === 'Normal' && data.defaults.subSaveLevel === 2 && data.defaults.bombInkFraction === 0.7, '확인되지 않은 엔진 기본값');
  exactKeys(data.rules, ['fps','distancePerCell','mainAP','subAP','maxAP','largeTankRatio','largeTankWeaponIds','ninjaSpeedRatio','respawnPunisherLoss','respawnFixedFrames','ownRespawnPenaltyFrames','enemyRespawnPenaltyFrames','enemyRespawnAPRate','enemySpecialLoss','stealthExtraMaxFrames','beaconMidAP','beaconMaxAP','beaconMidInput','tenacityRates'], 'rules');
  for (const [key, n] of Object.entries(data.rules)) {
    if (Array.isArray(n)) assert(n.length > 0 && n.every(v => isNumber(v) && v >= 0), `rules.${key}: 범위 오류`);
    else assert(isNumber(n) && n > 0, `rules.${key}: 양수 필요`);
  }
  assert(data.rules.fps === 60 && data.rules.distancePerCell === 5 && data.rules.mainAP === 10 && data.rules.subAP === 3 && data.rules.maxAP === 57, '단위·슬롯 규칙 오류');
  const kinds = ['speed','frames','distance','hp','screen','charge','percent','percentPerSecond','ratio'];
  for (const group of ['subs', 'specials']) {
    const expected = new Set(catalogue.weapons.map(w => w[group === 'subs' ? 'sub' : 'special']));
    assert(Object.keys(data[group]).length === expected.size, `${group}: 참조 개수 오류`);
    for (const [key, entry] of Object.entries(data[group])) {
      assert(expected.has(key), `${group}.${key}: 없는 무기`);
      exactKeys(entry, group === 'subs' ? ['source','effects','inkFraction','saveLevel','throwModel'] : ['source','effects'], key);
      assert(typeof entry.source === 'string' && entry.source.startsWith(`data/parameter/${data.version}/weapon/`), `${key}: 출처 오류`);
      if (group === 'subs') assert(isNumber(entry.inkFraction) && entry.inkFraction > 0 && entry.inkFraction <= 1 && Number.isInteger(entry.saveLevel) && entry.saveLevel >= 0 && entry.saveLevel <= 4, `${key}: 잉크 오류`);
      if(group==='subs' && entry.throwModel!==null){
        exactKeys(entry.throwModel,['mode','gravity','drag','vertical','flightFrames'],key+'.throwModel');
        const model=entry.throwModel;
        assert(['arc','slide','line'].includes(model.mode) && ['gravity','drag','vertical','flightFrames'].every(k=>isNumber(model[k])&&model[k]>=0) && model.drag<1 && (model.mode!=='arc'||model.gravity>0) && (model.mode!=='line'||model.flightFrames>0), '투척 모델 오류');
      }
      assert(Array.isArray(entry.effects), `${key}: 효과 배열 필요`);
      const ids = new Set();
      for (const effect of entry.effects) {
        exactKeys(effect, ['id','label','kind','curve','source'], key);
        assert(effect.id && !ids.has(effect.id) && typeof effect.label === 'string' && effect.label && typeof effect.source === 'string' && effect.source && kinds.includes(effect.kind), `${key}: 효과 정의 오류`);
        ids.add(effect.id); curve(effect.curve, key + '.' + effect.id);
      }
    }
  }
  const defenseKeys = Object.keys(data.subs).filter(key => !['Beacon','Shield','Sprinkler'].includes(key));
  exactKeys(data.defense, defenseKeys, 'defense');
  for (const [key, entry] of Object.entries(data.defense)) {
    exactKeys(entry, ['blasts','direct','damageCurve','directSource','mistLevels','mistSource'], 'defense.'+key);
    assert(['DamageRt_BombH','DamageRt_BombL','DamageRt_LineMarker'].includes(entry.damageCurve), '피해 곡선 참조 오류');
    assert(isNumber(entry.direct) && entry.direct >= 0 && typeof entry.directSource === 'string' && (!entry.direct || entry.directSource), '직격 피해 정의 오류');
    assert(Array.isArray(entry.mistLevels) && entry.mistLevels.length===(key==='PoisonMist'?3:0) && typeof entry.mistSource==='string' && (key!=='PoisonMist'||entry.mistSource), '미스트 단계 출처 오류');
    entry.mistLevels.forEach((level,i)=>{
      exactKeys(level,['startFrames','human','swim'],'mistLevels');
      assert(Number.isInteger(level.startFrames) && (i?level.startFrames>entry.mistLevels[i-1].startFrames:level.startFrames===0) && ['human','swim'].every(form=>isNumber(level[form])&&level[form]>0&&level[form]<=1), '미스트 단계 범위 오류');
    });
    assert(Array.isArray(entry.blasts), '폭발 배열 필요');
    for (const blast of entry.blasts) {
      exactKeys(blast, ['label','source','rings'], key+'.blast');
      assert(typeof blast.label === 'string' && blast.label && typeof blast.source === 'string' && blast.source && Array.isArray(blast.rings) && blast.rings.length, '폭발 정의 오류');
      blast.rings.forEach((ring,i) => {
        exactKeys(ring, ['radius','damage'], key+'.ring');
        assert(isNumber(ring.radius) && ring.radius > (i ? blast.rings[i-1].radius : 0) && isNumber(ring.damage) && ring.damage >= 0, '피해 거리 구간 오류');
      });
    }
  }
  const keys = new Set();
  for (const weapon of catalogue.weapons) {
    assert(weapon.key && !keys.has(weapon.key) && catalogue.parameters[weapon.actor] && isNumber(weapon.sp), '무기 정본 참조 오류');
    keys.add(weapon.key);
  }
  return data;
}

export function initialState() {
  return {weapon: 'Shooter_Normal_00', slots: Array.from({length:3}, () => Array(4).fill('None')),
    active: [], ldeStage: 21, tenacityDeficit: 1, cooler: false, jumpTarget: 'normal', beaconSubAP: null, jumpDistance: 100, respawnActive: false, enemyRespawnPenalty: false, enemySub: 'Bomb_Splash', enemySubAP: 0, mistLevel: 1};
}

// Compare incoming effects with identical opponent AP; only the defender AP changes.
export function subDefense(state, data, ap, movement=[]) {
  const key=state.enemySub, entry=data.defense[key], sub=data.subs[key];
  const factor=interpolate(data.curves[entry.damageCurve],ap);
  const reduce=damage => damage>100 ? damage : Math.floor(damage*factor*10+1e-9)/10;
  const marking=sub.effects.find(e=>e.kind==='frames' && /MarkingFrame/.test(e.id));
  const range=key==='Trap'?sub.effects.find(e=>e.kind==='ratio'):null;
  const scale=range?interpolate(range.curve,state.enemySubAP):1;
  const baseFrames=marking?Math.ceil(interpolate(marking.curve,state.enemySubAP)-1e-9):0;
  const markRate=interpolate(data.curves[key==='Trap'?'MarkingTimeRt_Trap':'MarkingTimeRt'],ap);
  const blasts=entry.blasts.map(blast=>({...blast,rings:blast.rings.map(r=>({radius:r.radius*scale/data.rules.distancePerCell,base:r.damage,value:reduce(r.damage)}))}));
  const direct=key==='Bomb_Quick'?{base:blasts[0].rings.reduce((n,r)=>n+r.base,0),value:Math.round(blasts[0].rings.reduce((n,r)=>n+r.value,0)*10)/10}:entry.direct?{base:entry.direct,value:reduce(entry.direct)}:null;
  const mistRate=interpolate(data.curves.MoveDownRt_PoisonMist,ap);
  const level=entry.mistLevels[state.mistLevel-1];
  return {key,ap,opponentRelevant:Boolean(marking||range),blasts,direct,
    marking:marking?{baseFrames,frames:Math.ceil(interpolate(marking.curve,state.enemySubAP)*markRate-1e-9)}:null,
    mist:level?{reductionRate:mistRate,level:state.mistLevel,startFrames:level.startFrames,
      movement:movement.slice(0,2).map((m,i)=>{
        const baseRatio=level[i===0?'swim':'human'],ratio=1-(1-baseRatio)*mistRate;
        return {...m,base:m.base*baseRatio,value:m.value*ratio,baseRatio,ratio};
      })}:null};
}

export function canEquip(data, key, row, slot) {
  return Number.isInteger(row) && row >= 0 && row < 3 && Number.isInteger(slot) && slot >= 0 && slot < 4 &&
    Boolean(data.gear[key] && (data.gear[key].slot === STACKABLE || slot === 0 && data.gear[key].slot === SLOT_TYPES[row]));
}

export function validateState(state, data, catalogue) {
  exactKeys(state, ['weapon','slots','active','ldeStage','tenacityDeficit','cooler','jumpTarget','beaconSubAP','jumpDistance','respawnActive','enemyRespawnPenalty','enemySub','enemySubAP','mistLevel'], 'selection');
  assert(catalogue.weapons.some(w => w.key === state.weapon), '알 수 없는 무기');
  assert(Array.isArray(state.slots) && state.slots.length === 3, '기어 3개 필요');
  state.slots.forEach((row, r) => {
    assert(Array.isArray(row) && row.length === 4, '기어당 4슬롯 필요');
    row.forEach((key, c) => assert(canEquip(data,key,r,c), '장착 불가능한 기어'));
  });
  assert(Array.isArray(state.active) && new Set(state.active).size === state.active.length && state.active.every(k => ['StartAllUp','EndAllUp','ComeBack','SomersaultLanding','MinorityUp'].includes(k)), '알 수 없는 발동 조건');
  assert(Number.isInteger(state.ldeStage) && state.ldeStage >= 1 && state.ldeStage <= 21, '라스트 스퍼트 단계는 1–21');
  assert(Number.isInteger(state.tenacityDeficit) && state.tenacityDeficit >= 0 && state.tenacityDeficit <= 3, '인원 차이는 0–3');
  assert(['normal','beacon'].includes(state.jumpTarget), '알 수 없는 점프 대상');
  assert(state.beaconSubAP === null || Number.isInteger(state.beaconSubAP) && state.beaconSubAP >= 0 && state.beaconSubAP <= 57, '비컨 서브 AP는 0–57');
  assert(Number.isInteger(state.jumpDistance) && state.jumpDistance >= 60 && state.jumpDistance <= 100, '스텔스 거리 범위 오류');
  assert(typeof state.respawnActive === 'boolean' && typeof state.enemyRespawnPenalty === 'boolean', '부활 조건 토글 오류');
  assert(Object.hasOwn(data.defense, state.enemySub), '알 수 없는 상대 서브');
  assert(Number.isInteger(state.enemySubAP) && state.enemySubAP >= 0 && state.enemySubAP <= 57, '상대 서브 AP는 0–57');
  assert(Number.isInteger(state.mistLevel) && state.mistLevel>=1 && state.mistLevel<=3, '미스트 단계는 1–3');
  assert(typeof state.cooler === 'boolean', '버프 토글 오류');
}

export function abilityPoints(state, data) {
  const equipped = state.slots.map(row => row[0]);
  const base = Object.fromEntries(Object.entries(data.gear).filter(([key, g]) => key !== 'None' && g.slot === STACKABLE).map(([key]) => [key, 0]));
  state.slots.forEach(row => row.forEach((key, i) => {
    if (Object.hasOwn(base, key)) base[key] += i === 0 ? data.rules.mainAP : data.rules.subAP * (row[0] === 'ExSkillDouble' ? 2 : 1);
  }));
  const effective = {...base};
  const active = state.active.filter(key => equipped.includes(key));
  for (const key of active) {
    const condition = data.conditions[key];
    if (condition?.add) for (const [ability, amount] of Object.entries(condition.add)) effective[ability] += amount;
    if (key === 'EndAllUp') {
      const amount = Math.floor(condition.maxBonus * state.ldeStage / condition.stages);
      for (const ability of condition.targets) effective[ability] += amount;
    }
  }
  if (!state.respawnActive) effective.RespawnTime_Save=0;
  if (state.cooler) for (const [key, minimum] of Object.entries(data.conditions.Tacticooler.minimum)) effective[key] = Math.max(effective[key], minimum);
  for (const key of Object.keys(effective)) effective[key] = Math.min(data.rules.maxAP, effective[key]);
  return {base, effective, equipped, active};
}

// Curves are [Low, Mid, High]; the exponent makes Mid the halfway response.
export function interpolate(curve, ap) {
  assert(isNumber(ap) && ap >= 0 && ap <= 57, 'AP 범위 오류');
  const [low, mid, high] = curve;
  if (low === high || ap === 0) return low;
  const progress = Math.min(1, (3.3 * ap - 0.027 * ap * ap) / 100);
  if (progress === 1) return high;
  const midpoint = (mid - low) / (high - low);
  if (midpoint === 0) return low;
  const power = Math.log(midpoint) / Math.log(0.5);
  return low + (high - low) * progress ** power;
}

function weaponCurve(params, data, key) {
  const original = data.curves[key];
  return ['Low','Mid','High'].map((level, i) => {
    const override = params.MainWeaponSetting?.[`Overwrite_${key}_${level}`];
    return isNumber(override) && override >= 0 ? override : original[i];
  });
}

function consumption(params, type) {
  const wp = params.WeaponParam || {};
  switch (type) {
    case 'Spinner': return [['풀 차지', wp.InkConsume]];
    case 'Charger': return [['풀 차지', wp.InkConsumeFullCharge], ['차지 없이 발사', wp.InkConsumeMinCharge]];
    case 'Stringer': {
      const charge = params.spl__WeaponStringerParam?.ChargeParam || {};
      return [['풀 차지', charge.InkConsumeFullCharge], ['차지 없이 발사', charge.InkConsumeMinCharge]];
    }
    case 'Saber': return [['차지 베기', params.spl__WeaponSaberParam?.ChargeParam?.InkConsumeFullCharge], ['가로 베기', params.spl__WeaponSaberParam?.SwingParam?.InkConsume]];
    case 'Roller': return [['가로 휘두르기', params.WeaponWideSwingParam?.InkConsume], ['세로 휘두르기', params.WeaponVerticalSwingParam?.InkConsume]];
    case 'Brush': return [['휘두르기', params.WeaponSwingParam?.InkConsume]];
    case 'Shelter': return [['발사', params.spl__WeaponShelterShotgunParam?.InkConsume]];
    case 'Slosher': return [['휘두르기', wp.InkConsume]];
    default: return [['발사', wp.InkConsume]];
  }
}

function resultEffects(entry, ap, data) {
  const {fps, distancePerCell} = data.rules;
  const units = {
    speed: [fps / distancePerCell, '칸/초'], frames: [1 / fps, '초'], distance: [1 / distancePerCell, '칸'],
    hp: [0.1, 'HP'], screen: [1, '원본 화면 단위'], charge: [fps * 100, '%/초'],
    percent: [100, '%'], percentPerSecond: [100, '%/초'], ratio: [1, '배'],
  };
  return entry.effects.map(effect => {
    const [scale, unit] = units[effect.kind];
    return {...effect, base: effect.curve[0] * scale, value: interpolate(effect.curve, ap) * scale, unit};
  });
}

// Both runners cover four cells out and four back, then share a restart.
export function movementTiming(base,speed) {
  const duration=8000/Math.min(base,speed);
  return {duration,returns:[8000/base,8000/speed].map(time=>time/duration)};
}

// Equal release/landing height. Rotate the initial velocity by the aim pitch.
export function throwPath(speed,model,angle=0) {
  if(model.mode==='slide')return [[0,0],[6.9*speed/0.4,0]]; // Uncharged flat-ground estimate.
  if(model.mode==='line')return [[0,0],[speed*model.flightFrames/5,0]];
  const radians=angle*Math.PI/180;
  let x=0,y=0,vx=speed*Math.cos(radians)-model.vertical*Math.sin(radians),vy=speed*Math.sin(radians)+model.vertical*Math.cos(radians);
  const path=[[0,0]];
  for(let frame=0;frame<600;frame++){
    const nextX=x+vx,nextY=y+vy;
    if(nextY<0){const fraction=y/(y-nextY);path.push([(x+vx*fraction)/5,0]);break;}
    x=nextX;y=nextY;path.push([x/5,y/5]);vx*=1-model.drag;vy=vy*(1-model.drag)-model.gravity;
  }
  return path;
}
export function maximumThrow(speed,model) {
  let best={angle:0,path:throwPath(speed,model)};
  if(model.mode!=='arc')return best;
  const consider=angle=>{
    const path=throwPath(speed,model,angle);
    if(path.at(-1)[0]>best.path.at(-1)[0])best={angle,path};
  };
  // Scan the entire upward aiming range, then refine the best interval to 0.01°.
  for(let step=1;step<=180;step++)consider(step/2);
  const center=best.angle;
  for(let step=-50;step<=50;step++){
    const angle=center+step/100;
    if(angle>=0&&angle<=90)consider(angle);
  }
  return best;
}
function throwEstimate(sub,ap){
  if(!sub.throwModel)return null;
  const effect=sub.effects.find(e=>e.id.endsWith('SpawnSpeedZSpecUp'));
  const base=maximumThrow(effect.curve[0],sub.throwModel),current=maximumThrow(interpolate(effect.curve,ap),sub.throwModel);
  return {mode:sub.throwModel.mode,base:base.path.at(-1)[0],value:current.path.at(-1)[0],basePath:base.path,path:current.path,baseAngle:base.angle,angle:current.angle};
}

export function calculate(state, data, catalogue) {
  validateState(state, data, catalogue);
  const weapon = catalogue.weapons.find(w => w.key === state.weapon);
  const params = catalogue.parameters[weapon.actor];
  const points = abilityPoints(state, data);
  const ap = points.effective;
  const curve = (key, ability) => interpolate(weaponCurve(params, data, key), ap[ability] || 0);
  const tank = data.rules.largeTankWeaponIds.includes(weapon.id) ? data.rules.largeTankRatio : 1;
  const mainFactor = curve('ConsumeRt_Main', 'MainInk_Save');
  const attacks = consumption(params, weapon.type).map(([label, raw]) => ({label,
    count: isNumber(raw) && raw > 0 ? Math.floor((tank + 1e-12) / (raw * mainFactor)) : null,
    baseCount: isNumber(raw) && raw > 0 ? Math.floor((tank + 1e-12) / raw) : null,
    percent: isNumber(raw) ? raw * mainFactor / tank * 100 : null,
  }));
  if (weapon.actor.includes('ShooterTriple') && isNumber(params.WeaponParam?.InkConsume)) {
    const raw = params.WeaponParam.InkConsume * 3;
    attacks.push({label:'3점사 묶음', count:Math.floor((tank + 1e-12) / (raw * mainFactor)), baseCount:Math.floor((tank + 1e-12) / raw), percent:raw * mainFactor / tank * 100});
  }
  const wp = params.WeaponParam || {};
  const spreadCurve = [...data.curves.ReduceJumpSwerveRate];
  const swerve = params.spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate;
  ['Low','Mid','High'].forEach((key, i) => { if (isNumber(swerve?.[key])) spreadCurve[i] = swerve[key]; });
  const spread = [];
  for (const [prefix, label] of [['',''], ['Variable_','변경 모드 · ']]) {
    const ground = wp[`${prefix}Stand_DegSwerve`], air = wp[`${prefix}Jump_DegSwerve`];
    if (isNumber(ground)) spread.push({label:label + '지상', value:ground, base:ground});
    if (isNumber(ground) && isNumber(air)) spread.push({label:label + '점프 직후', base:air, value:ground + (air - ground) * (1 - interpolate(spreadCurve, ap.Action_Up))});
  }
  const speedType = params.MainWeaponSetting?.WeaponSpeedType || data.defaults.speedType;
  assert(['Normal','Mid','Fast','Slow'].includes(speedType), '알 수 없는 이동 무게');
  const suffix = ['Normal','Mid'].includes(speedType) ? '' : '_' + speedType;
  const speedScale = data.rules.fps / data.rules.distancePerCell;
  const move = (label, key, ability, emoji) => ({label, emoji, value:curve(key, ability) * speedScale, base:data.curves[key][0] * speedScale});
  const swimming = move('징어대시', 'MoveVel_Stealth' + suffix, 'SquidMove_Up', '🐙');
  if (points.equipped.includes('SquidMoveSpatter_Reduction')) swimming.value *= data.rules.ninjaSpeedRatio;
  const movement = [swimming, move('인간 이동', 'MoveVel_Human' + suffix, 'HumanMove_Up', '🏃')];
  const shotFactor = curve('MoveVelRt_Shot', 'HumanMove_Up');
  const addSpeed = (label, raw, factor = shotFactor, note = '') => movement.push({label, emoji:'🏃', value:isNumber(raw) ? raw * factor * speedScale : null, base:isNumber(raw) ? raw * speedScale : null, note});
  if (['Shooter','Blaster','Maneuver','Slosher','Spinner'].includes(weapon.type)) addSpeed('사격 중 인간 이동', wp.MoveSpeed);
  if (weapon.type === 'Shelter') addSpeed('사격 중 인간 이동', params.spl__WeaponShelterShotgunParam?.MoveSpeed);
  if (weapon.type === 'Spinner') addSpeed('차지 중 인간 이동', wp.MoveSpeed_Charge);
  if (weapon.type === 'Charger') addSpeed('차지 중 인간 이동', wp.MoveSpeedFullCharge, shotFactor, '완전 차지 상태의 속도');
  if (weapon.type === 'Stringer') addSpeed('차지 중 인간 이동', params.spl__WeaponStringerParam?.ChargeParam?.MoveSpeedFullCharge, shotFactor, '완전 차지 상태의 속도');
  if (weapon.type === 'Brush') addSpeed('휘두르기 중 인간 이동', params.WeaponSwingParam?.SwingMoveSpeed);
  if (weapon.type === 'Roller') {
    addSpeed('가로 휘두르기 중 이동', params.WeaponWideSwingParam?.SwingMoveSpeed);
    addSpeed('세로 휘두르기 중 이동', params.WeaponVerticalSwingParam?.SwingMoveSpeed);
  }
  if (weapon.type === 'Saber') {
    const swing = params.spl__WeaponSaberParam?.SwingParam;
    addSpeed('베기 중 인간 이동', swing?.WeakSwingMoveVelLimit, 1, '연속 가로 베기 · 인간 이동 속도 업 미적용');
    addSpeed('차지 중 인간 이동', swing?.ChargeMoveVelLimit, 1, '인간 이동 속도 업 미적용');
  }
  movement.push({...move('상대 잉크 위 이동','OpInk_MoveVel','OpInkEffect_Reduction','🏃'),enemyInk:true});
  const sub = data.subs[weapon.sub];
  const subCost = sub.inkFraction * curve(`ConsumeRt_Sub_Lv${sub.saveLevel}`, 'SubInk_Save');
  const subEffects = resultEffects(sub, ap.SubSpec_Up, data);
  const beaconBonus = value => {
    const {beaconMidAP: mid, beaconMaxAP: max, beaconMidInput: input} = data.rules;
    const coefficient = (mid - input) / (input * (input - max));
    return Math.floor(coefficient * value ** 2 + (1 - coefficient * max) * value + 1e-9);
  };
  if (weapon.sub === 'Beacon') {
    subEffects.push({id:'beacon', label:'이 비콘 이용자의 점프 단축', base:0, value:beaconBonus(ap.SubSpec_Up), unit:'AP', kind:'ap', source:'spl__PlayerBeaconSubSpecUpParam.SubSpecUpParam'});
  }
  const beaconSubAP = state.beaconSubAP ?? (weapon.sub === 'Beacon' ? ap.SubSpec_Up : 0);
  const jumpAP = Math.min(data.rules.maxAP, ap.JumpTime_Save + (state.jumpTarget === 'beacon' ? beaconBonus(beaconSubAP) : 0));
  const chargeFrames = Math.ceil(interpolate(weaponCurve(params,data,'SuperJump_ChargeFrm'),jumpAP));
  const flightFrames = Math.ceil(interpolate(weaponCurve(params,data,'SuperJump_MoveFrm'),jumpAP));
  // User-requested approximation: zero through 60 units, full penalty from 100 units.
  const extraFrames = points.equipped.includes('SuperJumpSign_Hide') ? Math.ceil((state.jumpDistance - 60) / 40 * data.rules.stealthExtraMaxFrames) : 0;
  const tenacityRate=points.active.includes('MinorityUp')?data.rules.tenacityRates[state.tenacityDeficit]:0;
  const tenacityCharge=points.equipped.includes('MinorityUp')?{rate:tenacityRate,frames:tenacityRate>0?Math.ceil(weapon.sp/tenacityRate*data.rules.fps):null}:null;
  const respawnAP=state.enemyRespawnPenalty&&!state.cooler?Math.ceil(ap.RespawnTime_Save*data.rules.enemyRespawnAPRate):ap.RespawnTime_Save;
  const respawnBase=data.rules.respawnFixedFrames+data.curves.Dying_ChaseFrm[0]+data.curves.Dying_AroundFrm[0];
  const respawn={baseFrames:respawnBase,frames:Math.ceil(data.rules.respawnFixedFrames+interpolate(data.curves.Dying_ChaseFrm,respawnAP)+interpolate(data.curves.Dying_AroundFrm,respawnAP)+(points.equipped.includes('Exorcist')?data.rules.ownRespawnPenaltyFrames:0)+(state.enemyRespawnPenalty?data.rules.enemyRespawnPenaltyFrames:0)-1e-9)};
  const enemyLoss=state.enemyRespawnPenalty?data.rules.enemySpecialLoss:0;
  const ownPenalty = points.equipped.includes('Exorcist') ? data.rules.respawnPunisherLoss : 0;
  const recovery = {
    frames: Math.ceil(curve('InkRecoverFrm_Stealth','InkRecovery_Up') * tank - 1e-9),
    baseFrames: Math.ceil(data.curves.InkRecoverFrm_Stealth[0] * tank - 1e-9),
  };
  return {weapon, points, tank, defense:subDefense(state,data,ap.SubEffect_Reduction,movement), main:{attacks, spread, spreadApplicable:['Shooter','Blaster','Maneuver','Spinner'].includes(weapon.type)},
    sub:{count:Math.floor((tank + 1e-12) / subCost), baseCount:Math.floor((tank + 1e-12) / sub.inkFraction), percent:subCost / tank * 100, basePercent:sub.inkFraction / tank * 100, effects:subEffects,throw:throwEstimate(sub,ap.SubSpec_Up)},
    special:{points:Math.ceil(weapon.sp / curve('IncreaseRt_Special', 'SpecialIncrease_Up')), loss:Math.max(0, Math.min(1, 1 - curve('SpecialGaugeRt_Restart','RespawnSpecialGauge_Save') + ownPenalty + enemyLoss)) * 100,
      effects:resultEffects(data.specials[weapon.special], ap.SpecialSpec_Up, data), tenacity:tenacityRate||null,tenacityCharge},
    movement, recovery, respawn, surge:{frames:Math.ceil(curve('WallJumpChargeFrm','Action_Up')),baseFrames:data.curves.WallJumpChargeFrm[0]}, jump:{beaconSubAP, ap:jumpAP, chargeFrames, flightFrames, extraFrames, arrivalMin:chargeFrames + flightFrames, arrivalMax:chargeFrames + flightFrames + extraFrames},
  };
}
