import {openRespawnJump} from './respawn-jump.js?v=20260921-beacon-jump';
import {openInkTest} from './ink-test.js?v=20260921-ballpoint';
import {selectionImage} from './export-image.js?v=20260921-totals-shift';
import {t, setupLanguage, languageCode, applyStatic, gearName} from './i18n.js?v=20260921-beacon-jump';
import {SLOT_TYPES, initialState, validateData, calculate, canEquip, movementTiming} from './core.js?v=20260921-beacon-jump';
import {readSelection, selectionSearch} from './share.js?v=20260921-beacon-jump';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value, digits = 2) => value == null ? t("미확인") : value.toLocaleString(languageCode(), {maximumFractionDigits:digits});
let data, catalogue, locale, state = initialState(), result, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let jumpAnimation, phaseAnimationId, inkAnimationId, respawnAnimationId, tenacityAnimationId, tenacityAnimation, tankAnimations = [], comparisonAnimations = [];
const seconds = frames => (Math.max(0,Math.ceil(frames / 60 * 100 - 1e-9)) / 100).toLocaleString(languageCode(), {minimumFractionDigits:2, maximumFractionDigits:2});
const timeLabel = frames => `${seconds(frames)} ${t("초")} <small class="frame-note">${number(frames)} ${t("프레임")}</small>`;
let manualGroups = [];
function manualStart(button, animations) {
  animations.forEach(animation=>{animation.pause();animation.currentTime=0;});
  const group={animations,started:false};manualGroups.push(group);
  button.onclick=()=>{
    group.started=true;
    animations.forEach(animation=>{animation.currentTime=0;animation.play();if(paused)animation.finish();});
  };
}
let dragSource = null;
let selectedAbility = null, touchDrag = null, suppressClickUntil = 0;

function abilityIcon(key) {
  return key === 'None' ? '<span class="empty-slot" aria-hidden="true">?</span>' : `<img src="./icons/${escape(key)}.png" alt="" draggable="false">`;
}

function renderGear() {
  $('gear-slots').innerHTML = [t("머리"),t("옷"),t("신발")].map((name, row) => `<div class="circle-gear-row" role="group" aria-label="${name}"><span class="gear-part">${name}</span><div class="circle-slots">${state.slots[row].map((key,slot)=>{
    const label = `${name} ${slot === 0 ? t("큰 슬롯") : t("작은 슬롯 {n}",{n:slot})}`;
    const ability = key === 'None' ? t("선택 안 함") : gearName(key);
    return `<button class="gear-slot ${slot === 0 ? 'large' : 'small'} ${key === 'None' ? 'empty' : 'filled'}" type="button" draggable="${key !== 'None'}" data-row="${row}" data-slot="${slot}" aria-label="${label}: ${escape(ability)}" title="${label} · ${escape(ability)}">${abilityIcon(key)}<span class="slot-ap" aria-hidden="true">${slot === 0 ? 10 : state.slots[row][0] === 'ExSkillDouble' ? 6 : 3}</span></button>`;
  }).join('')}</div></div>`).join('');
  highlightSlots();
}

function renderPalette() {
  const entries = Object.entries(data.gear).sort((a,b)=>a[0]==='None'?-1:b[0]==='None'?1:['None',...SLOT_TYPES].indexOf(a[1].slot)-['None',...SLOT_TYPES].indexOf(b[1].slot));
  const partNames={None:t("공통"),Head:t("머리 전용"),Clothes:t("옷 전용"),Shoes:t("신발 전용")};
  $('gear-palette').innerHTML=entries.map(([key,gear])=>`<button type="button" class="palette-ability" draggable="true" data-ability="${key}" aria-label="${escape(key === 'None' ? t("선택 안 함") : gearName(key))} · ${partNames[gear.slot]}" aria-pressed="false" title="${escape(key === 'None' ? t("선택 안 함") : gearName(key))} · ${partNames[gear.slot]}"><span class="palette-icon">${abilityIcon(key)}</span><span class="palette-name">${escape(key === 'None' ? t("선택 안 함") : gearName(key))}</span></button>`).join('');
}

function highlightSlots() {
  $('gear-slots').querySelectorAll('.gear-slot').forEach(button=>{
    const eligible = selectedAbility != null && canEquip(data,selectedAbility,Number(button.dataset.row),Number(button.dataset.slot));
    button.classList.toggle('eligible',eligible);
    button.classList.toggle('ineligible',selectedAbility != null && !eligible);
  });
}

