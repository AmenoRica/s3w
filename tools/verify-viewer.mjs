import assert from 'node:assert/strict';
import {createMapViewer} from '../stages/viewer.js';
let frame,view,uniforms={},draws=[];
globalThis.requestAnimationFrame=fn=>(frame=fn,1);
globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class{observe(){}};
const gl=new Proxy({
 drawArrays:(_,start,count)=>draws.push({start,count}),
 isContextLost:()=>false,getShaderParameter:()=>true,getProgramParameter:()=>true,
 getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,
 uniformMatrix4fv:(_,__,m)=>view=Array.from(m),uniform1f:(name,v)=>uniforms[name]=v,
}, {get:(object,key)=>key in object?object[key]:()=>({})});
const events={};
const attributeNode=()=>({dataset:{},setAttribute(k,v){this[k]=v}});
const canvas={...attributeNode(),getBoundingClientRect:()=>({left:0,top:0}),clientWidth:800,clientHeight:600,getContext:()=>gl,addEventListener(name,fn){events[name]=fn},setPointerCapture(){},focus(){}};
const nodes={'#projection-toggle':attributeNode(),'#interaction-move':attributeNode(),'#interaction-rotate':attributeNode(),'#map-hint':{dataset:{}},'#camera-reset':{},'#map':canvas,'#status':{dataset:{}},'#reset':{},'#zoom-in':{},'#zoom-out':{},'#ceiling-toggle':{dataset:{},setAttribute(k,v){this[k]=v}}};
const viewer=createMapViewer({querySelector:id=>nodes[id]});
const flush=()=>{const next=frame;frame=null;next?.()};
const source=new Float32Array([0,0,0,0,1,0,1, 2,5,0,0,1,0,1, 0,0,2,0,1,0,1]);
const meta={boundsMin:[0,0,0],boundsMax:[2,5,2],ceilingHeight:3};
viewer.show(meta,source);flush();const initial=view.slice();
assert.equal(initial[4],0);assert.equal(initial[5],0); // Height never shifts screen position in the default top view.
assert.equal(uniforms.ceilingHeight,3);assert.equal(uniforms.hideCeiling,0);
canvas.onpointerdown({pointerId:1,clientX:100,clientY:100});
canvas.onpointermove({pointerId:1,clientX:150,clientY:130,shiftKey:false});flush();
assert.deepEqual(view.slice(0,12),initial.slice(0,12));assert.notDeepEqual(view.slice(12),initial.slice(12));
canvas.onpointerup({pointerId:1});nodes['#reset'].onclick();flush();assert.deepEqual(view,initial);
canvas.onpointerdown({pointerId:2,clientX:100,clientY:100,button:2});canvas.onpointermove({pointerId:2,clientX:150,clientY:120,shiftKey:false});flush();
assert.notDeepEqual(view.slice(0,12),initial.slice(0,12));canvas.onpointerup({pointerId:2});
nodes['#ceiling-toggle'].onclick();flush();assert.equal(uniforms.hideCeiling,1);assert.equal(nodes['#ceiling-toggle']['aria-pressed'],'true');
nodes['#ceiling-toggle'].onclick();flush();assert.equal(uniforms.hideCeiling,0);
nodes['#reset'].onclick();flush();assert.deepEqual(view,initial);
console.log('PASS: Default drag pans without rotation, right drag rotates, reset restores center, height threshold and visibility toggle update rendering.');

const rail=source.slice();for(let i=6;i<rail.length;i+=7)rail[i]=3;
viewer.show({...meta,ceilingHeight:Infinity,initialYaw:Math.PI/2},rail);draws=[];flush();
const sideways=view.slice();assert.notDeepEqual(sideways,initial);assert.equal(draws[0].count,3);assert.equal(draws[1].count,0);
canvas.onkeydown({key:"ArrowLeft",preventDefault(){}});flush();assert.notDeepEqual(view,sideways);
nodes["#reset"].onclick();flush();assert.deepEqual(view,sideways);
console.log("PASS: ink rails stay opaque and reset restores the minimap orientation.");

