import {t} from './i18n.js?v=20260919-l10n-2';
// Screen-space annotations use the terrain's exact view matrix, including pan/zoom.
export function projectPoint(point,matrix,width,height){
 const [x,y,z]=point;
 const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
 return [((matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w+1)*width/2,
         (1-(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w)*height/2];
}
// Split once in world space so camera movement cannot change the dash phase.
export function dashPath(points,dash=1.5,gap=1){
 const segments=[],period=dash+gap;let distance=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(...b.map((v,j)=>v-a[j]));
  if(!length)continue;
  const end=distance+length;
  for(let k=Math.floor(distance/period);k*period<end;k++){
   const start=Math.max(distance,k*period),stop=Math.min(end,k*period+dash);
   if(stop>start)segments.push([start,stop].map(d=>a.map((v,j)=>v+(b[j]-v)*(d-distance)/length)));
  }
  distance=end;
 }
 return segments;
}
export function createObjectives(svg){
 if(!svg)return {show(){},clear(){},draw(){}};
 const ns='http://www.w3.org/2000/svg';let shapes=[],markers=[],currentData;
 function element(tag,attrs={}){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);return node}
 function color(team){return team==='Alpha'?'#ffb56b':team==='Bravo'?'#baabff':'#ffe16b'}
 function clear(){currentData=null;svg.replaceChildren();shapes=[];markers=[];svg.setAttribute('hidden','')}
 function show(data){
  clear();currentData=data;if(!data)return;svg.removeAttribute('hidden');
  for(const area of data.areas){
   const node=element('polygon',{fill:'#ffe16b','fill-opacity':'.12',stroke:'#ffe16b','stroke-width':1.75,'stroke-linejoin':'round'});svg.append(node);shapes.push({node,points:area.points});
  }
  for(const path of data.paths){
   const segments=dashPath(path.points);
   const outline=element('path',{fill:'none',stroke:'#121a25','stroke-width':3.5,'stroke-linejoin':'round'});
   const node=element('path',{fill:'none',stroke:color(path.team),'stroke-width':1.75,'stroke-linejoin':'round'});
   svg.append(outline,node);shapes.push({node:outline,segments},{node,segments});
  }
  for(const marker of data.markers){
   const group=element('g',{'class':'objective-marker'}),tint=color(marker.kind==='zone'?'Neutral':marker.team),numeric=/^\d+$/.test(marker.label);
   const title=element('title');title.textContent=numeric?t('타워 관문 {n}',{n:marker.label}):t(marker.label);group.append(title);
   if(numeric){
    group.append(element('circle',{r:10,fill:'#121a25',stroke:tint,'stroke-width':2}));
   }else{
    const width=t(marker.label).length*11+16;
    group.append(element('line',{x1:0,y1:0,x2:0,y2:-12,stroke:tint,'stroke-width':2}),element('circle',{r:3,fill:tint,stroke:'#121a25','stroke-width':1.5}),element('rect',{x:-width/2,y:-32,width,height:20,rx:5,fill:'#121a25',stroke:tint,'stroke-width':1.5}));
   }
   const text=element('text',{x:0,y:numeric?0:-22,fill:tint,'text-anchor':'middle','dominant-baseline':'central'});text.textContent=t(marker.label);group.append(text);svg.append(group);markers.push({node:group,position:marker.position});
  }
 }
 function draw(matrix,width,height){
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  for(const shape of shapes){
   const project=p=>projectPoint(p,matrix,width,height).join(',');
   if(shape.segments)shape.node.setAttribute('d',shape.segments.map(([a,b])=>`M${project(a)}L${project(b)}`).join(' '));
   else shape.node.setAttribute('points',shape.points.map(project).join(' '));
  }
  for(const marker of markers){const [x,y]=projectPoint(marker.position,matrix,width,height);marker.node.setAttribute('transform',`translate(${x},${y}) scale(1.2)`)}
 }
 document.addEventListener('localizationchange',()=>{const positions=markers.map(marker=>marker.node.getAttribute('transform'));show(currentData);markers.forEach((marker,i)=>{if(positions[i])marker.node.setAttribute('transform',positions[i])})});
 return {show,clear,draw};
}