function selectAbility(key) {
  selectedAbility = key;
  $('gear-palette').querySelectorAll('[data-ability]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ability===key)));
  $('palette-status').textContent='';
  highlightSlots();
}

function equip(key, button, source = null) {
  const row=Number(button.dataset.row),slot=Number(button.dataset.slot);
  if (!canEquip(data,key,row,slot)) {
    $('palette-status').textContent='이 기어는 해당 슬롯에 장착할 수 없습니다. 빛나는 슬롯을 골라 주세요.';
    return;
  }
  if(source)state.slots[source.row][source.slot]='None';
  state.slots[row][slot]=key;
  state.active=state.active.filter(condition=>state.slots.some(gear=>gear[0]===condition));
  renderGear();renderConditions();update();
  $('palette-status').textContent='';
  $('gear-slots').querySelector(`[data-row="${row}"][data-slot="${slot}"]`).focus({preventScroll:true});
}

function bindPalette() {
  const palette=$('gear-palette'),slots=$('gear-slots'),panel=palette.closest('.palette-panel'),area=slots.closest('.selection-area');
  const sourceOf=button=>button.matches('.gear-slot')?{row:Number(button.dataset.row),slot:Number(button.dataset.slot)}:null;
  const keyOf=button=>button.dataset.ability??state.slots[Number(button.dataset.row)][Number(button.dataset.slot)];
  const discard=()=>{if(dragSource){const button=slots.querySelector(`[data-row="${dragSource.row}"][data-slot="${dragSource.slot}"]`);equip('None',button);selectAbility(null);}};
  palette.addEventListener('click',event=>{
    if(performance.now()<suppressClickUntil)return;
    const button=event.target.closest('[data-ability]');if(button)selectAbility(button.dataset.ability);
  });
  slots.addEventListener('click',event=>{
    if(performance.now()<suppressClickUntil)return;
    const button=event.target.closest('.gear-slot');if(!button)return;
    if(selectedAbility==null){$('palette-status').textContent='팔레트에서 먼저 기어를 선택해 주세요.';return;}
    equip(selectedAbility,button);
  });
  slots.addEventListener('keydown',event=>{
    const button=event.target.closest('.gear-slot');
    if(button&&['Delete','Backspace'].includes(event.key)){event.preventDefault();equip('None',button);}
  });
  area.addEventListener('dragstart',event=>{
    const button=event.target.closest('[data-ability],.gear-slot.filled');if(!button)return;
    dragSource=sourceOf(button);
    panel.classList.toggle('discard-active',Boolean(dragSource));
    const key=keyOf(button);selectAbility(key);
    event.dataTransfer.setData('application/x-gear-ability',key);event.dataTransfer.effectAllowed=dragSource?'move':'copy';
    event.dataTransfer.setDragImage(button.querySelector('.palette-icon')??button,22,22);
  });
  const clearHover=()=>area.querySelectorAll('.drop-over').forEach(button=>button.classList.remove('drop-over'));
  const finishDrag=()=>{clearHover();panel.classList.remove('discard-active');if(dragSource)selectAbility(null);dragSource=null;highlightSlots();};
  for(const name of ['dragenter','dragover'])panel.addEventListener(name,event=>{if(!dragSource)return;event.preventDefault();clearHover();event.dataTransfer.dropEffect='move';panel.classList.add('drop-over');});
  panel.addEventListener('dragleave',event=>{if(!panel.contains(event.relatedTarget))panel.classList.remove('drop-over');});
  panel.addEventListener('drop',event=>{if(!dragSource)return;event.preventDefault();discard();finishDrag();});
  for(const name of ['dragenter','dragover'])slots.addEventListener(name,event=>{
    const button=event.target.closest('.gear-slot');
    if(!button)return;
    event.preventDefault();clearHover();
    const valid=selectedAbility!=null&&canEquip(data,selectedAbility,Number(button.dataset.row),Number(button.dataset.slot));
    event.dataTransfer.dropEffect=valid?(dragSource?'move':'copy'):'none';if(valid)button.classList.add('drop-over');
  });
  slots.addEventListener('dragleave',event=>event.target.closest('.gear-slot')?.classList.remove('drop-over'));
  slots.addEventListener('drop',event=>{
    event.preventDefault();clearHover();
    const button=event.target.closest('.gear-slot'),key=event.dataTransfer.getData('application/x-gear-ability');
    if(button&&data.gear[key])equip(key,button,dragSource);
    finishDrag();
  });
  area.addEventListener('dragend',finishDrag);
  // Touch uses pointer capture; desktop keeps native HTML drag-and-drop.
  area.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-ability],.gear-slot.filled');
    if(event.pointerType!=='touch'||!button)return;
    touchDrag={source:sourceOf(button),key:keyOf(button),x:event.clientX,y:event.clientY,id:event.pointerId,button,ghost:null};
    button.setPointerCapture(event.pointerId);
  });
  area.addEventListener('pointermove',event=>{
    if(!touchDrag||touchDrag.id!==event.pointerId)return;
    // Vertical touch gestures scroll the palette; horizontal gestures can drag a gear.
    if(!touchDrag.source&&!touchDrag.ghost&&Math.abs(event.clientY-touchDrag.y)>=Math.abs(event.clientX-touchDrag.x))return;
    if(!touchDrag.ghost&&Math.hypot(event.clientX-touchDrag.x,event.clientY-touchDrag.y)<8)return;
    event.preventDefault();
    if(!touchDrag.ghost){dragSource=touchDrag.source;panel.classList.toggle('discard-active',Boolean(dragSource));selectAbility(touchDrag.key);touchDrag.ghost=document.createElement('div');touchDrag.ghost.className='drag-ghost';touchDrag.ghost.innerHTML=abilityIcon(touchDrag.key);document.body.append(touchDrag.ghost);}
    touchDrag.ghost.style.left=`${event.clientX}px`;touchDrag.ghost.style.top=`${event.clientY}px`;
    clearHover();const button=document.elementFromPoint(event.clientX,event.clientY)?.closest('.gear-slot');
    if(button&&canEquip(data,touchDrag.key,Number(button.dataset.row),Number(button.dataset.slot)))button.classList.add('drop-over');
    if(dragSource&&document.elementFromPoint(event.clientX,event.clientY)?.closest('.palette-panel'))panel.classList.add('drop-over');
    if(event.clientY<65)window.scrollBy(0,-12);else if(event.clientY>innerHeight-65)window.scrollBy(0,12);
  });
  const finishTouch=(event,cancelled)=>{
    if(!touchDrag||touchDrag.id!==event.pointerId)return;
    if(touchDrag.ghost){
      const button=document.elementFromPoint(event.clientX,event.clientY)?.closest('.gear-slot');
      if(!cancelled&&button)equip(touchDrag.key,button,dragSource);
      else if(!cancelled&&document.elementFromPoint(event.clientX,event.clientY)?.closest('.palette-panel'))discard();
      touchDrag.ghost.remove();suppressClickUntil=performance.now()+500;
    }
    finishDrag();touchDrag=null;
  };
  area.addEventListener('pointerup',event=>finishTouch(event,false));
  area.addEventListener('pointercancel',event=>finishTouch(event,true));
}

function filterWeapons(event) {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s.]+/g, '');
  const query = normalize($('weapon-search').value);
  const exact = query && catalogue.weapons.find(w => normalize(locale.names[w.key]) === query);
  const aliases = {Bomb_Splash:'삼각밤', Slosher_Diffusion_00:'힛센', Slosher_Diffusion_01:'힛센', SpChariot:'게탱크'};
  const matches = catalogue.weapons.filter(w => normalize([locale.names[w.key], locale.sub[w.sub], locale.special[w.special], aliases[w.key] || '', aliases[w.sub] || '', aliases[w.special] || ''].join(' ')).includes(query));
  // Only a typed exact name changes the build; rendering and history restoration do not.
  if (event?.type === 'input' && exact && state.weapon !== exact.key) {
    state.weapon = exact.key;
    update();
  }
  const current = catalogue.weapons.find(w => w.key === state.weapon);
  const options = matches.includes(current) ? matches : [current, ...matches];
  $('weapon').innerHTML = options.map(w => `<option value="${escape(w.key)}">${!matches.includes(w) ? t("현재 선택 · ") : ''}${escape(locale.names[w.key])}</option>`).join('');
  $('weapon').value = state.weapon;
  $('search-status').textContent = query ? t('{n}개 검색됨',{n:matches.length})+(matches.length?'':t(' · 현재 무기는 유지됩니다.')) : t('{n}개 무기',{n:catalogue.weapons.length});
}

const conditionHints = {
  StartAllUp: "스타트 대시가 유지되는 동안", EndAllUp: "상대 카운트에 따라 효과 선택",
  ComeBack: "부활 직후 효과가 유지되는 동안", SomersaultLanding: "낙법 직후 효과가 유지되는 동안",
  MinorityUp: "아군 생존 인원이 더 적을 때",
};

function ldeLabel() {
  return `${state.ldeStage===21?t("30 이하 / 마지막 30초 / 연장"):t('카운트 {n}',{n:51-state.ldeStage})} · ${t("각 {n} AP",{n:Math.floor(18*state.ldeStage/21)})}`;
}

function renderConditions() {
  const equipped = state.slots.map(row => row[0]);
  const conditions = Object.keys(conditionHints).filter(key => equipped.includes(key));
  $('conditions').innerHTML = conditions.length ? conditions.map(key => {
    const on = state.active.includes(key);
    let options = '';
    if (key === 'EndAllUp') options = `<label class="condition-select lde-slider" for="lde-stage"><span>${t("발동 단계 · 상대 팀 카운트")}</span><output id="lde-value">${ldeLabel()}</output><input id="lde-stage" aria-label="${t("라스트 스퍼트 발동 단계")}" aria-valuetext="${ldeLabel()}" type="range" min="1" max="21" step="1" value="${state.ldeStage}" ${on?'':'disabled'}><span class="range-ends"><span>${t("카운트 50")}</span><span>${t("30 이하 · 최대")}</span></span></label>`;
    return `<label class="toggle-label"><span><strong>${escape(key === 'None' ? t("선택 안 함") : gearName(key))}</strong><small>${t(conditionHints[key])}</small></span><input type="checkbox" role="switch" data-condition="${key}" ${on ? 'checked' : ''}></label>${options}`;
  }).join('') : `<p class="small-note">${t("조건부 기어를 장착하면 발동 여부와 해당 단계를 선택할 수 있습니다.")}</p>`;
  $('conditions').insertAdjacentHTML('beforeend',`<label class="toggle-label"><span><strong>${t("상대 부활 페널티 업")}</strong><small>${t("해당 기어를 장착한 상대에게 당함")}</small></span><input id="enemy-respawn-penalty" type="checkbox" role="switch" ${state.enemyRespawnPenalty?'checked':''}></label>`);
  $('cooler').checked = state.cooler;
}

