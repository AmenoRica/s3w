import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {initialState,validateData,validateState,calculate,abilityPoints,interpolate,canEquip,movementTiming,throwPath,maximumThrow} from '../gear/core.js';

const context = {window:{}};
vm.runInNewContext(readFileSync(new URL('../data.js',import.meta.url),'utf8'),context);
const catalogue = context.window.WEAPON_DATA;
const data = JSON.parse(readFileSync(new URL('../gear/data.json',import.meta.url),'utf8'));
const pristine = JSON.stringify(data);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const build = (ability,weapon='Shooter_Normal_00') => ({...initialState(),weapon,slots:Array.from({length:3},()=>Array(4).fill(ability))});
const calc = state => calculate(state,data,catalogue);
validateData(data,catalogue);
assert.deepEqual(validateData(JSON.parse(JSON.stringify(data)),catalogue),data);

// Pinned game parameters provide independently checkable 0/57 AP endpoints.
const plain=calc(initialState());
assert.equal(plain.main.attacks[0].count,108);
near(plain.main.attacks[0].percent,.92);
assert.equal(plain.sub.count,1);near(plain.sub.percent,70);
assert.equal(plain.special.points,200);near(plain.special.loss,50);
near(plain.movement[0].value,2.304);near(plain.movement[1].value,1.152);
assert.deepEqual(plain.jump,{beaconSubAP:0,ap:0,chargeFrames:80,flightFrames:138,extraFrames:0,arrivalMin:218,arrivalMax:218});
near(interpolate(data.curves.ConsumeRt_Main,10),.86365);
near(interpolate([1,1,1],57),1);
for(const curve of Object.values(data.curves)){
  near(interpolate(curve,0),curve[0]);near(interpolate(curve,57),curve[2]);
  for(let ap=0;ap<=57;ap++){
    const n=interpolate(curve,ap);
    assert.ok(Number.isFinite(n)&&n>=Math.min(...curve)-1e-9&&n<=Math.max(...curve)+1e-9);
  }
}
for(const ap of [-1,58,NaN,Infinity,'10'])assert.throws(()=>interpolate([1,.8,.5],ap));
assert.equal(calc(build('MainInk_Save')).main.attacks[0].count,197);
near(calc(build('MainInk_Save')).main.attacks[0].percent,.506);
assert.equal(calc(build('SubInk_Save')).sub.count,2);
near(calc(build('SubInk_Save')).sub.percent,45.5);
assert.equal(calc(build('SpecialIncrease_Up')).special.points,154);
near(calc(build('RespawnSpecialGauge_Save')).special.loss,0);
const maxJump=calc(build('JumpTime_Save')).jump;
assert.equal(maxJump.chargeFrames,20);assert.equal(maxJump.flightFrames,97);assert.equal(maxJump.arrivalMax,117);
near(calc(build('Action_Up')).main.spread[1].value,4.86);
near(calc(build('SquidMove_Up')).movement[0].value,2.88);
near(calc(build('HumanMove_Up')).movement[1].value,1.728);
assert.deepEqual(plain.recovery,{frames:180,baseFrames:180});
assert.deepEqual(calc(build('InkRecovery_Up')).recovery,{frames:117,baseFrames:180});
assert.deepEqual(calc(build('InkRecovery_Up','Shooter_First_00')).recovery,{frames:129,baseFrames:198});

// Large tank, weapon-specific curves, bursts and distinct charge actions.
const junior=calc({...initialState(),weapon:'Shooter_First_00'});
near(junior.tank,1.1);near(junior.sub.percent,70/1.1);
assert.equal(junior.main.attacks[0].count,255);
const hydra=calc(build('HumanMove_Up','Spinner_Hyper_00'));
near(hydra.movement.find(m=>m.label==='사격 중 인간 이동').value,.06*1.35*12);
assert.equal(calc({...initialState(),weapon:'Spinner_Standard_00'}).main.attacks[0].label,'풀 차지');
assert.equal(calc({...initialState(),weapon:'Charger_Normal_00'}).main.attacks[0].count,5);
assert.equal(calc({...initialState(),weapon:'Shooter_TripleQuick_00'}).main.attacks[1].count,30);
for(const actor of ['Saber_Normal_00','Saber_Lite_00','Saber_Heavy_00']){
  const a=calc({...initialState(),weapon:actor}),b=calc(build('HumanMove_Up',actor));
  near(a.movement[2].value,b.movement[2].value);near(a.movement[3].value,b.movement[3].value);
}
near(calc({...initialState(),weapon:'Saber_Normal_00'}).movement[2].value,.72);
near(calc(build('HumanMove_Up','Brush_Mini_00')).movement[2].value,.05*1.25*12);

