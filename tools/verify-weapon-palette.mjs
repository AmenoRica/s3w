import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPaletteDrag} from '../stages/weapons.js';
let dropped=[],previews=[];
const node={classList:{add(){},remove(){}},focus(){},setPointerCapture(id){this.capture=id},hasPointerCapture(id){return this.capture===id},releasePointerCapture(){this.capture=null}};
const palette=createPaletteDrag({canvas:{getBoundingClientRect:()=>({left:10,top:100,width:200,height:200})},pick:(x,y)=>x<150?[x,4,y]:null,started(){},preview:value=>previews.push(value),drop:(key,point)=>dropped.push({key,point})});
palette.bind(node,'Roller_Normal_00');
const e=(x,y,extra={})=>({pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y,preventDefault(){},...extra});
node.onpointerdown(e(30,30));node.onpointermove(e(80,140));assert.equal(dropped.length,0);assert.deepEqual(previews.at(-1).point,[70,4,40]);
node.onpointerup(e(90,150));assert.equal(dropped.length,1);assert.deepEqual(dropped[0],{key:'Roller_Normal_00',point:[80,4,50]});assert.equal(previews.at(-1),null);
node.onpointerdown(e(30,30));node.onpointerup(e(90,150));assert.equal(dropped.length,2); // Palette source remains reusable.
for(const [x,y] of [[230,150],[190,150],[40,40]]){node.onpointerdown(e(30,30));node.onpointermove(e(70,140));node.onpointerup(e(x,y));assert.equal(dropped.length,2)}
node.onpointerdown(e(30,30));node.onpointermove(e(70,140));palette.cancel();assert.equal(dropped.length,2);assert.equal(previews.at(-1),null);
node.onpointerdown(e(30,30));node.onpointermove(e(70,140));node.onpointercancel(e(70,140));assert.equal(dropped.length,2);assert.equal(palette.active(),false);
node.onpointerdown(e(30,30));node.onpointerup(e(31,31));assert.equal(dropped.length,2);
assert.equal(node.onclick,undefined);
node.onpointerdown(e(30,30,{button:2}));assert.equal(palette.active(),false);
const html=readFileSync(new URL('../stages/index.html',import.meta.url),'utf8'),route=readFileSync(new URL('../stages/stages.js',import.meta.url),'utf8');
for(const id of ['weapon-search','placement-weapon','weapon-place','weapon-move','map-legend','weapon-delete','weapon-cancel','placement-selection','placement-status','range-legend'])assert.ok(!html.includes(`id="${id}"`));
assert.ok(!route.includes("$('map-legend')"));
console.log('PASS: palette preview, one placement per valid drop, repeated extraction, invalid/canceled drops, no click selection, old controls and terrain legend removed.');