function renderAP() {
  const {base,effective} = result.points;
  const active = Object.keys(effective).filter(key => base[key] || effective[key]);
  $('ap-count').textContent = active.length ? t('· {n}종',{n:active.length}) : '';
  $('ability-points').innerHTML = active.length ? active.map(key => `<div class="ap-line"><span>${escape(key === 'None' ? t("선택 안 함") : gearName(key))}</span><b>${base[key] === effective[key] ? `${base[key]} AP` : `${base[key]} → <em>${effective[key]} AP</em>`}</b></div>`).join('') : `<p class="small-note">${t("아직 장착한 기어가 없습니다.")}</p>`;
}

const differs = (value,base) => value != null && base != null && Math.abs(value-base)>1e-8;
function fold(label,changed,body) {
  return `<details class="result-fold" ${changed?'open':''}><summary>${escape(t(label))}</summary><div class="fold-content">${body}</div></details>`;
}

function metric(label, value, unit, base, digits = 2) {
  if(unit===t("프레임"))return `<div><div class="metric-label">${escape(t(label))}</div><div class="metric-value">${timeLabel(value)}</div>${base==null?'':`<div class="baseline metric-baseline">${t("기본")} ${timeLabel(base)}</div>`}</div>`;
  return `<div><div class="metric-label">${escape(t(label))}</div><div class="metric-value">${number(value,digits)}${value == null ? '' : `<small>${escape(t(unit))}</small>`}</div>${base == null ? '' : `<div class="baseline metric-baseline">${t("기본")} ${number(base,digits)} ${escape(t(unit))}</div>`}</div>`;
}
function stat(label, value, unit, base) {
  if(unit==='초'||unit===t("초"))return `<div class="stat-row"><span>${escape(t(label))}</span><strong>${timeLabel(value*60)}${base==null?'':`<span class="baseline">${t("기본")} ${timeLabel(base*60)}</span>`}</strong></div>`;
  return `<div class="stat-row"><span>${escape(t(label))}</span><strong>${number(value)} ${escape(t(unit))}${base == null ? '' : `<span class="baseline">${t("기본")} ${number(base)} ${escape(t(unit))}</span>`}</strong></div>`;
}
function distanceBars(base,value,unit='칸') {
  const max=Math.max(base,value,0.001);
  return `<div class="distance-bars" role="img" aria-label="${t("기본")} ${number(base)} ${t(unit)}, ${t("현재")} ${number(value)} ${t(unit)}"><div><span>${t("기본")}</span><i class="bar-base" style="width:${base/max*100}%"></i></div><div><span>${t("현재")}</span><i style="width:${value/max*100}%"></i></div></div>`;
}
function effects(items) {
  return items.map(item => fold(item.label,differs(item.value,item.base),stat(item.label,item.value,item.unit,item.base)+(item.kind==='distance'||item.kind==='ratio'&&item.label.includes('범위')?distanceBars(item.base,item.value,item.unit):''))).join('');
}
function title(name, icon = '') {
  return `<div class="card-title"><h2>${t(name)}</h2>${icon ? `<span class="kit-badge"><img class="kit-icon" src="../assets/${escape(icon)}.png" alt=""></span>` : ''}</div>`;
}
function angleGraphic(angle) {
  const radius = 94, radians = angle * Math.PI / 180;
  const x = 8 + radius * Math.cos(radians), delta = radius * Math.sin(radians);
  const center = Math.max(25, Math.ceil(delta + 4));
  return `<svg class="angle-view" style="height:${center*2}px" viewBox="0 0 115 ${center*2}" role="img" aria-label="${t("중심선에서 좌우 {n}도",{n:number(angle)})}"><path class="angle-fill" d="M8 ${center} L${x} ${center-delta} A${radius} ${radius} 0 0 1 ${x} ${center+delta} Z"/><path class="angle-center" d="M8 ${center} H110"/><path class="angle-edge" d="M${x} ${center-delta} L8 ${center} L${x} ${center+delta}"/><circle cx="8" cy="${center}" r="2.5" fill="currentColor"/></svg>`;
}
function track(speed, base, emoji, enemyInk=false) {
  if (!(speed > 0)) return `<p class="card-note">${t("확인된 속도가 없어 움직임을 표시하지 않습니다.")}</p>`;
  const splashes='<i class="splash splash-one"></i><i class="splash splash-two"></i><i class="splash splash-three"></i><i class="splash splash-four"></i><i class="splash splash-five"></i><i class="splash splash-six"></i>';
  const swimming=emoji==='🐙',ninja=result.points.equipped.includes('SquidMoveSpatter_Reduction');
  const character=swimming?`<span class="swim-emoji">${emoji}</span>`:`<span class="human-emoji">${emoji}</span>`;
  return `<button type="button" class="motion-start">${t("출발")}</button><div class="motion-track ${enemyInk?'enemy-ink-track':''}" data-speed="${speed}" data-base="${base}" aria-hidden="true"><span class="runner runner-reference">${character}${swimming?splashes:''}</span><span class="runner runner-current">${character}${swimming&&!ninja?splashes:''}</span></div><div class="track-labels" aria-hidden="true"><span>0</span><span>1</span><span>2</span><span>3</span><span>${t("4칸")}</span></div>`;
}

function throwView() {
  const trajectory=result.sub.throw;if(!trajectory)return '';
  const label=trajectory.mode==='slide'?t("평지 이동 거리 · 근사"):t("최대 투척 거리(근사치)");
  return `<div class="throw-view"><h3>${label}</h3>${stat(t("현재 예상"),trajectory.value,t("칸"),trajectory.base)}<p class="range-gain">${t("기본보다 약 {cells}칸 · {percent}% 증가",{cells:number(trajectory.value-trajectory.base),percent:number((trajectory.value/trajectory.base-1)*100,1)})}</p>${distanceBars(trajectory.base,trajectory.value)}<div class="throw-stage ${trajectory.mode==='arc'?'arc':'flat'}" aria-hidden="true"><span class="thrower">🫳</span><span class="projectile projectile-base">●</span><span class="projectile projectile-current">●</span><span class="landing-mark landing-base" style="left:${trajectory.base/Math.max(trajectory.base,trajectory.value)*100}%"></span><span class="landing-mark" style="left:100%"></span></div></div>`;
}
function animateThrows(add){
  const trajectory=result.sub.throw;if(!trajectory)return;
  const max=Math.max(trajectory.base,trajectory.value),height=Math.max(...trajectory.basePath.map(p=>p[1]),...trajectory.path.map(p=>p[1]),.01);
  [['.projectile-base',trajectory.basePath],['.projectile-current',trajectory.path]].forEach(([selector,path])=>{
    const frames=path.map(([x,y],i)=>({left:`${x/max*100}%`,bottom:`${y/height*55}px`,offset:.15+i/(path.length-1)*.6}));
    frames.unshift({...frames[0],offset:0});frames.push({...frames.at(-1),offset:1});
    add(document.querySelector(selector),frames,2400);
  });
  add(document.querySelector('.thrower'),[{transform:'rotate(-30deg)',offset:0},{transform:'rotate(20deg)',offset:.15},{transform:'rotate(0)',offset:.3},{transform:'rotate(0)',offset:1}],2400);
}

