import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for (const page of ['gear', 'stages', 'team']) {
  const file = page === 'gear' ? 'gear/app.js' : page === 'stages' ? 'stages/stages.js' : 'app.js';
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const handler = page === 'gear'
    ? source.match(/\$\('copy-link'\)\.addEventListener\('click', (async event => \{[\s\S]*?)\n  \}\);/)[1] + '\n}'
    : page === 'stages' ? source.match(/\$\('marker-share'\)\.onclick=(async event=>\{[\s\S]*?)\n\};/)[1] + '\n}'
    : source.match(/async function copyTeam\(button, shiftKey\) \{[\s\S]*?\n  \}/)[0];
  const path = page === 'team' ? '/s3w/' : `/s3w/${page}/`;
  for (const shiftKey of [false, true]) {
    for (const clipboardFails of [false, true]) {
      let copied;
      const context = {URL, URLSearchParams, location:{href:'https://ameno.cc'+path+'?lang=KRko#old'},
        $:()=>({value:'KRko'}), state:{}, selectionSearch:()=>'?weapon=Shooter_Normal&head=LDE,ISM,-,IRU&lang=KRko',
        active:'Vss_Yunohana', viewer:{snapshot:async()=>'marker-payload'}, t:x=>x,
        navigator:{clipboard:{writeText:async text=>{if(clipboardFails)throw Error('blocked');copied=text;}}},
        window:{SITE_I18N:{text(){}},prompt:(_,text)=>{copied=text;}},
        copyLabels:{ko:['copy','done','failed','Team {n}']},groups:{KRko:'ko'},language:'KRko',randomSeed:123,num:String,
        setTimeout(){},document:{createElement:()=>({select(){copied=this.value;},remove(){}}),body:{append(){}},execCommand:()=>true}};
      const fn = vm.runInNewContext('('+handler+')',context);
      if(page==='team') await fn({dataset:{team:'2'},querySelector:()=>({}),closest:()=>({querySelectorAll:()=>[{textContent:'Weapon'}]}),focus(){}},shiftKey);
      else await fn({shiftKey});
      const url = new URL(copied.split('\n').at(-1));
      assert.equal(url.origin,shiftKey?'https://amenorica.github.io':'https://ameno.cc');
      assert.equal(url.pathname,path);
      if(page==='gear') {assert.equal(url.searchParams.get('head'),'LDE,ISM,-,IRU');assert.equal(url.hash,'');}
      else {const hash=new URLSearchParams(url.hash.slice(1));assert.equal(hash.get(page==='team'?'rand':'markers'),page==='team'?'123':'marker-payload');}
      // The deployed GitHub Pages redirect keeps every shared selection.
      const redirect=readFileSync(new URL('../pages-redirect/index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
      let destination;
      vm.runInNewContext(redirect,{location:{pathname:url.pathname,search:url.search,hash:url.hash,replace:value=>{destination=value;}}});
      assert.equal(destination,'https://ameno.cc'+url.pathname+url.search+url.hash);
    }
  }
}
console.log('PASS: all three copy handlers, Shift/normal, clipboard fallback, selections and Pages redirect.');
