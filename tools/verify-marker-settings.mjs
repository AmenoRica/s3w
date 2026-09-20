import assert from 'node:assert/strict';
import {utilityMarkers,utilityByKey,utilityForPlacement,utilityTriangles,gearValue,normalizeGearAP,stormDestination} from '../stages/utility-markers.js';
import {createRangeRenderer} from '../stages/range-renderer.js';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
for(const [input,expected] of [[-3,0],[100,57],[12.6,13],[NaN,0],[Infinity,0],['57',0]])assert.equal(normalizeGearAP(input),expected);
near(gearValue(10,[3,3.5,4]),3.303);
near(gearValue(10,[20,24,27]),22.669550825338792);
near(gearValue(57,[20,24,27]),27);
const original=JSON.stringify(utilityMarkers);
for(const marker of utilityMarkers){
 const item={key:marker.key,position:[0,0,0],gearAP:0};
 if(marker.shape!=='curling')assert.deepEqual(utilityForPlacement(item),marker);else near(utilityForPlacement(item).radius,marker.radius);
 let previous=0;
 for(let gearAP=0;gearAP<=57;gearAP++){
  const adjusted=utilityForPlacement({...item,gearAP});
  if(adjusted.radius){assert.ok(adjusted.radius>=previous);previous=adjusted.radius}
  for(const field of ['radius','sensorRadius','lethalRadius','travel'])if(adjusted[field]!==undefined)assert.ok(Number.isFinite(adjusted[field]));
 }
}
assert.equal(JSON.stringify(utilityMarkers),original,'canonical definitions stay unchanged');
const atMax=key=>utilityForPlacement({key,gearAP:57});
near(atMax('Trap').sensorRadius,4);near(atMax('Trap').radius,11);
near(atMax('SpSkewer').radius,17.88);near(atMax('SpSkewer').lethalRadius,10.8);near(atMax('SpShockSonar').radius,27);
near(atMax('SpInkStorm').travel,43.75);near(atMax('SpInkStorm').radius,10);
for(const key of ['Beacon','SpGreatBarrier','SpEnergyStand','PoisonMist','Sprinkler','SpTripleTornado','SpNiceBall','SpChimney','PointSensor'])assert.deepEqual(atMax(key),utilityByKey.get(key));
const item={key:'Trap',position:[0,0,0],gearAP:57},faces=utilityTriangles(item,atMax('Trap'));
const radii=new Set(faces.flatMap(f=>f.vertices.map(v=>Math.round(Math.hypot(...v.slice(0,3))))));assert.deepEqual([...radii].sort((a,b)=>a-b),[4,11]);
const cloud={key:'SpInkStorm',position:[0,0,0],angle:Math.PI/2,gearAP:57};near(stormDestination(cloud,utilityForPlacement(cloud))[0],43.75);
const uploads=[],gl=new Proxy({getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,n)=>['position','normal','tint','opacity'].indexOf(n),bufferData:(_,v)=>uploads.push(v.slice())},{get:(o,k)=>k in o?o[k]:()=>({})});
const renderer=createRangeRenderer(gl),view=[.1,0,0,0,0,0,-.1,0,0,-.1,0,0,0,0,0,1],marker={key:'SpShockSonar',position:[0,0,0],gearAP:0};
const draw=()=>{renderer.update([marker],{actors:{}},new Map());renderer.draw(view,[0,1,0]);return uploads.at(-2)};
const before=draw();marker.gearAP=57;const after=draw();assert.notDeepEqual(after,before,'stationary marker AP change invalidates range cache');
for(let i=0;i<before.length;i+=9)assert.deepEqual(after.slice(i+6,i+9),before.slice(i+6,i+9),'AP preserves range colors');
marker.background='#ee3355';assert.deepEqual(draw(),after,'background does not change geometry or range colors');
marker.gearAP=0;assert.deepEqual(draw(),before,'return to 0 restores original geometry');
console.log('PASS: AP bounds and nonlinear curve, all 25 definitions, max radii, cloud route, immutable defaults, stationary cache updates and unchanged range colors.');
