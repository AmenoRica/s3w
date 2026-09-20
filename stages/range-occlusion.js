// Solid terrain only. Build once per map; query finite segments from each sphere center.
export function createRangeOcclusion(source){
 const triangles=[];
 for(let i=0;i<source.length;i+=21){
  if(source[i+6]!==0&&source[i+6]!==1)continue;
  const a=Array.from(source.subarray(i,i+3)),b=Array.from(source.subarray(i+7,i+10)),c=Array.from(source.subarray(i+14,i+17));
  const min=a.map((v,j)=>Math.min(v,b[j],c[j])),max=a.map((v,j)=>Math.max(v,b[j],c[j]));
  triangles.push({a,normal:Array.from(source.subarray(i+3,i+6)),e1:b.map((v,j)=>v-a[j]),e2:c.map((v,j)=>v-a[j]),min,max});
 }
 function build(items){
  if(!items.length)return null;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const t of items)for(let j=0;j<3;j++){min[j]=Math.min(min[j],t.min[j]);max[j]=Math.max(max[j],t.max[j])}
  if(items.length<=8)return {min,max,items};
  const size=max.map((v,j)=>v-min[j]),axis=size.indexOf(Math.max(...size));
  items.sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis]));
  const half=items.length>>1;
  return {min,max,left:build(items.slice(0,half)),right:build(items.slice(half))};
 }
 const tree=build(triangles),epsilon=1e-4;
 function blocked(origin,direction,distance,ceiling=Infinity){
  function intersects(node){
   if(!node)return false;
   let near=-epsilon,far=distance-epsilon;
   for(let j=0;j<3;j++){
    if(Math.abs(direction[j])<1e-12){if(origin[j]<node.min[j]-epsilon||origin[j]>node.max[j]+epsilon)return false;continue}
    let a=(node.min[j]-epsilon-origin[j])/direction[j],b=(node.max[j]+epsilon-origin[j])/direction[j];
    if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
   }
   if(!node.items)return intersects(node.left)||intersects(node.right);
   for(const {a,normal,e1,e2} of node.items){
    const [dx,dy,dz]=direction;
    const px=dy*e2[2]-dz*e2[1],py=dz*e2[0]-dx*e2[2],pz=dx*e2[1]-dy*e2[0];
    const det=e1[0]*px+e1[1]*py+e1[2]*pz;if(Math.abs(det)<1e-10)continue;
    const ox=origin[0]-a[0],oy=origin[1]-a[1],oz=origin[2]-a[2];
    const u=(ox*px+oy*py+oz*pz)/det;if(u< -1e-7||u>1+1e-7)continue;
    const qx=oy*e1[2]-oz*e1[1],qy=oz*e1[0]-ox*e1[2],qz=ox*e1[1]-oy*e1[0];
    const v=(dx*qx+dy*qy+dz*qz)/det;if(v< -1e-7||u+v>1+1e-7)continue;
    const t=(e2[0]*qx+e2[1]*qy+e2[2]*qz)/det;
    if(origin[1]+direction[1]*t>=ceiling)continue;
    // At the supporting surface, only rays entering its back side are blocked.
    // Use the supplied surface normal; outgoing rays must not self-shadow.
    if(t<distance-epsilon&&(t>epsilon||(t>=-epsilon&&dx*normal[0]+dy*normal[1]+dz*normal[2]<-1e-7)))return true;
   }
   return false;
  }
  return intersects(tree);
 }
 // Nearest walkable solid surface vertically below this sphere point.
 // No ground (off the map) keeps the ordinary range color.
 blocked.groundBlocked=(origin,point)=>{
  let groundY=-Infinity;
  function below(node){
   if(!node||point[0]<node.min[0]-epsilon||point[0]>node.max[0]+epsilon||point[2]<node.min[2]-epsilon||point[2]>node.max[2]+epsilon||node.min[1]>point[1]+epsilon||node.max[1]<groundY)return;
   if(!node.items){below(node.left);below(node.right);return}
   for(const {a,normal,e1,e2} of node.items){
    if(normal[1]<=.3)continue;
    const det=e1[0]*e2[2]-e1[2]*e2[0];if(Math.abs(det)<1e-10)continue;
    const x=point[0]-a[0],z=point[2]-a[2];
    const u=(x*e2[2]-z*e2[0])/det,v=(e1[0]*z-e1[2]*x)/det;
    if(u< -1e-7||v< -1e-7||u+v>1+1e-7)continue;
    const y=a[1]+u*e1[1]+v*e2[1];
    if(y<=point[1]+epsilon&&y>groundY)groundY=y;
   }
  }
  below(tree);if(!Number.isFinite(groundY))return false;
  const delta=[point[0]-origin[0],groundY-origin[1],point[2]-origin[2]],distance=Math.hypot(...delta);
  return distance>epsilon&&blocked(origin,delta.map(v=>v/distance),distance);
 };
 return blocked;
}