// Main-only slot legality and Ability Doubler only affect the clothing sub slots.
const double=initialState();double.slots[1]=['ExSkillDouble','SubInk_Save','SubInk_Save','SubInk_Save'];
double.slots[0][1]='SubInk_Save';
assert.equal(abilityPoints(double,data).effective.SubInk_Save,21);
assert.ok(canEquip(data,'EndAllUp',0,0));
assert.equal(canEquip(data,'EndAllUp',0,1),false);
assert.equal(canEquip(data,'EndAllUp',1,0),false);
for(const key of Object.keys(data.gear)){
  for(let row=0;row<3;row++)for(let slot=0;slot<4;slot++){
    const state=initialState();state.slots[row][slot]=key;
    if(canEquip(data,key,row,slot))validateState(state,data,catalogue);
    else assert.throws(()=>validateState(state,data,catalogue));
  }
  if(key!=='None')assert.ok(existsSync(new URL(`../gear/icons/${key}.png`,import.meta.url)));
}
assert.equal(canEquip(data,'Missing',0,0),false);
assert.equal(canEquip(data,'InkRecovery_Up',-1,0),false);
const badSlot=initialState();badSlot.slots[0][1]='ComeBack';assert.throws(()=>validateState(badSlot,data,catalogue));
badSlot.slots[0][1]='None';badSlot.slots[2][0]='ComeBack';assert.throws(()=>validateState(badSlot,data,catalogue));

// Conditions require the gear; staged LDE does not silently jump to its maximum.
const lde=initialState();lde.slots[0][0]='EndAllUp';lde.active=['EndAllUp'];
for(const [stage,expected] of [[1,0],[2,1],[11,9],[20,17],[21,18]]){
  lde.ldeStage=stage;const points=abilityPoints(lde,data).effective;
  for(const key of ['MainInk_Save','SubInk_Save','InkRecovery_Up'])assert.equal(points[key],expected);
}
lde.active=[];assert.equal(abilityPoints(lde,data).effective.MainInk_Save,0);
lde.active=['EndAllUp'];lde.slots[0][0]='None';assert.equal(abilityPoints(lde,data).effective.MainInk_Save,0);
const overlap=build('SquidMove_Up');overlap.slots[0][0]='ComeBack';overlap.slots[2][0]='SomersaultLanding';overlap.active=['ComeBack','SomersaultLanding'];overlap.cooler=true;
assert.equal(abilityPoints(overlap,data).effective.SquidMove_Up,57);
const drink={...initialState(),cooler:true};
assert.equal(abilityPoints(drink,data).effective.SquidMove_Up,29);
assert.equal(calc(drink).jump.arrivalMax,117);near(calc(drink).special.loss,0);
assert.equal(abilityPoints({...build('SquidMove_Up'),cooler:true},data).effective.SquidMove_Up,57);
const ninja={...initialState(),cooler:true};ninja.slots[1][0]='SquidMoveSpatter_Reduction';
near(calc(ninja).movement[0].value,calc(drink).movement[0].value*.9);
const stealth=initialState();stealth.slots[2][0]='SuperJumpSign_Hide';
assert.equal(calc(stealth).jump.arrivalMin,218);assert.equal(calc(stealth).jump.arrivalMax,278);
const punisher=initialState();punisher.slots[1][0]='Exorcist';near(calc(punisher).special.loss,72.5);
punisher.cooler=true;near(calc(punisher).special.loss,22.5);

// Eight-cell trips at 2 / 4 cells per second: one waits at origin for two seconds.
assert.deepEqual(movementTiming(2,4),{duration:4000,returns:[1,0.5]});
assert.deepEqual(movementTiming(4,2),{duration:4000,returns:[0.5,1]});
assert.deepEqual(movementTiming(2,2),{duration:4000,returns:[1,1]});
// User-selected stealth penalty is applied only while equipped.
for(const [distance,frames] of [[60,0],[61,2],[80,30],[100,60]]){
  assert.equal(calc({...stealth,jumpDistance:distance}).jump.arrivalMax,218+frames);
  assert.equal(calc({...initialState(),jumpDistance:distance}).jump.arrivalMax,218);
}
assert.deepEqual(plain.surge,{frames:45,baseFrames:45});
assert.equal(calc(build('Action_Up')).surge.frames,5);
assert.equal(calc(drink).surge.frames,5);
const oneAction=initialState();oneAction.slots[0][0]='Action_Up';
assert.equal(calc(oneAction).surge.frames,25);
for(const sub of new Set(catalogue.weapons.map(w=>w.sub))){
  const weapon=catalogue.weapons.find(w=>w.sub===sub).key;
  const a=calc({...initialState(),weapon}).sub.throw,b=calc(build('SubSpec_Up',weapon)).sub.throw;
  if(!a){assert.equal(b,null);continue;}
  near(a.base,a.value);assert.ok(b.value>a.value);
  for(const path of [b.path,b.basePath]){
    assert.deepEqual(path[0],[0,0]);assert.equal(path.at(-1)[1],0);
    assert.ok(path.every((point,i)=>point.every(Number.isFinite)&&point[1]>=0&&(i===0||point[0]>=path[i-1][0])));
  }
  if(sub==='LineMarker'){near(a.value,6.3*7/5);near(b.value,6.8*7/5);}
  if(sub==='Bomb_Curling'){near(a.value,6.9);near(b.value,6.9*1.3);}
}

