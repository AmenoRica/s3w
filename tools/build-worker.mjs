import {readFileSync, writeFileSync, mkdirSync, rmSync, cpSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const context = {window:{}};
vm.runInNewContext(readFileSync('data.js', 'utf8'), context);
const {weapons, languages} = context.window.WEAPON_DATA;
const catalogue = {
  weapons: weapons.map(({key}) => ({key})),
  languages: Object.fromEntries(Object.entries(languages).map(([code, {names}]) => [code, {names}]))
};
const revision = createHash('sha256');
for (const name of ['data.js', 'gear/data.json', 'gear/share.js', 'gear/core.js', 'gear/export-image.js', 'assets/display.ttf', 'worker/index.js']) revision.update(readFileSync(name));
for (const {key} of weapons) revision.update(readFileSync(`assets/Path_Wst_${key}.png`));
const gear = JSON.parse(readFileSync('gear/data.json'));
for (const key of Object.keys(gear.gear).filter(key => key !== 'None')) revision.update(readFileSync(`gear/icons/${key}.png`));
mkdirSync('worker/generated', {recursive:true});
writeFileSync('worker/generated/catalogue.json', JSON.stringify({...catalogue, revision:revision.digest('hex').slice(0,12)}));
rmSync('_worker-assets', {recursive:true, force:true});
mkdirSync('_worker-assets', {recursive:true});
cpSync('_site', '_worker-assets/s3w', {recursive:true});
console.log('Worker assets assembled at /s3w/');
