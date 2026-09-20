import {sphereTriangles} from './range-math.js';
import {utilityForPlacement,utilityTriangles,normalizeGearAP} from './utility-markers.js?v=20260920-live-url';
// Approximate humanoid Inkling height (1.65 m); not weapon-specific muzzle data.
const sightHeight=1.65;
export const rangeColors=['#54e1bd','#bb9aff'];
const colors=[[.33,.88,.74],[.73,.60,1]],sphere=sphereTriangles(64,32),gray=[.55,.57,.60],indirect=[1,.57,.18];
// Deduplicate the unchanged sphere once, rather than stringify every vertex on each drag.
const directions=[],directionIds=new Map();
const sphereIds=sphere.map(face=>face.map(n=>{
 const key=n.join(',');if(!directionIds.has(key)){directionIds.set(key,directions.length);directions.push(n)}
 return directionIds.get(key);
}));
// Stable linear-time depth order at GPU float precision. Only ordering keys are
// rounded; positions, range samples and terrain occlusion remain unchanged.
function sortDepths(order,scratch,depths,overlays,counts){
 const bits=new Uint32Array(depths.buffer);
 for(let i=0;i<order.length;i++){order[i]=i;bits[i]=bits[i]&0x80000000?~bits[i]:bits[i]^0x80000000}
 for(let pass=0;pass<4;pass++){
  counts.fill(0);const shift=pass*8;
  for(let i=0;i<order.length;i++)counts[(bits[order[i]]>>>shift)&255]++;
  let offset=0;for(let i=0;i<256;i++){const n=counts[i];counts[i]=offset;offset+=n}
  for(let i=0;i<order.length;i++){const id=order[i];scratch[counts[(bits[id]>>>shift)&255]++]=id}
  [order,scratch]=[scratch,order];
 }
 let solid=0;for(let i=0;i<order.length;i++)if(!overlays[i])solid++;
 if(solid===order.length||!solid)return;
 let a=0,b=solid;for(let i=0;i<order.length;i++){const id=order[i];scratch[overlays[id]?b++:a++]=id}
 order.set(scratch);
}
export function createRangeRenderer(gl){
 const program=gl.createProgram();
 const sources=[
  [gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;attribute vec3 tint;attribute float opacity;uniform mat4 view;varying vec3 n;varying vec3 color;varying float alpha;void main(){gl_Position=view*vec4(position,1.);n=normal;color=tint;alpha=opacity;}`],
  [gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 n;varying vec3 color;varying float alpha;uniform vec3 back;void main(){float rim=1.-abs(dot(normalize(n),back));float light=.80+.20*max(0.,dot(normalize(n),normalize(vec3(-.4,1.,.3))));gl_FragColor=vec4(color*light,alpha*(.24+.32*pow(rim,3.)));}`]
 ];
 for(const [type,source] of sources){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('사거리 구를 준비하지 못했습니다.');gl.attachShader(program,shader);gl.deleteShader(shader)}
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('사거리 구를 준비하지 못했습니다.');
 const buffer=gl.createBuffer(),attributes=['position','normal','tint'].map(name=>gl.getAttribLocation(program,name));
 const indexed=!!gl.getExtension('OES_element_index_uint'),indexBuffer=indexed?gl.createBuffer():null;
 const alphaBuffer=gl.createBuffer(),alphaLocation=gl.getAttribLocation(program,'opacity');
 const viewLocation=gl.getUniformLocation(program,'view'),backLocation=gl.getUniformLocation(program,'back');
 let cache=new WeakMap(),lastBlocked,chunks=[],sceneDirty=true,lastBack=[];
 let indices=new Uint32Array(),faces=new Uint32Array();
 let vertices=new Float32Array(),centers=new Float64Array(),alpha=new Float32Array(),overlays=new Uint8Array();
 let packed=new Float32Array(),alphas=new Float32Array(),depths=new Float32Array(),order=new Uint32Array(),solidVertices=0,scratch=new Uint32Array(),counts=new Uint32Array(256);
 function update(placements,ranges,weapons,blocked){
  if(lastBlocked!==blocked){cache=new WeakMap();lastBlocked=blocked}
  const next=[];
  for(const placement of placements){
   let cached=cache.get(placement);
   const startKey=(placement.start||[]).join(','),gearAP=normalizeGearAP(placement.gearAP);
   if(cached&&cached.gearAP===gearAP&&cached.startKey===startKey&&cached.angle===(placement.angle||0)&&cached.position.every((v,i)=>v===placement.position[i])){next.push(cached);continue}
   const utility=utilityForPlacement(placement),mesh=utility?utilityTriangles(placement,utility):null;
   const profiles=utility?[]:ranges.actors[weapons.get(placement.key).actor];
   const count=mesh?mesh.length:sphere.length*profiles.length,vertexCount=mesh?count*3:directions.length*profiles.length;
   if(!cached||cached.centers.length!==count*3)cached={vertices:new Float32Array(vertexCount*9),faces:new Uint32Array(count*3),centers:new Float64Array(count*3),alpha:new Float32Array(count),overlays:new Uint8Array(count)};
   cached.position=placement.position.slice();cached.angle=placement.angle||0;cached.startKey=startKey;cached.gearAP=gearAP;
   if(mesh){
    mesh.forEach((face,i)=>{for(let j=0;j<3;j++)cached.vertices.set(face.vertices[j],i*27+j*9);cached.centers.set(face.center,i*3);cached.alpha[i]=face.alpha??1;cached.overlays[i]=+!!face.overlay;for(let j=0;j<3;j++)cached.faces[i*3+j]=i*3+j});
   }else{
    const origin=[placement.position[0],placement.position[1]+sightHeight,placement.position[2]];
    const point=[0,0,0],direction=[0,0,0],shades=new Array(directions.length);
    profiles.forEach((range,index)=>{
     const radius=range.lines*ranges.worldUnitsPerLine;
     for(let i=0;i<directions.length;i++){
      const n=directions[i];for(let j=0;j<3;j++){point[j]=placement.position[j]+n[j]*radius;direction[j]=point[j]-origin[j]}
      const distance=Math.hypot(...direction);for(let j=0;j<3;j++)direction[j]/=distance;
      shades[i]=distance>1e-4&&blocked?.(origin,direction,distance)?gray:blocked?.groundBlocked?.(origin,point)?indirect:colors[index];
     }
     const base=index*directions.length;
     for(let i=0;i<directions.length;i++){
      const n=directions[i],shade=shades[i],v=(base+i)*9;
      for(let k=0;k<3;k++){cached.vertices[v+k]=placement.position[k]+n[k]*radius;cached.vertices[v+3+k]=n[k];cached.vertices[v+6+k]=shade[k]}
     }
     for(let i=0;i<sphereIds.length;i++){
      const face=index*sphere.length+i;
      for(let j=0;j<3;j++)cached.faces[face*3+j]=base+sphereIds[i][j];
      for(let k=0;k<3;k++)cached.centers[face*3+k]=(cached.vertices[cached.faces[face*3]*9+k]+cached.vertices[cached.faces[face*3+1]*9+k]+cached.vertices[cached.faces[face*3+2]*9+k])/3;
      cached.alpha[face]=1;
     }
    });
   }
   cache.set(placement,cached);next.push(cached);sceneDirty=true;
  }
  if(next.length!==chunks.length||next.some((chunk,i)=>chunk!==chunks[i]))sceneDirty=true;
  chunks=next;
 }
 function draw(view,back){
  const count=chunks.reduce((n,chunk)=>n+chunk.alpha.length,0),vertexCount=chunks.reduce((n,chunk)=>n+chunk.vertices.length/9,0);if(!count)return;
  if(sceneDirty){
   if(order.length!==count||vertices.length!==vertexCount*9){
    vertices=new Float32Array(vertexCount*9);faces=new Uint32Array(count*3);centers=new Float64Array(count*3);alpha=new Float32Array(count);overlays=new Uint8Array(count);
    packed=new Float32Array(indexed?0:count*27);alphas=new Float32Array(indexed?vertexCount:count*3);depths=new Float32Array(count);order=new Uint32Array(count);scratch=new Uint32Array(count);indices=new Uint32Array(indexed?count*3:0);
   }
   let offset=0,vertexOffset=0;solidVertices=0;
   for(const chunk of chunks){
    vertices.set(chunk.vertices,vertexOffset*9);centers.set(chunk.centers,offset*3);alpha.set(chunk.alpha,offset);overlays.set(chunk.overlays,offset);
    for(let i=0;i<chunk.faces.length;i++)faces[offset*3+i]=chunk.faces[i]+vertexOffset;
    if(indexed)for(let i=0;i<chunk.faces.length;i++)alphas[chunk.faces[i]+vertexOffset]=chunk.alpha[Math.floor(i/3)];
    offset+=chunk.alpha.length;vertexOffset+=chunk.vertices.length/9;
   }
   for(let i=0;i<count;i++){order[i]=i;if(!overlays[i])solidVertices+=3}
   if(indexed){
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
    if(alphaLocation>=0){gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);gl.bufferData(gl.ARRAY_BUFFER,alphas,gl.DYNAMIC_DRAW)}
   }
  }
  // Camera translation and zoom do not change depth order. Upload only on geometry changes or rotation.
  if(sceneDirty||back.some((v,i)=>v!==lastBack[i])){
   for(let i=0;i<count;i++)depths[i]=centers[i*3]*back[0]+centers[i*3+1]*back[1]+centers[i*3+2]*back[2];
   sortDepths(order,scratch,depths,overlays,counts);
   if(indexed){
    for(let i=0;i<count;i++){const v=order[i]*3;indices[i*3]=faces[v];indices[i*3+1]=faces[v+1];indices[i*3+2]=faces[v+2]}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.DYNAMIC_DRAW);
   }else{
    // WebGL without 32-bit indices retains identical geometry via a reusable vertex buffer.
    for(let i=0;i<count;i++){
     const source=order[i],to=i*27;
     for(let v=0;v<3;v++){const from=faces[source*3+v]*9;for(let j=0;j<9;j++)packed[to+v*9+j]=vertices[from+j]}
     alphas.fill(alpha[source],i*3,i*3+3);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,packed,gl.DYNAMIC_DRAW);
    if(alphaLocation>=0){gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);gl.bufferData(gl.ARRAY_BUFFER,alphas,gl.DYNAMIC_DRAW)}
   }
   sceneDirty=false;lastBack=back.slice();
  }
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  attributes.forEach((location,i)=>{gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,36,i*12)});
  if(alphaLocation>=0){gl.bindBuffer(gl.ARRAY_BUFFER,alphaBuffer);gl.enableVertexAttribArray(alphaLocation);gl.vertexAttribPointer(alphaLocation,1,gl.FLOAT,false,4,0)}
  gl.uniformMatrix4fv(viewLocation,false,view);gl.uniform3fv(backLocation,back);
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  if(indexed)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
  const render=(start,count)=>indexed?gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,start*4):gl.drawArrays(gl.TRIANGLES,start,count);
  render(0,solidVertices);
  if(solidVertices<count*3){gl.disable(gl.DEPTH_TEST);render(solidVertices,count*3-solidVertices);gl.enable(gl.DEPTH_TEST)}
  gl.depthMask(true);gl.disable(gl.BLEND);attributes.forEach(location=>gl.disableVertexAttribArray(location));
  if(alphaLocation>=0)gl.disableVertexAttribArray(alphaLocation);
 }
 return {update,draw};
}
