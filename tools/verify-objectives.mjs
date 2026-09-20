import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPoint,createObjectives,dashPath} from '../stages/objectives.js';
const root=new URL('../stages/',import.meta.url),data=JSON.parse(readFileSync(new URL('objectives.json',root))),stages=JSON.parse(readFileSync(new URL('data.json',root)));
assert.deepEqual(Object.keys(data.stages).sort(),stages.stages.filter(s=>s.kind==='versus').map(s=>s.key).sort());
let combinations=0;
for(const [key,modes] of Object.entries(data.stages)){
 assert.deepEqual(Object.keys(modes).sort(),['Var','Vgl','Vlf','Vcl'].sort());
 for(const [mode,items] of Object.entries(modes)){
  combinations++;
  for(const p of [...items.areas.flatMap(a=>a.points),...items.paths.flatMap(a=>a.points),...items.markers.map(a=>a.position)]){assert.equal(p.length,3);assert(p.every(Number.isFinite));}
  for(const area of items.areas)assert(area.points.length>=4);
  if(mode==='Var'){assert(items.areas.length>0);assert(items.markers.every(m=>m.kind==='zone'));}
  if(mode==='Vgl'){assert.equal(items.markers.filter(m=>m.kind==='spawn').length,1);assert(items.markers.filter(m=>m.kind==='checkpoint').length>=2);assert.equal(items.markers.filter(m=>m.kind==='goal').length,2);}
  if(mode==='Vcl'){assert.equal(items.markers.length,2);assert.deepEqual(items.markers.map(m=>m.team).sort(),['Alpha','Bravo']);}
  if(mode==='Vlf'){
   assert.equal(items.paths.length,2);const [a,b]=items.paths;assert.equal(a.points.length,b.points.length);
   for(let i=0;i<a.points.length;i++){assert.equal(b.points[i][1],a.points[i][1]);assert.equal(b.points[i][2],-a.points[i][2]);assert.equal(b.points[i][0],key==='Vss_AutoWalk00'?a.points[i][0]:-a.points[i][0]);}
   for(const team of ['Alpha','Bravo']){const checks=items.markers.filter(m=>m.kind==='checkpoint'&&m.team===team);assert(checks.length>0);checks.forEach((m,i)=>{assert.equal(m.label,String(i+1));assert(items.paths.find(p=>p.team===team).points.some(p=>p.every((v,j)=>v===m.position[j])));});}
  }
 }
}
assert.equal(data.stages.Vss_Temple01.Var.areas.length,2);
assert.equal(data.stages.Vss_Carousel.Var.areas[0].points.length,64);
assert.equal(data.stages.Vss_Twist00.Var.areas.length,3);
assert.equal(data.stages.Vss_Cross00.Var.areas.length,3);
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
assert.deepEqual(projectPoint([0,0,0],identity,800,600),[400,300]);
assert.deepEqual(projectPoint([1,1,0],identity,800,600),[800,0]);
const perspective=identity.slice();perspective[15]=2;assert.deepEqual(projectPoint([1,1,0],perspective,800,600),[600,150]);
const moved=identity.slice();moved[12]=.5;moved[13]=-.5;assert.deepEqual(projectPoint([0,0,0],moved,800,600),[600,450]);
// SVG has no reflecting `hidden` property: exercise the attribute and clear-on-rule-change behavior.
class Node{constructor(){this.attrs={};this.children=[]}setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k]}append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}}
globalThis.document={addEventListener(){},createElementNS:()=>new Node()};
const svg=new Node(),overlay=createObjectives(svg);
overlay.show(data.stages.Vss_Propeller00.Vlf);overlay.draw(identity,800,600);assert(!('hidden' in svg.attrs));assert(svg.children.length>6);assert(svg.children.some(n=>n.attrs.transform?.endsWith('scale(1.2)')));
overlay.show();assert('hidden' in svg.attrs);assert.equal(svg.children.length,0);
console.log(`PASS: ${combinations} ranked combinations, area shapes/subareas, opposite tower routes, ordered checkpoints, projection and clearing.`);

assert.deepEqual(dashPath([[0,0,0],[5,0,0]]),[[[0,0,0],[1.5,0,0]],[[2.5,0,0],[4,0,0]]]);
assert.deepEqual(dashPath([[0,0,0],[1,0,0],[1,0,3]]),[[[0,0,0],[1,0,0]],[[1,0,0],[1,0,.5]],[[1,0,1.5],[1,0,3]]]);
assert.deepEqual(dashPath([[0,0,0],[0,0,0],[0,3,0]]),[[[0,0,0],[0,1.5,0]],[[0,2.5,0],[0,3,0]]]);
console.log('PASS: world-space dash phase survives corners, height changes and duplicate points.');
