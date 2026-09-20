import assert from 'node:assert/strict';
import {utilityByKey,utilityTriangles,markerPosition,stormDestination,reefStart,directionPoint} from '../stages/utility-markers.js';
import {createRangeRenderer} from '../stages/range-renderer.js';
import {createWeaponDrag,constrainTerrainDrag} from '../stages/weapons.js';
const storm=utilityByKey.get('SpInkStorm'),cloud={key:storm.key,position:[2,3,4],angle:0};
assert.deepEqual(markerPosition(cloud,storm),[2,23,4]);
assert.deepEqual(stormDestination(cloud,storm),[2,3.35,39]);
cloud.angle=Math.PI/2;const end=stormDestination(cloud,storm);assert.ok(Math.abs(end[0]-37)<1e-9&&Math.abs(end[2]-4)<1e-9);
const faces=utilityTriangles(cloud,storm),cylinder=faces.filter(f=>f.alpha===1&&f.vertices.some(v=>v[1]===23)&&f.vertices.some(v=>v[1]===3.35)),destination=faces.filter(f=>f.alpha===.22);
assert.equal(cylinder.length,192);assert.equal(destination.length,288);
assert.equal(Math.max(...destination.flatMap(f=>f.vertices.map(v=>v[1]))),23);
for(const f of cylinder)for(const v of f.vertices){assert.ok(Math.abs(Math.hypot(v[0]-2,v[2]-4)-10)<1e-8);assert.ok(v[1]>=3.35&&v[1]<=23)}
for(const f of destination)for(const v of f.vertices){assert.ok(v[1]>=3.35&&v[1]<=23);assert.ok(Math.hypot(v[0]-end[0],v[2]-end[2])<=10.000001)}
assert.ok(directionPoint(cloud,storm)[1]>23);
const reef=utilityByKey.get('SpSkewer'),shark={key:reef.key,position:[0,2,0],angle:0,start:[10,5,-20]};
assert.deepEqual(reefStart(shark,reef),[10,5,-20]);
assert.deepEqual(directionPoint(shark,reef),[10,5.35,-20]);
assert.deepEqual(markerPosition(shark,reef),[0,2,0]);
const geometry=utilityTriangles(shark,reef);
for(const [opacity,radius] of [[.16,14.9],[.85,9]])for(const f of geometry.filter(f=>f.alpha===opacity))for(const v of f.vertices)assert.ok(Math.abs(Math.hypot(v[0],v[1]-2,v[2])-radius)<1e-7);
const rails=geometry.filter(f=>f.alpha===1.5);assert.equal(rails.length,4);
assert.ok(geometry.filter(f=>f.alpha===1.5||f.alpha===1.3).every(f=>f.overlay===true),'every rail and cross-tie triangle must stay visible through terrain');
assert.ok(rails.some(f=>f.vertices.some(v=>Math.abs(v[1]-5.35)<1e-9)));
const uploaded=[];
const gl=new Proxy({getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,n)=>['position','normal','tint','opacity'].indexOf(n),bufferData:(_,v)=>uploaded.push(v.slice())},{get:(o,k)=>k in o?o[k]:()=>({})});
const renderer=createRangeRenderer(gl),view=[.1,0,0,0,0,0,-.1,0,0,-.1,0,0,0,0,0,1];
renderer.update([shark,cloud],{actors:{}},new Map());renderer.draw(view,[0,1,0]);
const before=uploaded[0];assert.equal(uploaded[0].length/9,uploaded[1].length);assert.ok(uploaded[1].some(a=>a<.25));
shark.start=[-10,5,-20];renderer.update([shark,cloud],{actors:{}},new Map());renderer.draw(view,[0,1,0]);assert.notDeepEqual(uploaded[2],before,'start movement invalidates cached rails');assert.deepEqual(shark.position,[0,2,0]);
const node={classList:{add(){},remove(){}},focus(){},getBoundingClientRect:()=>({left:90,top:90,width:20,height:20}),setPointerCapture(id){this.id=id},hasPointerCapture(id){return this.id===id},releasePointerCapture(){this.id=null}};
const canvas={getBoundingClientRect:()=>({left:0,top:0})},handle={get position(){return shark.start},set position(v){shark.start=v}},drag=createWeaponDrag({canvas,pick:(x,y)=>x>=0?[x,1,y]:null,changed(){}});
drag.bind(node,handle);const event=(x,y)=>({pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){}}),origin=shark.start.slice();
node.onpointerdown(event(100,100));node.onpointermove(event(130,140));assert.deepEqual(shark.start,[130,1,140]);drag.cancel();assert.deepEqual(shark.start,origin);assert.deepEqual(shark.position,[0,2,0]);
node.onpointerdown(event(100,100));node.onpointerup(event(130,140));assert.deepEqual(shark.start,[130,1,140]);
const elevated={position:[0,0,0],dragOffset:[0,-40]};drag.bind(node,elevated);node.onpointerdown(event(100,100));node.onpointerup(event(120,110));assert.deepEqual(elevated.position,[120,1,150],'raised icon dragging accounts for projected height');
console.log('PASS: raised cloud, faint cylinder, rotated maximum-travel circle, two blast radii, sloped straight rails, alpha uploads, start-cache invalidation, endpoint preservation and canceled/raised drags.');

