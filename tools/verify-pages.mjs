import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname,extname} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {decodeGeometry} from '../stages/geometry.js';
const root=resolve(process.argv[2]||'_site'),read=name=>readFileSync(resolve(root,name),'utf8');
for(const name of ['.git','tools','outputs','planner-demo','map-demo','.github','README.md'])assert.ok(!existsSync(resolve(root,name)),`development file published: ${name}`);
const files=[];function walk(dir){for(const name of readdirSync(dir)){const p=resolve(dir,name);if(statSync(p).isDirectory())walk(p);else files.push(p)}}walk(root);
const versions=new Set();
for(const file of files){
 if(!['.html','.js','.css'].includes(extname(file)))continue;
 const content=readFileSync(file,'utf8');
 for(const match of content.matchAll(/["']((?:\.?\.?\/)?[A-Za-z0-9_./-]+\.(?:js|css|json))(?:\?v=([A-Za-z0-9_-]+))?["']/g)){
  const target=resolve(dirname(file),match[1]);assert.ok(existsSync(target),`${file}: missing ${match[1]}`);
  assert.ok(match[2],`${file}: unversioned ${match[1]}`);versions.add(match[2]);
 }
}
assert.equal(versions.size,1,'one release identifier across the module graph');
const data=JSON.parse(read('stages/data.json')),mini=JSON.parse(read('stages/minimaps.json')),seen=new Set();let combinations=0;
assert.equal(data.stages.length,39);
for(const stage of data.stages){
 assert.ok(existsSync(resolve(root,'stages',stage.image)));
 const modes=stage.kind==='versus'?['Pnt','Var','Vlf','Vgl','Vcl']:['Low','Mid','High'];
 assert.deepEqual(Object.keys(mini.stages[stage.key]).sort(),modes.sort());combinations+=modes.length;
 for(const info of [...Object.values(stage.layers),...Object.values(mini.stages[stage.key])]){
  if(!info||seen.has(info.file))continue;seen.add(info.file);
  const bytes=readFileSync(resolve(root,'stages',info.file));assert.equal(bytes.length,info.bytes);
  const raw=gunzipSync(bytes),mesh=decodeGeometry(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),info.vertices);
  assert.ok(mesh.every(Number.isFinite),info.file);
 }
}
assert.equal(combinations,167);
globalThis.window={};await import(pathToFileURL(resolve(root,'data.js')));
for(const w of window.WEAPON_DATA.weapons)assert.ok(existsSync(resolve(root,`assets/Path_Wst_${w.key}.png`)),w.key);
console.log(`PASS: ${files.length} publishable files, 39 stages / 167 combinations, ${seen.size} terrain files, versioned module graph, no development directories.`);
