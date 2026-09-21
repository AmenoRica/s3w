import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context = {window:{}};
vm.runInNewContext(readFileSync(new URL('../data.js', import.meta.url), 'utf8'), context);
const catalogue = context.window.WEAPON_DATA;
const elements = Object.fromEntries(['weapon-search','weapon','search-status'].map(id => [id, {value:''}]));
const state = {weapon:'Shooter_Normal_00'};
let updates = 0;
const source = readFileSync(new URL('../gear/app.js', import.meta.url), 'utf8');
const filter = source.slice(source.indexOf('function filterWeapons('), source.indexOf('\nconst conditionHints'));
vm.runInNewContext(filter + '\nthis.filterWeapons = filterWeapons;', Object.assign(context, {
  catalogue, locale:catalogue.languages.KRko, state,
  $:id=>elements[id], escape:String, t:s=>s, update:()=>updates++,
}));
const search = (query, event={type:'input'}) => {
  elements['weapon-search'].value = query;
  context.filterWeapons(event);
};
search('스플랫 스피너');
assert.equal(state.weapon, 'Spinner_Quick_00');
assert.equal(elements.weapon.value, state.weapon);
assert.equal((elements.weapon.innerHTML.match(/<option /g)||[]).length, 3);
for (const key of ['Spinner_Quick_00','Spinner_Quick_01','Spinner_Quick_02']) {
  assert.ok(elements.weapon.innerHTML.includes(`value="${key}"`));
}
assert.equal(updates, 1);
search('스플랫 스피너 컬래버');
assert.equal(state.weapon, 'Spinner_Quick_01');
assert.equal((elements.weapon.innerHTML.match(/<option /g)||[]).length, 1);
for (const query of ['스피너','존재하지않는무기','']) {
  search(query);
  assert.equal(state.weapon, 'Spinner_Quick_01');
}
search('  스플랫 스피너  ');
assert.equal(state.weapon, 'Spinner_Quick_00');
// A render (including popstate) must preserve the restored weapon.
state.weapon = 'Shooter_Normal_00';
context.filterWeapons();
assert.equal(state.weapon, 'Shooter_Normal_00');
assert.equal(elements.weapon.value, state.weapon);
const matchedKeys = () => [...elements.weapon.innerHTML.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].filter(([, , name]) => !name.startsWith('현재 선택 · ')).map(([, key]) => key);
for (const query of ['스플랫스피너', '스 플랫 스피 너', ' 스플랫\t스피너 ']) {
  search(query);
  assert.deepEqual(matchedKeys(), ['Spinner_Quick_00','Spinner_Quick_01','Spinner_Quick_02']);
  assert.equal(state.weapon, 'Spinner_Quick_00');
}
for (const [alias, expected] of [
  ['삼각밤', catalogue.weapons.filter(w => w.sub === 'Bomb_Splash').map(w => w.key)],
  ['힛센', ['Slosher_Diffusion_00','Slosher_Diffusion_01']],
  ['게탱크', catalogue.weapons.filter(w => w.special === 'SpChariot').map(w => w.key)],
]) {
  search(alias);
  assert.deepEqual(matchedKeys(), Array.from(expected));
  search(alias.split('').join(' '));
  assert.deepEqual(matchedKeys(), Array.from(expected));
}
for (const [spaced, compact] of [['스플래시 밤','스플래시밤'], ['크랩 탱크','크랩탱크']]) {
  search(spaced);
  const expected = matchedKeys();
  search(compact);
  assert.deepEqual(matchedKeys(), expected);
}
for (const number of ['52', '96']) {
  search(`.${number} 갤런`);
  const expected = matchedKeys();
  assert.ok(expected.length >= 2);
  for (const query of [`${number} 갤런`, `${number}갤런`, `.${number}갤런`, `${number} 갤 런`]) {
    search(query);
    assert.deepEqual(matchedKeys(), expected);
  }
}
console.log('PASS: variant results, optional whitespace and periods, three aliases, selection and history restoration.');
