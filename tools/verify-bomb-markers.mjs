import assert from 'node:assert/strict';
import {utilityByKey,utilityForPlacement,utilityTriangles,curlingLimits,fitCurlingStart,routeDistance} from '../stages/utility-markers.js';
import {constrainTerrainDrag} from '../stages/weapons.js';
import {encodeMarkers,decodeMarkers} from '../stages/marker-share.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const [key,radius] of [['Bomb_Splash',7],['Bomb_Suction',8],['Bomb_Robot',6.5],['Bomb_Torpedo',6]])near(utilityByKey.get(key).radius,radius);
near(utilityByKey.get('Bomb_Robot').sensorRadius,12.5);
assert.equal(utilityByKey.get('Bomb_Torpedo').sensorRadius,undefined);
const original=JSON.stringify([...utilityByKey.values()]);
for(const ap of [0,10,57]){
 const {min,max}=curlingLimits(ap);let previous=Infinity;
 for(let i=0;i<=60;i++){
  const distance=max-(max-min)*i/60,item={key:'Bomb_Curling',position:[0,0,0],start:[0,100,distance],gearAP:ap};
  const marker=utilityForPlacement(item);near(marker.chargeFrames,i);near(marker.radius,5+i/20);assert.ok(distance<=previous);previous=distance;
  const saved=await decodeMarkers(await encodeMarkers([item]),new Set([item.key]));near(saved[0].start[1],100);assert.ok(Math.abs(utilityForPlacement(saved[0]).chargeFrames-i)<.011);
 }
}
const item={key:'Bomb_Curling',position:[0,3,0],start:[0,10,5],gearAP:57};
fitCurlingStart(item);near(routeDistance(item.position,item.start,true),6.5);assert.deepEqual(item.position,[0,3,0]);near(item.start[1],10);
item.start=[0,10,44.85];item.gearAP=0;fitCurlingStart(item);near(routeDistance(item.position,item.start,true),34.5);
assert.equal(JSON.stringify([...utilityByKey.values()]),original,'definitions are immutable');
const options={current:[0,2,20],anchor:[0,0,0],minDistance:5,maxDistance:34.5,horizontal:true,project:p=>[p[0],p[2]],pick:(x,z)=>[x,100,z]};
const capped=constrainTerrainDrag([50,100,50],options);assert.ok(routeDistance(capped,options.anchor,true)<=34.5);assert.ok(routeDistance(capped,options.anchor,true)>34.49);
const short=constrainTerrainDrag([0,100,2],options);near(routeDistance(short,options.anchor,true),5);near(short[1],100);
assert.deepEqual(constrainTerrainDrag([0,100,0],options),options.current);
assert.deepEqual(constrainTerrainDrag([0,100,2],{...options,pick:()=>null}),options.current);
const fizzy=utilityByKey.get('Bomb_Fizzy'),a=utilityTriangles({position:[0,0,0],angle:0},fizzy),b=utilityTriangles({position:[0,0,0],angle:Math.PI/2},fizzy);
assert.notDeepEqual(a,b);const spheres=a.filter(f=>f.alpha===.5),per=spheres.length/3;
for(let i=0;i<3;i++)for(const face of spheres.slice(i*per,(i+1)*per))for(const v of face.vertices)near(Math.hypot(v[0],v[1],v[2]-i*1.5),fizzy.blastRadii[i]);
const shield=utilityByKey.get('Shield');near(shield.width,4.5);near(shield.height,4);
assert.notDeepEqual(utilityTriangles({position:[0,0,0],angle:0},shield),utilityTriangles({position:[0,0,0],angle:1},shield));
const all=['Bomb_Splash','Bomb_Suction','Bomb_Curling','Bomb_Fizzy','Bomb_Robot','Bomb_Torpedo','Shield'].map(key=>({key,position:[0,1,0],angle:0,gearAP:0,background:null,...(key==='Bomb_Curling'?{start:[0,3,20]}:{})}));
const known=new Set(all.map(i=>i.key));assert.deepEqual(await decodeMarkers(await encodeMarkers(all),known),all);
for(const start of [[0,1,4.9],[0,1,34.6],[0,1,Infinity]])await assert.rejects(()=>encodeMarkers([{...all[2],start}]));
await assert.rejects(()=>encodeMarkers([{...all[0],start:[0,1,20]}]));
console.log('PASS: 7 new markers, curling boundaries/60 charge steps/AP/horizontal distance, terrain clamps, source immutability, 3 fizzy sphere centers and radii, shield rotation and share round trips/rejections.');