// Zoom must keep the terrain point beneath the cursor stationary.
nodes['#reset'].onclick();flush();
const point=[1,2,1];
const screen=()=>[view[0]*point[0]+view[4]*point[1]+view[8]*point[2]+view[12],view[1]*point[0]+view[5]*point[1]+view[9]*point[2]+view[13]];
const beforeZoom=screen();
events.wheel({deltaY:-400,deltaMode:0,clientX:(beforeZoom[0]+1)*400,clientY:(1-beforeZoom[1])*300,preventDefault(){}});flush();
assert.ok(screen().every((v,i)=>Math.abs(v-beforeZoom[i])<1e-6));
nodes['#reset'].onclick();flush();const beforeTouch=view.slice();
canvas.onpointerdown({pointerId:3,clientX:300,clientY:300});canvas.onpointerdown({pointerId:4,clientX:500,clientY:300});
canvas.onpointermove({pointerId:3,clientX:320,clientY:330});canvas.onpointermove({pointerId:4,clientX:520,clientY:330});flush();
assert.ok(view.slice(0,12).every((v,i)=>Math.abs(v-beforeTouch[i])<1e-6));assert.notDeepEqual(view.slice(12),beforeTouch.slice(12));
canvas.onpointermove({pointerId:4,clientX:600,clientY:330});flush();assert.notEqual(view[0],beforeTouch[0]);
canvas.onpointercancel({pointerId:3});canvas.onlostpointercapture({pointerId:4});
nodes['#interaction-rotate'].onclick();assert.equal(nodes['#interaction-rotate']['aria-pressed'],'true');
const beforeRotate=view.slice();canvas.onpointerdown({pointerId:5,clientX:100,clientY:100});canvas.onpointermove({pointerId:5,clientX:150,clientY:80});flush();assert.notDeepEqual(view.slice(0,12),beforeRotate.slice(0,12));canvas.onpointerup({pointerId:5});
nodes['#camera-reset'].onclick();flush();assert.ok(Math.abs(view[5])<1e-6);assert.ok(Math.abs(view[2])<1e-6);assert.ok(Math.abs(view[10])<1e-6);
nodes['#reset'].onclick();flush();assert.deepEqual(view,sideways);
nodes['#interaction-move'].onclick();assert.equal(nodes['#interaction-move']['aria-pressed'],'true');
console.log('PASS: cursor-anchored zoom, two-finger pan/pinch, rotation mode, camera reset and full reset.');

const ortho=view.slice();
nodes['#projection-toggle'].onclick();flush();assert.equal(nodes['#projection-toggle']['aria-pressed'],'false');assert.notDeepEqual(view,ortho);assert.notEqual(view[7],0);
const perspective=view.slice();const center=meta.boundsMin.map((v,i)=>(v+meta.boundsMax[i])/2);
const ndc=(p,m)=>{const w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12])/w,(m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13])/w]};
assert.ok(ndc(center,perspective).every(v=>Math.abs(v)<1e-6));
const near=ndc([center[0]+1,center[1]+1,center[2]],perspective),far=ndc([center[0]+1,center[1]-1,center[2]],perspective);
assert.ok(Math.hypot(...near)>Math.hypot(...far));
nodes['#projection-toggle'].onclick();flush();assert.deepEqual(view,ortho);
console.log('PASS: default orthographic projection, perspective depth scaling, and lossless toggle back.');

// Reset from a perspective camera with changed rotation, zoom and center.
nodes['#projection-toggle'].onclick();nodes['#interaction-rotate'].onclick();
canvas.onkeydown({key:'ArrowUp',preventDefault(){}});canvas.onkeydown({key:'ArrowLeft',preventDefault(){}});
nodes['#zoom-in'].onclick();canvas.onkeydown({key:'ArrowRight',shiftKey:true,preventDefault(){}});flush();
assert.notDeepEqual(view,sideways);
nodes['#camera-reset'].onclick();flush();assert.deepEqual(view,sideways);
assert.equal(nodes['#projection-toggle']['aria-pressed'],'true');assert.equal(nodes['#projection-toggle'].textContent,'직교');
console.log('PASS: camera reset restores orthographic projection, default position, rotation and zoom.');
