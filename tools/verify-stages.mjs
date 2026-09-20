import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeGeometry} from '../stages/geometry.js';
const root=new URL('../stages/',import.meta.url),data=JSON.parse(readFileSync(new URL('data.json',root)));
assert.equal(data.stages.length,39);assert.equal(new Set(data.stages.map(s=>s.key)).size,39);
assert.deepEqual(data.stages.reduce((a,s)=>(a[s.kind]++,a),{versus:0,coop:0,bigrun:0}),{versus:25,coop:7,bigrun:7});
const checked=new Set();let total=0,combinations=0,sizes=[];
for(const stage of data.stages){
 assert(Number.isFinite(stage.ceilingHeight));
 assert(stage.names.KRko&&!stage.names.KRko.startsWith('Vss_'));assert.equal(Object.keys(stage.names).length,14);
 assert(statSync(new URL(stage.image,root)).size>1000);
 const modes=stage.kind==='versus'?['Pnt','Var','Vlf','Vgl','Vcl']:['Low','Mid','High'];
 assert.deepEqual(Object.keys(stage.layers).sort(),['Cmn',...modes].sort());assert(stage.layers.Cmn);
 for(const mode of modes){combinations++;sizes.push(stage.layers.Cmn.bytes+(stage.layers[mode]?.bytes||0));if(stage.kind!=='versus')assert(Number.isFinite(stage.water[mode]));}
 for(const info of Object.values(stage.layers)){
  if(!info||checked.has(info.file))continue;checked.add(info.file);
  const zipped=readFileSync(new URL(info.file,root));assert.equal(zipped.length,info.bytes);total+=zipped.length;
  const raw=gunzipSync(zipped);const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);const vertices=decodeGeometry(buffer,info.vertices);
  assert.equal(vertices.length,info.vertices*7);assert(vertices.every(Number.isFinite));
  for(let i=0;i<vertices.length;i+=7){if(vertices[i+6]===1)assert(stage.ceilingHeight>=vertices[i+1]+2.999);const n=Math.hypot(vertices[i+3],vertices[i+4],vertices[i+5]);assert(n>.98&&n<1.02);}
 }
}
assert.throws(()=>decodeGeometry(new ArrayBuffer(0),0));assert.throws(()=>decodeGeometry(new ArrayBuffer(12),0));
sizes.sort((a,b)=>a-b);console.log(JSON.stringify({stages:data.stages.length,combinations,geometryFiles:checked.size,totalMB:total/1e6,minMapMB:sizes[0]/1e6,medianMapMB:sizes[Math.floor(sizes.length/2)]/1e6,maxMapMB:sizes.at(-1)/1e6},null,2));
