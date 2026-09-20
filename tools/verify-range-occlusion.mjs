import assert from 'node:assert/strict';
import {createRangeOcclusion} from '../stages/range-occlusion.js';
import {createRangeRenderer} from '../stages/range-renderer.js';
const triangle=(points,normal=[0,1,0],category=1)=>points.flatMap(p=>[...p,...normal,category]);
const wall=(x,category=1)=>triangle([[x,-20,-20],[x,20,-20],[x,0,20]],[-1,0,0],category);
const floor=triangle([[-20,0,-20],[20,0,-20],[0,0,20]]);
const make=(...faces)=>createRangeOcclusion(new Float32Array(faces.flat()));
assert.equal(make()([0,0,0],[1,0,0],10),false);
for(const category of [0,1]){
 const blocked=make(wall(5,category));
 assert.equal(blocked([0,0,0],[1,0,0],4),false);
 assert.equal(blocked([0,0,0],[1,0,0],6),true);
 assert.equal(blocked([0,0,0],[-1,0,0],10),false);
 assert.equal(blocked([10,0,0],[-1,0,0],10),true);
 assert.equal(blocked([0,30,0],[1,0,0],10),false);
}
for(const category of [2,3])assert.equal(make(wall(5,category))([0,0,0],[1,0,0],10),false);
const ground=make(floor);
for(const y of [0,1e-6,-1e-6]){
 assert.equal(ground([0,y,0],[0,1,0],10),false,'outgoing surface contact');
 assert.equal(ground([0,y,0],[0,-1,0],10),true,'entering surface contact');
 assert.equal(ground([0,y,0],[1,0,0],10),false,'tangent contact');
}
const slope=make(triangle([[-20,-20,-20],[20,20,-20],[0,0,20]],[-Math.SQRT1_2,Math.SQRT1_2,0]));
assert.equal(slope([0,0,0],[0,1,0],10),false);
assert.equal(slope([0,0,0],[1,0,0],10),true);
// Exercise internal BVH nodes, not just leaf intersections.
const many=make(...Array.from({length:40},(_,i)=>wall(5+i*2)));
assert.equal(many([0,0,0],[1,0,0],4),false);
assert.equal(many([0,0,0],[1,0,0],100),true);
assert.equal(many([0,30,0],[1,0,0],100),false);
let uploaded,calls=0;
const gl=new Proxy({getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,n)=>['position','normal','tint'].indexOf(n),bufferData:(_,data)=>uploaded=data},{get:(o,k)=>k in o?o[k]:()=>({})});
const renderer=createRangeRenderer(gl),ranges={worldUnitsPerLine:5,actors:{roller:[{lines:2.4},{lines:3.2}]}},weapons=new Map([['roller',{actor:'roller'}]]),item={key:'roller',position:[0,0,0]};
const block=make(wall(14)),counted=(...args)=>{calls++;return block(...args)};
const view=[.1,0,0,0,0,0,-.1,0,0,.1,0,0,0,0,0,1];
renderer.update([item],ranges,weapons,counted);renderer.draw(view,[0,1,0]);
let shortGray=0,longGray=0,longColor=0;
for(let i=0;i<uploaded.length;i+=9){
 const r=Math.round(Math.hypot(...uploaded.subarray(i,i+3))),gray=Math.abs(uploaded[i+6]-.55)<1e-6;
 if(r===12&&gray)shortGray++;if(r===16&&gray)longGray++;if(r===16&&!gray)longColor++;
}
assert.equal(shortGray,0);assert.ok(longGray>0&&longColor>0,'only the longer sphere reaches the wall');
const before=calls;renderer.update([item],ranges,weapons,counted);assert.equal(calls,before,'stationary placements reuse shading');
item.position=[30,0,0];renderer.update([item],ranges,weapons,counted);assert.ok(calls>before,'drag recomputes shading');
renderer.update([item],ranges,weapons,()=>false);renderer.draw(view,[0,1,0]);
for(let i=6;i<uploaded.length;i+=9)assert.ok(Math.abs(uploaded[i]-.55)>1e-6,'new terrain invalidates cached shadows');
console.log('PASS: solid walls, finite rays, both sides, floor contact, slope, grate/rail pass-through, BVH traversal, dual radii, drag and terrain cache invalidation.');
// Air above low cover is visible, but its vertical ground projection is hidden.
const lowWall=triangle([[3,-1,-10],[3,3,-10],[3,-1,10]],[-1,0,0]);
const cover=make(floor,lowWall),origin=[0,0,0],air=[8,8,0],airDistance=Math.hypot(...air);
assert.equal(cover(origin,air.map(v=>v/airDistance),airDistance),false);
assert.equal(cover.groundBlocked(origin,air),true);
assert.equal(cover.groundBlocked(origin,[-8,8,0]),false,'open ground');
assert.equal(cover.groundBlocked(origin,[50,8,0]),false,'no ground');
assert.equal(cover.groundBlocked(origin,[8,-2,0]),false,'do not project upward');
assert.equal(ground.groundBlocked(origin,[0,8,0]),false,'projection at the weapon');
const upper=triangle([[6,4,-4],[10,4,-4],[8,4,4]]);
assert.equal(make(floor,lowWall,upper).groundBlocked(origin,air),false,'nearest floor below air, not floor underneath it');
for(const category of [2,3]){
 const pass=lowWall.slice();for(let i=6;i<pass.length;i+=7)pass[i]=category;
 assert.equal(make(floor,pass).groundBlocked(origin,air),false,'grates and rails do not hide ground');
}
item.position=[0,0,0];renderer.update([item],ranges,weapons,cover);renderer.draw(view,[0,1,0]);
let orange=0,gray=0,normal=0;
for(let i=0;i<uploaded.length;i+=9){
 const point=Array.from(uploaded.subarray(i,i+3)),sight=[0,1.65,0],delta=point.map((v,j)=>v-sight[j]),radius=Math.hypot(...delta),direction=delta.map(v=>v/radius);
 const isOrange=Math.abs(uploaded[i+6]-1)<1e-6,isGray=Math.abs(uploaded[i+6]-.55)<1e-6;
 if(isOrange){orange++;assert.equal(cover(sight,direction,radius),false);assert.equal(cover.groundBlocked(sight,point),true)}
 else if(isGray)gray++;else normal++;
}
assert.ok(orange&&gray&&normal,'renderer distinguishes indirect, blocked and direct regions');
console.log('PASS: projected ground occlusion, open ground, voids, stacked floors, pass-through materials and three rendered colors.');
// A raised origin can shoot down past a ledge; a real wall still blocks it.
const ledge=triangle([[-10,4,-10],[1,4,-10],[1,4,10]]);
const downhill=make(floor,ledge),foot=[0,4,0],sight=[0,5.65,0],target=[8,0,0];
const segment=(scene,start,end)=>{const d=end.map((v,i)=>v-start[i]),length=Math.hypot(...d);return scene(start,d.map(v=>v/length),length)};
assert.equal(segment(downhill,foot,target),true);
assert.equal(segment(downhill,sight,target),false);
assert.equal(downhill.groundBlocked(sight,[8,8,0]),false);
assert.equal(segment(make(floor,ledge,wall(5)),sight,target),true);
// Verify both renderer queries use the raised origin, without moving the sphere.
let rayQueries=0,groundQueries=0;
const checkOrigin=(p)=>assert.deepEqual(p,[0,5.65,0]);
const query=(p)=>{checkOrigin(p);rayQueries++;return false};
query.groundBlocked=(p)=>{checkOrigin(p);groundQueries++;return false};
item.position=foot;renderer.update([item],ranges,weapons,query);renderer.draw(view,[0,1,0]);
assert.ok(rayQueries&&groundQueries);
for(let i=0;i<uploaded.length;i+=9){const r=Math.hypot(uploaded[i],uploaded[i+1]-4,uploaded[i+2]);assert.ok(Math.abs(r-12)<1e-5||Math.abs(r-16)<1e-5)}
console.log('PASS: raised sight origin, clear downhill shot, wall blocking, both color queries and unchanged sphere center/radii.');