// Optimized landing range must beat horizontal throws and a separate angle grid.
for(const sub of Object.values(data.subs).filter(s=>s.throwModel?.mode==='arc')){
  const effect=sub.effects.find(e=>e.id.endsWith('SpawnSpeedZSpecUp'));
  for(const speed of [effect.curve[0],effect.curve[2]]){
    const best=maximumThrow(speed,sub.throwModel),distance=best.path.at(-1)[0];
    assert.ok(best.angle>0&&best.angle<90);
    assert.ok(distance>throwPath(speed,sub.throwModel,0).at(-1)[0]);
    for(let angle=0;angle<=90;angle+=0.25)assert.ok(distance+0.0001>=throwPath(speed,sub.throwModel,angle).at(-1)[0]);
  }
}

// Respawn activation, enemy penalties, and Tacticooler exceptions.
assert.deepEqual(plain.respawn,{baseFrames:450,frames:450});
assert.equal(calc(build('RespawnTime_Save')).respawn.frames,450);
const activeQR={...build('RespawnTime_Save'),respawnActive:true};
assert.equal(calc(activeQR).respawn.frames,210);
assert.equal(calc({...activeQR,enemyRespawnPenalty:true}).respawn.frames,429);
assert.equal(calc({...initialState(),enemyRespawnPenalty:true}).respawn.frames,495);
assert.equal(calc({...initialState(),cooler:true}).respawn.frames,210);
assert.equal(calc({...initialState(),cooler:true,enemyRespawnPenalty:true}).respawn.frames,255);
const ownRP=initialState();ownRP.slots[1][0]='Exorcist';
assert.equal(calc(ownRP).respawn.frames,518);
assert.equal(calc({...ownRP,enemyRespawnPenalty:true}).respawn.frames,563);
near(calc({...initialState(),enemyRespawnPenalty:true}).special.loss,65);
near(calc({...initialState(),enemyRespawnPenalty:true,cooler:true}).special.loss,15);

// Enemy-ink movement uses resistance AP, independent of run-speed gear.
const enemyWalk=r=>r.movement.find(m=>m.enemyInk).value;
near(enemyWalk(plain),0.024*12);
near(enemyWalk(calc(build('OpInkEffect_Reduction'))),0.0768*12);
near(enemyWalk(calc(build('HumanMove_Up'))),enemyWalk(plain));
const tenacityState=initialState();tenacityState.slots[0][0]='MinorityUp';
assert.equal(calc(tenacityState).special.tenacityCharge.frames,null);
assert.equal(calc(initialState()).special.tenacityCharge,null);
tenacityState.active=['MinorityUp'];
for(const deficit of [1,2,3]){
  tenacityState.tenacityDeficit=deficit;
  assert.equal(calc(tenacityState).special.tenacityCharge.frames,Math.ceil(200/data.rules.tenacityRates[deficit]*60));
}
assert.equal(calc({...tenacityState,tenacityDeficit:0}).special.tenacityCharge.frames,null);
const beforeCharge=calc(tenacityState).special.tenacityCharge.frames;
tenacityState.slots[1][0]='SpecialIncrease_Up';
assert.equal(calc(tenacityState).special.tenacityCharge.frames,beforeCharge);

