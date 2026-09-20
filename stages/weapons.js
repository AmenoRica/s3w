import {encodeMarkers,decodeMarkers} from './marker-share.js?v=20260920-specials-v2';
import {t,localizedText} from './i18n.js?v=20260919-l10n-2';
import {validateRanges,transform,inverseMatrix} from './range-math.js';
import {markerOccluded,markerScale} from './marker-visibility.js';
import {createRangeRenderer} from './range-renderer.js?v=20260920-specials-v2';
import {createRangeOcclusion} from './range-occlusion.js?v=20260919-range-brightness-v3';
import {utilityMarkers,utilityByKey,utilityForPlacement,utilityIcon,directionPoint,directionAngle,createDirectionDrag,markerPosition,reefStart,hasRoute,routeDistance,fitCurlingStart} from './utility-markers.js?v=20260920-live-url';
import {createMarkerSettings} from './marker-settings.js?v=20260920-specials-v2';
// A drag previews valid terrain positions, committing only a valid drop.
export function createWeaponDrag({canvas,pick,changed,selected=()=>{},outside=()=>false,removed=()=>{},committed=()=>{},constrain=(_item,point)=>point}){
 let drag=null;
 function end(commit=false){
  if(!drag)return;
  const current=drag;drag=null;
  const deleting=commit&&current.moved&&current.outside;
  if(!deleting&&(!commit||!current.valid)){current.item.position=current.origin;changed()}
  if(commit&&!current.moved)selected(current.item);
  current.node.classList.remove('dragging');
  current.node.classList.remove('delete-pending');
  if(current.node.hasPointerCapture(current.pointerId))current.node.releasePointerCapture(current.pointerId);
  if(deleting)removed(current.item);
  else if(commit&&current.moved&&current.valid)committed();
 }
 function move(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
  drag.moved=true;
  const rect=canvas.getBoundingClientRect();
  const x=event.clientX-rect.left-drag.offsetX-(drag.item.dragOffset?.[0]||0),y=event.clientY-rect.top-drag.offsetY-(drag.item.dragOffset?.[1]||0);
  drag.outside=outside(x,y,event);
  if(drag.outside)drag.node.classList.add('delete-pending');else drag.node.classList.remove('delete-pending');
  const point=drag.outside?null:pick(x,y);
  drag.valid=!!point;
  if(point){drag.item.position=constrain(drag.item,point);changed()}
 }
 function bind(node,item){
  node.onpointerdown=event=>{
   if(event.button!==0||event.isPrimary===false)return;
   end();event.preventDefault();node.focus({preventScroll:true});
   const rect=node.getBoundingClientRect();
   drag={node,item,pointerId:event.pointerId,origin:item.position.slice(),x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left-rect.width/2,offsetY:event.clientY-rect.top-rect.height/2,moved:false,valid:true};
   node.setPointerCapture(event.pointerId);node.classList.add('dragging');
  };
  node.onpointermove=move;
  node.onpointerup=event=>{if(drag?.pointerId===event.pointerId){move(event);end(true)}};
  node.onpointercancel=node.onlostpointercapture=event=>{if(drag?.pointerId===event.pointerId)end()};
 }
 return {bind,cancel:()=>end(),active:()=>!!drag};
}
// Search outward from the fixed endpoint so a capped rail follows the pointer direction.
export function constrainTerrainDrag(point,{current,anchor,maxDistance,minDistance=0,horizontal=false,project,pick}){
 const distance=p=>routeDistance(p,anchor,horizontal),within=p=>distance(p)<=maxDistance;
 if(distance(point)<minDistance){
  const length=distance(point);if(length<1e-8)return current;
  const target=point.map((v,i)=>horizontal&&i===1?v:anchor[i]+(v-anchor[i])*minDistance/length),screen=project(target),candidate=pick(...screen);
  return candidate&&distance(candidate)>=minDistance-.001&&within(candidate)?candidate:current;
 }
 if(within(point))return point;
 const from=project(anchor),to=project(point);
 let low=0,high=1,result=current;
 for(let i=0;i<14;i++){
  const middle=(low+high)/2,candidate=pick(from[0]+(to[0]-from[0])*middle,from[1]+(to[1]-from[1])*middle);
  if(candidate&&within(candidate)){low=middle;result=candidate}else high=middle;
 }
 return result;
}
export function createPaletteDrag({canvas,pick,started,preview,drop}){
 let drag=null;
 function move(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
  drag.moved=true;
  const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  drag.point=x>=0&&y>=0&&x<rect.width&&y<rect.height?pick(x,y):null;
  preview({key:drag.key,x:event.clientX,y:event.clientY,point:drag.point});
 }
 function end(commit=false){
  if(!drag)return;
  const current=drag;drag=null;
  current.node.classList.remove('dragging');
  if(current.node.hasPointerCapture(current.pointerId))current.node.releasePointerCapture(current.pointerId);
  preview(null);
  if(current.moved&&commit&&current.point)drop(current.key,current.point);
 }
 function bind(node,key){
  node.onpointerdown=event=>{
   if(event.button!==0||event.isPrimary===false)return;
   end();event.preventDefault();started();node.focus({preventScroll:true});
   drag={node,key,pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,point:null};
   node.setPointerCapture(event.pointerId);node.classList.add('dragging');
  };
  node.onpointermove=move;
  node.onpointerup=event=>{if(drag?.pointerId===event.pointerId){move(event);end(true)}};
  node.onpointercancel=node.onlostpointercapture=event=>{if(drag?.pointerId===event.pointerId)end()};
 }
 return {bind,cancel:()=>end(),active:()=>!!drag};
}
export function createWeaponPlacement(root,{pick,schedule,onChange=()=>{}}){
 if(!root.querySelector('#weapon-panel'))return {clear(){},confirmClear:()=>true,ready(){},draw(){}};
 const $=id=>root.querySelector('#'+id),canvas=$('map'),markers=$('weapon-markers'),palette=$('weapon-palette'),categories=$('weapon-categories');
 let pendingShare=null,shareRevision=0,restoring=false;
 let data,ranges,weapons,renderer,ready=false,placements=[],category='Shooter',dirty=true,previewItem=null,ghost=null,blocked,lastView,selection=null,mapCorners=[],mapRect=null;
 const language=()=>document.getElementById('language').value;
 const pack=()=>data.languages[language()]||data.languages.KRko;
 const name=key=>{const marker=utilityByKey.get(key),group=marker?.type||'names';return pack()[group][key]||data.languages.KRko[group][key]};
 const icon=key=>utilityByKey.has(key)?utilityIcon(utilityByKey.get(key)):`../assets/Path_Wst_${key}.png`;
 const handleLabel=key=>t(hasRoute(utilityByKey.get(key))?'출발점을 드래그해서 레일 조정':'방향 손잡이를 드래그해서 회전');
 const tooltip=(key,item)=>{
  const marker=utilityForPlacement(item||{key}),lines=n=>t('{n}칸',{n:window.SITE_I18N.number(n/5)});
  if(marker)return [name(key),...(marker.sensorRadius?[`${t('청록')} · ${t('감지 반지름')}: ${lines(marker.sensorRadius)}`,`${t('파랑')} · ${t('폭발 반지름')}: ${lines(marker.radius)}`]:marker.radius?[`${t('범위 반지름')}: ${lines(marker.radius)}`]:[]),...(marker.shape==='curling'?[t('차지 시간 ≈ {n}초 (평지 추정)',{n:window.SITE_I18N.number(Math.round(marker.chargeFrames/60*100)/100)})]:[]),...(marker.shape==='fizzy'?[t('최대 차지 · 3연속 폭발'),marker.blastRadii.map(lines).join(' → ')]:[]),...(marker.innerRadius?[`${t('보라')} · ${marker.damage[0]}: ${lines(marker.innerRadius)}`,`${t('파랑')} · ${marker.damage[1]}: ${lines(marker.radius)}`]:[]),...(marker.shape==='pogo'?[t('본체·양쪽 주먹 배치 (평지 근사)')]:[]),...(marker.shape==='vacuum'?[`${t('흡입 거리')}: ${lines(marker.length)}`]:[]),...(marker.shotRange?[`${t('파랑')} · ${t('탄 도달 거리')}: ${lines(marker.shotRange)}`,t('수평 최대 거리 착탄 예시')]:[]),...(marker.rapidRange?[`${t('청록')} · ${t('연사 사거리')}: ${lines(marker.rapidRange)}`]:[]),...(marker.lethalRadius?[`${t('보라')} · 220: ${lines(marker.lethalRadius)}`,`${t('파랑')} · 70: ${lines(marker.radius)}`]:[]),...(marker.travel?[`${t('이동 거리')} ≈ ${lines(marker.travel)}`]:[]),...(marker.shape==='plane'?[`${t('평면 근사')}: ${lines(marker.width)} × ${lines(marker.height)}`]:[]),...(marker.shape==='cylinder'?[`${t('높이')}: ${lines(marker.height)} · ${t('1발')}`]:[]),...(marker.directional?[handleLabel(key)]:[])].join('\n');
  return [name(key),...ranges.actors[weapons.get(key).actor].map((range,i)=>`${t(i?'보라':'청록')} · ${t(range.label)}: ${t('{n}칸',{n:window.SITE_I18N.number(range.lines)})}`)].join('\n');
 };
 const committed=()=>{if(ready&&!restoring&&pendingShare===null)onChange()};
 const changed=()=>{dirty=true;if(data)refresh();schedule()};
 const rangeMode=$('range-mode');
 rangeMode?.addEventListener('change',changed);
 const settings=createMarkerSettings(canvas.parentElement,{name,describe:item=>tooltip(item.key,item).split('\n').slice(1).join('\n'),changed(){for(const item of placements)if(item.key==='Bomb_Curling')fitCurlingStart(item);changed();refresh();committed()},remove(item){remove(item);canvas.focus({preventScroll:true})}});
 function remove(item){settings.close();directionDrag.cancel();startDrag.cancel();if(selection===item)select(null);placements=placements.filter(p=>p!==item);item.node.remove();item.handle?.remove();item.chargeLabel?.remove();changed();refresh();committed()}
 function select(item){selection=item;for(const placement of placements)placement.node.setAttribute('aria-pressed',String(placement===item));schedule()}
 function limitRoutePoint(current,anchor,point,item){
  if(!lastView)return current;
  return constrainTerrainDrag(point,{current,anchor,maxDistance:utilityForPlacement(item).railLength,minDistance:utilityForPlacement(item).minTravel||0,horizontal:item.key==='Bomb_Curling',pick,project(position){const [x,y]=transform(position,lastView);return [(x+1)*canvas.clientWidth/2,(1-y)*canvas.clientHeight/2]}});
 }
 const drag=createWeaponDrag({canvas,pick,changed,committed,selected:select,
  constrain:(item,point)=>hasRoute(utilityByKey.get(item.key))?limitRoutePoint(item.position,item.start,point,item):point,
  outside(x,y,event){return event.clientX<0||event.clientY<0||event.clientX>window.innerWidth||event.clientY>window.innerHeight||outsideMarkerBounds(x,y,canvas.clientWidth,canvas.clientHeight,mapRect)},
  removed:remove
 });
 const startDrag=createWeaponDrag({canvas,pick,changed,committed,constrain:(item,point)=>limitRoutePoint(item.position,item.owner.position,point,item.owner)});
 const directionDrag=createDirectionDrag({changed,committed,angleAt(item,event){if(!lastView)return null;const rect=canvas.getBoundingClientRect();return directionAngle(markerPosition(item,utilityForPlacement(item)),lastView,event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height)}});
 const paletteDrag=createPaletteDrag({canvas,pick,
  started(){settings.close();drag.cancel();directionDrag.cancel();startDrag.cancel()},
  preview(value){
   previewItem=value?.point?{key:value.key,position:value.point}:null;changed();
   if(!value){ghost?.remove();ghost=null;return}
   if(!ghost){ghost=document.createElement('div');ghost.className='weapon-ghost';ghost.classList.toggle('utility-marker',utilityByKey.has(value.key));ghost.setAttribute('aria-hidden','true');const img=new Image();img.src=icon(value.key);ghost.append(img);document.body.append(ghost)}
   ghost.style.left=`${value.x}px`;ghost.style.top=`${value.y}px`;ghost.classList.toggle('valid',!!value.point);
  },
  drop(key,point){if(ready)add(key,point)}
 });
 const hasMarkers=()=>placements.length>0||!!pendingShare||restoring;
 const confirmClear=()=>!hasMarkers()||window.confirm(t('배치한 마커가 모두 사라집니다. 계속하시겠습니까?'));
 const beforeUnload=event=>{if(hasMarkers()){event.preventDefault();event.returnValue=''}};
 function refresh(){
  if(hasMarkers())window.addEventListener('beforeunload',beforeUnload);else window.removeEventListener('beforeunload',beforeUnload);
  $('weapon-clear').disabled=!placements.length;
  $('marker-share').disabled=!ready||!data||restoring;
  for(const item of placements){const label=[tooltip(item.key,item),...(utilityByKey.has(item.key)?[`${t(utilityByKey.get(item.key).type==='sub'?'서브 성능 업':'스페셜 성능 업')}: ${item.gearAP} AP`]:[]),t('우클릭으로 마커 설정')].join('\n');item.node.title=label;item.node.setAttribute('aria-label',label);if(item.handle){item.handle.title=handleLabel(item.key);item.handle.setAttribute('aria-label',`${name(item.key)} · ${handleLabel(item.key)}`)}}
  for(const node of palette.children)node.disabled=!ready;
  schedule();
 }
 function renderPalette(updateCategories=false){
  paletteDrag.cancel();
  if(updateCategories)categories.replaceChildren(...[...new Set(data.weapons.map(w=>w.type)),'sub','special'].map(type=>{
   const button=document.createElement('button');button.type='button';button.textContent=pack().types[type]||t(type==='sub'?'서브':'스페셜');button.dataset.type=type;button.setAttribute('aria-pressed',String(category===type));
   button.onclick=()=>{category=type;renderPalette();palette.scrollLeft=0};return button;
  }));
  for(const button of categories.children)button.setAttribute('aria-pressed',String(button.dataset.type===category));
  palette.replaceChildren(...[...data.weapons,...utilityMarkers].filter(w=>w.type===category).map(weapon=>{
   const button=document.createElement('button'),img=new Image(52,52);button.type='button';button.dataset.key=weapon.key;button.title=tooltip(weapon.key);button.setAttribute('aria-label',tooltip(weapon.key));
   img.src=icon(weapon.key);img.alt='';img.draggable=false;button.append(img);paletteDrag.bind(button,weapon.key);return button;
  }));refresh();
 }
 for(const row of [palette,categories])row.addEventListener('wheel',event=>{
  if(event.deltaX||!event.deltaY||row.scrollWidth<=row.clientWidth)return;
  const before=row.scrollLeft;row.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?row.clientWidth:1);
  if(row.scrollLeft!==before)event.preventDefault();
 },{passive:false});
 function clear(shared=null){shareRevision++;restoring=false;pendingShare=shared;settings.close();drag.cancel();directionDrag.cancel();startDrag.cancel();paletteDrag.cancel();selection=null;placements=[];mapRect=null;mapCorners=[];markers.replaceChildren();changed();ready=false;refresh();}
 $('weapon-clear').onclick=()=>{if(!confirmClear())return;const wasReady=ready;clear();ready=wasReady;refresh();committed()};
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&(selection||drag.active()||paletteDrag.active()||directionDrag.active()||startDrag.active())){event.preventDefault();drag.cancel();directionDrag.cancel();startDrag.cancel();paletteDrag.cancel();select(null)}
 });
 let blankStart=null;
 canvas.addEventListener('pointerdown',event=>{if(event.button===0&&event.isPrimary!==false)blankStart={id:event.pointerId,x:event.clientX,y:event.clientY}});
 canvas.addEventListener('pointerup',event=>{if(blankStart?.id!==event.pointerId)return;const click=Math.hypot(event.clientX-blankStart.x,event.clientY-blankStart.y)<5;blankStart=null;if(click)select(null)});
 canvas.addEventListener('pointercancel',()=>{blankStart=null});
 document.getElementById('language').addEventListener('change',()=>data&&renderPalette(true));
 function add(key,point,saved={}){
  if(!weapons.has(key)&&!utilityByKey.has(key))return;
  const node=document.createElement('button'),img=new Image(36,36);
  node.type='button';node.className='weapon-marker';node.classList.toggle('utility-marker',utilityByKey.has(key));img.src=icon(key);img.alt='';img.draggable=false;
  node.append(img);
  const item={key,position:point,node,angle:0,background:null,gearAP:0,...saved};placements.push(item);markers.append(node);drag.bind(node,item);
  if(item.background)node.style.setProperty('--marker-background',item.background);
  node.setAttribute('aria-haspopup','dialog');node.setAttribute('aria-expanded','false');
  const openSettings=event=>{event.preventDefault();event.stopPropagation();drag.cancel();directionDrag.cancel();startDrag.cancel();select(item);const rect=node.getBoundingClientRect();settings.show(item,{x:rect.right,y:rect.top})};
  node.oncontextmenu=openSettings;
  node.onkeydown=event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))openSettings(event)};
  node.setAttribute('aria-pressed','false');node.onclick=event=>{if(event.detail===0)select(item)};
  const utility=utilityForPlacement(item);
  if(utility?.directional){
   const handle=document.createElement('button');handle.type='button';handle.className='direction-handle';handle.textContent=hasRoute(utility)?'●':'↻';handle.hidden=true;item.handle=handle;markers.append(handle);
   if(hasRoute(utility)){
    item.start=reefStart(item,utility);
    const startItem={owner:item,get position(){return item.start},set position(value){item.start=value},get dragOffset(){return item.startDragOffset}};
    startDrag.bind(handle,startItem);
   }else directionDrag.bind(handle,item);
  }
  if(utility?.shape==='curling'){
   item.chargeLabel=document.createElement('span');item.chargeLabel.className='bomb-charge';item.chargeLabel.hidden=true;markers.append(item.chargeLabel);
  }
  changed();refresh();committed();
 }
 function draw(gl,view,back,width,height,zoom=1,ceiling=Infinity){
  lastView=view;
  const inverse=inverseMatrix(view);
  const corners=mapCorners.map(point=>transform(point,view)).filter(p=>p.every(Number.isFinite));
  if(corners.length)mapRect={left:Math.min(...corners.map(p=>(p[0]+1)*width/2)),right:Math.max(...corners.map(p=>(p[0]+1)*width/2)),top:Math.min(...corners.map(p=>(1-p[1])*height/2)),bottom:Math.max(...corners.map(p=>(1-p[1])*height/2))};
  if(!ranges)return;
  const mode=rangeMode?.value||'advanced';
  if(mode!=='none'&&(placements.length||previewItem)&&!renderer)renderer=createRangeRenderer(gl);
  if(renderer&&mode!=='none'){if(dirty){renderer.update(previewItem?[...placements,previewItem]:placements,ranges,weapons,mode==='advanced'?blocked:undefined);dirty=false}renderer.draw(view,back)}
  const iconScale=markerScale(zoom);
  markers.style.setProperty('--weapon-scale',iconScale);
  for(const item of placements){
   const utility=utilityForPlacement(item),display=markerPosition(item,utility),[x,y,z]=transform(display,view),w=view[3]*display[0]+view[7]*display[1]+view[11]*display[2]+view[15];
   const anchor=transform(item.position,view);item.dragOffset=[(x-anchor[0])*width/2,(anchor[1]-y)*height/2];
   item.node.hidden=w<=0||z< -1||z>1||x< -1||x>1||y< -1||y>1;
   const occluded=!item.node.hidden&&markerOccluded(display,[x,y,z],inverse,blocked,ceiling);
   item.node.classList.toggle('occluded',occluded);
   item.node.style.left=`${(x+1)*width/2}px`;item.node.style.top=`${(1-y)*height/2}px`;
   if(item.chargeLabel){
    item.chargeLabel.hidden=selection!==item||item.node.hidden;
    item.chargeLabel.textContent=t('차지 시간 ≈ {n}초 (평지 추정)',{n:window.SITE_I18N.number(Math.round(utility.chargeFrames/60*100)/100)});
    item.chargeLabel.style.left=item.node.style.left;item.chargeLabel.style.top=`${(1-y)*height/2+Math.max(24,20*iconScale)}px`;
   }
   if(item.handle){
    const point=directionPoint(item,utility),[hx,hy,hz]=transform(point,view),hw=view[3]*point[0]+view[7]*point[1]+view[11]*point[2]+view[15];
    const dx=(hx-x)*width/2,dy=(y-hy)*height/2,distance=Math.hypot(dx,dy),spacing=Math.max(30,35.2*iconScale/2+18),scale=hasRoute(utility)?1:distance>0?Math.max(1,spacing/distance):1;
    if(hasRoute(utility)){const start=transform(item.start,view);item.startDragOffset=[(hx-start[0])*width/2,(start[1]-hy)*height/2]}
    item.handle.hidden=selection!==item||item.node.hidden||hw<=0||hz< -1||hz>1;
    item.handle.classList.toggle('occluded',markerOccluded(point,[hx,hy,hz],inverse,blocked,ceiling));
    item.handle.style.left=`${(x+1)*width/2+dx*scale}px`;item.handle.style.top=`${(1-y)*height/2+dy*scale}px`;
   }
  }
 }
 async function restore(){
  if(!ready||!weapons||pendingShare===null)return;
  const value=pendingShare,current=shareRevision;pendingShare=null;restoring=true;refresh();
  try{const items=await decodeMarkers(value,new Set([...weapons.keys(),...utilityByKey.keys()]));if(current!==shareRevision)return;for(const item of items)add(item.key,item.position,item)}
  catch{if(current===shareRevision)localizedText($('marker-share-status'),'마커 링크를 불러오지 못했습니다.');}
  finally{if(current===shareRevision){restoring=false;refresh()}}
 }
 async function load(){
  try{
   $('weapon-error').hidden=true;$('weapon-retry').hidden=true;palette.setAttribute('aria-busy','true');
   const [,response]=await Promise.all([import('../data.js'),fetch('./weapon-ranges.json')]);
   if(!response.ok)throw Error('사거리 데이터를 불러오지 못했습니다.');
   data=window.WEAPON_DATA;ranges=validateRanges(await response.json(),data.weapons);weapons=new Map(data.weapons.map(w=>[w.key,w]));renderPalette(true);restore();
  }catch(error){localizedText($('weapon-error'),'무기 목록을 불러오지 못했습니다.');$('weapon-error').hidden=false;$('weapon-retry').hidden=false}
  finally{palette.setAttribute('aria-busy','false')}
 }
 $('weapon-retry').onclick=load;load();
 return {clear,confirmClear,draw,snapshot:()=>encodeMarkers(placements),ready(source){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<source.length;i+=7)for(let j=0;j<3;j++){min[j]=Math.min(min[j],source[i+j]);max[j]=Math.max(max[j],source[i+j])}
  mapCorners=Array.from({length:8},(_,i)=>min.map((v,j)=>i&(1<<j)?max[j]:v));
  blocked=createRangeOcclusion(source);dirty=true;ready=true;restore();refresh()
 }};
}

// A margin avoids deleting on small misses beside terrain or at a viewport edge.
export function outsideMarkerBounds(x,y,width,height,mapRect,margin=32){
 if(x< -margin||y< -margin||x>width+margin||y>height+margin)return true;
 return !!mapRect&&(x<mapRect.left-margin||x>mapRect.right+margin||y<mapRect.top-margin||y>mapRect.bottom+margin);
}
