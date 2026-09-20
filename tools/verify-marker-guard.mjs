import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=file=>readFileSync(new URL('../stages/'+file,import.meta.url),'utf8');
const weapons=read('weapons.js'),stages=read('stages.js');
let prompts=0,allow=false;
const context=vm.createContext({window:{confirm:()=>{prompts++;return allow}},t:v=>v});
vm.runInContext('let placements=[],pendingShare=null,restoring=false;'+weapons.slice(weapons.indexOf(' const hasMarkers='),weapons.indexOf(' function refresh(){')),context);
const run=code=>vm.runInContext(code,context);
assert.equal(run('confirmClear()'),true);assert.equal(prompts,0);
run('placements=[{}]');assert.equal(run('confirmClear()'),false);assert.equal(prompts,1);
allow=true;assert.equal(run('confirmClear()'),true);
let prevented=false;context.event={preventDefault(){prevented=true},returnValue:null};run('beforeUnload(event)');assert.equal(prevented,true);assert.equal(context.event.returnValue,'');
run('placements=[]');prevented=false;run('beforeUnload(event)');assert.equal(prevented,false);
run("pendingShare='shared'");assert.equal(run('hasMarkers()'),true);run('pendingShare=null;restoring=true');assert.equal(run('hasMarkers()'),true);
// Run the actual routing guard before any loading or visible state changes.
const mode={value:'Var'},location={hash:'#stage=new',pathname:'/stages/',search:'?test=1'};
let clears=0;
const routeContext=vm.createContext({data:{stages:[]},viewer:{confirmClear:()=>allow,clearMarkers(){clears++}},location,history:{state:null,replaceState(_,__,url){location.hash=url.slice(url.indexOf('#'))}},$:()=>mode,URLSearchParams});
const prefix=stages.slice(stages.indexOf('function route(){'),stages.indexOf(' const reset=active!==key;'));
// The no-stage branch is exercised separately with lightweight UI/abort stubs.
Object.assign(routeContext,{revision:0,controller:{abort(){}},document:{},t:v=>v,active:null});
vm.runInContext("let acceptedHash='#stage=old&mode=Pnt',acceptedMode='Pnt',urlRevision=0;"+prefix+'}',routeContext);
allow=false;vm.runInContext('route()',routeContext);assert.equal(location.hash,'#stage=old&mode=Pnt');assert.equal(mode.value,'Pnt');assert.equal(clears,0);
allow=true;location.hash='#';vm.runInContext('route()',routeContext);assert.equal(clears,1);
assert.match(weapons,/onclick=\(\)=>\{if\(!confirmClear\(\)\)return;const wasReady/);
assert.doesNotMatch(weapons.slice(weapons.indexOf('removed(item)'),weapons.indexOf('const startDrag=')),/confirm/);
console.log('PASS: empty/placed/restoring guards, unload cancellation, cancelled route URL/mode preservation, confirmed list exit, whole-clear guard and no individual-delete confirmation.');