function surgeView() {
  const {frames,baseFrames}=result.surge;
  return `<section class="result-card full-width" aria-label="${t("징어클라임 충전 비교")}">${title(t("징어클라임"))}<button id="surge-start" type="button">${t("출발")}</button><div class="surge-comparison">${[[t("기본"),baseFrames,'base'],[t("현재 조합"),frames,'current']].map(([label,time,key])=>`<div><h3>${label}</h3><div class="surge-wall"><span class="surge-squid" data-frames="${time}"><span class="surge-emoji">🐙</span></span><div class="surge-gauge"><i data-frames="${time}"></i></div></div><strong>${timeLabel(time)}</strong></div>`).join('')}</div></section>`;
}
function tenacityView() {
  const charge=result.special.tenacityCharge;
  if(!charge)return '';
  return fold(t("역경 강화 · 자동 충전"),charge.rate>0,`<label class="condition-select lde-slider" for="tenacity-deficit"><span>${t("부족한 아군 생존 인원 ")}<output id="tenacity-deficit-value">${t("{n}명 차이",{n:state.tenacityDeficit})}</output></span><input id="tenacity-deficit" aria-label="${t("역경 강화 인원 차이")}" type="range" min="0" max="3" step="1" value="${state.tenacityDeficit}"><span class="range-ends"><span>${t("0명")}</span><span>${t("3명")}</span></span></label><div class="tenacity-meter"><div class="respawn-heading"><strong id="tenacity-duration">${charge.frames?timeLabel(charge.frames):t("미발동")}</strong><small id="tenacity-rate">${number(charge.rate)} ${t("p/초")}</small></div><div class="respawn-gauge" aria-hidden="true"><i id="tenacity-fill"></i><span id="tenacity-progress">0%</span></div></div>`);
}

function respawnView() {
  const r=result.respawn;
  const toggle=state.slots.flat().includes('RespawnTime_Save')?`<label class="toggle-label"><span><strong>${t("부활 시간 단축")}</strong><small>${t("발동 조건 충족")}</small></span><input id="respawn-active" type="checkbox" role="switch" ${state.respawnActive?'checked':''}></label>`:'';
  return `<section class="result-card full-width" aria-label="${t("부활 시간 계산 결과")}">${title(t("부활 시간"))}<button id="respawn-jump-open" type="button" aria-haspopup="dialog">${t("부활+점프 테스트")}</button>${toggle}<div class="respawn-comparison">${[[t("기본"),r.baseFrames,'base'],[t("현재 조합"),r.frames,'current']].map(([label,frames,key])=>`<div class="respawn-row ${key==='base'?'respawn-base':''}"><div class="respawn-heading"><h3>${label}</h3><strong>${timeLabel(frames)}</strong></div><div class="respawn-gauge" aria-hidden="true"><i id="respawn-${key}" data-frames="${frames}"></i><span id="respawn-${key}-status">${t("부활 중")}</span></div></div>`).join('')}</div></section>`;
}

function jumpDistanceLabel() {
  return `${number(state.jumpDistance/data.rules.distancePerCell,1)} ${t("칸")}${state.jumpDistance===60?t(" 이하"):state.jumpDistance===100?t(" 이상"):''}`;
}
function jumpDistanceControl() {
  if(!result.points.equipped.includes('SuperJumpSign_Hide'))return '';
  return `<label class="jump-penalty" for="jump-distance"><span>${t("스텔스 점프 거리 ")}<output id="jump-distance-value">${jumpDistanceLabel()}</output></span><input id="jump-distance" aria-label="${t("스텔스 점프 거리")}" aria-valuetext="${jumpDistanceLabel()}" type="range" min="12" max="20" step="0.2" value="${state.jumpDistance/data.rules.distancePerCell}"><span class="range-ends"><span>${t("12칸 이하")}</span><span>${t("20칸 이상")}</span></span></label><p class="small-note">${t("추가 비행 ")}<strong id="jump-extra">${timeLabel(result.jump.extraFrames)}</strong>${t(" · 스텔스 점프 보정은 정확하지 않을 수 있습니다")}</p>`;
}
function jumpTargetControl() {
  return `<label class="toggle-label"><span>${t("비컨 대상 점프")}</span><input id="jump-target" type="checkbox" role="switch" ${state.jumpTarget==='beacon'?'checked':''}></label><label class="jump-penalty" id="jump-beacon-control" for="jump-beacon-ap" ${state.jumpTarget==='beacon'?'':'hidden'}><span>${t("설치자의 서브 성능 업")} <output id="jump-beacon-value">${number(result.jump.beaconSubAP)} AP</output></span><input id="jump-beacon-ap" type="range" min="0" max="57" step="1" value="${result.jump.beaconSubAP}" aria-valuetext="${number(result.jump.beaconSubAP)} AP"><span class="range-ends"><span>0 AP</span><span>57 AP</span></span></label>`;
}
function changeJump(id, value) {
  if(id==='jump-target') state.jumpTarget=value?'beacon':'normal';
  else if(id==='jump-beacon-ap') state.beaconSubAP=Number(value);
  else if(id==='jump-distance') state.jumpDistance=Math.round(Number(value)*data.rules.distancePerCell);
  result=calculate(state,data,catalogue);
  $('jump-target').checked=state.jumpTarget==='beacon';
  $('jump-beacon-control').hidden=state.jumpTarget!=='beacon';
  $('jump-beacon-ap').value=result.jump.beaconSubAP;
  $('jump-beacon-ap').setAttribute('aria-valuetext',`${number(result.jump.beaconSubAP)} AP`);
  $('jump-beacon-value').textContent=`${number(result.jump.beaconSubAP)} AP`;
  if($('jump-distance')) {
    $('jump-distance').value=state.jumpDistance/data.rules.distancePerCell;
    $('jump-distance-value').textContent=jumpDistanceLabel();
    $('jump-distance').setAttribute('aria-valuetext',jumpDistanceLabel());
    $('jump-extra').innerHTML=timeLabel(result.jump.extraFrames);
  }
  $('jump-metrics').innerHTML=jumpMetrics();
  animateJump();
  return {result,label:jumpDistanceLabel(),extra:timeLabel(result.jump.extraFrames),beaconLabel:`${number(result.jump.beaconSubAP)} AP`,target:state.jumpTarget};
}
function jumpMetrics() {
  const j=result.jump;
  return `${metric(t("차지"),j.chargeFrames,t("프레임"),80)}${metric(t("비행 + 패널티"),j.flightFrames+j.extraFrames,t("프레임"),138)}${metric(t("입력부터 도착까지"),j.arrivalMax,t("프레임"),218)}`;
}
function inkTank(id,frames,isBase=false) {
  return `<div class="tank-column ${isBase?'tank-base':''}"><div class="tank-frame" aria-hidden="true"><div class="tank-cap"></div><div class="tank-body"><div id="${id}" class="ink-fill"></div><div class="tank-ticks"></div><span id="${id}-percent" class="tank-percent">0%</span></div></div><p class="tank-duration">${timeLabel(frames)}</p></div>`;
}

