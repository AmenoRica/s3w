import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const context={window:{}};for(const file of ['data.js','ui.js','localization.js'])vm.runInNewContext(read(file),context);
const {WEAPON_DATA:catalogue,SITE_I18N:shared,WEAPON_UI:ui}=context.window;
const messages=JSON.parse(read('gear/messages.json')),names=JSON.parse(read('gear/gear-names.json')),data=JSON.parse(read('gear/data.json'));
const langs=['en','ja','de','es','fr','it','nl','ru','zh-Hans','zh-Hant'];
const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
for(const [key,row] of Object.entries(messages))for(const lang of langs){
 assert.equal(typeof row[lang],'string',`${key}: missing ${lang}`);
 assert.ok(row[lang].trim(),`${key}: empty ${lang}`);
 assert.deepEqual(placeholders(row[lang]),placeholders(key),`${key}: placeholders in ${lang}`);
 if(key!=='한국어')assert.ok(!/[가-힣]/.test(row[lang]),`${key}: untranslated ${lang}`);
}
for(const code of Object.keys(catalogue.languages))for(const key of Object.keys(data.gear))assert.equal(typeof names[code][key],'string',`${code}: missing official name ${key}`);
const keys=new Set();
for(const m of (read('gear/app.js')+'\n'+read('gear/ink-test.js')).matchAll(/\bt\(["']([^"'\n]+)["']/g))keys.add(m[1].trim());
for(const m of read('gear/index.html').matchAll(/data-l10n(?:-[\w-]+)?="([^"]+)"/g))keys.add(m[1].trim());
for(const group of ['subs','specials'])for(const entry of Object.values(data[group]))for(const effect of entry.effects)keys.add(effect.label);
for(const entry of Object.values(data.defense))for(const blast of entry.blasts)keys.add(blast.label);
for(const key of keys)for(const lang of langs)assert.ok(messages[key]?.[lang]||shared.messages[key]?.[lang]||(key==='언어'&&ui[lang].language),`${key}: no translation in ${lang}`);
console.log(`PASS: ${Object.keys(messages).length} messages in ${langs.length+1} languages, placeholders, official gear names in ${Object.keys(names).length} regional packs, UI and effect-label coverage.`);