// Full catalogue coverage, finite numbers, deterministic results and unchanged inputs.
let scenarios=0;
for(const weapon of catalogue.weapons){
  assert.ok(existsSync(new URL(`../assets/Path_Wst_${weapon.key}.png`,import.meta.url)));
  for(const state of [{...initialState(),weapon:weapon.key},{...build('SubSpec_Up',weapon.key),cooler:true},build('SpecialSpec_Up',weapon.key),build('MainInk_Save',weapon.key)]){
    const before=JSON.stringify(state),r=calc(state);assert.deepEqual(calc(state),r);assert.equal(JSON.stringify(state),before);
    assert.ok(r.main.attacks.every(a=>Number.isInteger(a.count)&&a.count>=0&&a.percent>0));
    assert.ok(r.movement.every(m=>Number.isFinite(m.value)&&m.value>0));
    assert.ok(r.sub.effects.every(e=>Number.isFinite(e.value))&&r.special.effects.every(e=>Number.isFinite(e.value)));
    assert.ok(r.sub.count>=1&&r.special.loss>=0&&r.special.loss<=100&&r.special.points>0);
    assert.ok(Number.isInteger(r.recovery.frames)&&r.recovery.frames>0&&r.recovery.frames<=r.recovery.baseFrames);
    scenarios++;
  }
}
const beakon=catalogue.weapons.find(w=>w.sub==='Beacon');
assert.equal(calc(build('SubSpec_Up',beakon.key)).sub.effects.find(e=>e.id==='beacon').value,57);
// External beacons use the installer's AP, independently of our sub weapon.
const beaconState={...initialState(),jumpTarget:'beacon'};
assert.equal(calc(beaconState).jump.arrivalMax,218);
beaconState.beaconSubAP=57;
assert.equal(calc(beaconState).jump.ap,57);
assert.equal(calc(beaconState).jump.arrivalMax,calc(build('JumpTime_Save')).jump.arrivalMax);
assert.equal(calc({...beaconState,jumpTarget:'normal'}).jump.arrivalMax,218);
const ownBeacon=build('SubSpec_Up',beakon.key);
assert.equal(calc(ownBeacon).jump.beaconSubAP,57);
assert.equal(calc(ownBeacon).jump.arrivalMax,218);
ownBeacon.jumpTarget='beacon';
assert.equal(calc(ownBeacon).jump.ap,57);
ownBeacon.slots[0][0]='JumpTime_Save';
assert.equal(calc(ownBeacon).jump.beaconSubAP,47);
assert.equal(calc(ownBeacon).jump.ap,57);
ownBeacon.beaconSubAP=0;
assert.equal(calc(ownBeacon).jump.ap,10);
assert.equal(calc({...ownBeacon,weapon:'Shooter_Normal_00',beaconSubAP:null}).jump.beaconSubAP,0);
for(const change of [s=>s.jumpTarget='invalid',s=>s.beaconSubAP=-1,s=>s.beaconSubAP=58,s=>s.beaconSubAP=1.5,s=>s.beaconSubAP='10']){
 const invalid=initialState();change(invalid);assert.throws(()=>calc(invalid));
}
const coolerWeapon=catalogue.weapons.find(w=>w.special==='SpEnergyStand');
near(calc(build('SpecialSpec_Up',coolerWeapon.key)).special.effects.find(e=>e.kind==='frames').value,25);
assert.equal(JSON.stringify(data),pristine);

// Reject corrupt snapshots rather than rendering plausible-looking fallback values.
for(const corrupt of [d=>d.schemaVersion=2,d=>d.extra=true,d=>d.version='9999',d=>d.curves.ConsumeRt_Main[1]=Infinity,d=>d.curves.ConsumeRt_Main[1]=4,d=>d.subs.Bomb_Splash.saveLevel=6,d=>d.subs.Bomb_Splash.inkFraction=0,d=>d.subs.Bomb_Splash.effects[0].kind='made-up',d=>d.subs.Bomb_Splash.effects.push({...d.subs.Bomb_Splash.effects[0]}),d=>delete d.specials.SpEnergyStand]){
  const copy=structuredClone(data);corrupt(copy);assert.throws(()=>validateData(copy,catalogue));
}
for(const change of [s=>s.respawnActive=1,s=>s.enemyRespawnPenalty='true',s=>s.jumpDistance=59,s=>s.jumpDistance=101,s=>s.jumpDistance=80.5,s=>s.weapon='missing',s=>s.ldeStage=22,s=>s.ldeStage=1.5,s=>s.tenacityDeficit=-1,s=>s.cooler='true',s=>s.active=['unexpected'],s=>s.slots[0].push('None')]){
  const state=initialState();change(state);assert.throws(()=>calc(state));
}
console.log(`PASS: ${catalogue.weapons.length} weapons, ${scenarios} scenarios; AP limits, conditions, Tacticooler, staged LDE, weapon exceptions, units and invalid data.`);