function blastGraph(blast) {
  const rings=blast.rings,radius=rings.at(-1).radius,maxDamage=Math.max(...rings.map(r=>r.base));
  const colors=['#f2c6a0','#bdd9ec','#cfcaeb'];
  const x=distance=>42+distance/radius*298,y=damage=>160-damage/maxDamage*140;
  const path=key=>`M42 ${y(rings[0][key])}`+rings.map((r,i)=>` H${x(r.radius)} V${i===rings.length-1?160:y(rings[i+1][key])}`).join('');
  const range=`<svg class="blast-range" viewBox="0 0 200 200" role="img" aria-label="${t("폭발 범위")}">${rings.map((r,i)=>`<circle cx="100" cy="100" r="${r.radius/radius*88}" fill="${colors[i%colors.length]}" stroke="currentColor" stroke-width="1.5"/>`).reverse().join('')}<path d="M100 100 H188" stroke="currentColor" stroke-dasharray="4 3"/><circle cx="100" cy="100" r="3" fill="currentColor"/><text x="100" y="198" text-anchor="middle">${number(radius)} ${t("칸")}</text></svg>`;
  const graph=`<svg class="damage-graph" viewBox="0 0 365 210" role="img" aria-label="${t("폭발 중심에서의 거리별 피해")}">${rings.map((r,i)=>`<rect x="${x(i?rings[i-1].radius:0)}" y="20" width="${x(r.radius)-x(i?rings[i-1].radius:0)}" height="140" fill="${colors[i%colors.length]}" opacity=".65"/>`).join('')}${[0,maxDamage/2,maxDamage].map(n=>`<path d="M42 ${y(n)} H340" stroke="currentColor" opacity=".15"/><text x="35" y="${y(n)+4}" text-anchor="end">${number(n,1)}</text>`).join('')}<path d="M42 15 V160 H345" fill="none" stroke="currentColor"/><path class="damage-base" d="${path('base')}"/><path class="damage-current" d="${path('value')}"/>${[0,...rings.map(r=>r.radius)].map(n=>`<text x="${x(n)}" y="179" text-anchor="middle">${number(n)}</text>`).join('')}<text x="190" y="202" text-anchor="middle">${t("중심에서 거리")} (${t("칸")})</text></svg>`;
  return `<div class="defense-blast"><h3>${t(blast.label)}</h3><div class="defense-plots"><div><h4>${t("폭발 범위")}</h4>${range}</div><div><div class="damage-line-legend"><span class="base">${t("기본")}</span><span class="current">${t("현재 조합")}</span><span>${t("받는 피해")}</span></div>${graph}</div></div><table class="defense-table"><thead><tr><th>${t("중심에서 거리")}</th><th>${t("기본")}</th><th>${t("현재 조합")}</th></tr></thead><tbody>${rings.map((r,i)=>`<tr><td><i class="range-swatch" style="background:${colors[i%colors.length]}" aria-hidden="true"></i>${number(i?rings[i-1].radius:0)}–${number(r.radius)} ${t("칸")}</td><td>${number(r.base,1)}</td><td>${number(r.value,1)}</td></tr>`).join('')}</tbody></table></div>`;
}
function defenseEffects() {
  const d=result.defense;
  const blastViews=d.blasts.map(blastGraph).join('');
  const mark=d.marking;
  const marking=mark?`<h3>${t("마킹 지속")}</h3><div class="defense-pair defense-marking">${[[t("기본"),mark.baseFrames],[t("현재 조합"),mark.frames]].map(([label,frames])=>`<div><div class="respawn-heading"><h4>${label}</h4><strong>${timeLabel(frames)}</strong></div><div class="respawn-gauge" aria-hidden="true"><i class="marking-fill" data-frames="${frames}"></i></div></div>`).join('')}</div>`:'';
  const mist=d.mist?`<p class="small-note">${t("제공된 단계별 수치 기준")}</p>${d.mist.movement.map(m=>`<div class="mist-track"><h3>${t(m.label)}</h3>${stat(t("이동 속도"),m.value,t("칸/초"),m.base)}<p class="small-note">${t("정상 속도 대비")} ${number(m.baseRatio*100,1)}% → ${number(m.ratio*100,1)}%</p>${track(m.value,m.base,m.emoji)}</div>`).join('')}`:'';
  return `${d.blasts.length?`<p class="small-note">${t("단일 폭발 · 평지 기준")}</p><div class="defense-blasts">${blastViews}</div>`:''}${d.direct?stat(t("직격 피해"),d.direct.value,'',d.direct.base):''}${marking}${mist}`;
}
function defenseView() {
  const d=result.defense;
  return `<section class="result-card full-width" id="sub-defense-card" aria-label="${t("서브 영향 감소")}">${title(t("서브 영향 감소"))}<div class="defense-controls"><label for="enemy-sub">${t("상대 서브")}<select id="enemy-sub">${Object.keys(data.defense).map(key=>`<option value="${key}" ${key===state.enemySub?'selected':''}>${escape(locale.sub[key])}</option>`).join('')}</select></label><label id="enemy-sub-ap-control" class="condition-select lde-slider" for="enemy-sub-ap" ${d.opponentRelevant?'':'hidden'}><span>${t("상대 서브 성능 업")} <output id="enemy-sub-ap-value">${state.enemySubAP} AP</output></span><input id="enemy-sub-ap" type="range" min="0" max="57" step="1" value="${state.enemySubAP}"><span class="range-ends"><span>0 AP</span><span>57 AP</span></span></label></div><label id="mist-level-control" class="mist-level-control" for="mist-level" ${d.mist?'':'hidden'}>${t("둔화 레벨")}<select id="mist-level">${data.defense.PoisonMist.mistLevels.map((level,i)=>`<option value="${i+1}" ${state.mistLevel===i+1?'selected':''}>${t("레벨 {n}",{n:i+1})} · ${number(level.startFrames/60,1)} ${t("초")}</option>`).join('')}</select></label><div id="defense-effects">${defenseEffects()}</div></section>`;
}
function updateDefense() {
  result=calculate(state,data,catalogue);
  $('mist-level-control').hidden=!result.defense.mist;
  $('enemy-sub-ap-control').hidden=!result.defense.opponentRelevant;
  $('enemy-sub-ap-value').textContent=state.enemySubAP+' AP';
  $('defense-effects').innerHTML=defenseEffects();
  animateComparisons();
}

