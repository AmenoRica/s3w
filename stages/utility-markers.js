import {inverseMatrix,transform,sphereTriangles} from './range-math.js';

// Same v11.3.0 data revision as data.js. Distances are native map units.
export const utilitySource='https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon';
export const utilityMarkers=[
 {key:'Bomb_Quick',type:'sub',shape:'blast',radius:4,innerRadius:2.8,damage:[35,25],field:'WeaponBombQuick.BlastParam.DistanceDamage'},
 {key:'SpPogo',type:'special',shape:'pogo',radius:9.6,innerRadius:6.4,damage:[220,60],fistDistance:6.54,directional:true,field:'WeaponSpPogo.BlastParamNormal / BulletParam.MoveDistance'},
 {key:'SpBlower',type:'special',shape:'vacuum',length:15,nearRadius:.8,farRadius:3.3,height:1.65,directional:true,field:'WeaponSpBlower.InhaleParam.LengthMax / RadiusMin / RadiusMax'},
 {key:'SpFirework',type:'special',shape:'sphere',radius:6,field:'WeaponSpFirework.IceParam.BlastParam.DistanceDamage[1].Distance'},
 {key:'SpChariot',type:'special',shape:'shot',radius:4.8,shotRange:28,rapidRange:28.5,directional:true,field:'WeaponSpChariot.CannonParam.BlastParam',source:'https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/カニタンク'},
 {key:'Bomb_Splash',type:'sub',shape:'sphere',radius:7,field:'WeaponBombSplash.BlastParam.DistanceDamage[1].Distance'},
 {key:'Bomb_Suction',type:'sub',shape:'sphere',radius:8,field:'WeaponBombSuction.BlastParam.DistanceDamage[1].Distance'},
 {key:'Bomb_Curling',type:'sub',shape:'curling',radius:5,maxRadius:8,minTravel:5,railLength:34.5,maxChargeFrames:60,directional:true,field:'WeaponBombCurling.BlastParamMinCharge / BlastParamMaxCharge / WeaponParam.MaxChargeFrame',source:'https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/カーリングボム'},
 {key:'Bomb_Fizzy',type:'sub',shape:'fizzy',blastRadii:[3.8,4.5,5.45],step:1.5,directional:true,field:'WeaponBombFizzy.MoveParam.BlastParamArray',source:'https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/タンサンボム'},
 {key:'Bomb_Robot',type:'sub',shape:'sphere',radius:6.5,sensorRadius:12.5,sensorAlpha:.22,field:'WeaponBombRobot.BlastParam / v11.2.0 BulletBombRobot_Search.Cylinder.Radius'},
 {key:'Bomb_Torpedo',type:'sub',shape:'sphere',radius:6,field:'WeaponBombTorpedo.BlastParamChase.DistanceDamage[1].Distance'},
 {key:'Shield',type:'sub',shape:'plane',width:4.5,height:4,directional:true,field:'v11.2.0 BulletShield_Shield.Box.HalfExtents'},
 {key:'Beacon',type:'sub',shape:'none'},
 {key:'SpGreatBarrier',type:'special',shape:'sphere',radius:7.5,field:'spl__BulletSpGreatBarrierMoveParam.BarrierParam.MaxRadius'},
 {key:'SpEnergyStand',type:'special',shape:'none'},
 {key:'PoisonMist',type:'sub',shape:'sphere',radius:5.4,field:'AreaParam.DistanceForOff'},
 {key:'Sprinkler',type:'sub',shape:'none'},
 {key:'SpTripleTornado',type:'special',shape:'cylinder',radius:7.7,height:20,field:'BlastParam.DamageRadiusEnd / DamageHeightUp'},
 {key:'SpNiceBall',type:'special',shape:'sphere',radius:12.6,field:'BlastParam.DamageRadiusEnd'},
 // Flat approximation of the curved screen: measured span 5.4 lines, height 1.8 lines.
 {key:'SpChimney',type:'special',shape:'plane',width:27,height:9,directional:true,source:'https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート'},
 {key:'SpInkStorm',type:'special',shape:'storm',radius:10,height:20,travel:35,directional:true,field:'CloudParam.DamageRadius',source:'https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/アメフラシ'},
 {key:'SpSkewer',type:'special',shape:'reef',radius:14.9,lethalRadius:9,railLength:25,directional:true,field:'BulletBlastParam.DistanceDamage'},
 {key:'Trap',type:'sub',shape:'sphere',radius:8,sensorRadius:3,field:'BlastParam.DistanceDamage[1].Distance / MoveParam.SensorRadius.Low'},
 {key:'PointSensor',type:'sub',shape:'sphere',radius:6,field:'AreaParam.Distance.Low'},
 {key:'SpShockSonar',type:'special',shape:'circle',radius:20,field:'spl__BulletSpShockSonarParam.WaveParam.MaxRadius.Low'},
];
export const utilityByKey=new Map(utilityMarkers.map(item=>[item.key,item]));
// Low / Mid / High from utilitySource. Only properties already visualized here.
const gearCurves={
 SpPogo:{blastScale:[1,1.05,1.1]},
 SpFirework:{blastScale:[1,1.1,1.2]},
 SpBlower:{nearRadius:[.8,1.1,1.4],farRadius:[3.3,3.8,4.3]},
 Trap:{sensorRadius:[3,3.5,4],blastScale:[1,1.1875,1.375]},
 SpShockSonar:{radius:[20,24,27]},
 SpSkewer:{blastScale:[1,1.1,1.2]},
 SpInkStorm:{rainFrames:[480,540,600]},
};
export const hasGearGeometry=key=>key==='Bomb_Curling'||Object.hasOwn(gearCurves,key);
export const normalizeGearAP=value=>Number.isFinite(value)?Math.max(0,Math.min(57,Math.round(value))):0;
// sendou.ink build-analyzer/core/utils.ts: AP percentage and Low/Mid/High curve.
export function gearValue(ap,[low,mid,high]){
 const points=normalizeGearAP(ap),fraction=Math.min(3.3*points-.027*points*points,100)/100;
 if(low===high||fraction===0)return low;
 if(fraction===1)return high;
 return low+(high-low)*Math.pow(fraction,-Math.log2((mid-low)/(high-low)));
}
export function utilityForPlacement(item){
 const base=utilityByKey.get(item.key),curves=gearCurves[item.key],ap=normalizeGearAP(item.gearAP);
 if(base?.shape==='curling'){
  const {min,max}=curlingLimits(ap),distance=item.position&&item.start?routeDistance(item.position,item.start,true):max;
  const charge=Math.max(0,Math.min(1,(max-distance)/(max-min)));
  return {...base,railLength:max,minTravel:min,travel:distance,chargeFrames:charge*base.maxChargeFrames,radius:base.radius+(base.maxRadius-base.radius)*charge};
 }
 if(!base||!curves||!ap)return base;
 const marker={...base};
 if(curves.sensorRadius)marker.sensorRadius=gearValue(ap,curves.sensorRadius);
 if(curves.radius)marker.radius=gearValue(ap,curves.radius);
 for(const field of ['nearRadius','farRadius'])if(curves[field])marker[field]=gearValue(ap,curves[field]);
 if(curves.blastScale){const scale=gearValue(ap,curves.blastScale);marker.radius*=scale;if(marker.lethalRadius)marker.lethalRadius*=scale;if(marker.innerRadius)marker.innerRadius*=scale}
 // Keep the existing approximate 35-unit route, scaled by rain duration.
 if(curves.rainFrames)marker.travel=base.travel*gearValue(ap,curves.rainFrames)/curves.rainFrames[0];
 return marker;
}
export const utilityIcon=marker=>`../assets/${marker.type==='sub'?'Wsb':'Wsp'}_${marker.key}00.png`;
export const hasRoute=marker=>marker?.shape==='reef'||marker?.shape==='curling';
export const routeDistance=(a,b,horizontal=false)=>Math.hypot(a[0]-b[0],horizontal?0:a[1]-b[1],a[2]-b[2]);
// ponytail: linear estimate between published flat-ground endpoints; replace with measured samples if available.
export function curlingLimits(ap=0){const scale=gearValue(ap,[.4,.46,.52])/.4,base=utilityByKey.get('Bomb_Curling');return {min:base.minTravel*scale,max:base.railLength*scale}}
export function fitCurlingStart(item){
 const marker=utilityForPlacement(item),start=reefStart(item,marker),distance=routeDistance(item.position,start,true),length=Math.max(marker.minTravel,Math.min(marker.railLength,distance));
 if(distance===length)return;
 item.start=distance>0?start.map((v,i)=>i===1?v:item.position[i]+(v-item.position[i])*length/distance):[item.position[0],start[1],item.position[2]-length];
}
export const directionLength=marker=>marker.shotRange||marker.length||(marker.radius||4)+3;
export function reefStart(item,marker){return item.start||[item.position[0],item.position[1],item.position[2]-marker.railLength]}
export function markerPosition(item,marker){return item.position.map((v,i)=>v+(i===1&&marker?.shape==='storm'?marker.height:0))}
export function stormDestination(item,marker){const a=item.angle||0;return [item.position[0]+Math.sin(a)*marker.travel,item.position[1]+flatRangeLift,item.position[2]+Math.cos(a)*marker.travel]}
export function directionPoint(item,marker){if(hasRoute(marker))return reefStart(item,marker).map((v,i)=>v+(i===1?flatRangeLift:0));const a=item.angle||0,l=directionLength(marker);return [item.position[0]+Math.sin(a)*l,item.position[1]+flatRangeLift+.04+(marker.shape==='storm'?marker.height:0),item.position[2]+Math.cos(a)*l]}

