import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeGeometry} from '../stages/geometry.js';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const data=JSON.parse(read('stages/data.json')),manifest=JSON.parse(read('stages/minimaps.json')),source=JSON.parse(read('outputs/all-minimaps/manifest.json'));
source.stages.push(...JSON.parse(read('outputs/salmon-minimaps/manifest.json')).stages);
assert.deepEqual(Object.keys(manifest.stages).sort(),data.stages.map(s=>s.key).sort());
let combinations=0,rails=0,vertices=0;
for(const stage of source.stages){
 const salmon=stage.key.startsWith('Cop_'),folder=salmon?'salmon-minimaps':'all-minimaps';
 assert.deepEqual(Object.keys(manifest.stages[stage.key]).sort(),(salmon?['Low','Mid','High']:['Pnt','Var','Vlf','Vgl','Vcl']).sort());
 if(salmon) for(const mode of ['Low','Mid','High']) assert(Number.isFinite(data.stages.find(s=>s.key===stage.key).water[mode]));
 for(const [mode,entry] of Object.entries(stage.modes)){
  const info=manifest.stages[stage.key][mode],zipped=read('stages/'+info.file);assert.equal(zipped.length,info.bytes);
  const raw=gunzipSync(zipped),decoded=decodeGeometry(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),info.vertices);
  let cursor=0;
  for(const part of ['collision','rails','details']){
   if(!entry.files.includes(part+'.bin.gz'))continue;
   const merged=`outputs/simplified-minimaps/data/${stage.key}/${mode}.bin.gz`;
   const bytes=gunzipSync(read(part==='collision'&&existsSync(new URL(merged,root))?merged:`outputs/${folder}/data/${stage.key}/${mode}/${part}.bin.gz`));
   const reference=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
   for(let i=0;i<reference.length;i++){
    const field=i%7,value=decoded[cursor+i];assert(Number.isFinite(value));
    assert(Math.abs(value-reference[i])<=(field<3?.00051:field<6?.004:0),`${stage.key}/${mode}/${part}: changed field ${i}`);
   }
   cursor+=reference.length;
  }
  assert.equal(cursor,decoded.length);assert.equal(info.railCount,entry.railCount);rails+=info.railCount;vertices+=info.vertices;combinations++;
 }
}
assert.equal(combinations,167);
console.log(JSON.stringify({combinations,rails,vertices,verified:'Packaged meshes match the selected merged terrain source and unchanged rail/sponge sources within STG1 precision.'}));
