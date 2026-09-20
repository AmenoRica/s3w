// CPU benchmark: real terrain + 16 dual-range markers; excludes GPU time.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {decodeGeometry} from '../stages/geometry.js';
import {createRangeOcclusion} from '../stages/range-occlusion.js';
globalThis.window??={};
await import('../data.js');
const moduleURL=process.argv[2]?pathToFileURL(process.argv[2]):new URL('../stages/range-renderer.js',import.meta.url);
const {createRangeRenderer}=await import(moduleURL);
const manifest=JSON.parse(readFileSync(new URL('../stages/minimaps.json',import.meta.url)));
const entry=manifest.stages[process.env.STAGE||'Vss_Yunohana'][process.env.MODE||'Vlf'],bytes=gunzipSync(readFileSync(new URL('../stages/'+entry.file,import.meta.url)));
const terrain=decodeGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),entry.vertices);
const blocked=createRangeOcclusion(terrain),ranges=JSON.parse(readFileSync(new URL('../stages/weapon-ranges.json',import.meta.url)));
const weapons=new Map(globalThis.WEAPON_DATA?.weapons?.map(w=>[w.key,w])||window.WEAPON_DATA.weapons.map(w=>[w.key,w]));
const gl=new Proxy({getExtension:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0},{get:(o,k)=>k in o?o[k]:()=>{}});
const renderer=createRangeRenderer(gl),items=[];
for(let i=0;i<terrain.length&&items.length<16;i+=21){if(terrain[i+6]===1&&terrain[i+4]>.5&&i%7===0)items.push({key:'Roller_Normal_00',position:[terrain[i],terrain[i+1],terrain[i+2]]})}
const view=new Float32Array([.01,0,0,0,0,.01,0,0,0,0,-.01,0,0,0,0,1]);
function camera(i){const a=i*.013;view[2]=-Math.sin(a)*.01;view[6]=-Math.cos(a)*.01;return [Math.sin(a),Math.cos(a),0]}
const summary=values=>{values.sort((a,b)=>a-b);return {medianMs:+values[values.length>>1].toFixed(2),p95Ms:+values[Math.floor(values.length*.95)].toFixed(2)}};
let start=performance.now();renderer.update(items,ranges,weapons,blocked);renderer.draw(view,camera(0));const initial=performance.now()-start;
const result={markers:items.length,rangesPerMarker:2,initialMs:+initial.toFixed(2)};
for(const mode of ['rotate','pan','drag']){const times=[];for(let i=0;i<65;i++){start=performance.now();if(mode==='drag'){items[0].position[0]+=.02;renderer.update(items,ranges,weapons,blocked)}if(mode==='pan')view[12]+=.0001;renderer.draw(view,camera(mode==='rotate'?i:0));if(i>=5)times.push(performance.now()-start)}result[mode]=summary(times)}
console.log(JSON.stringify(result,null,2));