// Intersect with the marker's horizontal plane; direction does not depend on terrain height.
export function directionAngle(position,view,x,y,width,height,lift=flatRangeLift+.04){
 const inverse=inverseMatrix(view);if(!inverse||!width||!height)return null;
 const a=transform([2*x/width-1,1-2*y/height,-1],inverse),b=transform([2*x/width-1,1-2*y/height,1],inverse);
 const dy=b[1]-a[1];if(Math.abs(dy)<1e-8)return null;
 const t=(position[1]+lift-a[1])/dy;if(t<0||t>1)return null;
 const dx=a[0]+(b[0]-a[0])*t-position[0],dz=a[2]+(b[2]-a[2])*t-position[2];
 return Math.hypot(dx,dz)<.1?null:Math.atan2(dx,dz);
}
export function createDirectionDrag({angleAt,changed,committed=()=>{}}){
 let drag=null;
 function end(commit=false){if(!drag)return;const d=drag;drag=null;if(!commit){d.item.angle=d.origin;changed()}if(d.node.hasPointerCapture(d.id))d.node.releasePointerCapture(d.id);if(commit)committed()}
 function move(e){if(!drag||drag.id!==e.pointerId)return;const angle=angleAt(drag.item,e);if(angle!==null){drag.item.angle=angle;changed()}}
 function bind(node,item){
  node.onpointerdown=e=>{if(e.button!==0||e.isPrimary===false)return;e.preventDefault();e.stopPropagation();end();node.focus({preventScroll:true});drag={node,item,id:e.pointerId,origin:item.angle||0};node.setPointerCapture(e.pointerId)};
  node.onpointermove=move;node.onpointerup=e=>{if(drag?.id===e.pointerId){move(e);end(true)}};
  node.onpointercancel=node.onlostpointercapture=e=>{if(drag?.id===e.pointerId)end()};
  node.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();item.angle=(item.angle||0)+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1)*Math.PI/12;changed();committed()}};
 }
 return {bind,cancel:()=>end(),active:()=>!!drag};
}

