export function journeyAt(respawn, jump, frame) {
  const takeoff = respawn + jump.chargeFrames;
  const total = respawn + jump.arrivalMax;
  const progress = Math.max(0, Math.min(1, (frame - takeoff) / (total - takeoff)));
  return {total, progress, phase: frame < respawn ? '부활 중' : frame < takeoff ? '차지 중' : frame < total ? '비행 중' : '도착'};
}

export function openRespawnJump(result, baseline, t, duration, seconds, distanceControl, changeDistance) {
  const dialog = document.createElement('dialog');
  dialog.id = 'respawn-jump';
  dialog.className = 'ink-test-dialog respawn-jump-dialog';
  dialog.setAttribute('aria-labelledby', 'respawn-jump-title');
  const rows = [baseline, result].map(r => ({respawn:r.respawn.frames, jump:r.jump}));
  const totals = rows.map(r => journeyAt(r.respawn, r.jump, 0).total);
  dialog.innerHTML = `<div class="test-heading"><h2 id="respawn-jump-title">${t('부활+점프')}</h2><button type="button" aria-label="${t('닫기')}">×</button></div><p class="small-note">${t('사망 → 부활 → 슈퍼 점프 → 도착')}</p><button id="journey-start" type="button">${t("출발")}</button>${distanceControl.replaceAll('jump-distance','journey-distance').replaceAll('jump-extra','journey-extra')}<div class="journey-summaries">${rows.map((r,i)=>`<section class="journey-row ${i?'':'respawn-base'}"><div class="respawn-heading"><h3>${t(i?'현재 조합':'기본')}</h3><strong>${duration(totals[i])}</strong></div><p class="small-note">${t('부활 시간')} ${seconds(r.respawn)} + ${t('슈퍼 점프')} ${seconds(r.jump.arrivalMax)} ${t('초')}</p></section>`).join('')}</div><div class="journey-gauges">${rows.map((r,i)=>`<div class="${i?'':'respawn-base'}"><div class="respawn-gauge" role="progressbar" aria-label="${t(i?'현재 조합':'기본')} · ${t('부활 시간')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i><b>${t(i?'현재 조합':'기본')}</b><span>0%</span></div></div>`).join('')}</div><div class="journey-track" aria-hidden="true"><span class="journey-home">🏠</span><span class="journey-traveler journey-base">👻</span><span class="journey-traveler journey-current">👻</span><span class="journey-end">⚑</span></div><div class="jump-caption"><span>${t('출발')}</span><span>${t('도착')}</span></div>`;
  document.body.append(dialog);
  const nodes = [...dialog.querySelectorAll('.journey-row')];
  const travelers = [...dialog.querySelectorAll('.journey-traveler')];
  const visuals = [...dialog.querySelectorAll('.respawn-gauge')].map((gauge,i)=>({gauge,fill:gauge.querySelector('i'),label:gauge.querySelector('span'),traveler:travelers[i]}));
  visuals.forEach(({fill})=>{fill.style.width='100%';fill.style.transformOrigin='left';fill.style.transform='scaleX(0)';});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cycle = Math.max(...totals);
  let frame = 0, previous = null, raf, started = false;
  function draw(now) {
    if (previous !== null && !document.hidden) frame = Math.min(cycle, frame + (now-previous)*60/1000);
    previous = now;
    rows.forEach((r,i)=>{
      const at = journeyAt(r.respawn,r.jump,reduced&&started?totals[i]:frame);
      const progress = Math.min(1, (reduced&&started?totals[i]:frame)/r.respawn);
      const percent = Math.floor(progress*100);
      const {gauge,fill,label,traveler} = visuals[i];
      fill.style.transform = `scaleX(${progress})`;
      if(label.textContent !== `${percent}%`){
        label.textContent = `${percent}%`;
        gauge.setAttribute('aria-valuenow',String(percent));
      }
      traveler.style.left = `${at.progress*100}%`;
      traveler.style.transform = `translate(-50%,${-Math.sin(Math.PI*at.progress)*55}px)`;
      const emoji = at.phase === '부활 중' ? '👻' : at.phase === '도착' ? '🧍‍♂️' : '🐙';
      if(traveler.textContent !== emoji)traveler.textContent=emoji;
      traveler.classList.toggle('charging',started && !reduced && at.phase === '차지 중');
    });
    if (started && !reduced && frame<cycle) raf = requestAnimationFrame(draw);
  }
  dialog.querySelector('#journey-distance')?.addEventListener('input',event=>{
    const next = changeDistance(event.target.value);
    rows[1] = {respawn:next.result.respawn.frames,jump:next.result.jump};
    totals[1] = journeyAt(rows[1].respawn,rows[1].jump,0).total;
    cycle = Math.max(...totals);
    nodes[1].querySelector('.respawn-heading strong').innerHTML = `${duration(totals[1])}`;
    nodes[1].querySelector('.small-note').textContent = `${t('부활 시간')} ${seconds(rows[1].respawn)} + ${t('슈퍼 점프')} ${seconds(rows[1].jump.arrivalMax)} ${t('초')}`;
    dialog.querySelector('#journey-distance-value').textContent = next.label;
    event.target.setAttribute('aria-valuetext',next.label);
    dialog.querySelector('#journey-extra').innerHTML = next.extra;
    frame=0;previous=null;started=false;
    cancelAnimationFrame(raf);
    draw(performance.now());
  });
  dialog.querySelector('#journey-start').addEventListener('click',()=>{
    cancelAnimationFrame(raf);frame=0;previous=null;started=true;draw(performance.now());
  });
  const visibility = () => { previous = null; };
  document.addEventListener('visibilitychange',visibility);
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange',visibility);
    dialog.remove();
  },{once:true});
  dialog.showModal();
  draw(performance.now());
}
