import {t} from './i18n.js?v=20260919-l10n-2';
import {utilityByKey,normalizeGearAP} from './utility-markers.js?v=20260920-ultrashot';

export function createMarkerSettings(container,{name,describe,changed,remove}){
 const popup=document.createElement('section');popup.className='marker-settings';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-labelledby','marker-settings-title');
 popup.innerHTML=`<div class="marker-settings-heading"><strong id="marker-settings-title"></strong><button type="button" class="marker-settings-close">×</button></div>
 <div class="marker-color-row"><label for="marker-background"></label><input id="marker-background" type="color"><button type="button" class="marker-color-reset"></button></div>
 <div class="marker-gear"><label for="marker-gear-ap"></label><div class="marker-gear-inputs"><input type="range" min="0" max="57" step="1" aria-labelledby="marker-gear-label"><input id="marker-gear-ap" type="number" min="0" max="57" step="1" inputmode="numeric"><span>AP</span></div><p class="marker-gear-details"></p></div>
 <button type="button" class="marker-delete"></button>`;
 container.append(popup);
 const $=selector=>popup.querySelector(selector),title=$('strong'),closeButton=$('.marker-settings-close'),color=$('[type=color]'),reset=$('.marker-color-reset'),deleteButton=$('.marker-delete'),colorLabel=$('label'),gear=$('.marker-gear'),gearLabel=gear.querySelector('label'),slider=$('[type=range]'),number=$('[type=number]'),details=$('.marker-gear-details');
 gearLabel.id='marker-gear-label';let item=null,anchor;
 function position(){
  if(!item)return;
  const width=container.clientWidth,height=container.clientHeight;
  popup.style.maxHeight=`${Math.max(0,height-16)}px`;
  popup.style.left=`${Math.max(8,Math.min(anchor.x,width-popup.offsetWidth-8))}px`;
  popup.style.top=`${Math.max(8,Math.min(anchor.y,height-popup.offsetHeight-8))}px`;
 }
 function refresh(){
  if(!item)return;
  title.textContent=name(item.key);closeButton.setAttribute('aria-label',t('닫기'));colorLabel.textContent=t('마커 배경');reset.textContent=t('기본값');deleteButton.textContent=t('삭제');color.value=item.background||'#4a6574';
  const utility=utilityByKey.get(item.key);gear.hidden=!utility;
  if(utility){
   gearLabel.textContent=t(utility.type==='sub'?'서브 성능 업':'스페셜 성능 업');
   slider.value=number.value=normalizeGearAP(item.gearAP);
   details.textContent=describe(item);details.hidden=!details.textContent;
  }
  position();
 }
 function close(restoreFocus=false){
  const previous=item;item=null;popup.hidden=true;
  previous?.node.setAttribute('aria-expanded','false');
  if(restoreFocus&&previous?.node.isConnected)previous.node.focus({preventScroll:true});
 }
 function show(next,point){
  close();item=next;const bounds=container.getBoundingClientRect();anchor={x:point.x-bounds.left-container.clientLeft,y:point.y-bounds.top-container.clientTop};popup.hidden=false;next.node.setAttribute('aria-expanded','true');refresh();color.focus({preventScroll:true});
 }
 color.oninput=()=>{if(!item)return;item.background=color.value;item.node.style.setProperty('--marker-background',item.background)};
 reset.onclick=()=>{if(!item)return;item.background=null;item.node.style.removeProperty('--marker-background');color.value='#4a6574'};
 function setAP(input){
  if(!item||!input.validity.valid||input.value==='')return;
  item.gearAP=normalizeGearAP(input.valueAsNumber);changed();refresh();
 }
 for(const input of [slider,number]){input.oninput=()=>setAP(input);input.onchange=()=>{if(item){item.gearAP=normalizeGearAP(input.valueAsNumber);changed();refresh()}}}
 deleteButton.onclick=()=>{if(!item)return;const target=item;close();remove(target)};
 closeButton.onclick=()=>close(true);
 popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}});
 popup.addEventListener('contextmenu',event=>event.preventDefault());
 document.addEventListener('pointerdown',event=>{if(item&&!popup.contains(event.target))close()},true);
 document.addEventListener('focusin',event=>{if(item&&!popup.contains(event.target))close()});
 document.addEventListener('localizationchange',refresh);
 window.addEventListener('resize',()=>close());
 return {show,close,refresh};
}
