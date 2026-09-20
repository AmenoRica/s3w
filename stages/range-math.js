// Pure map picking and data checks. Coordinates are the original S3 world units.
export function validateRanges(data,weapons){
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.sort().join();
 if(!exact(data,['formatVersion','sourceVersion','checkedAt','sourceUrl','unitSourceUrl','worldUnitsPerLine','actors'])||data.formatVersion!==1||data.worldUnitsPerLine!==5)throw Error('사거리 데이터 형식이 올바르지 않습니다.');
 for(const field of ['sourceVersion','checkedAt','sourceUrl','unitSourceUrl'])if(typeof data[field]!=='string'||!data[field])throw Error(`사거리 출처 누락: ${field}`);
 for(const field of ['sourceUrl','unitSourceUrl'])if(new URL(data[field]).protocol!=='https:')throw Error('잘못된 사거리 출처 주소');
 const actors=new Set(weapons.map(w=>w.actor));
 if(!data.actors||Array.isArray(data.actors)||Object.keys(data.actors).length!==actors.size)throw Error('무기 사거리 목록이 일치하지 않습니다.');
 for(const [actor,ranges] of Object.entries(data.actors)){
  if(!actors.has(actor)||!Array.isArray(ranges)||ranges.length<1||ranges.length>2)throw Error(`무기 사거리 참조 오류: ${actor}`);
  const labels=new Set();
  for(const range of ranges){
   if(!exact(range,['label','lines'])||typeof range.label!=='string'||!range.label.trim()||labels.has(range.label)||!Number.isFinite(range.lines)||range.lines<=0)throw Error(`잘못된 사거리: ${actor}`);
   labels.add(range.label);
  }
 }
 return data;
}
export function inverseMatrix(matrix){
 const rows=Array.from({length:4},(_,i)=>[...Array.from({length:4},(_,j)=>matrix[j*4+i]),...Array.from({length:4},(_,j)=>+(i===j))]);
 for(let col=0;col<4;col++){
  let pivot=col;for(let row=col+1;row<4;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  if(Math.abs(rows[pivot][col])<1e-12)return null;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const divisor=rows[col][col];rows[col]=rows[col].map(v=>v/divisor);
  for(let row=0;row<4;row++)if(row!==col){const factor=rows[row][col];rows[row]=rows[row].map((v,j)=>v-factor*rows[col][j])}
 }
 return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);
}
export function transform(point,matrix){
 const p=[...point,1],v=Array.from({length:4},(_,i)=>p.reduce((s,x,j)=>s+x*matrix[j*4+i],0));
 return v.slice(0,3).map(x=>x/v[3]);
}
export function pickTerrain(source,matrix,x,y,width,height,{water=-Infinity,ceiling=Infinity}={}){
 if(width<=0||height<=0||!source.length)return null;
 const inverse=inverseMatrix(matrix);if(!inverse)return null;
 const near=transform([2*x/width-1,1-2*y/height,-1],inverse),far=transform([2*x/width-1,1-2*y/height,1],inverse);
 const dx=far[0]-near[0],dy=far[1]-near[1],dz=far[2]-near[2];
 let closest=Infinity,result=null;
 // Pointer motion visits every triangle: use scalars to avoid per-triangle temporary arrays.
 for(let i=0;i<source.length;i+=21){
  const ax=source[i],ay=source[i+1],az=source[i+2];
  const e1x=source[i+7]-ax,e1y=source[i+8]-ay,e1z=source[i+9]-az;
  const e2x=source[i+14]-ax,e2y=source[i+15]-ay,e2z=source[i+16]-az;
  const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x;
  const det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<1e-9)continue;
  const ox=near[0]-ax,oy=near[1]-ay,oz=near[2]-az;
  const u=(ox*px+oy*py+oz*pz)/det;if(u< -1e-7||u>1+1e-7)continue;
  const qx=oy*e1z-oz*e1y,qy=oz*e1x-ox*e1z,qz=ox*e1y-oy*e1x;
  const v=(dx*qx+dy*qy+dz*qz)/det;if(v< -1e-7||u+v>1+1e-7)continue;
  const t=(e2x*qx+e2y*qy+e2z*qz)/det;if(t<0||t>1||t>=closest)continue;
  const height=near[1]+dy*t;if(height>=ceiling)continue;
  closest=t;
  // Walls still occlude placement: accept only the nearest visible walkable surface.
  const normalY=(source[i+4]+source[i+11]+source[i+18])/3;
  result=normalY>.3&&height>=water&&source[i+6]!==3?[near[0]+dx*t,height,near[2]+dz*t]:null;
 }
 return result;
}
export function sphereTriangles(longitudes=32,latitudes=16){
 const point=(i,j)=>{const a=i*Math.PI/latitudes,b=j*2*Math.PI/longitudes;return [Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)]};
 const triangles=[];
 for(let i=0;i<latitudes;i++)for(let j=0;j<longitudes;j++){
  const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);
  if(i>0)triangles.push([a,b,d]);if(i<latitudes-1)triangles.push([b,c,d]);
 }
 return triangles;
}
