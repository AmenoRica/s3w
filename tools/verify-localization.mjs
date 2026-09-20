import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const context={window:{},document:{documentElement:{},querySelectorAll:()=>[],dispatchEvent(){}},Event,Intl};
vm.createContext(context);for(const path of ['ui.js','localization.js'])vm.runInContext(read(path),context);
const i18n=context.window.SITE_I18N,keys=new Set(Object.keys(i18n.messages));
for(const path of ['index.html','stages/index.html'])for(const match of read(path).matchAll(/data-l10n(?:-aria-label|-title|-placeholder)?="([^"]+)"/g))keys.add(match[1]);
for(const rows of Object.values(JSON.parse(read('stages/weapon-ranges.json')).actors))for(const row of rows)keys.add(row.label);
const objectives=JSON.parse(read('stages/objectives.json'));
function labels(value){if(Array.isArray(value))value.forEach(labels);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='label'&&/[가-힣]/.test(item))keys.add(item);labels(item)}}labels(objectives);
for(const code of Object.keys(i18n.groups)){
 i18n.setLanguage(code);
 for(const key of keys){const value=i18n.t(key);assert.equal(typeof value,'string');assert.ok(value.length);if(code!=='KRko')assert.ok(!/[가-힣]/.test(value),`${code}: ${key}`)}
 assert.ok(!i18n.t('{n}칸',{n:3}).includes('{n}'));
}
console.log(`PASS: ${keys.size} interface/data labels across 14 locale variants (11 languages), including attributes, range labels and objectives.`);
