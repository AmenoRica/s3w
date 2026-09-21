import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const listeners = {}, copies = [];
let now = 0;
const button = {disabled:false, closest:()=>button, dispatchEvent:event=>emit('click',event)};
const emit = (type, values={}) => {
  const event = {target:button, isPrimary:true, button:0, pointerId:1, clientX:0, clientY:0, detail:1, timeStamp:now,
    preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};
  listeners[type]?.(event);
  if(type==='click'&&!event.stopped) copies.push(!!event.shiftKey);
  return event;
};
vm.runInNewContext(readFileSync(new URL('../share-copy.js',import.meta.url),'utf8'), {
  document:{addEventListener:(type,fn)=>{listeners[type]=fn;}},window:{addEventListener:(type,fn)=>{listeners[type]=fn;}},
  MouseEvent:class {constructor(type,options){Object.assign(this,options,{detail:0});}}
});
function tap(duration, action, click={}) {
  copies.length=0;now+=2000;emit('pointerdown');now+=duration;
  action?.();emit('pointerup');emit('click',click);
  return [...copies];
}
assert.deepEqual(tap(100),[false],'short tap keeps normal copy');
assert.deepEqual(tap(599),[false],'below threshold');
assert.deepEqual(tap(600),[true],'long tap copies GitHub once');
assert.deepEqual(tap(2000),[true],'very long hold copies only once');
assert.deepEqual(tap(100,null,{shiftKey:true}),[true],'Shift still works');
for(const cancel of ['pointercancel','scroll','blur']) {
  assert.deepEqual(tap(700,()=>emit(cancel)),[false],cancel+' cancels the long-press state');
}
assert.deepEqual(tap(700,()=>emit('pointermove',{clientX:11})),[false],'moving cancels');
assert.deepEqual(tap(700,()=>emit('pointerdown',{pointerId:2,isPrimary:false})),[false],'multitouch cancels');
copies.length=0;emit('click',{detail:0});assert.deepEqual(copies,[false],'keyboard activation is normal');
copies.length=0;now+=2000;emit('pointerdown');now+=700;emit('pointerup');assert.deepEqual(copies,[true],'release copies even if the browser omits the subsequent click');
assert.deepEqual(tap(100),[false],'next tap is not swallowed or redirected');
assert.ok(emit('contextmenu').prevented,'native callout suppressed on copy buttons');
const outside={closest:()=>null};
assert.ok(!emit('contextmenu',{target:outside}).prevented,'other context menus untouched');
button.disabled=true;assert.deepEqual(tap(700),[false],'disabled buttons do not start long press');
console.log('PASS: short/long/Shift/keyboard, single copy, movement, scroll, cancellation, multitouch and context menus.');
