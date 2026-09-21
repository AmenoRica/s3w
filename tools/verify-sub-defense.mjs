import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initialState,calculate,validateData,validateState} from '../gear/core.js';
import {selectionSearch,readSelection} from '../gear/share.js';
const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../data.js',import.meta.url),'utf8'),context);
const catalogue=context.window.WEAPON_DATA;
const data=JSON.parse(readFileSync(new URL('../gear/data.json',import.meta.url),'utf8'));
validateData(data,catalogue);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const state=(key='Bomb_Splash',ap=0)=>({...initialState(),enemySub:key,slots:Array.from({length:3},()=>Array(4).fill(ap===57?'SubEffect_Reduction':'None'))});
const calc=s=>calculate(s,data,catalogue).defense;
const splash=calc(state('Bomb_Splash',57));
assert.deepEqual(splash.blasts[0].rings.map(r=>[r.base,r.value]),[[180,180],[30,15]]);
near(splash.blasts[0].rings[0].radius,.72);near(splash.blasts[0].rings[1].radius,1.4);
assert.equal(calc(state('Bomb_Quick',57)).direct.value,36);
assert.equal(calc(state('LineMarker',57)).direct.value,20);
assert.equal(calc(state('PointSensor',57)).marking.frames,48);
assert.equal(calc({...state('PointSensor',57),enemySubAP:57}).marking.frames,96);
const trap=calc({...state('Trap',57),enemySubAP:57});
assert.equal(trap.marking.baseFrames,600);assert.equal(trap.marking.frames,60);
near(trap.blasts[0].rings[1].radius,2.2);
assert.equal(trap.blasts[0].rings[0].value,22.5);
assert.equal(calc(state('Bomb_Fizzy',57)).blasts.length,3);
assert.equal(calc(state('Bomb_Curling',57)).blasts.length,2);
assert.equal(calc(state('Bomb_Torpedo',57)).blasts[1].rings[0].value,6);
for(const key of Object.keys(data.defense))for(const ap of [0,57])for(const enemySubAP of [0,57]){
 const s={...state(key,ap),enemySubAP},d=calc(s);
 for(const blast of d.blasts)for(const [i,ring] of blast.rings.entries()){
  assert.ok(ring.radius>(i?blast.rings[i-1].radius:0));
  assert.ok(ring.value>=0&&ring.value<=ring.base);
  if(!ap||ring.base>100)assert.equal(ring.value,ring.base);
 }
 if(!d.opponentRelevant)assert.deepEqual(d,calc({...s,enemySubAP:57-enemySubAP}));
}
const expected=[[.55,.65],[.32,.43],[.1,.2]];
for(let mistLevel=1;mistLevel<=3;mistLevel++){
 for(const ap of [0,57]){
  const s={...state('PoisonMist',ap),mistLevel};
  const r=calculate(s,data,catalogue);
  r.defense.mist.movement.forEach((m,i)=>{
   near(m.baseRatio,expected[mistLevel-1][i]);
   near(m.ratio,ap?1-(1-m.baseRatio)*.5:m.baseRatio);
   near(m.base,r.movement[i].base*m.baseRatio);
   near(m.value,r.movement[i].value*m.ratio);
  });
 }
}
// Other movement abilities still apply, while opponent AP does not affect mist.
const moving={...state('PoisonMist'),mistLevel:3};moving.slots[0][0]='SquidMove_Up';
const r=calculate(moving,data,catalogue);near(r.defense.mist.movement[0].value,r.movement[0].value*.1);
for(const invalid of [{enemySub:'Beacon'},{enemySubAP:58},{enemySubAP:-1},{enemySubAP:1.5},{mistLevel:0},{mistLevel:4}])assert.throws(()=>validateState({...state(),...invalid},data,catalogue));
for(const change of [d=>d.defense.Bomb_Splash.blasts[0].rings[1].radius=0,d=>d.defense.PoisonMist.mistLevels[0].human=NaN,d=>d.defense.Trap.damageCurve='nope']){
 const broken=structuredClone(data);change(broken);assert.throws(()=>validateData(broken,catalogue));
}
const selection={...state('PoisonMist',57),enemySubAP:57,mistLevel:3};
const restored=readSelection(selectionSearch(selection),data,catalogue);
assert.equal(restored.enemySub,'Bomb_Splash');assert.equal(restored.enemySubAP,0);assert.equal(restored.mistLevel,1);assert.deepEqual(restored.slots,selection.slots);
console.log('PASS: 11 opponent subs; lethal immunity, damage rounding, compound effects, opponent AP, all mist levels, movement, validation and link isolation.');
