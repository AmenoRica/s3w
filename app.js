/* No framework, server API, build step, or third-party runtime. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.WEAPON_DATA;
  const ui = window.WEAPON_UI;
  $('retry').addEventListener('click', () => location.reload());
  if (!data || !ui) {
    $('count').textContent = '';
    $('error').hidden = false;
    $('error').querySelector('p').textContent = '데이터를 읽지 못했습니다. data.js, ui.js 파일이 있는지 확인하고 다시 열어 주세요. / Data unavailable. Check the files and reload.';
    return;
  }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const groups = {KRko:'ko', JPja:'ja', USen:'en', EUen:'en', EUde:'de', EUes:'es', USes:'es', EUfr:'fr', USfr:'fr', EUit:'it', EUnl:'nl', EUru:'ru', CNzh:'zh-Hans', TWzh:'zh-Hant'};
  const references = {ko:'개별 성능 파일 없음 · 기본 무기 참고값:',en:'Individual parameter file absent · base weapon reference:',ja:'個別性能ファイルなし・基本ブキの参考値：',de:'Keine eigene Parameterdatei · Referenz der Basiswaffe:',es:'Sin archivo propio · referencia del arma base:',fr:'Fichier individuel absent · référence de l’arme de base :',it:'File individuale assente · riferimento dell’arma base:',nl:'Eigen parameterbestand ontbreekt · basiswapen als referentie:',ru:'Нет отдельного файла · справочные значения базового оружия:', 'zh-Hans':'无单独性能文件 · 基础武器参考值：','zh-Hant':'無獨立性能檔案 · 基礎武器參考值：'};
  const byKey = new Map(data.weapons.map(w => [w.key, w]));
  const types = [...new Set(data.weapons.map(w => w.type))];
  let language, pack, t, formatter, active = null, lastFocus = null;
  let searchTimer;
  let randomSeed = null;
  let randomTeam = null;
  const copyLabels = {
    ko:['복사','복사됨','다시 시도','{n}번째 랜덤 무기 팀'],
    en:['Copy','Copied','Retry','Random weapon team {n}'],
    ja:['コピー','コピー済み','再試行','ランダムブキチーム {n}'],
    de:['Kopieren','Kopiert','Erneut','Zufälliges Waffenteam {n}'],
    es:['Copiar','Copiado','Reintentar','Equipo de armas aleatorias {n}'],
    fr:['Copier','Copié','Réessayer','Équipe d’armes aléatoires {n}'],
    it:['Copia','Copiato','Riprova','Squadra di armi casuali {n}'],
    nl:['Kopieer','Gekopieerd','Opnieuw','Willekeurig wapenteam {n}'],
    ru:['Копировать','Скопировано','Повторить','Команда случайного оружия {n}'],
    'zh-Hans':['复制','已复制','重试','第{n}组随机武器队伍'],
    'zh-Hant':['複製','已複製','重試','第{n}組隨機武器隊伍']
  };
  const randomLabels = {ko:'랜덤 무기',en:'Random weapons',ja:'ランダムブキ',de:'Zufällige Waffen',es:'Armas aleatorias',fr:'Armes aléatoires',it:'Armi casuali',nl:'Willekeurige wapens',ru:'Случайное оружие','zh-Hans':'随机武器','zh-Hant':'隨機武器'};
  const randomOption = new Option('', 'random');
  randomOption.hidden = true;
  $('sort').append(randomOption);
  function initialLanguage() {
    try {
      const saved = localStorage.getItem('ink-armory-language');
      if (data.languages[saved]) return saved;
    } catch { /* Storage is optional, especially on file://. */ }
    const locale = navigator.language || 'ko';
    if (locale.startsWith('zh')) return /TW|HK|Hant/i.test(locale) ? 'TWzh' : 'CNzh';
    return Object.keys(groups).find(code => data.languages[code].locale.toLowerCase() === locale.toLowerCase())
      || Object.keys(groups).find(code => groups[code] === locale.split('-')[0]) || 'KRko';
  }
  const num = value => formatter.format(value);
  const asset = (prefix, key) => `assets/${prefix}${key}.png`;
  function setLanguage(code) {
    language = data.languages[code] ? code : 'KRko';
    pack = data.languages[language];
    t = ui[groups[language]];
    $('random').title = $('random').ariaLabel = randomLabels[groups[language]];
    randomOption.textContent = randomLabels[groups[language]];
    formatter = new Intl.NumberFormat(pack.locale, {maximumFractionDigits:3});
    document.documentElement.lang = pack.locale;
    document.title = `${t.title} · Splatoon 3`;
    $('catalogue').setAttribute('aria-label', t.title);
    document.querySelectorAll('[data-ui]').forEach(el => { el.textContent = t[el.dataset.ui]; });
    $('language').value = language;
    $('language').setAttribute('aria-label', t.language);
    $('search').placeholder = t.searchHint;
    const previousType = $('type').value;
    $('type').replaceChildren(new Option(t.all, ''), ...types.map(type => new Option(pack.types[type], type)));
    $('type').value = types.includes(previousType) ? previousType : '';
    try { localStorage.setItem('ink-armory-language', language); } catch { /* Optional. */ }
  }
  function writeURL() {
    const params = new URLSearchParams();
    if (randomSeed !== null) params.set('rand', randomSeed);
    if (randomSeed !== null && randomTeam !== null) params.set('team', randomTeam);
    params.set('lang', language);
    if ($('search').value) params.set('q', $('search').value);
    if ($('type').value) params.set('type', $('type').value);
    if (randomSeed === null && $('sort').value !== 'default') params.set('sort', $('sort').value);
    if (active) params.set('weapon', active);
    history.replaceState(null, '', '#' + params);
  }
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase(pack.locale).replace(/\s+/g, ' ').trim();
  function renderList() {
    const query = normalize($('search').value);
    const needles = query.split(' ').filter(Boolean);
    const type = $('type').value;
    const results = randomSeed !== null ? window.WEAPON_RANDOM.shuffle(data.weapons, randomSeed) : data.weapons.filter(w => {
      if (type && w.type !== type) return false;
      const text = normalize([pack.names[w.key], pack.sub[w.sub], pack.special[w.special], w.key, w.id].join(' '));
      return needles.every(word => text.includes(word));
    });
    const mode = $('sort').value;
    if (mode === 'name') results.sort((a,b) => pack.names[a.key].localeCompare(pack.names[b.key], pack.locale));
    if (mode === 'sp') results.sort((a,b) => a.sp - b.sp);
    if (mode === 'rank') results.sort((a,b) => (a.rank < 0 ? Infinity : a.rank) - (b.rank < 0 ? Infinity : b.rank));
    $('count').textContent = `${num(results.length)} / ${num(data.weapons.length)} ${t.results}`;
    $('empty').hidden = results.length !== 0;
    $('catalogue').classList.toggle('random-catalogue', randomSeed !== null);
    const cards = results.map((w, i) => `<button type="button" class="weapon-card" data-weapon="${esc(w.key)}" title="${esc(pack.names[w.key])}" aria-label="${esc(pack.names[w.key])}" aria-haspopup="dialog">
      <span class="card-art"><span class="card-code">${String(w.id).padStart(4,'0')}</span><img src="${asset('Path_Wst_', w.key)}" width="256" height="256" alt="" loading="${i < 12 ? 'eager' : 'lazy'}" decoding="async">
      <span class="card-kit" aria-hidden="true"><img src="${asset('Wsb_',w.sub+'00')}" width="24" height="24" alt="" loading="lazy"><img src="${asset('Wsp_',w.special+'00')}" width="24" height="24" alt="" loading="lazy"></span></span>
      <span class="card-name">${esc(pack.names[w.key])}</span><span class="card-meta"><span>${esc(pack.types[w.type])}</span><span>${num(w.sp)} SP</span></span></button>`);
    $('catalogue').innerHTML = randomSeed === null ? cards.join('') : Array.from({length:Math.ceil(cards.length/4)}, (_, i) => `<section class="random-group" aria-labelledby="random-group-${i}" id="team-${i+1}"><div class="group-heading"><h2 class="group-number" id="random-group-${i}">${num(i+1)}</h2><button type="button" class="copy-team" data-team="${i+1}" aria-live="polite"><span class="copy-label">${esc(copyLabels[groups[language]][0])}</span>${copyLabels[groups[language]].slice(0,3).map(label => `<span class="copy-size" aria-hidden="true">${esc(label)}</span>`).join('')}</button></div><div class="group-weapons">${cards.slice(i*4,i*4+4).join('')}</div></section>`).join('');
  }
  async function copyTeam(button) {
    const labels = copyLabels[groups[language]];
    const label = button.querySelector('.copy-label');
    const team = Number(button.dataset.team);
    const names = Array.from(button.closest('.random-group').querySelectorAll('.card-name'), el => el.textContent);
    const url = new URL(location.protocol === 'file:' ? 'https://amenorica.github.io/splatoon3-weapon-browser/' : location.href);
    url.hash = new URLSearchParams({rand:randomSeed, lang:language, team:String(team)}).toString();
    const text = [labels[3].replace('{n}',num(team)), ...names.map((name,i) => `${i+1}.${name}`), url.href].join('\n');
    button.disabled = true;
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(text);
      } catch {
        const input = document.createElement('textarea');
        input.value = text; input.className = 'clipboard-input';
        document.body.append(input); input.select();
        try { if (!document.execCommand('copy')) throw new Error('Copy failed'); }
        finally { input.remove(); button.focus({preventScroll:true}); }
      }
      label.textContent = labels[1];
    } catch { label.textContent = labels[2]; }
    finally { button.disabled = false; }
    setTimeout(() => { if (button.isConnected) label.textContent = labels[0]; }, 1800);
  }
  function setRandom(seed) {
    randomTeam = null;
    history.scrollRestoration = 'auto';
    randomSeed = seed;
    randomOption.hidden = seed === null;
    $('random').setAttribute('aria-pressed', String(seed !== null));
    if (seed !== null) {
      clearTimeout(searchTimer);
      $('search').value = ''; $('type').value = ''; $('sort').value = 'random';
    } else if ($('sort').value === 'random') $('sort').value = 'default';
  }
  function dialogue(text, target) {
    target.replaceChildren();
    if (!text) {
      const p = document.createElement('p'); p.className = 'missing'; p.textContent = t.missing; target.append(p); return;
    }
    for (const page of text.split('[page break]')) {
      const p = document.createElement('p');
      let highlighted = false;
      for (const part of page.split(/(\[[^\]]*\])/g)) {
        if (part.startsWith('[')) {
          if (part === '[color=0001]') highlighted = true;
          else if (part === '[color=ffff]') highlighted = false;
          continue; // Timing/sound controls are not printed text.
        }
        // In-game line lengths target a fixed dialogue box. Let the web text reflow.
        const content = part.replace(/\n/g, ['ja','zh-Hans','zh-Hant'].includes(groups[language]) ? '' : ' ');
        if (highlighted) { const strong = document.createElement('strong'); strong.textContent = content; p.append(strong); }
        else p.append(document.createTextNode(content));
      }
      target.append(p);
    }
  }
  function statValue(s) {
    const value = num(s.value);
    if (s.unit === 'percent') return `${value}%`;
    if (s.unit === 'frames') return `${value} F <small>${num(s.value/60)} ${esc(t.seconds)}</small>`;
    if (s.unit === 'internal') return `${value}<small>${esc(t.internal)}</small>`;
    return value;
  }
  function renderGuides(w) {
    const names = {main:data.languages.KRko.names[w.key], sub:data.languages.KRko.sub[w.sub], special:data.languages.KRko.special[w.special]};
    for (const kind of ['main', 'sub', 'special']) {
      const target = $(`guides-${kind}`);
      // Keep the current language and DOM target so a late response cannot replace another weapon.
      const labels = t;
      function show(retry = false) {
        target.replaceChildren();
        const status = document.createElement('p');
        status.className = 'note'; status.textContent = labels.guidesLoading;
        target.append(status);
        window.WEAPON_GUIDES.load(kind, retry).then(rows => {
          if (!target.isConnected) return;
          const matches = rows.filter(row => row.weapon === names[kind]);
          target.replaceChildren();
          if (!matches.length) {
            status.textContent = labels.guidesEmpty; target.append(status); return;
          }
          const list = document.createElement('ul'); list.className = 'guide-links';
          for (const row of matches) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = row.url; link.textContent = row.title;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            item.append(link); list.append(item);
          }
          target.append(list);
        }).catch(() => {
          if (!target.isConnected) return;
          status.textContent = labels.guidesError;
          const button = document.createElement('button'); button.type = 'button';
          button.textContent = labels.retry; button.addEventListener('click', () => show(true));
          target.replaceChildren(status, button);
        });
      }
      show();
    }
  }
  function renderDetail(key) {
    const w = byKey.get(key);
    if (!w) return;
    $('detail-class').textContent = pack.types[w.type];
    const base = `https://github.com/Leanny/splat3/blob/${data.commit}/`;
    const uniqueStats = new Map();
    w.stats.forEach(s => {
      const signature = s.label + ':' + s.value;
      if (!uniqueStats.has(signature)) uniqueStats.set(signature, s);
    });
    $('detail-body').innerHTML = `<div class="weapon-heading"><h2 id="weapon-title">${esc(pack.names[w.key])}</h2><p class="id">${esc(w.key)} · #${w.id}</p></div>
      <div class="detail-main"><section class="weapon-spec" aria-label="${esc(t.performance)}">
        <div class="detail-picture"><img src="${asset('Path_Wst_',w.key)}" width="300" height="300" alt="${esc(pack.names[w.key])}"></div>
        <div class="kit"><span class="kit-icon"><img src="${asset('Wsb_',w.sub+'00')}" width="36" height="36" alt=""></span><div><small>${esc(t.sub)}</small><strong>${esc(pack.sub[w.sub])}</strong></div></div>
        <div class="kit"><span class="kit-icon"><img src="${asset('Wsp_',w.special+'00')}" width="36" height="36" alt=""></span><div><small>${esc(t.special)}</small><strong>${esc(pack.special[w.special])}</strong></div></div>
        <dl class="quick-stats"><div><dt>${esc(t.sp)}</dt><dd>${num(w.sp)}</dd></div><div><dt>${esc(t.rank)}</dt><dd${w.rank < 0 ? ' class="special-unlock"' : ''}>${w.rank < 0 ? esc(t.specialUnlock) : num(w.rank)}</dd></div></dl>
      </section><section class="weapon-dialogue" aria-label="${esc(t.explanation)}">
        <div class="sheldon-heading"><img src="assets/IconNPCWeaponShop.png" width="60" height="60" alt=""><div><small>${esc(pack.sheldon)}</small><h3>${esc(t.explanation)}</h3></div></div><div class="dialogue" id="dialogue"></div>
      </section></div>
      <section class="performance"><div class="bars">${w.bars.map((b,i) => `<div><div class="bar-label"><label for="bar-${i}">${esc(pack.paramNames[b.Type])}</label><span>${num(b.Value)} / 100</span></div><meter id="bar-${i}" min="0" max="100" value="${b.Value}">${b.Value}</meter></div>`).join('')}</div><p class="note">${esc(t.barsNote)}</p></section>
      <section class="performance"><h3>${esc(t.numbers)}</h3>${w.reference ? `<p class="reference-note">${esc(references[groups[language]])} <strong>${esc(pack.names[w.reference])}</strong></p>` : ''}
        <dl class="numeric">${[...uniqueStats.values()].map(s => `<div title="${esc(s.source)}"><dt>${esc(t.stats[s.label])}</dt><dd>${statValue(s)}</dd></div>`).join('')}<div><dt>${esc(t.matchRange)}</dt><dd>${num(w.matchRange)}</dd></div></dl><p class="note">${esc(t.rangeNote)}</p>
        <details id="raw-details"><summary>${esc(t.raw)}</summary><p class="note">${esc(w.actor)}</p><pre id="raw-content" tabindex="0"></pre></details>
        <div class="sources"><a href="${base}data/mush/${data.version}/WeaponInfoMain.json" target="_blank" rel="noopener noreferrer">${esc(t.source)} · ${esc(t.performance)} ↗</a><a href="${base}data/language/${language}_full_unicode.json" target="_blank" rel="noopener noreferrer">${esc(t.source)} · ${esc(t.explanation)} ↗</a><a href="${base}data/parameter/${data.version}/weapon/${w.actor}.game__GameParameterTable.json" target="_blank" rel="noopener noreferrer">${esc(t.raw)} ↗</a></div>
      </section>
      <section class="performance related-guides" aria-label="${esc(t.guides)}">
        <section aria-labelledby="guides-main-title"><h3 id="guides-main-title">${esc(t.guidesMain)}</h3><div id="guides-main" aria-live="polite"></div></section>
        <section aria-labelledby="guides-sub-title"><h3 id="guides-sub-title">${esc(t.guidesSub)}</h3><p class="guide-weapon">${esc(pack.sub[w.sub])}</p><div id="guides-sub" aria-live="polite"></div></section>
        <section aria-labelledby="guides-special-title"><h3 id="guides-special-title">${esc(t.guidesSpecial)}</h3><p class="guide-weapon">${esc(pack.special[w.special])}</p><div id="guides-special" aria-live="polite"></div></section>
      </section>`;
    renderGuides(w);
    dialogue(pack.descriptions[key], $('dialogue'));
    $('raw-details').addEventListener('toggle', e => {
      if (e.currentTarget.open && !$('raw-content').textContent) $('raw-content').textContent = JSON.stringify(data.parameters[w.actor], null, 2);
    });
  }
  function openWeapon(key, save = true) {
    if (!byKey.has(key)) return;
    active = key;
    lastFocus = document.activeElement;
    renderDetail(key);
    if (!$('detail').open) $('detail').showModal();
    $('detail').scrollTop = 0;
    if (save) writeURL();
  }
  function reset() {
    setRandom(null);
    clearTimeout(searchTimer);
    $('search').value = ''; $('type').value = ''; $('sort').value = 'default';
    renderList(); writeURL(); $('search').focus();
  }
  function readURL() {
    const params = new URLSearchParams(location.hash.slice(1));
    setLanguage(params.get('lang') || language || initialLanguage());
    $('search').value = params.get('q') || '';
    $('type').value = types.includes(params.get('type')) ? params.get('type') : '';
    $('sort').value = ['default','name','sp','rank'].includes(params.get('sort')) ? params.get('sort') : 'default';
    setRandom(params.get('rand') || null);
    renderList();
    const team = Number(params.get('team'));
    if (randomSeed !== null && Number.isInteger(team) && team > 0 && $(`team-${team}`)) randomTeam = team;
    const key = params.get('weapon');
    if (byKey.has(key)) openWeapon(key, false);
    else if ($('detail').open) $('detail').close();
    history.scrollRestoration = randomTeam !== null ? 'manual' : 'auto';
    if (randomTeam !== null && !byKey.has(key)) scrollToTeam();
  }
  function scrollToTeam() {
    requestAnimationFrame(() => {
      if (randomTeam !== null && !$('detail').open) $(`team-${randomTeam}`)?.scrollIntoView({block:'start'});
    });
  }
  $('language').replaceChildren(...Object.entries(data.languages).map(([code,l]) => new Option(l.label,code)));
  $('language').addEventListener('change', () => {
    setLanguage($('language').value); renderList(); if (active) renderDetail(active); writeURL();
  });
  $('filters').addEventListener('submit', e => e.preventDefault());
  $('filters').addEventListener('reset', e => { e.preventDefault(); reset(); });
  $('empty-reset').addEventListener('click', reset);
  $('random').addEventListener('click', () => {
    setRandom(window.WEAPON_RANDOM.newSeed()); renderList(); writeURL();
  });
  $('search').addEventListener('input', () => {
    setRandom(null);
    clearTimeout(searchTimer); searchTimer = setTimeout(() => {renderList(); writeURL();}, 180);
  });
  ['type','sort'].forEach(id => $(id).addEventListener('change', () => {setRandom(null); renderList(); writeURL();}));
  $('catalogue').addEventListener('click', e => {
    const copy = e.target.closest('.copy-team');
    if (copy) { copyTeam(copy); return; }
    const button = e.target.closest('[data-weapon]'); if (button) openWeapon(button.dataset.weapon);
  });
  $('close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', e => {
    if (e.target !== $('detail')) return;
    const r = $('detail').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('detail').close();
  });
  $('detail').addEventListener('close', () => {
    active = null; writeURL();
    if (lastFocus?.isConnected) lastFocus.focus({preventScroll:true});
  });
  window.addEventListener('hashchange', readURL);
  window.addEventListener('load', scrollToTeam);
  readURL();
})();