export const flatRangeLift=.35;
const sphere=sphereTriangles(48,24),tint=[.18,.65,1];
export function utilityTriangles(item,marker){
 const triangles=[],angle=item.angle||0,c=Math.cos(angle),s=Math.sin(angle);
 const lift=marker.shape==='circle'||marker.shape==='plane'?flatRangeLift:0;
 const world=([x,y,z])=>[item.position[0]+x*c+z*s,item.position[1]+y+lift,item.position[2]-x*s+z*c];
 const add=(points,n=[0,1,0],alpha=1,overlay=false)=>{const vertices=points.map(p=>[...world(p),...n,...tint]);triangles.push({vertices,alpha,overlay,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)})};
 const globe=(center,radius,color=tint,alpha=1)=>{
  const origin=world(center);
  for(const face of sphere){const vertices=face.map(n=>[...n.map((v,i)=>origin[i]+v*radius),...n,...color]);triangles.push({vertices,alpha,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)})}
 };
 const blast=center=>{globe(center,marker.radius,tint,marker.innerRadius?.3:.7);if(marker.innerRadius)globe(center,marker.innerRadius,[.73,.60,1],.7)};
 if(marker.shape==='blast')blast([0,0,0]);
 if(marker.shape==='pogo'){
  const d=marker.fistDistance/Math.sqrt(2); // Flat, unobstructed 45-degree formation approximation.
  for(const point of [[0,0,0],[-d,0,d],[d,0,d]])blast(point);
 }
 if(marker.shape==='shot'){
  // Match ordinary range visibility; the old .12 multiplier hid rapid fire on terrain.
  globe([0,0,0],marker.rapidRange,[.33,.88,.74],1);
  blast([0,0,marker.shotRange]);
 }
 if(marker.shape==='vacuum'){
  for(let i=0;i<64;i++){
   const a=i*Math.PI/32,b=(i+1)*Math.PI/32,point=(angle,r,z)=>[Math.cos(angle)*r,marker.height+Math.sin(angle)*r,z],p=point(a,marker.nearRadius,0),q=point(b,marker.nearRadius,0),u=point(a,marker.farRadius,marker.length),v=point(b,marker.farRadius,marker.length);
   const n0=[Math.cos((a+b)/2),Math.sin((a+b)/2),-(marker.farRadius-marker.nearRadius)/marker.length],n=[n0[0]*c+n0[2]*s,n0[1],-n0[0]*s+n0[2]*c];
   add([p,q,u],n,.6);add([q,v,u],n,.6);add([[0,marker.height,0],q,p],[s,0,c],.25);add([[0,marker.height,marker.length],u,v],[s,0,c],.25);
  }
 }
 if(marker.shape==='sphere'||marker.shape==='curling')for(const face of sphere){const vertices=face.map(n=>[...n.map((v,i)=>item.position[i]+v*marker.radius),...n,...tint]);triangles.push({vertices,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)})}
 if(marker.sensorRadius)for(const face of sphere){const vertices=face.map(n=>[...n.map((v,i)=>item.position[i]+v*marker.sensorRadius),...n,.33,.88,.74]);triangles.push({vertices,alpha:marker.sensorAlpha??1,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)})}
 if(marker.shape==='fizzy')for(const [index,radius] of marker.blastRadii.entries())for(const face of sphere){
  const center=world([0,0,index*marker.step]),vertices=face.map(n=>[...n.map((v,i)=>center[i]+v*radius),...n,...tint]);triangles.push({vertices,alpha:.5,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)});
 }
 if(marker.shape==='cylinder')for(let i=0;i<96;i++){
  const a=i*Math.PI/48,b=(i+1)*Math.PI/48,r=marker.radius,h=marker.height;
  const p=[Math.cos(a)*r,0,Math.sin(a)*r],q=[Math.cos(b)*r,0,Math.sin(b)*r],up=v=>[v[0],h,v[2]],n=[Math.cos((a+b)/2),0,Math.sin((a+b)/2)];
  add([p,q,up(p)],n);add([q,up(q),up(p)],n);add([[0,h,0],up(p),up(q)]);add([[0,0,0],q,p],[0,-1,0]);
 }
 if(marker.shape==='circle')for(let i=0;i<96;i++){
  const a=i*Math.PI/48,b=(i+1)*Math.PI/48,r=marker.radius;
  add([[0,0,0],[Math.cos(a)*r,0,Math.sin(a)*r],[Math.cos(b)*r,0,Math.sin(b)*r]]);
  const p=[Math.cos(a)*r,.02,Math.sin(a)*r],q=[Math.cos(b)*r,.02,Math.sin(b)*r],inner=v=>[v[0]*(r-.15)/r,.02,v[2]*(r-.15)/r];
  add([p,q,inner(p)],[1,0,0]);add([q,inner(q),inner(p)],[1,0,0]);
 }
 if(marker.shape==='plane'){
  const w=marker.width/2,h=marker.height,n=[s,0,c];
  add([[-w,0,0],[w,0,0],[-w,h,0]],n);add([[w,0,0],[w,h,0],[-w,h,0]],n);
  // A thin footprint keeps the upright plane legible in the default top-down view.
  add([[-w,.02,-.12],[w,.02,-.12],[-w,.02,.12]],n);add([[w,.02,-.12],[w,.02,.12],[-w,.02,.12]],n);
 }
 if(marker.shape==='storm'){
  const r=marker.radius,h=marker.height,base=flatRangeLift;
  for(let i=0;i<96;i++){
   const a=i*Math.PI/48,b=(i+1)*Math.PI/48,p=[Math.cos(a)*r,base,Math.sin(a)*r],q=[Math.cos(b)*r,base,Math.sin(b)*r],up=v=>[v[0],h,v[2]],n=[Math.cos((a+b)/2),0,Math.sin((a+b)/2)];
   add([p,q,up(p)],n);add([q,up(q),up(p)],n);
   add([[0,h,0],up(p),up(q)],[0,1,0]);
   // Destination cylinder matches the source height and radius, with a fainter tint.
   const target=v=>[v[0],v[1],v[2]+marker.travel];
   add([target(p),target(q),target(up(p))],n,.22);add([target(q),target(up(q)),target(up(p))],n,.22);
   add([[0,h,marker.travel],target(up(p)),target(up(q))],[0,1,0],.22);
   const inner=v=>[v[0]*(r-.2)/r,base+.02,v[2]*(r-.2)/r];
   add([target(p),target(q),target(inner(p))],[1,0,0],.55);add([target(q),target(inner(q)),target(inner(p))],[1,0,0],.55);
  }
  // Dashed center line links the current cloud to its maximum travel footprint.
  for(let z=0;z<marker.travel;z+=2.5){const end=Math.min(z+1.2,marker.travel),y=base+.04;add([[-.12,y,z],[.12,y,z],[-.12,y,end]],[1,0,0],.5);add([[.12,y,z],[.12,y,end],[-.12,y,end]],[1,0,0],.5)}
 }
 if(marker.shape==='reef'){
  for(const [r,color,alpha] of [[marker.radius,tint,.16],[marker.lethalRadius,[.73,.60,1],.85]])for(const face of sphere){
   const vertices=face.map(n=>[...n.map((v,i)=>item.position[i]+v*r),...n,...color]);triangles.push({vertices,alpha,center:[0,1,2].map(i=>vertices.reduce((v,p)=>v+p[i],0)/3)});
  }
 }
 if(hasRoute(marker)){
  const start=reefStart(item,marker),offset=start.map((v,i)=>v-item.position[i]),delta=[offset[0]*c-offset[2]*s,offset[1],offset[0]*s+offset[2]*c],length=Math.hypot(delta[0],delta[2]);
  if(length>.01){
   // Two straight rails plus cross ties. The endpoints may have different heights.
   const side=[-delta[2]/length,0,delta[0]/length];
   const point=(t,offset)=>delta.map((v,i)=>v*t+side[i]*offset+(i===1?flatRangeLift:0));
   for(const offset of [-.65,.65]){add([point(0,offset-.16),point(1,offset-.16),point(0,offset+.16)],[0,1,0],1.5,true);add([point(1,offset-.16),point(1,offset+.16),point(0,offset+.16)],[0,1,0],1.5,true)}
   const count=Math.min(150,Math.ceil(length/1.5));for(let i=0;i<count;i++){const t=i/count,u=Math.min(1,t+.15/length);add([point(t,-.8),point(u,-.8),point(t,.8)],[0,1,0],1.3,true);add([point(u,-.8),point(u,.8),point(t,.8)],[0,1,0],1.3,true)}
  }
 }
 if(marker.directional&&!hasRoute(marker)){
  const l=directionLength(marker),y=.04+(marker.shape==='storm'?marker.height:0);
  add([[-.16,y,0],[.16,y,0],[-.16,y,l-1.2]],[1,0,0]);add([[.16,y,0],[.16,y,l-1.2],[-.16,y,l-1.2]],[1,0,0]);
  add([[-.85,y,l-1.2],[.85,y,l-1.2],[0,y,l]],[1,0,0]);
 }
 return triangles;
}