// A large pointer jump must stop at the terrain boundary, not overshoot or snap back.
const flatPick=(x,z)=>[x,0,z],project=p=>[p[0],p[2]],anchor=[0,0,0];
const limit=(current,point,pick=flatPick)=>constrainTerrainDrag(point,{current,anchor,maxDistance:25,project,pick});
assert.deepEqual(limit([0,0,0],[3,0,4]),[3,0,4]);
assert.deepEqual(limit([0,0,0],[15,0,20]),[15,0,20]);
const stopped=limit([0,0,0],[60,0,80]);assert.ok(Math.hypot(...stopped)<=25&&Math.hypot(...stopped)>24.99);
const uphill=limit([0,0,0],[60,30,80],(x,z)=>[x,x/2,z]);assert.ok(Math.hypot(...uphill)<=25&&Math.hypot(...uphill)>24.99);assert.equal(uphill[1],uphill[0]/2);
const beforeGap=limit([0,0,0],[100,0,0],(x,z)=>x>23&&x<30?null:[x,0,z]);assert.ok(beforeGap[0]<=23&&beforeGap[0]>22.99);
const bounded={position:[0,0,0]},fixed=[0,0,0];
const boundedDrag=createWeaponDrag({canvas,pick:flatPick,changed(){},constrain:(item,point)=>constrainTerrainDrag(point,{current:item.position,anchor:fixed,maxDistance:25,project,pick:flatPick})});
boundedDrag.bind(node,bounded);node.onpointerdown(event(100,100));node.onpointerup(event(160,180));assert.ok(Math.hypot(...bounded.position)<=25&&Math.hypot(...bounded.position)>24.98);assert.deepEqual(fixed,[0,0,0]);
const committed=bounded.position.slice();node.onpointerdown(event(100,100));node.onpointermove(event(5,5));boundedDrag.cancel();assert.deepEqual(bounded.position,committed);
node.onpointerdown(event(100,100));node.onpointerup(event(5,5));assert.deepEqual(bounded.position,[5,0,5]);
const paired={position:[0,0,0],start:[0,0,-25]};
const endpointDrag=createWeaponDrag({canvas,pick:flatPick,changed(){},constrain:(item,point)=>constrainTerrainDrag(point,{current:item.position,anchor:paired.start,maxDistance:25,project,pick:flatPick})});
endpointDrag.bind(node,paired);node.onpointerdown(event(100,100));node.onpointerup(event(60,80));assert.ok(Math.hypot(...paired.position.map((v,i)=>v-paired.start[i]))<=25);assert.deepEqual(paired.start,[0,0,-25]);
console.log('PASS: max-distance stop, height-aware terrain boundary, gaps, large jumps, release/rollback, inward movement and fixed opposite endpoint.');

// At full extension, changing pointer direction must rotate around the fixed endpoint.
let radial=[25,0,0];
for(const target of [[0,0,100],[-100,0,0],[60,0,-80],[60,0,80]]){
 radial=limit(radial,target);
 const distance=Math.hypot(...radial),targetDistance=Math.hypot(...target);
 assert.ok(distance<=25&&distance>24.99);
 for(let i=0;i<3;i++)assert.ok(Math.abs(radial[i]/distance-target[i]/targetDistance)<1e-8);
}
assert.deepEqual(anchor,[0,0,0]);
console.log('PASS: fully extended rail rotates toward the pointer in every quadrant without extending or moving its anchor.');
