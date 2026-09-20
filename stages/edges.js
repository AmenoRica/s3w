// Weld by the 0.01-unit position tolerance; keep boundaries and folds over 25 degrees.
// Flat triangle diagonals and the separate ink-rail category are not outlined.
export function terrainEdges(source){
 const edges=new Map(),threshold=Math.cos(25*Math.PI/180);
 const key=v=>v.slice(0,3).map(x=>Math.round(x*100)).join(',');
 for(let i=0;i<source.length;i+=21){
  if(source[i+6]===3)continue;
  const vertices=[0,7,14].map(offset=>Array.from(source.subarray(i+offset,i+offset+7)));
  const [a,b,c]=vertices,u=b.slice(0,3).map((v,j)=>v-a[j]),v=c.slice(0,3).map((v,j)=>v-a[j]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  if(length<1e-8)continue;
  const normal=n.map(x=>x/length),keys=vertices.map(key);
  for(let j=0;j<3;j++){
   const next=(j+1)%3;if(keys[j]===keys[next])continue;
   const id=[keys[j],keys[next]].sort().join('|'),existing=edges.get(id);
   if(existing){existing.count++;if(Math.abs(existing.normal.reduce((sum,x,k)=>sum+x*normal[k],0))<threshold)existing.fold=true;}
   else edges.set(id,{a:vertices[j],b:vertices[next],normal,count:1,fold:false});
  }
 }
 // Adjacent planar regions can split the same straight edge at different points.
 // Match overlapping intervals as well as identical endpoints to remove those seams.
 const lines=new Map();
 for(const edge of edges.values()){
  if(edge.count!==1)continue;
  let direction=edge.b.slice(0,3).map((v,j)=>v-edge.a[j]);const length=Math.hypot(...direction);
  direction=direction.map(v=>v/length);const major=direction.find(v=>Math.abs(v)>.0001);if(major<0)direction=direction.map(v=>-v);
  const [x,y,z]=direction,[a,b,c]=edge.a,moment=[y*c-z*b,z*a-x*c,x*b-y*a];
  const id=[...direction.map(v=>Math.round(v*1000)),...moment.map(v=>Math.round(v*50))].join(',');
  const dot=p=>direction.reduce((sum,v,j)=>sum+v*p[j],0);
  edge.start=dot(edge.a);edge.end=dot(edge.b);edge.lo=Math.min(edge.start,edge.end);edge.hi=Math.max(edge.start,edge.end);
  if(!lines.has(id))lines.set(id,[]);lines.get(id).push(edge);
 }
 const result=[];
 for(const edge of edges.values())if(edge.fold)result.push(...edge.a,...edge.b);
 for(const group of lines.values())for(const edge of group){
  let intervals=[[edge.lo,edge.hi]];
  for(const other of group){
   if(edge===other||Math.abs(edge.normal.reduce((s,v,j)=>s+v*other.normal[j],0))<.999)continue;
   intervals=intervals.flatMap(([lo,hi])=>other.hi<=lo+.001||other.lo>=hi-.001?[[lo,hi]]:[[lo,Math.min(hi,other.lo)],[Math.max(lo,other.hi),hi]].filter(([a,b])=>b-a>.001));
  }
  for(const interval of intervals)for(const t of interval){const f=(t-edge.start)/(edge.end-edge.start);result.push(...edge.a.map((v,j)=>j<3?v+(edge.b[j]-v)*f:v));}
 }
 return new Float32Array(result);
}
