import assert from 'node:assert/strict';
import {createRangeRenderer} from '../stages/range-renderer.js';
function context(indexed){
 let id=0;const bound=new Map(),buffers=new Map(),uploads=[],draws=[];
 const gl=new Proxy({ARRAY_BUFFER:'vertices',ELEMENT_ARRAY_BUFFER:'indices',getExtension:()=>indexed?{}:null,createBuffer:()=>++id,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,name)=>['position','normal','tint','opacity'].indexOf(name),bindBuffer:(target,buffer)=>bound.set(target,buffer),bufferData:(target,data)=>{buffers.set(bound.get(target),data.slice());uploads.push({target,bytes:data.byteLength})},drawArrays:(_,start,count)=>draws.push({start,count}),drawElements:(_,count,__,offset)=>draws.push({start:offset/4,count})},{get:(o,k)=>k in o?o[k]:()=>{}});
 return {gl,uploads,draws,vertices:()=>buffers.get(1),indices:()=>buffers.get(2),alpha:()=>buffers.get(indexed?3:2)};
}
const items=Array.from({length:16},(_,i)=>({key:'roller',position:[(i-8)*2,Math.sin(i),i%3*5]}));
items[15]={key:'SpSkewer',position:[0,0,0],start:[0,0,-10]};
const ranges={worldUnitsPerLine:5,actors:{roller:[{lines:2.4},{lines:3.2}]}},weapons=new Map([['roller',{actor:'roller'}]]);
const view=[.01,0,0,0,0,.01,0,0,0,0,-.01,0,0,0,0,1];
const a=context(true),b=context(false),ra=createRangeRenderer(a.gl),rb=createRangeRenderer(b.gl);
let queries=0;const blocked=()=>{queries++;return false};
for(const renderer of [ra,rb])renderer.update(items,ranges,weapons,blocked);
for(const back of [[0,0,1],[.3,.4,-.5],[-.7,-.3,.2]]){
 ra.draw(view,back);rb.draw(view,back);
 const vertices=a.vertices(),indices=a.indices(),fallback=b.vertices();
 assert.equal(fallback.length,indices.length*9);
 for(let i=0;i<indices.length;i++)for(let j=0;j<9;j++)assert.equal(vertices[indices[i]*9+j],fallback[i*9+j]);
 const count=a.draws.at(-2).count;let last=-Infinity;
 for(let i=0;i<count;i+=3){let depth=0;for(let v=0;v<3;v++)for(let axis=0;axis<3;axis++)depth+=vertices[indices[i+v]*9+axis]*back[axis]/3;assert.ok(depth>=last-1e-5,'back-to-front ordering');last=depth}
 assert.ok(a.draws.at(-1).count>0,'reef overlay is drawn after depth-tested ranges');
}
const before=a.uploads.length,oldQueries=queries;
view[12]=.5;ra.draw(view,[-.7,-.3,.2]);assert.equal(a.uploads.length,before,'pan reuses GPU geometry and order');
ra.update(items,ranges,weapons,blocked);ra.draw(view,[-.7,-.3,.2]);assert.equal(queries,oldQueries);assert.equal(a.uploads.length,before,'unchanged items reuse buffers');
ra.draw(view,[0,1,0]);assert.deepEqual(a.uploads.slice(before).map(x=>x.target),['indices'],'rotation uploads only indices');
items[0].position[0]++;ra.update(items,ranges,weapons,blocked);ra.draw(view,[0,1,0]);assert.ok(queries>oldQueries);
const drawCount=a.draws.length;ra.update([],ranges,weapons,blocked);ra.draw(view,[0,1,0]);assert.equal(a.draws.length,drawCount);
console.log('PASS: 16-marker indexed/fallback parity, GPU-precision depth order, reef overlays, pan reuse, index-only rotation, shading invalidation and clearing.');
