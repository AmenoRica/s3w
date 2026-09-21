import {projectPoint} from './objectives.js?v=20260919-l10n-2';
import {t} from './i18n.js?v=20260919-l10n-2';

// Same horizontal-distance approximation as gear/core.js: 12–20 cells, 5 units/cell.
export function penaltyCircle([x,y,z], radius) {
 return Array.from({length:128},(_,i)=>[x+radius*Math.cos(i*Math.PI/64),y,z+radius*Math.sin(i*Math.PI/64)]);
}
export function createStealthJump(root,schedule) {
 const svg=root.querySelector('#stealth-jump-overlay'),toggle=root.querySelector('#stealth-jump-toggle');
 if(!svg||!toggle)return {show(){},clear(){},draw(){}};
 let spawns=[],rings=[],centers=[],enabled=false;
 const element=(tag,attrs)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);return node};
 function visibility(){svg.toggleAttribute('hidden',!enabled||!spawns.length);toggle.setAttribute('aria-pressed',String(enabled));}
 toggle.onclick=()=>{enabled=!enabled;visibility();schedule()};
 function clear(){spawns=[];rings=[];centers=[];svg.replaceChildren();toggle.disabled=true;visibility()}
 function show(data){
  clear();spawns=data||[];toggle.hidden=!spawns.length;toggle.disabled=!spawns.length;
  for(const spawn of spawns){
   const color=spawn.team==='Alpha'?'#ffb56b':'#baabff';
   const other=spawns.find(item=>item.team!==spawn.team);
   const angle=Math.atan2(other.position[2]-spawn.position[2],other.position[0]-spawn.position[0])+.55;
   for(const radius of [60,100]){
    const node=element('polygon',{fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':radius===100?'7 5':'none','stroke-linejoin':'round'});
    const key=radius===60?'스텔스 점프 페널티 시작':'스텔스 점프 페널티 최대';
    const label=element('text',{fill:color,stroke:'#121a25','stroke-width':4,'paint-order':'stroke','stroke-linejoin':'round','font-size':12,'font-weight':600,'font-family':'system-ui, sans-serif','text-anchor':'middle',dy:-7,'data-l10n':key});
    label.textContent=t(key);
    svg.append(node);svg.append(label);
    rings.push({node,label,position:[spawn.position[0]+radius*Math.cos(angle),spawn.position[1],spawn.position[2]+radius*Math.sin(angle)],points:penaltyCircle(spawn.position,radius)});
   }
   const node=element('circle',{r:5,fill:color,stroke:'#121a25','stroke-width':2});svg.append(node);centers.push({node,position:spawn.position});
  }
  visibility();
 }
 function draw(matrix,width,height){
  if(!enabled||!spawns.length)return;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  for(const ring of rings){
   ring.node.setAttribute('points',ring.points.map(p=>projectPoint(p,matrix,width,height).join(',')).join(' '));
   const [x,y]=projectPoint(ring.position,matrix,width,height);ring.label.setAttribute('x',x);ring.label.setAttribute('y',y);
  }
  for(const center of centers){const [x,y]=projectPoint(center.position,matrix,width,height);center.node.setAttribute('cx',x);center.node.setAttribute('cy',y)}
 }
 return {show,clear,draw};
}