function renderResults() {
  document.getElementById('ink-test')?.close();
  document.getElementById('respawn-jump')?.close();
  result = calculate(state, data, catalogue);
  const {weapon,main,sub,special,movement,jump,recovery} = result;
  const baseline=calculate({...initialState(),weapon:state.weapon},data,catalogue);
  $('weapon-summary').innerHTML = `<div class="weapon-summary"><img class="weapon-art" src="../assets/Path_Wst_${escape(weapon.key)}.png" alt="${escape(locale.names[weapon.key])}"><div><p class="weight-label">${escape(locale.types[weapon.type] || weapon.type)}${result.tank > 1 ? t(" · 큰 잉크 탱크") : ''}</p><div class="kit-name"><span class="mini-kit"><img src="../assets/Wsb_${escape(weapon.sub)}00.png" alt=""></span>${escape(locale.sub[weapon.sub])}</div><div class="kit-name"><span class="mini-kit"><img src="../assets/Wsp_${escape(weapon.special)}00.png" alt=""></span>${escape(locale.special[weapon.special])}</div></div></div>`;
  $('reference-note').hidden = !weapon.reference;
  $('reference-note').textContent = weapon.reference ? t('이 무기는 {weapon}의 기본 무기 참고값입니다. 변형의 모든 동작이 같다는 뜻은 아닙니다.',{weapon:locale.names[weapon.reference]}) : '';
  const spreads = main.spread.length ? fold(t("탄퍼짐"),main.spread.some(s=>differs(s.value,s.base)),`<div class="spread-pair">${main.spread.map(s=>`<div class="spread-item"><h3>${t("{mode} 탄퍼짐",{mode:t(s.label)})}</h3><strong class="spread-number">±${number(s.value)}°<span class="baseline">${t("기본")} ±${number(s.base)}°</span></strong>${angleGraphic(s.value)}</div>`).join('')}</div>`) : `<p class="card-note">${t("지상·점프 탄퍼짐")}: ${main.spreadApplicable ? t("미확인") : t("해당 없음 — 이 무기는 같은 방식의 탄퍼짐 수치를 사용하지 않습니다.")}</p>`;
  const attackRows = main.attacks.map((a,i) => fold(t('최대 {action}',{action:t(a.label)}),differs(a.percent,baseline.main.attacks[i].percent),`${stat(t('최대 {action}',{action:t(a.label)}), a.count, t("회"), a.baseCount)}<p class="small-note">${t("1회 잉크 소비")} ${number(a.percent,3)}%</p>`)).join('');

  $('result-cards').innerHTML = `
    <section class="result-card" aria-label="${t("메인 계산 결과")}">${title(t("메인"),`Path_Wst_${weapon.key}`)}<button type="button" class="ink-test-open" data-ink-test>${t("발사 테스트")}</button>${attackRows}${spreads}</section>
    <section class="result-card" aria-label="${t("서브 계산 결과")}">${title(t("서브"),`Wsb_${weapon.sub}00`)}<p class="small-note">${escape(locale.sub[weapon.sub])}</p><button type="button" class="ink-test-open" data-ink-test>${t("테스트")}</button>${fold(t("최대 사용 횟수 · 1회 잉크 소비"),differs(sub.count,sub.baseCount)||differs(sub.percent,sub.basePercent),`<div class="paired-metrics">${metric(t("최대 사용 횟수"),sub.count,t("회"),sub.baseCount)}${metric(t("1회 잉크 소비"),Math.ceil(sub.percent*1000-1e-9)/1000,'%',sub.basePercent,3)}</div>`)}<h3>${t("서브 성능 업")}</h3>${effects(sub.effects)}${sub.throw?fold(sub.throw.mode==='slide'?t("평지 이동 거리"):t("최대 투척 거리(근사치)"),differs(sub.throw.value,sub.throw.base),throwView()):''}</section>
    <section class="result-card full-width" aria-label="${t("스페셜 계산 결과")}">${title(t("스페셜"),`Wsp_${weapon.special}00`)}<p class="small-note">${escape(locale.special[weapon.special])}</p><div class="special-grid">${fold(t("필요 포인트 · 사망 시 잃는 포인트"),differs(special.points,weapon.sp)||differs(special.loss,50),`<div class="paired-metrics special-points">${metric(t("필요 포인트"),special.points,'p',weapon.sp)}${metric(t("사망 시 잃는 포인트"),special.loss,'%',50)}</div>`)}<div><h3>${t("스페셜 성능 업")}</h3>${effects(special.effects)}${tenacityView()}</div></div></section>
    <section class="result-card full-width" aria-label="${t("잉크 회복 계산 결과")}"><div class="card-title"><h2>${t("잉크 회복")}</h2></div><div class="ink-comparison">${inkTank('ink-base',recovery.baseFrames,true)}<div class="tank-difference"><span>${t("회복 시간")}</span><strong>${recovery.baseFrames===recovery.frames?t("동일"):t('{n}초 단축',{n:seconds(recovery.baseFrames-recovery.frames)})}</strong></div>${inkTank('ink-current',recovery.frames)}</div></section>
    <section class="result-card full-width" aria-label="${t("이동 속도 계산 결과")}">${title(t("이동 속도"))}${movement.map(m=>fold(m.label,differs(m.value,m.base),`<div class="movement-row"><div class="motion-heading"><h3>${escape(t(m.label))}</h3><div class="speed-value">${number(m.value,3)} <small>${m.value == null ? '' : t("칸/초")}</small></div></div>${m.note ? `<p class="small-note">${escape(t(m.note))}</p>` : ''}${track(m.value,m.base,m.emoji,m.enemyInk)}</div>`)).join('')}</section>
    ${surgeView()}
    <section class="result-card full-width" aria-label="${t("슈퍼 점프 계산 결과")}">${title(t("슈퍼 점프"))}<div id="jump-metrics" class="jump-metrics">${jumpMetrics()}</div>${jumpTargetControl()}${jumpDistanceControl()}<button id="jump-start" type="button">${t("출발")}</button><div class="jump-stage" aria-hidden="true"><span id="jumper" class="jumper"><span id="jump-emoji">🐙</span></span></div><div class="jump-caption"><span>${t("출발")}</span><span>${t("도착")}</span></div></section>${respawnView()}${defenseView()}`;
  const changed=[
    main.attacks.some((a,i)=>differs(a.percent,baseline.main.attacks[i].percent))||main.spread.some(s=>differs(s.value,s.base)),
    differs(sub.percent,sub.basePercent)||sub.effects.some(e=>differs(e.value,e.base)),
    differs(special.points,weapon.sp)||differs(special.loss,50)||special.effects.some(e=>differs(e.value,e.base))||special.tenacity>0,
    differs(recovery.frames,recovery.baseFrames),
    movement.some(m=>differs(m.value,m.base)),
    differs(result.surge.frames,result.surge.baseFrames),
    differs(jump.chargeFrames,80)||differs(jump.flightFrames+jump.extraFrames,138),
    differs(result.respawn.frames,result.respawn.baseFrames),
    result.defense.ap>0,
  ];
  $('result-cards').querySelectorAll(':scope > section').forEach((section,i)=>{
    const heading=section.querySelector('.card-title');
    if(i===0){
      const button=section.querySelector('[data-ink-test]');
      button.classList.add('main-test-button');
      heading.querySelector('.kit-badge').before(button);
    }
    const details=document.createElement('details');details.className='section-fold';details.open=changed[i];
    const summary=document.createElement('summary');
    summary.append(heading);details.append(summary);
    const body=document.createElement('div');body.className='section-content';
    while(section.firstChild)body.append(section.firstChild);
    details.append(body);section.append(details);
  });
  $('tenacity-deficit')?.addEventListener('input',event=>{
    state.tenacityDeficit=Number(event.target.value);
    $('tenacity-deficit-value').textContent=t('{n}명 차이',{n:state.tenacityDeficit});
    result=calculate(state,data,catalogue);
    animateTenacity();
  });
  $('respawn-jump-open').addEventListener('click',()=>openRespawnJump(result,baseline,t,timeLabel,seconds,jumpTargetControl()+jumpDistanceControl(),changeJump));
  $('respawn-active')?.addEventListener('change',event=>{
    state.respawnActive=event.target.checked;
    update();
    $('respawn-active').closest('.section-fold').open=true;
    $('respawn-active').focus({preventScroll:true});
  });
  $('mist-level').addEventListener('change',event=>{state.mistLevel=Number(event.target.value);updateDefense();});
  $('enemy-sub').addEventListener('change',event=>{state.enemySub=event.target.value;updateDefense();});
  $('enemy-sub-ap').addEventListener('input',event=>{state.enemySubAP=Number(event.target.value);updateDefense();});
  renderAP();
  animateJump();
  animateInk();
  animateComparisons();
  ['jump-target','jump-beacon-ap','jump-distance'].forEach(id=>{
    $(id)?.addEventListener(id==='jump-target'?'change':'input',event=>changeJump(id,id==='jump-target'?event.target.checked:event.target.value));
  });
}

