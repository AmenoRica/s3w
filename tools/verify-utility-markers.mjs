import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {flatRangeLift,utilityMarkers,utilityByKey,utilityIcon,utilityTriangles,directionAngle,directionPoint,createDirectionDrag} from '../stages/utility-markers.js';
import {createRangeRenderer} from '../stages/range-renderer.js';
assert.equal(utilityMarkers.length,25);assert.equal(utilityByKey.size,25);
const item={position:[2,3,4],angle:0};
for(const marker of utilityMarkers){
 assert.ok(existsSync(new URL(utilityIcon(marker),new URL('../stages/utility-markers.js',import.meta.url))));
 const faces=utilityTriangles(item,marker);for(const f of faces)for(const v of f.vertices)assert.ok(v.every(Number.isFinite));
 if(marker.shape==='none')assert.equal(faces.length,0);
 if(marker.shape==='circle'||marker.shape==='plane')assert.equal(Math.min(...faces.flatMap(f=>f.vertices.map(v=>v[1]))),item.position[1]+flatRangeLift);
 if(marker.shape==='sphere'&&!marker.sensorRadius)for(const f of faces)for(const v of f.vertices)assert.ok(Math.abs(Math.hypot(...v.slice(0,3).map((n,i)=>n-item.position[i]))-marker.radius)<1e-7);
 if(marker.shape==='cylinder'){
  const vertices=faces.flatMap(f=>f.vertices);assert.equal(Math.min(...vertices.map(v=>v[1])),3);assert.equal(Math.max(...vertices.map(v=>v[1])),23);
  for(const v of vertices)assert.ok(Math.hypot(v[0]-2,v[2]-4)<=7.700001);
 }
}
const trap=utilityTriangles(item,utilityByKey.get('Trap'));assert.deepEqual([...new Set(trap.flatMap(f=>f.vertices.map(v=>Math.round(Math.hypot(...v.slice(0,3).map((n,i)=>n-item.position[i]))))))].sort(),[3,8]);
const top=[.1,0,0,0,0,0,-.1,0,0,-.1,0,0,0,0,0,1];
assert.ok(Math.abs(directionAngle([0,0,0],top,100,50,100,100)-Math.PI/2)<1e-9);
assert.ok(Math.abs(directionAngle([0,0,0],top,50,100,100,100))<1e-9);
assert.equal(directionAngle([0,0,0],new Array(16).fill(0),10,10,100,100),null);
assert.equal(directionAngle([0,0,0],top,50,50,100,100),null);
const node={focus(){},setPointerCapture(id){this.id=id},hasPointerCapture(id){return this.id===id},releasePointerCapture(){this.id=null}},p={angle:.5,position:[0,0,0]};let updates=0;
const drag=createDirectionDrag({angleAt:(_,e)=>e.angle??null,changed(){updates++}});drag.bind(node,p);
const e=(angle,extra={})=>({button:0,pointerId:1,preventDefault(){},stopPropagation(){},angle,...extra});
node.onpointerdown(e());node.onpointermove(e(1));assert.equal(p.angle,1);node.onpointercancel(e());assert.equal(p.angle,.5);
node.onpointerdown(e());node.onpointerup(e(2));assert.equal(p.angle,2);assert.equal(drag.active(),false);
node.onpointerdown(e());node.onpointermove(e(3));drag.cancel();assert.equal(p.angle,2);
node.onpointerdown(e());node.onpointermove(e(3,{pointerId:2}));assert.equal(p.angle,2);node.onlostpointercapture(e());
node.onkeydown(e(null,{key:'ArrowRight'}));assert.ok(Math.abs(p.angle-2-Math.PI/12)<1e-9);
let uploaded;
const gl=new Proxy({getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,n)=>['position','normal','tint'].indexOf(n),bufferData:(_,data)=>uploaded=data},{get:(o,k)=>k in o?o[k]:()=>({})});
const renderer=createRangeRenderer(gl),screen={key:'SpChimney',position:[0,0,0],angle:0};
const ranges={actors:{}},weapons=new Map();const blocked=()=>{throw Error('Utility areas must not use gun sight occlusion')};
renderer.update([screen],ranges,weapons,blocked);renderer.draw(top,[0,1,0]);const before=uploaded.slice();
screen.angle=Math.PI/2;renderer.update([screen],ranges,weapons,blocked);renderer.draw(top,[0,1,0]);assert.notDeepEqual(uploaded,before);
assert.ok(Math.abs(directionPoint(screen,utilityByKey.get(screen.key))[2])<1e-9);
renderer.update(utilityMarkers.map(m=>({key:m.key,...item})),ranges,weapons,blocked);renderer.draw(top,[0,1,0]);assert.ok(uploaded.length>0);
console.log('PASS: 25 icons, sphere/cylinder dimensions, trap detection/blast radii, plane picking, direction commit/cancel/keyboard, rotation cache and all utility shapes without gun occlusion.');
