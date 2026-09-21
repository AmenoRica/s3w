import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {calculate,initialState} from '../gear/core.js';
import {testProfile,spendInk} from '../gear/ink-test.js';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../data.js',import.meta.url),'utf8'),context);
const catalogue=context.window.WEAPON_DATA,data=JSON.parse(fs.readFileSync(new URL('../gear/data.json',import.meta.url),'utf8'));
const profile=(weapon,slots=initialState().slots)=>{const result=calculate({...initialState(),weapon,slots},data,catalogue);return testProfile(result,catalogue.parameters[result.weapon.actor]);};
assert.equal(spendInk(30,70),null);assert.equal(spendInk(70,70),0);assert.equal(spendInk(100,NaN),null);assert.equal(spendInk(100,null),null);
assert.equal(profile('Shooter_Normal_00').modes[0].interval,6);
assert.equal(profile('Shooter_Flash_00').modes[0].followInterval,7);
assert.equal(profile('Shooter_TripleQuick_00').modes[1].interval,18);
assert.equal(profile('Shooter_TripleMiddle_00').modes[1].interval,32);
const mini=profile('Spinner_Quick_00');assert.equal(mini.stages[0].percent,7.5);assert.equal(mini.stages[1].percent,15);
const edit=profile('Spinner_HyperShort_00');assert.equal(edit.stages[0].shots,31);assert.equal(edit.stages[1].shots,61);assert.equal(edit.stages[1].interval,3);
assert.equal(profile('Charger_Normal_00').modes[1].chargeFrames,60);
const stringer=profile('Stringer_Normal_00');assert.equal(stringer.modes.length,3);assert.ok(Math.abs(stringer.modes[1].percent-6)<1e-8);assert.equal(stringer.modes[1].chargeFrames,30);
const slots=Array.from({length:3},()=>Array(4).fill('MainInk_Save'));
assert.ok(profile('Stringer_Normal_00',slots).modes[1].percent<stringer.modes[1].percent);
for(const w of catalogue.weapons){const p=profile(w.key);for(const mode of p.modes)assert.ok(mode.percent===null || (Number.isFinite(mode.percent)&&mode.percent>=0));if(w.type==='Shooter')assert.ok(p.modes[0].interval>0,w.key);}
let ink=100,shots=0;while(spendInk(ink,.92)!==null){ink=spendInk(ink,.92);shots++;}assert.equal(shots,108);assert.ok(ink>=0&&ink<.92);
console.log('PASS: 174 weapon profiles; ink boundary, shooter/burst timing, gear scaling, charger/stringer modes, first/full spinner stages.');

const roll=profile('Maneuver_Normal_00').modes[1];assert.ok(Math.abs(roll.rollCost-7)<1e-8);assert.equal(roll.rollFrames,20);assert.equal(roll.interval,4);assert.ok(Math.abs(profile('Maneuver_Normal_00',slots).modes[1].rollCost-3.85)<1e-8);

const ballpoint=profile('Spinner_Downpour_00');assert.equal(ballpoint.stages[0].percent,12.78);assert.equal(ballpoint.stages[0].shots,23);assert.equal(ballpoint.stages[1].shots,45);assert.equal(ballpoint.stages[0].longInterval,5);assert.ok(profile('Spinner_Downpour_00',slots).stages[0].percent<12.78);
for(const w of catalogue.weapons){const p=profile(w.key);for(const a of(p.spinner?p.stages:p.modes)){assert.ok(a.percent>0,w.key);if('rollCost'in a)assert.ok(a.rollCost>0,w.key);}}