function animateInk() {
  tankAnimations.forEach(animation=>animation.cancel());
  cancelAnimationFrame(inkAnimationId);
  const cycle=(result.recovery.baseFrames/60+1)*1000;
  const configs=[['ink-base',result.recovery.baseFrames],['ink-current',result.recovery.frames]];
  tankAnimations=configs.map(([id,frames])=>{
    const animation=$(id).animate([{height:'0%',offset:0},{height:'100%',offset:(frames/60*1000)/cycle},{height:'100%',offset:1}],{duration:cycle,iterations:Infinity,easing:'linear'});
    if(paused||document.hidden)animation.pause();return animation;
  });
  function percentages(){
    configs.forEach(([id,frames],i)=>{
      const elapsed=Number(tankAnimations[i].currentTime||0)%cycle;
      $(id+'-percent').textContent=`${Math.min(100,Math.floor(elapsed/(frames/60*1000)*100))}%`;
    });
    inkAnimationId=requestAnimationFrame(percentages);
  }
  percentages();
}

function animateComparisons() {
  comparisonAnimations.forEach(animation=>animation.cancel());comparisonAnimations=[];manualGroups=manualGroups.filter(group=>group.animations.includes(jumpAnimation));
  const add=(node,frames,duration)=>{
    const animation=node.animate(frames,{duration,iterations:Infinity,easing:'linear'});
    if(paused||document.hidden)animation.pause();comparisonAnimations.push(animation);return animation;
  };
  document.querySelectorAll('.motion-track').forEach(track=>{
    const first=comparisonAnimations.length;
    const speeds=[Number(track.dataset.base),Number(track.dataset.speed)];
    const timing=movementTiming(...speeds);
    track.querySelectorAll('.runner').forEach((runner,i)=>{
      const end=timing.returns[i];
      add(runner,[{left:'0%',offset:0},{left:'100%',offset:end/2},{left:'0%',offset:end},{left:'0%',offset:1}],timing.duration);
      const swimmer=runner.querySelector('.swim-emoji');
      if(swimmer)add(swimmer,[{transform:'rotate(90deg)',offset:0},{transform:'rotate(90deg)',offset:end/2},{transform:'rotate(-90deg)',offset:end/2},{transform:'rotate(-90deg)',offset:end},{transform:'rotate(90deg)',offset:end},{transform:'rotate(90deg)',offset:1}],timing.duration);
      const human=runner.querySelector('.human-emoji');
      if(human)add(human,[{transform:'scaleX(-1)',offset:0},{transform:'scaleX(-1)',offset:end/2},{transform:'scaleX(1)',offset:end/2},{transform:'scaleX(1)',offset:end},{transform:'scaleX(-1)',offset:end},{transform:'scaleX(-1)',offset:1}],timing.duration);
      runner.querySelectorAll('.splash').forEach((particle,j)=>add(particle,[{opacity:.75,transform:'translate(0,0) scale(.4)',offset:0},{opacity:0,transform:'translate(var(--dx),var(--dy,-13px)) scale(1)',offset:.8},{opacity:0,offset:1}],430+j*55));
    });
    const animations=comparisonAnimations.slice(first);
    animations.forEach(animation=>{
      const particle=animation.effect.target.classList.contains('splash');
      const iterations=particle?Math.ceil(timing.duration/animation.effect.getTiming().duration):1;
      animation.effect.updateTiming({iterations,duration:timing.duration/iterations,fill:'forwards'});
    });
    manualStart(track.previousElementSibling,animations);
  });
  if(result.defense.marking){
    const cycle=(result.defense.marking.baseFrames/60+1)*1000;
    document.querySelectorAll('.marking-fill').forEach(node=>{
      const end=Number(node.dataset.frames)/60*1000/cycle;
      add(node,[{width:'100%',offset:0},{width:'0%',offset:end},{width:'0%',offset:1}],cycle);
    });
  }
  const surgeFirst=comparisonAnimations.length;
  const cycle=(result.surge.baseFrames/60+1.2)*1000;
  document.querySelectorAll('.surge-gauge i').forEach(node=>{
    const charge=Number(node.dataset.frames)/60*1000/cycle;
    add(node,[{height:'0%',offset:0},{height:'100%',offset:charge},{height:'100%',offset:1}],cycle);
  });
  document.querySelectorAll('.surge-squid').forEach(node=>{
    const charge=Number(node.dataset.frames)/60*1000/cycle;
    const steps=Math.max(2,Math.ceil(charge*cycle/40));
    const shake=Array.from({length:steps},(_,i)=>({offset:i/steps*charge,transform:`translateX(${i%2?1.5:-1.5}px) rotate(${i%2?5:-5}deg)`}));
    shake.push({offset:charge,transform:'translateX(0) rotate(0deg)'},{offset:1,transform:'translateX(0) rotate(0deg)'});
    add(node.querySelector('.surge-emoji'),shake,cycle);
    add(node,[{transform:'translateY(0)',offset:0},{transform:'translateY(0)',offset:charge},{transform:'translateY(-70px)',offset:charge+250/cycle},{transform:'translateY(-70px)',offset:1}],cycle);
  });
  const surgeAnimations=comparisonAnimations.slice(surgeFirst);
  surgeAnimations.forEach(animation=>animation.effect.updateTiming({iterations:1,fill:'forwards'}));
  manualStart($('surge-start'),surgeAnimations);
  cancelAnimationFrame(respawnAnimationId);
  const respawnCycle=(Math.max(result.respawn.frames,result.respawn.baseFrames)/60+1)*1000;
  const respawnAnimations=['base','current'].map(key=>{
    const node=$('respawn-'+key),duration=Number(node.dataset.frames)/60*1000;
    add(node,[{width:'0%',offset:0},{width:'100%',offset:duration/respawnCycle},{width:'100%',offset:1}],respawnCycle);
    return {key,duration,animation:comparisonAnimations.at(-1)};
  });
  function respawnStatus(){
    for(const {key,duration,animation} of respawnAnimations){
      const elapsed=Number(animation.currentTime||0)%respawnCycle;
      $('respawn-'+key+'-status').textContent=elapsed>=duration?t("부활 완료"):`${Math.min(99,Math.floor(elapsed/duration*100))}%`;
    }
    respawnAnimationId=requestAnimationFrame(respawnStatus);
  }
  respawnStatus();
  animateTenacity();
  animateThrows(add);
}

function animateTenacity() {
  cancelAnimationFrame(tenacityAnimationId);
  tenacityAnimation?.cancel();tenacityAnimation=null;
  const charge=result.special.tenacityCharge;
  if(!charge)return;
  $('tenacity-duration').innerHTML=charge.frames?timeLabel(charge.frames):t("미발동");
  $('tenacity-rate').textContent=number(charge.rate)+t(" p/초");
  $('tenacity-progress').textContent='0%';
  if(!charge.frames)return;
  const duration=charge.frames/data.rules.fps*1000,cycle=duration+1000;
  tenacityAnimation=$('tenacity-fill').animate([{width:'0%',offset:0},{width:'100%',offset:duration/cycle},{width:'100%',offset:1}],{duration:cycle,iterations:Infinity,easing:'linear'});
  if(paused||document.hidden)tenacityAnimation.pause();
  function chargeStatus(){
    const elapsed=Number(tenacityAnimation.currentTime||0)%cycle;
    $('tenacity-progress').textContent=elapsed>=duration?t("사용 가능"):Math.floor(elapsed/duration*100)+'%';
    tenacityAnimationId=requestAnimationFrame(chargeStatus);
  }
  chargeStatus();
}

