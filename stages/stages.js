import {t} from './i18n.js?v=20260919-l10n-2';
import {createMapViewer} from './viewer.js?v=20260920-live-url';
import {decodeGeometry} from './geometry.js';
const $=id=>document.getElementById(id);
const kinds={versus:'대전',coop:'연어런',bigrun:'빅 런'};
const modes={Pnt:'영역 배틀',Var:'랭크 에어리어',Vlf:'랭크 타워',Vgl:'랭크 피시 배틀',Vcl:'랭크 바지락',Low:'간조',Mid:'일반',High:'만조'};
const languageLabels={KRko:'한국어',JPja:'日本語',USen:'English (US)',EUen:'English (Europe)',EUde:'Deutsch',EUes:'Español (España)',USes:'Español (América)',EUfr:'Français (Europe)',USfr:'Français (Canada)',EUit:'Italiano',EUnl:'Nederlands',EUru:'Русский',CNzh:'简体中文',TWzh:'繁體中文'};
let data,minimaps,objectives,viewer,active=null,revision=0,controller,commonKey='',commonData=null,listScroll=0,language=Object.keys(window.SITE_I18N.groups).find(code=>window.SITE_I18N.groups[code]===(navigator.language.startsWith('zh')?(/TW|HK|Hant/i.test(navigator.language)?'zh-Hant':'zh-Hans'):navigator.language.split('-')[0]))||'KRko';
try{language=localStorage.getItem('ink-armory-language')||language}catch{}
if(!languageLabels[language])language='KRko';
$('language').replaceChildren(...Object.entries(languageLabels).map(([code,label])=>new Option(label,code)));$('language').value=language;
window.SITE_I18N.setLanguage(language);
const name=stage=>stage.names[language]||stage.names.KRko;
function list(){
 const q=$('search').value.normalize('NFKC').toLowerCase().trim(),kind=$('kind').value;
 const rows=data.stages.filter(s=>(!kind||s.kind===kind)&&[...Object.values(s.names),s.key].join(' ').normalize('NFKC').toLowerCase().includes(q));
 if($('sort').value==='name')rows.sort((a,b)=>name(a).localeCompare(name(b),document.documentElement.lang));
 $('count').textContent=`${window.SITE_I18N.number(rows.length)} / ${window.SITE_I18N.number(data.stages.length)} ${t('스테이지')}`;$('empty').hidden=!!rows.length;
 $('catalogue').replaceChildren(...rows.map((s,i)=>{
  const a=document.createElement('a');a.className='weapon-card stage-card';a.href='#stage='+encodeURIComponent(s.key);a.ariaLabel=name(s);
  const art=document.createElement('span');art.className='card-art';const img=new Image(640,360);img.src=s.image;img.alt='';img.loading=i<8?'eager':'lazy';img.decoding='async';art.append(img);
  const title=document.createElement('span');title.className='card-name';title.textContent=name(s);
  const meta=document.createElement('span');meta.className='card-meta';const type=document.createElement('span');type.textContent=t(kinds[s.kind]);const variants=document.createElement('span');variants.textContent=t(s.kind==='versus'?'5개 룰':'3개 수위');meta.append(type,variants);a.append(art,title,meta);return a;
 }));
}
function heading(stage){$('stage-title').textContent=name(stage);$('stage-kind').textContent=t(kinds[stage.kind]);document.title=`${name(stage)} · ${t('스테이지')}`;}
async function chunk(info,signal){
 if(!info)return new Float32Array();
 const response=await fetch(info.file,{signal});if(!response.ok)throw Error('지형을 불러오지 못했습니다. 다시 시도해 주세요.');
 if(!window.DecompressionStream)throw Error('압축 지형을 열 수 없습니다. 최신 브라우저로 열어 주세요.');
 const raw=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 return decodeGeometry(raw,info.vertices);
}
async function load(stage,mode,reset,shared){
 const current=++revision;controller?.abort();controller=new AbortController();const {signal}=controller;
 viewer??=createMapViewer($('stage-detail'),{onChange:writePlacementURL});viewer.loading(undefined,shared);$('marker-share-status').textContent='';delete $('marker-share-status').dataset.l10n;$('map-retry').hidden=true;
 const simplified=minimaps.stages[stage.key]?.[mode];
 const base=simplified||stage.layers.Cmn,extra=simplified?null:stage.layers[mode];
 const cacheKey=base.file;
 try{
  const [common,variant]=await Promise.all([commonKey===cacheKey&&commonData?commonData:chunk(base,signal),chunk(extra,signal)]);
  if(current!==revision)return;commonKey=cacheKey;commonData=common;
  const combined=new Float32Array(common.length+variant.length);combined.set(common);combined.set(variant,common.length);
  const boundsMin=[Infinity,Infinity,Infinity],boundsMax=[-Infinity,-Infinity,-Infinity],heights=[];
  // Fit the playable painted surfaces, so distant scenery does not shrink the map.
  for(let i=0;i<combined.length;i+=7)if(combined[i+6]===1){for(let a=0;a<3;a++){boundsMin[a]=Math.min(boundsMin[a],combined[i+a]);boundsMax[a]=Math.max(boundsMax[a],combined[i+a])}heights.push(combined[i+1])}
  heights.sort((a,b)=>a-b);
  const meta={ceilingHeight:stage.ceilingHeight,boundsMin:heights.length?boundsMin:base.boundsMin,boundsMax:heights.length?boundsMax:base.boundsMax,heightRange:stage.key==='Vss_Yunohana'?[0,12]:[heights[Math.floor(heights.length*.05)]||0,heights[Math.floor(heights.length*.95)]||12],water:stage.water[mode]};
  if(simplified){
   meta.outlines=true;meta.heightRange=[0,12];meta.ceilingHeight=Infinity;
   // Fit Salmon Run's playable terrain rather than distant scenery.
   if(stage.kind==='versus'){meta.boundsMin=base.boundsMin;meta.boundsMax=base.boundsMax;}
   meta.initialYaw=meta.boundsMax[0]-meta.boundsMin[0]>meta.boundsMax[2]-meta.boundsMin[2]?Math.PI/2:0;
  }
  meta.objectives=objectives.stages[stage.key]?.[mode];
  viewer.show(meta,combined,reset);
 }catch(error){if(current!==revision||error.name==='AbortError')return;viewer.error(error);$('map-retry').hidden=false;}
}
let acceptedHash=location.hash,acceptedMode='',urlRevision=0;
async function writePlacementURL(){
 const current=++urlRevision,hash=location.hash;
 if(!active)return;
 const params=new URLSearchParams(hash.slice(1));
 params.set('stage',active);params.set('mode',acceptedMode);
 try{
  params.set('markers',await viewer.snapshot());
  // A newer edit or navigation must never receive an older compressed snapshot.
  if(current!==urlRevision||location.hash!==hash)return;
  history.replaceState(history.state,'','#'+params);
  acceptedHash=location.hash;
 }catch{if(current===urlRevision&&location.hash===hash)window.SITE_I18N.text($('marker-share-status'),'마커 링크를 만들지 못했습니다.');}
}
function route(){
 if(!data)return;
 if(viewer&&!viewer.confirmClear()){
  history.replaceState(history.state,'',location.pathname+location.search+acceptedHash);
  $('mode').value=acceptedMode;return;
 }
 urlRevision++;acceptedHash=location.hash;
 const params=new URLSearchParams(location.hash.slice(1)),key=params.get('stage'),stage=data.stages.find(s=>s.key===key);
 if(!stage){viewer?.clearMarkers();revision++;controller?.abort();$('stage-detail').hidden=true;$('stage-list').hidden=false;document.title=`${t('스테이지')} · Splatoon 3`;if(active){const previous=active;active=null;requestAnimationFrame(()=>{document.querySelector(`a[href="#stage=${previous}"]`)?.focus({preventScroll:true});window.scrollTo(0,listScroll)})}return}
 const reset=active!==key;if(reset){if(!active)listScroll=window.scrollY;active=key;commonData=null;commonKey='';}
 $('stage-list').hidden=true;$('stage-detail').hidden=false;heading(stage);
 $('ceiling-toggle').hidden=!!minimaps.stages[stage.key];
 const options=stage.kind==='versus'?['Pnt','Var','Vlf','Vgl','Vcl']:['Low','Mid','High'];const requested=params.get('mode'),mode=options.includes(requested)?requested:stage.kind==='versus'?'Pnt':'Mid';
 $('mode-label').textContent=t(stage.kind==='versus'?'룰':'수위');$('mode').replaceChildren(...options.map(m=>new Option(t(modes[m]),m)));$('mode').value=mode;acceptedMode=mode;
 if(reset){window.scrollTo(0,0);$('stage-title').tabIndex=-1;$('stage-title').focus({preventScroll:true})}load(stage,mode,reset,params.get('markers'));
}
$('language').onchange=()=>{language=$('language').value;window.SITE_I18N.setLanguage(language);try{localStorage.setItem('ink-armory-language',language)}catch{}if(data){list();if(active){const stage=data.stages.find(s=>s.key===active);heading(stage);$('mode-label').textContent=t(stage.kind==='versus'?'룰':'수위');for(const option of $('mode').options)option.textContent=t(modes[option.value]);}else document.title=`${t('스테이지')} · Splatoon 3`}};
$('filters').onsubmit=e=>e.preventDefault();$('search').oninput=()=>data&&list();$('kind').onchange=$('sort').onchange=()=>data&&list();$('filters').onreset=()=>requestAnimationFrame(()=>data&&list());
$('mode').onchange=()=>{const params=new URLSearchParams({stage:active,mode:$('mode').value});location.hash=params.toString()};$('map-retry').onclick=route;window.addEventListener('hashchange',route);
try{[data,minimaps,objectives]=await Promise.all(['data.json','minimaps.json','objectives.json'].map(async file=>{const response=await fetch(file);if(!response.ok)throw Error('목록을 불러오지 못했습니다.');return response.json()}));list();route()}catch(error){$('count').textContent='';$('list-error').hidden=false;}

$('marker-share').onclick=async()=>{
 const url=new URL(location.href);
 try{url.hash=new URLSearchParams({stage:active,mode:$('mode').value,markers:await viewer.snapshot()}).toString()}
 catch{window.SITE_I18N.text($('marker-share-status'),'마커 링크를 만들지 못했습니다.');return}
 try{await navigator.clipboard.writeText(url.href);window.SITE_I18N.text($('marker-share-status'),'마커 링크를 복사했습니다.');}
 catch{window.prompt(t('마커 링크를 복사해 주세요.'),url.href);}
};
