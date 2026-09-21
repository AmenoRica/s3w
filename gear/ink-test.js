// The test owns only temporary tank/input state; calculation results remain immutable.
const positive = n => Number.isFinite(n) && n > 0;
export function testProfile(result, params) {
  const wp = params.WeaponParam || {}, type = result.weapon.type;
  const spinner = type === 'Spinner';
  // Omitted Splattershot default, independently measured at 6F (v11.0).
  // https://wikiwiki.jp/splatoon3mix/ブキ/スプラシューター
  const repeat = wp.RepeatFrame ?? (result.weapon.actor === 'WeaponShooterNormal' ? 6 : null);
  const modes = result.main.attacks.map(a => ({...a, interval:null}));
  if (['Shooter','Blaster','Maneuver','Slosher'].includes(type) && !result.weapon.actor.includes('ShooterTriple')) modes[0].interval = positive(repeat) ? repeat : null;
  if (type === 'Charger' || type === 'Stringer') {
    const charge = type === 'Charger' ? wp : params.spl__WeaponStringerParam?.ChargeParam || {};
    const full = modes[0], tap = modes[1];
    modes.splice(0,modes.length,{...tap,chargeFrames:0},{...full,chargeFrames:charge.ChargeFrameFullCharge ?? (/^WeaponChargerNormal(?:Scope)?$/.test(result.weapon.actor)?60:null)});
    if(type === 'Stringer') {
      const factor = positive(charge.InkConsumeFullCharge) ? full.percent/charge.InkConsumeFullCharge : null;
      modes.splice(1,0,{label:'1차지',percent:positive(factor)&&positive(charge.InkConsumeMidCharge)?factor*charge.InkConsumeMidCharge:null,chargeFrames:charge.ChargeFrameMidCharge,interval:null});
    }
  }
  if(type === 'Shooter' && result.weapon.actor.includes('ShooterTriple')) {
    modes[0].interval=wp.RepeatFrame;
    modes[0].burstGap=wp.TripleShotSpanFrame+2;
    modes[1].interval=2*wp.RepeatFrame+wp.TripleShotSpanFrame+2;
  }
  if(type === 'Shooter' && params.VariableWeaponParam) {
    const variable=params.VariableWeaponParam;
    modes[0].followCost=modes[0].percent*variable.InkConsume/wp.InkConsume;
    modes[0].followInterval=variable.RepeatFrame;
    modes[0].followStart=wp.VariableShotRepeatStartFrame;
  }
  if(type === 'Maneuver') {
    const step=params.SideStepParam || {};
    const factor=positive(wp.InkConsume)?modes[0].percent/wp.InkConsume:null;
    // Missing defaults cross-checked with the Splat Dualies, Glooga and Quad
    // measurements at wikiwiki.jp/splatoon3mix/ブキ (16F move / 4F charge / 4F lock).
    const moveFrames=step.MoveFrame ?? 16;
    modes.push({label:'구르기+사격',percent:modes[0].percent,interval:wp.LapOver_RepeatFrame,
      rollCost:positive(factor)&&positive(step.InkConsume)?step.InkConsume*factor:null,
      rollFrames:step.IsShootableInMove?moveFrames:moveFrames+(step.ChargeFrame??4)+(step.UnrelaxFrameNoWeapon??4)});
  }
  if (type === 'Brush') modes[0].interval = params.WeaponRollParam?.SwingRepeatFrame || null;
  // Swing duration alone is not an attack interval. Unknown timing stays manual.
  let stages = [];
  if (spinner) {
    const variable = Boolean(params.VariableShotParam);
    const full = {...wp,...params.WeaponFullChargeParam};
    const bullets = (duration, interval) => positive(duration) && positive(interval) ? Math.floor(duration / interval) + 1 : null;
    const firstShots = bullets(wp.MaxShootingFrame_First,wp.RepeatFrame);
    const fullShots = bullets(full.MaxShootingFrame_Second,full.RepeatFrame);
    const cost = modes[0].percent;
    // Fixed completed stages only; no interpolation of partial-charge consumption.
    // Stage cost follows loaded-bullet ratio. Cross-checked against Mini (11/22),
    // Hydra (33/66), Heavy Edit (31/61) in wikiwiki.jp/splatoon3mix/ブキ.
    stages = [
      {label:'1차지', frames:wp.ChargeFrame_First, percent:!variable && firstShots && fullShots && positive(cost) ? cost*firstShots/fullShots : null, shots:firstShots, interval:wp.RepeatFrame},
      {label:'풀 차지', frames:wp.ChargeFrame_Second, percent:cost, shots:variable ? null : fullShots, interval:full.RepeatFrame},
    ];
    if(result.weapon.actor === 'WeaponSpinnerDownpour') {
      // Fixed-stage measurements (v11.0); 12.78% is the source's rounded value.
      // https://wikiwiki.jp/splatoon3mix/ブキ/クーゲルシュライバー
      // Both stages begin with 10 short-range shots, then switch to 5F intervals.
      stages = [
        {label:'1차지',frames:50,percent:cost*12.78/25,shots:23,interval:wp.RepeatFrame,shortShots:10,longInterval:params.VariableShotParam.RepeatFrame},
        {label:'풀 차지',frames:wp.ChargeFrame_Second,percent:cost,shots:45,interval:wp.RepeatFrame,shortShots:10,longInterval:params.VariableShotParam.RepeatFrame},
      ];
    }
  }
  return {spinner,modes,stages,sub:result.sub.percent};
}
export function spendInk(ink, cost) {
  if (!Number.isFinite(ink) || ink < 0 || ink > 100 || !positive(cost) || cost > ink+1e-9) return null;
  return Math.max(0,ink-cost);
}
export function openInkTest(result, params, locale, t) {
  document.getElementById('ink-test')?.close();
  const profile = testProfile(result,params);
  const attacks = profile.spinner ? profile.stages : profile.modes;
  const separateCounts = ['Spinner','Charger','Stringer','Saber','Roller'].includes(result.weapon.type);
  const dialog = document.createElement('dialog');
  dialog.id='ink-test'; dialog.className='ink-test-dialog';
  dialog.setAttribute('aria-labelledby','ink-test-title');
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = key => esc(t(key));
  dialog.innerHTML=`<div class="test-heading"><div><p class="eyebrow">INK TEST</p><h2 id="ink-test-title">${text('잉크 효율 테스트')}</h2></div><button type="button" data-close aria-label="${text('닫기')}">×</button></div>
    <div class="test-weapon"><img src="../assets/Path_Wst_${esc(result.weapon.key)}.png" alt=""><strong>${esc(locale.names[result.weapon.key])}</strong></div>
    <div class="test-readout"><div class="test-tank" role="meter" aria-label="${text('남은 잉크')}" aria-valuemin="0" aria-valuemax="100"><i></i><span class="test-sub-line" aria-label="${text('서브')} ${result.sub.percent.toFixed(1)}%" style="bottom:${Math.min(100,result.sub.percent)}%"></span><strong>100%</strong></div><div><p>${text('메인')} <output data-main-count>0</output> · ${text('서브')} <output data-sub-count>0</output></p>${separateCounts?attacks.map((attack,i)=>`<p>${text(attack.label)} <output data-mode-count="${i}">0</output></p>`).join(''):''}${result.weapon.type==='Maneuver'?`<p>${text('구르기')} <output data-roll-count>0</output></p>`:''}<p data-status role="status">${text('준비')}</p><div class="test-shot-view" aria-hidden="true"><span>●</span></div></div></div>
    <div class="test-controls">${attacks.map((attack,i)=>`<button type="button" data-main="${i}" ${positive(attack.percent)?'':'disabled'}>${text(attacks.length===1?'메인 발사':attack.label)}</button>`).join('')}<button type="button" data-sub>${text('서브 사용')}</button></div>
    <button type="button" class="test-refill" data-refill>${text('잉크 채우기')}</button>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const modeCounts=attacks.map(()=>0);
  let rollCount=0;
  let ink=100, mainCount=0, subCount=0, held=false, activeMode=0, raf=0, nextShot=0, shotsLeft=0, interval=0, readyAt=0, pointer=null, shotAnimation, holdShots=0, refilling=false, refillStart=0, refillInk=100, refillPointer=null;
  const abort=new AbortController();
  const on=(node,event,fn)=>node.addEventListener(event,fn,{signal:abort.signal});
  const mode=()=>attacks[activeMode];
  const status=key=>{$('[data-status]').textContent=t(key);};
  const paint=()=>{
    $('.test-tank').setAttribute('aria-valuenow',String(ink));
    $('.test-tank i').style.height=ink+'%';
    $('.test-tank strong').textContent=ink.toFixed(1)+'%';
    dialog.querySelectorAll('[data-mode-count]').forEach(node=>{node.value=String(modeCounts[Number(node.dataset.modeCount)]);});
    if($('[data-roll-count]'))$('[data-roll-count]').value=String(rollCount);
    $('[data-main-count]').value=String(mainCount);$('[data-sub-count]').value=String(subCount);
  };
  const pulse=()=>{
    shotAnimation?.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) shotAnimation=$('.test-shot-view span').animate([{transform:'translateX(0)',opacity:1},{transform:'translateX(110px)',opacity:0}],{duration:180});
  };
  const pay=cost=>{
    const remaining=spendInk(ink,cost);
    if(remaining===null){status(positive(cost)?'잉크 부족':'미확인');return false;}
    ink=remaining;paint();return true;
  };
  const fire=()=>{if(!pay(holdShots>0&&positive(mode().followCost)?mode().followCost:mode().percent))return false;holdShots++;mainCount++;modeCounts[activeMode]++;paint();pulse();status('발사');return true;};
  const shotGap=()=>mode().burstGap&&holdShots%3===0?mode().burstGap:positive(mode().followInterval)?(holdShots===1?mode().followStart:mode().followInterval):mode().interval;
  const stop=()=>{refilling=false;refillPointer=null;held=false;pointer=null;shotsLeft=0;cancelAnimationFrame(raf);};
  const frame=now=>{
    if(!dialog.open)return;
    if(refilling){ink=Math.min(100,refillInk+(now-refillStart)*60/(result.recovery.frames*1000)*100);paint();if(ink<100)raf=requestAnimationFrame(frame);return;}
    if(held && !profile.spinner && positive(mode().interval)) {
      while(now>=nextShot){if(!fire()){held=false;break;}readyAt=nextShot+shotGap()*1000/60;nextShot=readyAt;}
    }
    while(shotsLeft>0 && now>=nextShot){mainCount++;shotsLeft--;paint();pulse();nextShot+=(mode().shortShots && mode().shots-shotsLeft>mode().shortShots?mode().longInterval:interval)*1000/60;}
    if(held||shotsLeft)raf=requestAnimationFrame(frame);else if(profile.spinner)status('준비');
  };
  const start=index=>{
    if(held||refilling||shotsLeft||performance.now()<readyAt)return;
    activeMode=index;holdShots=0;
    if(profile.spinner){
      if(!pay(mode().percent))return;
      modeCounts[activeMode]++;
      shotsLeft=mode().shots||1;interval=mode().interval;nextShot=performance.now();
      status('발사');frame(nextShot);return;
    }
    held=true;
    if(Object.hasOwn(mode(),'rollCost')){
      if(!pay(mode().rollCost)){held=false;return;}
      rollCount++;paint();status('구르기+사격');
      readyAt=performance.now()+mode().rollFrames*1000/60;nextShot=readyAt;
      shotAnimation?.cancel();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)shotAnimation=$('.test-shot-view span').animate([{transform:'translateX(0) rotate(0deg)'},{transform:'translateX(35px) rotate(360deg)'}],{duration:mode().rollFrames*1000/60});
      raf=requestAnimationFrame(frame);return;
    }
    if(!fire()){held=false;return;}
    if(positive(mode().interval)){readyAt=performance.now()+shotGap()*1000/60;nextShot=readyAt;raf=requestAnimationFrame(frame);}
  };
  const release=()=>{held=false;if(!shotsLeft)cancelAnimationFrame(raf);};
  dialog.querySelectorAll('[data-main]').forEach(button=>{
    const index=Number(button.dataset.main);
    on(button,'pointerdown',e=>{if(e.button!==0||!e.isPrimary||pointer!==null)return;e.preventDefault();button.focus();pointer=e.pointerId;button.setPointerCapture(e.pointerId);start(index);});
    on(button,'pointerup',e=>{if(e.pointerId===pointer){pointer=null;release();}});
    on(button,'pointercancel',()=>{stop();status('준비');});
    on(button,'lostpointercapture',()=>{if(pointer!==null){stop();status('준비');}});
    on(button,'keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)start(index);}});
    on(button,'keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();release();}});
    on(button,'click',e=>{if(e.detail===0&&!held){start(index);release();}});
    on(button,'blur',()=>{stop();status('준비');});
  });
  on($('[data-sub]'),'click',()=>{stop();if(pay(profile.sub)){subCount++;paint();pulse();status('서브 사용');}});
  const refill=()=>{stop();refilling=true;refillStart=performance.now();refillInk=ink;status('잉크 채우기');raf=requestAnimationFrame(frame);};
  const endRefill=()=>{if(!refilling)return;ink=Math.min(100,refillInk+(performance.now()-refillStart)*60/(result.recovery.frames*1000)*100);stop();paint();status('준비');};
  const refillButton=$('[data-refill]');
  on(refillButton,'pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();refillButton.focus();refill();refillPointer=e.pointerId;refillButton.setPointerCapture(e.pointerId);});
  on(refillButton,'pointerup',e=>{if(e.pointerId===refillPointer)endRefill();});
  on(refillButton,'pointercancel',endRefill);on(refillButton,'lostpointercapture',endRefill);
  on(refillButton,'keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)refill();}});
  on(refillButton,'keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();endRefill();}});
  on(refillButton,'blur',endRefill);
  on($('[data-close]'),'click',()=>dialog.close());
  on(window,'blur',()=>{stop();status('준비');});
  on(document,'visibilitychange',()=>{if(document.hidden){stop();status('준비');}});
  on(dialog,'close',()=>{stop();shotAnimation?.cancel();abort.abort();dialog.remove();});
  paint();dialog.showModal();$('[data-main]:not(:disabled)').focus();
}