function animateJump() {
  manualGroups=manualGroups.filter(group=>!group.animations.includes(jumpAnimation));
  jumpAnimation?.cancel();cancelAnimationFrame(phaseAnimationId);
  const {chargeFrames,arrivalMax}=result.jump;
  const legFrames=arrivalMax+60, duration=legFrames/60*1000;
  const charge=chargeFrames/legFrames, arrival=arrivalMax/legFrames, frames=[];
  for(let leg=0;leg<2;leg++) {
    const left=leg===0?'0%':'100%',dest=leg===0?'100%':'0%';
    frames.push({offset:leg/2,left,transform:'translate(-50%,0px)'},{offset:(leg+charge)/2,left,transform:'translate(-50%,0px)'});
    for(let i=1;i<=24;i++){
      const t=i/24;
      frames.push({offset:(leg+charge+(arrival-charge)*t)/2,left:`${(leg===0?t:1-t)*100}%`,transform:`translate(-50%,${-Math.sin(Math.PI*t)*75}px)`});
    }
    frames.push({offset:(leg+1)/2,left:dest,transform:'translate(-50%,0px)'});
  }
  jumpAnimation=$('jumper').animate(frames,{duration:duration*2,iterations:1,fill:'forwards',easing:'linear'});
  manualStart($('jump-start'),[jumpAnimation]);
  function phase(){
    const elapsed=jumpAnimation.playState==='finished'?duration:Number(jumpAnimation.currentTime||0)%duration;
    const charging=jumpAnimation.playState==='running'&&elapsed<chargeFrames/60*1000,landed=elapsed>=arrivalMax/60*1000;
    $('jump-emoji').textContent=landed?'🧍‍♂️':'🐙';
    $('jump-emoji').classList.toggle('charging',charging);
    phaseAnimationId=requestAnimationFrame(phase);
  }
  phase();
}

function applyMotion() {
  document.body.classList.toggle('paused',paused);
  [jumpAnimation,...tankAnimations,...comparisonAnimations,tenacityAnimation].filter(Boolean).forEach(animation=>{
    const group=manualGroups.find(group=>group.animations.includes(animation));
    if(group&&(!group.started||animation.playState==='finished'))return;
    paused?animation.pause():animation.play();
  });
}

function update() {
  try {
    renderResults();$('error').hidden = true;
    const params = new URLSearchParams(location.search);
    params.set('lang', $('language').value);
    const search = selectionSearch(state, params);
    if (search !== location.search || location.hash) history.replaceState(history.state, '', location.pathname + search);
  }
  catch(error) {$('error').textContent = t('계산을 완료할 수 없습니다. 데이터를 다시 불러와 주세요.');$('error').hidden = false;}
}

async function init() {
  catalogue = window.WEAPON_DATA;
  if (!catalogue) throw new Error(t("무기 데이터를 불러오지 못했습니다."));
  await setupLanguage(catalogue, () => {
    locale = catalogue.languages[document.getElementById('language').value];
    if (!data) return;
    renderPalette();selectAbility(selectedAbility);renderGear();filterWeapons();renderConditions();update();applyStatic();
  });
  const response = await fetch('./data.json?v=20260921-sub-defense');
  if (!response.ok) throw new Error(t('계산 데이터를 불러오지 못했습니다 ({n}).',{n:response.status}));
  data = validateData(await response.json(),catalogue);
  state = readSelection(location.search, data, catalogue);
  locale = catalogue.languages[document.getElementById('language').value];
  renderPalette();renderGear();filterWeapons();renderConditions();update();applyMotion();bindPalette();
  const links = [["무기·서브·스페셜 원본 데이터",data.sources.game.replace('raw.githubusercontent.com','github.com').replace(`/${data.commit}/`,`/tree/${data.commit}/`)],["기어 효과 원본 곡선",data.sources.game+data.sources.curves],["기어 효과·계산식 조사",`https://leanny.github.io/splat3/ability.html`],["조건 중첩·생략된 기본값 대조",data.sources.supplement],["연습장 거리 단위",data.sources.units]];
  $('source-links').innerHTML = links.map(([name,url])=>`<li><a data-l10n="${escape(name)}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(t(name))} ↗</a></li>`).join('');
  $('load-status').hidden = true;$('workspace').hidden = false;applyStatic();
  $('result-cards').addEventListener('click', event => {
    if (event.target.closest('[data-ink-test]')) {
      event.preventDefault();
      openInkTest(result, catalogue.parameters[result.weapon.actor], locale, t);
    }
  });
  $('copy-link').addEventListener('click', async event => {
    const url = new URL(location.href);
    url.search = selectionSearch(state, new URLSearchParams({lang:$('language').value}));
    url.hash = '';
    if (event.shiftKey) url.href = 'https://amenorica.github.io/s3w/gear/' + url.search;
    $('share-status').textContent = '';
    try { await navigator.clipboard.writeText(url.href); $('share-status').textContent = t('링크를 복사했습니다.'); }
    catch { window.prompt(t('링크를 복사해 주세요.'), url.href); }
  });
  $('export-image').addEventListener('click', async event => {
    const button = $('export-image'), weapon = state.weapon;
    button.disabled = true; $('share-status').textContent = '';
    try {
      const blob = await selectionImage(state, data, event.shiftKey ? 1 : 3), url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `splatoon3-${weapon}-gear.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { $('share-status').textContent = t('이미지를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { button.disabled = false; }
  });
  $('weapon-search').addEventListener('input',filterWeapons);
  window.addEventListener('popstate', () => {
    state = readSelection(location.search, data, catalogue);
    selectAbility(null);renderGear();filterWeapons();renderConditions();update();
  });
  $('weapon').addEventListener('change',event=>{state.weapon=event.target.value;update();});
  $('conditions').addEventListener('input',event=>{
    if(event.target.id!=='lde-stage')return;
    state.ldeStage=Number(event.target.value);
    $('lde-value').textContent=ldeLabel();
    event.target.setAttribute('aria-valuetext',ldeLabel());
    update();
  });
  $('conditions').addEventListener('change',event=>{
    if(event.target.dataset.condition){const key=event.target.dataset.condition;state.active=state.active.filter(k=>k!==key);if(event.target.checked)state.active.push(key);renderConditions();}
    if(event.target.id==='lde-stage')return;
    if(event.target.id==='enemy-respawn-penalty')state.enemyRespawnPenalty=event.target.checked;
    update();
  });
  $('cooler').addEventListener('change',event=>{state.cooler=event.target.checked;update();});
  $('reset').addEventListener('click',()=>{state={...initialState(),weapon:state.weapon};selectedAbility=null;renderPalette();renderGear();renderConditions();$('palette-status').textContent='';update();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){[jumpAnimation,...tankAnimations,...comparisonAnimations,tenacityAnimation].filter(animation=>animation?.playState==='running').forEach(animation=>animation.pause());document.body.classList.add('paused');}
    else applyMotion();
  });
}
init().catch(error=>{$('load-status').hidden=true;$('error').textContent=error.message;$('error').hidden=false;});
