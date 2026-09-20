import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {encodeMarkers,decodeMarkers} from '../stages/marker-share.js';
const items=[{key:'Shooter_Normal_00',position:[1.254,3.002,-10.003],angle:0,background:'#ee3355',gearAP:0},{key:'SpSkewer',position:[0,2,4],angle:1.2,background:null,gearAP:57,start:[0,2,-20]}];
const known=new Set(items.map(i=>i.key));
const raw=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const legacy=rows=>raw([1,rows.map(({key,position,angle=0,background=null,gearAP=0,start})=>[key,position,angle,background,gearAP,...(start?[start]:[])])]);
function near(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((item,i)=>{
 const original=expected[i];for(const field of ['key','background','gearAP'])assert.equal(item[field],original[field]);
 for(const field of ['position','start'])if(original[field])item[field].forEach((n,j)=>assert.ok(Math.abs(n-original[field][j])<=.00500001));
 assert.ok(Math.abs(Math.atan2(Math.sin(item.angle-original.angle),Math.cos(item.angle-original.angle)))<=Math.PI/256+1e-10);
})}
const encoded=await encodeMarkers(items);near(await decodeMarkers(encoded,known),items);
assert.deepEqual(await decodeMarkers(legacy(items),known),items,'old JSON links remain exact');
assert.deepEqual(await decodeMarkers(await encodeMarkers([]),known),[]);
assert.deepEqual(await decodeMarkers(null,known),[]);
for(const invalid of ['%',raw([2,[]]),raw([1,{}]),raw([1,[[null,[0,0,0],0,null,0]]]),raw([1,[['SpSkewer',[0,0],0,null,0]]]),raw([1,[['SpSkewer',[0,0,0],0,'red',0]]]),raw([1,[['SpSkewer',[0,0,0],0,null,58]]]),raw([1,[['SpSkewer',[0,0,0],0,null,0,[0,0,26]]]])])await assert.rejects(()=>decodeMarkers(invalid,known));
const one={key:'SpSkewer',position:[0,0,0],angle:0,background:null,gearAP:0};
const small=Buffer.from(await encodeMarkers([one]),'base64url');assert.equal(small[0],2,'small payload stays uncompressed');
for(let n=1;n<small.length;n++)await assert.rejects(()=>decodeMarkers(small.subarray(0,n).toString('base64url'),known));
await assert.rejects(()=>decodeMarkers(Buffer.concat([small,Buffer.from([0])]).toString('base64url'),known));
await assert.rejects(()=>decodeMarkers(Buffer.concat([Buffer.from([3]),gzipSync(Buffer.alloc(150001))]).toString('base64url'),known));
await assert.rejects(()=>encodeMarkers([{...one,position:[327.68,0,0]}]));
for(const x of [-327.68,327.67])near(await decodeMarkers(await encodeMarkers([{...one,position:[x,0,0]}]),known),[{...one,position:[x,0,0]}]);
for(let i=0;i<256;i++){const angle=i*Math.PI*2/256;near(await decodeMarkers(await encodeMarkers([{...one,angle}]),known),[{...one,angle}])}
const multi=Array.from({length:140},(_,i)=>({...one,key:'Key_'+i}));near(await decodeMarkers(await encodeMarkers(multi),new Set(multi.map(i=>i.key))),multi);
for(const n of [1,4,10,50]){
 const rows=Array.from({length:n},(_,i)=>({...one,position:[i*1.1234567,2.12345678,-i*2.1234567]}));
 const value=await encodeMarkers(rows);near(await decodeMarkers(value,known),rows);
 if(n===50)assert.equal(Buffer.from(value,'base64url')[0],3,'large repeated payload is compressed');
 console.log(`${n} markers: ${legacy(rows).length} → ${value.length} characters (${Math.round(100*(1-value.length/legacy(rows).length))}% shorter)`);
}
const full=await decodeMarkers(encoded,known);assert.equal(await encodeMarkers(full),encoded,'repeated saves are stable');
console.log('PASS: binary and legacy, precision, optional fields, boundaries, dictionary indexes, malformed/truncated/compressed size limits and stable re-encoding.');
// Verify against actual stored terrain, including sloped surfaces and map edges.
const {readFileSync}=await import('node:fs');
const {gunzipSync}=await import('node:zlib');
const {decodeGeometry}=await import('../stages/geometry.js');
const {createRangeOcclusion}=await import('../stages/range-occlusion.js');
const catalogue=JSON.parse(readFileSync(new URL('../stages/minimaps.json',import.meta.url)));
for(const modes of Object.values(catalogue.stages))for(const meta of Object.values(modes))for(const bound of [meta.boundsMin,meta.boundsMax])assert.ok(bound.every(v=>v>=-327.68&&v<=327.67));
let rays=0,different=0,visibilityChanged=0,maxError=0;
for(const stage of ['Vss_Yunohana','Vss_Yagara','Cop_District00']){
 const meta=Object.values(catalogue.stages[stage])[0],raw=gunzipSync(readFileSync(new URL('../stages/'+meta.file,import.meta.url))),mesh=decodeGeometry(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),meta.vertices),blocked=createRangeOcclusion(mesh);
 for(let i=0;i<mesh.length;i+=21*13){
  if(mesh[i+6]!==1||mesh[i+4]<.4)continue;
  const original=[0,1,2].map(a=>(mesh[i+a]+mesh[i+7+a]+mesh[i+14+a])/3),rounded=original.map(v=>Math.round(v*100)/100);
  maxError=Math.max(maxError,...original.map((v,j)=>Math.abs(v-rounded[j])));
  const from=original.map((v,j)=>v+(j===1?1.65:0)),to=rounded.map((v,j)=>v+(j===1?1.65:0));
  for(let angle=0;angle<16;angle++){
   const dir=[Math.cos(angle*Math.PI/8),0,Math.sin(angle*Math.PI/8)];rays++;
   if(blocked(from,dir,20)!==blocked(to,dir,20))different++;
  }
  // Top-down marker visibility stops .03 units before its terrain anchor.
  const visible=p=>blocked([p[0],p[1]+.1,p[2]],[0,-1,0],.07);if(visible(original)!==visible(rounded))visibilityChanged++;
 }
}
assert.ok(maxError<=.00500001);
console.log(`Terrain samples: ${rays} range rays, ${different} boundary classifications changed, ${visibilityChanged} marker visibility changes; max axis error ${maxError.toFixed(6)}. All 167 map bounds fit.`);
