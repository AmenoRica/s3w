import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validateRanges,pickTerrain,transform,inverseMatrix,sphereTriangles} from '../stages/range-math.js';
import {createRangeRenderer} from '../stages/range-renderer.js';
globalThis.window={};await import('../data.js');
const weapons=window.WEAPON_DATA.weapons,ranges=JSON.parse(readFileSync(new URL('../stages/weapon-ranges.json',import.meta.url)));
validateRanges(ranges,weapons);
assert.equal(Object.keys(ranges.actors).length,65);
for(const weapon of weapons){assert.ok(ranges.actors[weapon.actor]);assert.ok(existsSync(new URL(`../assets/Path_Wst_${weapon.key}.png`,import.meta.url)))}
assert.equal(ranges.actors.WeaponShooterNormal[0].lines*5,13);
assert.deepEqual(ranges.actors.WeaponRollerNormal.map(r=>r.lines*5),[12,16]);
assert.equal(ranges.actors.WeaponChargerLongScope[0].lines*5,33.5);
assert.equal(Object.values(ranges.actors).filter(r=>r.length===2).length,13);
for(const mutate of [d=>delete d.actors.WeaponShooterNormal,d=>d.actors.WeaponShooterNormal[0].lines=NaN,d=>d.actors.WeaponShooterNormal[0].lines=0,d=>d.actors.WeaponShooterNormal[0].unexpected=1,d=>d.actors.Unknown=[],d=>d.worldUnitsPerLine=50,d=>d.actors.WeaponRollerNormal[1].label=d.actors.WeaponRollerNormal[0].label]){const copy=structuredClone(ranges);mutate(copy);assert.throws(()=>validateRanges(copy,weapons))}
const triangle=(y,normal=1,category=1)=>[-5,y,-5,0,normal,0,category,5,y,-5,0,normal,0,category,0,y,5,0,normal,0,category];
const topView=[.1,0,0,0,0,0,-.1,0,0,.1,0,0,0,0,0,1],terrain=new Float32Array([...triangle(0),...triangle(3)]);
assert.deepEqual(pickTerrain(terrain,topView,400,300,800,600),[0,3,0]);
assert.equal(pickTerrain(terrain,topView,0,0,800,600),null);
assert.equal(pickTerrain(terrain,topView,400,300,800,600,{water:4}),null);
assert.deepEqual(pickTerrain(terrain,topView,400,300,800,600,{ceiling:2}),[0,0,0]);
for(const [normal,category] of [[-1,1],[.1,1],[1,3]])assert.equal(pickTerrain(new Float32Array([...triangle(0),...triangle(3,normal,category)]),topView,400,300,800,600),null);
// Oblique perspective: screen projection/unprojection must recover a known point on a slope.
const perspective=[1,0,0,0,0,1,0,0,0,0,-1.02,-1,0,0,-2.02,0],point=[.2,.3,-4];
const projected=transform(point,perspective),restored=transform(projected,inverseMatrix(perspective));
restored.forEach((v,i)=>assert.ok(Math.abs(v-point[i])<1e-10));
const face=new Float32Array([-2,-2,-5,0,1,0,1, 2,-2,-5,0,1,0,1, 0,2,-3,0,1,0,1]);
const hit=pickTerrain(face,perspective,400,300,800,600);assert.ok(hit);assert.ok(Math.abs(hit[2]+4)<1e-10);
assert.equal(inverseMatrix(new Array(16).fill(0)),null);
for(const triangle of sphereTriangles())for(const vertex of triangle)assert.ok(Math.abs(Math.hypot(...vertex)-1)<1e-12);
let uploaded,drawCount=0,depthMask;
const gl=new Proxy({getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:(_,name)=>['position','normal','tint'].indexOf(name),bufferData:(_,data)=>uploaded=data,drawArrays:(_,__,count)=>drawCount=count,depthMask:v=>depthMask=v},{get:(o,k)=>k in o?o[k]:()=>({})});
const renderer=createRangeRenderer(gl),byKey=new Map(weapons.map(w=>[w.key,w]));
renderer.update([{key:'Roller_Normal_00',position:[0,0,0]}],ranges,byKey);renderer.draw(topView,[0,1,0]);
assert.equal(drawCount,sphereTriangles(64,32).length*3*2);assert.equal(depthMask,true);
const radii=new Set();for(let i=0;i<uploaded.length;i+=9)radii.add(Math.round(Math.hypot(...uploaded.subarray(i,i+3))));assert.deepEqual([...radii].sort((a,b)=>a-b),[12,16]);
renderer.update([],ranges,byKey);drawCount=0;renderer.draw(topView,[0,1,0]);assert.equal(drawCount,0);
console.log(`PASS: ${weapons.length} weapon references, 65 range profiles, 13 dual ranges, validation failures, world scale, nearest terrain, slope/perspective, invalid surfaces, sphere radii and renderer clearing.`);
