import {t,localizedText} from './i18n.js?v=20260919-l10n-2';
'use strict';
import {terrainEdges} from './edges.js';
import {createObjectives} from './objectives.js?v=20260919-l10n-2';
import {createWeaponPlacement} from './weapons.js?v=20260920-ultrashot';
import {pickTerrain} from './range-math.js';
export function createMapViewer(root,{onChange=()=>{}}={}){
const canvas=root.querySelector('#map'),status=root.querySelector('#status');
const objectives=createObjectives(root.querySelector('#objectives'));
let yaw=0,tilt=0,zoom=1,gl,program,vertexCount=0,meta,frame=0,opaqueCount=0,meshBuffer,grateData,sortedGrates,grateCenters,grateOrder;
const uniforms={},attributes={};
let edgeStart=0,edgeCount=0,orthographic=true,terrain=new Float32Array();
const weapons=createWeaponPlacement(root,{schedule,onChange,pick:(x,y)=>pickTerrain(terrain,matrix(),x,y,canvas.clientWidth,canvas.clientHeight,{water:meta?.water??-Infinity,ceiling:hideCeiling?ceilingHeight:Infinity})});
const projectionToggle=root.querySelector('#projection-toggle');
function setProjection(value){orthographic=value;projectionToggle.setAttribute('aria-pressed',String(orthographic));localizedText(projectionToggle,orthographic?'직교':'원근');schedule()}
projectionToggle.onclick=()=>setProjection(!orthographic);
let ceilingHeight=Infinity,hideCeiling=false,pan=[0,0,0];
const ceilingToggle=root.querySelector('#ceiling-toggle');
ceilingToggle.onclick=()=>{hideCeiling=!hideCeiling;ceilingToggle.setAttribute('aria-pressed',String(hideCeiling));localizedText(ceilingToggle,hideCeiling?'높은 지형 표시':'높은 지형 숨기기');schedule()};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function matrix(){
 const center=meta.boundsMin.map((v,i)=>(v+meta.boundsMax[i])/2+pan[i]);
 const back=[Math.sin(tilt)*Math.sin(yaw),Math.cos(tilt),Math.sin(tilt)*Math.cos(yaw)];
 const up=[-Math.sin(yaw)*Math.cos(tilt),Math.sin(tilt),-Math.cos(yaw)*Math.cos(tilt)];
 const right=normalize(cross(up,back)),vertical=cross(back,right),eye=center.map((x,i)=>x+back[i]*300);
 const aspect=canvas.width/canvas.height,radius=Math.hypot(...meta.boundsMax.map((v,i)=>v-meta.boundsMin[i]))/2;
 const half=radius*1.08/zoom*Math.max(1,1/aspect),sx=1/(half*aspect),sy=1/half,sz=-1/Math.max(1000,radius*5);
 if(!orthographic){
  // Match the orthographic scale at the center plane; keep the camera outside the map at every zoom.
  const distance=Math.max(1,radius*3),near=distance/100,far=distance+radius*2;
  const camera=center.map((v,i)=>v+back[i]*distance),a=-(far+near)/(far-near),b=-2*far*near/(far-near);
  return new Float32Array([right[0]*sx*distance,vertical[0]*sy*distance,back[0]*a,-back[0],right[1]*sx*distance,vertical[1]*sy*distance,back[1]*a,-back[1],right[2]*sx*distance,vertical[2]*sy*distance,back[2]*a,-back[2],-dot(right,camera)*sx*distance,-dot(vertical,camera)*sy*distance,-dot(back,camera)*a+b,dot(back,camera)]);
 }
 return new Float32Array([right[0]*sx,vertical[0]*sy,back[0]*sz,0,right[1]*sx,vertical[1]*sy,back[1]*sz,0,right[2]*sx,vertical[2]*sy,back[2]*sz,0,-dot(right,eye)*sx,-dot(vertical,eye)*sy,-dot(back,eye)*sz,1]);
}
function moveCenter(dx,dy){
 if(!meta)return;
 const aspect=canvas.clientWidth/canvas.clientHeight,radius=Math.hypot(...meta.boundsMax.map((v,i)=>v-meta.boundsMin[i]))/2;
 const units=2*radius*1.08/zoom*Math.max(1,1/aspect)/canvas.clientHeight;
 const right=[Math.cos(yaw),0,-Math.sin(yaw)];
 const up=[-Math.sin(yaw)*Math.cos(tilt),Math.sin(tilt),-Math.cos(yaw)*Math.cos(tilt)];
 pan=pan.map((v,i)=>v-dx*units*right[i]+dy*units*up[i]);schedule();
}
function schedule(){if(!frame)frame=requestAnimationFrame(draw)}
function draw(){
 frame=0;if(!vertexCount||!gl||gl.isContextLost())return;
 const ratio=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);
 if(w<1||h<1)return;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 bindTerrain();
 const view=matrix();gl.uniformMatrix4fv(uniforms['view'],false,view);
 objectives.draw(view,canvas.clientWidth,canvas.clientHeight);
 gl.uniform1f(uniforms['ceilingHeight'],Number.isFinite(ceilingHeight)?ceilingHeight:1e4);
 gl.uniform1f(uniforms['hideCeiling'],hideCeiling?1:0);
 gl.uniform1f(uniforms['edgePass'],0);
 gl.uniform1f(uniforms['transparentPass'],0);
 gl.disable(gl.BLEND);gl.depthMask(true);gl.drawArrays(gl.TRIANGLES,0,opaqueCount);
 // Draw the translucent triangles back to front, after all solid surfaces.
 const back=[Math.sin(tilt)*Math.sin(yaw),Math.cos(tilt),Math.sin(tilt)*Math.cos(yaw)];
 const depths=grateCenters.map(center=>dot(center,back));
 grateOrder.sort((a,b)=>depths[a]-depths[b]);
 grateOrder.forEach((source,i)=>sortedGrates.set(grateData.subarray(source*21,source*21+21),i*21));
 gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,opaqueCount*28,sortedGrates);
 gl.uniform1f(uniforms['transparentPass'],1);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 gl.drawArrays(gl.TRIANGLES,opaqueCount,vertexCount-opaqueCount);
 if(edgeCount){
  gl.uniform1f(uniforms['edgePass'],1);gl.lineWidth(1);
  for(const pass of [0,1]){gl.uniform1f(uniforms['transparentPass'],pass);gl.drawArrays(gl.LINES,edgeStart,edgeCount)}
 }
 gl.depthMask(true);gl.disable(gl.BLEND);
 weapons.draw(gl,view,back,canvas.clientWidth,canvas.clientHeight,zoom,hideCeiling?ceilingHeight:Infinity);
}
function update(){yaw=((yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;tilt=clamp(tilt,0,75*Math.PI/180);schedule()}
function magnify(factor,x=canvas.clientWidth/2,y=canvas.clientHeight/2){
 const oldZoom=zoom;zoom=clamp(zoom*factor,.45,8);
 moveCenter((x-canvas.clientWidth/2)*(1-zoom/oldZoom),(y-canvas.clientHeight/2)*(1-zoom/oldZoom));schedule();
}
let interaction='move';
const moveButton=root.querySelector('#interaction-move'),rotateButton=root.querySelector('#interaction-rotate'),hint=root.querySelector('#map-hint');
function setInteraction(mode){
 interaction=mode;moveButton.setAttribute('aria-pressed',String(mode==='move'));rotateButton.setAttribute('aria-pressed',String(mode==='rotate'));
 localizedText(hint,mode==='move'?'드래그해서 이동 · 휠 / 두 손가락으로 확대':'드래그해서 회전 · 휠 / 두 손가락으로 확대');
 canvas.dataset.l10nAriaLabel=mode==='move'?'드래그 또는 방향키로 이동, 오른쪽 드래그로 회전, 더하기와 빼기로 확대 축소':'드래그 또는 방향키로 회전, Shift와 함께 이동, 더하기와 빼기로 확대 축소';canvas.setAttribute('aria-label',t(canvas.dataset.l10nAriaLabel));
}
moveButton.onclick=()=>setInteraction('move');rotateButton.onclick=()=>setInteraction('rotate');setInteraction('move');
function resetView(){yaw=(meta?.initialYaw||0)+Math.PI/2;tilt=0;zoom=1;pan=[0,0,0];update()}
root.querySelector('#reset').onclick=resetView;
root.querySelector('#camera-reset').onclick=()=>{setProjection(true);resetView()};
root.querySelector('#zoom-in').onclick=()=>magnify(1.2);root.querySelector('#zoom-out').onclick=()=>magnify(1/1.2);
canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);magnify(Math.exp(-delta*.001),e.clientX-rect.left,e.clientY-rect.top)},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const pointers=new Map();
canvas.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0&&e.button!==2)return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,rotate:e.button===2});canvas.focus({preventScroll:true})};
canvas.onpointermove=e=>{
 if(!pointers.has(e.pointerId))return;
 const old=pointers.get(e.pointerId),before=[...pointers.values()];
 pointers.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});
 if(pointers.size===1){
  if(!old.rotate&&(e.shiftKey||interaction==='move')){moveCenter(e.clientX-old.x,e.clientY-old.y);return}
  yaw-=(e.clientX-old.x)*.007;tilt-=(e.clientY-old.y)*.006;update();
 }else if(pointers.size===2){
  const [a,b]=before,[c,d]=[...pointers.values()];
  const oldX=(a.x+b.x)/2,oldY=(a.y+b.y)/2,newX=(c.x+d.x)/2,newY=(c.y+d.y)/2;
  const oldDistance=Math.hypot(a.x-b.x,a.y-b.y),distance=Math.hypot(c.x-d.x,c.y-d.y);
  const rect=canvas.getBoundingClientRect();
  if(oldDistance>0&&distance>0)magnify(distance/oldDistance,oldX-rect.left,oldY-rect.top);
  moveCenter(newX-oldX,newY-oldY);
 }
};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=e=>{pointers.delete(e.pointerId)};
canvas.onkeydown=e=>{
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key))return;e.preventDefault();
 if(e.key.startsWith('Arrow')){
  if(e.shiftKey||interaction==='move')moveCenter(e.key==='ArrowLeft'?-30:e.key==='ArrowRight'?30:0,e.key==='ArrowUp'?-30:e.key==='ArrowDown'?30:0);
  else{if(e.key==='ArrowLeft')yaw+=.1;if(e.key==='ArrowRight')yaw-=.1;if(e.key==='ArrowUp')tilt+=.1;if(e.key==='ArrowDown')tilt-=.1;update()}
 }else magnify(e.key==='-'?1/1.1:1.1);
};
const observer=new ResizeObserver(schedule);observer.observe(canvas);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();status.hidden=false;localizedText(status,'화면 연결이 끊겼습니다. 페이지를 새로고침해 주세요.')});
function prepare(){
 gl=canvas.getContext('webgl',{antialias:true,alpha:false});if(!gl)throw Error('이 브라우저에서는 3D 화면을 열 수 없습니다. 다른 브라우저로 열어주세요.');
 const vertex=`attribute vec3 position;attribute vec3 normal;attribute float category;uniform mat4 view;uniform mediump float edgePass;uniform vec2 heightRange;uniform float water;varying vec3 color;varying float worldY;varying float opacity;void main(){worldY=position.y;opacity=category>1.5&&category<2.5?.45:1.0;float t=clamp((position.y+2.0)/20.0,0.0,1.0);vec3 low=vec3(90.,93.,97.);vec3 high=vec3(206.,209.,211.);if(category>2.5){low=vec3(60.,224.,218.);high=low;}else if(category>1.5){low=vec3(120.,73.,63.);high=vec3(207.,140.,101.);}else if(category>.5){low=vec3(135.,116.,84.);high=vec3(255.,252.,236.);t=clamp((position.y-heightRange.x)/max(1.0,heightRange.y-heightRange.x),0.0,1.0);}vec3 n=normal.y<0.0?-normal:normal;float light=clamp(dot(n,vec3(-.35,.88,-.32)),0.0,1.0);color=mix(low,high,t)/255.0*(.84+.16*light);gl_Position=view*vec4(position,1.0);gl_Position.z-=edgePass*.000015*gl_Position.w;}`;
 const fragment=`precision mediump float;uniform float water;uniform float ceilingHeight;uniform float hideCeiling;uniform float transparentPass;uniform mediump float edgePass;varying float worldY;varying vec3 color;varying float opacity;void main(){bool high=worldY>=ceilingHeight;bool translucent=high||opacity<1.0;if((transparentPass<.5&&translucent)||(transparentPass>.5&&!translucent)||(high&&hideCeiling>.5))discard;vec3 c=worldY<water?mix(color,vec3(.10,.29,.37),.85):color;if(edgePass>.5)c=vec3(.18,.20,.21);gl_FragColor=vec4(c,(high?.22:opacity)*(edgePass>.5?.72:1.0));}`;
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
 program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('화면 준비에 실패했습니다.');gl.useProgram(program);
 for(const name of ['view','ceilingHeight','hideCeiling','edgePass','transparentPass','heightRange','water'])uniforms[name]=gl.getUniformLocation(program,name);
 for(const name of ['position','normal','category'])attributes[name]=gl.getAttribLocation(program,name);
 gl.enable(gl.DEPTH_TEST);gl.clearColor(18/255,26/255,37/255,1);
}
function bindTerrain(){
 gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);
 for(const [name,size,offset] of [['position',3,0],['normal',3,12],['category',1,24]]){const loc=attributes[name];gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
}
function show(mapMeta,source,reset=true){
 if(!gl)prepare();gl.useProgram(program);terrain=source;objectives.show(mapMeta.objectives);meta=mapMeta;ceilingHeight=meta.ceilingHeight;vertexCount=0;
 gl.uniform2fv(uniforms['heightRange'],meta.heightRange||[0,12]);
 gl.uniform1f(uniforms['water'],meta.water??-1e4);
 const solid=[],grates=[];
 for(let i=0;i<source.length;i+=21){solid.push(i);if(source[i+6]===2||Math.max(source[i+1],source[i+8],source[i+15])>=ceilingHeight)grates.push(i)}
 const edges=meta.outlines?terrainEdges(source):new Float32Array();
 opaqueCount=solid.length*3;edgeStart=(solid.length+grates.length)*3;edgeCount=edges.length/7;
 const packed=new Float32Array(edgeStart*7+edges.length);packed.set(edges,edgeStart*7);
 [...solid,...grates].forEach((offset,i)=>packed.set(source.subarray(offset,offset+21),i*21));
 grateData=packed.slice(opaqueCount*7,edgeStart*7);sortedGrates=new Float32Array(grateData.length);
 grateCenters=grates.map((_,i)=>[0,1,2].map(axis=>(grateData[i*21+axis]+grateData[i*21+7+axis]+grateData[i*21+14+axis])/3));
 grateOrder=grates.map((_,i)=>i);
 if(meshBuffer)gl.deleteBuffer(meshBuffer);meshBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,packed,gl.DYNAMIC_DRAW);for(const [name,size,offset] of [['position',3,0],['normal',3,12],['category',1,24]]){const loc=attributes[name];gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
 vertexCount=edgeStart;weapons.ready(source);status.hidden=true;if(reset){yaw=(meta?.initialYaw||0)+Math.PI/2;tilt=0;zoom=1;pan=[0,0,0]}update();
}
return {show,confirmClear:()=>weapons.confirmClear(),clearMarkers:()=>weapons.clear(),snapshot:()=>weapons.snapshot(),loading(message='지형을 불러오는 중…',shared=null){terrain=new Float32Array();weapons.clear(shared);objectives.clear();vertexCount=0;if(gl)gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);status.hidden=false;localizedText(status,message)},error(error){status.hidden=false;localizedText(status,window.SITE_I18N.messages[error.message]?error.message:'지형을 불러오지 못했습니다. 다시 시도해 주세요.')},resize:schedule};
}
