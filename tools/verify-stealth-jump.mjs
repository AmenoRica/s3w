import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {penaltyCircle,createStealthJump} from '../stages/stealth-jump.js';
const read=name=>JSON.parse(readFileSync(new URL(`../stages/${name}`,import.meta.url)));
const data=read('respawns.json'),stages=read('data.json').stages.filter(s=>s.kind==='versus');
assert.deepEqual(Object.keys(data.stages).sort(),stages.map(s=>s.key).sort());
for(const stage of stages)for(const mode of ['Pnt','Var','Vlf','Vgl','Vcl']){
 const spawns=data.stages[stage.key][mode];assert.deepEqual(spawns.map(s=>s.team),['Alpha','Bravo']);
 for(const spawn of spawns){
  assert.equal(spawn.position.length,3);assert(spawn.position.every(Number.isFinite));assert.match(spawn.source,/^\d+$/);
  for(const radius of [60,100])for(const p of penaltyCircle(spawn.position,radius)){
   assert(Math.abs(Math.hypot(p[0]-spawn.position[0],p[2]-spawn.position[2])-radius)<1e-8);assert.equal(p[1],spawn.position[1]);
  }
 }
}
class Node{
 constructor(){this.attrs={};this.children=[]}
 setAttribute(k,v){this.attrs[k]=String(v)}
 toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k]}
 append(node){this.children.push(node)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElementNS:()=>new Node()};
const svg=new Node(),toggle=new Node();let scheduled=0;
const overlay=createStealthJump({querySelector:id=>({'#stealth-jump-overlay':svg,'#stealth-jump-toggle':toggle})[id]},()=>scheduled++);
overlay.show(data.stages.Vss_Yagara.Pnt);assert('hidden' in svg.attrs);assert.equal(svg.children.length,10);
toggle.onclick();assert.equal(scheduled,1);assert(!('hidden' in svg.attrs));
overlay.draw([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],800,600);assert(svg.children[0].attrs.points);
assert.deepEqual(svg.children.filter(n=>n.attrs['data-l10n']).map(n=>n.textContent),['스텔스 점프 페널티 시작','스텔스 점프 페널티 최대','스텔스 점프 페널티 시작','스텔스 점프 페널티 최대']);
assert(svg.children.filter(n=>n.attrs['data-l10n']).every(n=>Number.isFinite(Number(n.attrs.x))&&Number.isFinite(Number(n.attrs.y))));
overlay.clear();assert('hidden' in svg.attrs);assert.equal(svg.children.length,0);assert(toggle.disabled);
overlay.show(data.stages.Vss_Yagara.Vgl);assert(!('hidden' in svg.attrs));assert.equal(svg.children.length,10);
toggle.onclick();assert('hidden' in svg.attrs);
overlay.show();assert(toggle.hidden);assert.equal(svg.children.length,0);
console.log('PASS: 125 rules × 2 respawns, 12/20-cell radii, toggle, projection, loading, rule change and Salmon Run hiding.');
