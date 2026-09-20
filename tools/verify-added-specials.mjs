import assert from 'node:assert/strict';
import {utilityByKey,utilityForPlacement,utilityTriangles} from '../stages/utility-markers.js';
import {encodeMarkers,decodeMarkers} from '../stages/marker-share.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const keys=['Bomb_Quick','SpPogo','SpBlower','SpFirework','SpChariot'];
assert.equal(utilityByKey.has('LineMarker'),false);
const origin={position:[0,0,0],angle:0};
for(const [key,outer,inner] of [['Bomb_Quick',4,2.8],['SpPogo',9.6,6.4],['SpFirework',6,undefined],['SpChariot',4.8,undefined]]){
 const m=utilityByKey.get(key);near(m.radius,outer);assert.equal(m.innerRadius,inner);
}
for(const [key,multiplier] of [['SpPogo',1.1],['SpFirework',1.2]]){
 const base=utilityByKey.get(key),max=utilityForPlacement({key,gearAP:57});near(max.radius,base.radius*multiplier);if(base.innerRadius)near(max.innerRadius,base.innerRadius*multiplier);
}
const vac=utilityForPlacement({key:'SpBlower',gearAP:57});near(vac.nearRadius,1.4);near(vac.farRadius,4.3);near(vac.length,15);
const flat=key=>utilityTriangles(origin,utilityByKey.get(key)),points=faces=>faces.flatMap(f=>f.vertices.map(v=>v.slice(0,3)));
const quick=flat('Bomb_Quick');for(const v of points(quick))assert.ok([2.8,4].some(r=>Math.abs(Math.hypot(...v)-r)<1e-7));
const pogo=utilityByKey.get('SpPogo'),d=pogo.fistDistance/Math.sqrt(2),centers=[[0,0,0],[-d,0,d],[d,0,d]];
for(const f of flat('SpPogo').filter(f=>f.alpha===.3||f.alpha===.7))for(const v of f.vertices)assert.ok(centers.some(c=>[6.4,9.6].some(r=>Math.abs(Math.hypot(...c.map((n,i)=>v[i]-n))-r)<1e-7)));
for(const v of points(flat('SpFirework')))near(Math.hypot(...v),6);
assert.equal(utilityByKey.get('SpFirework').directional,undefined);
assert.equal(utilityByKey.has('SpJetpack'),false);
const cone=points(flat('SpBlower').filter(f=>f.alpha===.6));for(const p of cone){near(Math.hypot(p[0],p[1]-1.65),p[2]===0?.8:3.3);assert.ok([0,15].includes(p[2]))}
for(const key of ['SpChariot']){
 const m=utilityByKey.get(key),faces=flat(key),blast=faces.filter(f=>f.alpha===(m.innerRadius?.3:.7));
 for(const v of points(blast))near(Math.hypot(v[0],v[1],v[2]-m.shotRange),m.radius);
 if(m.rapidRange)for(const v of points(faces.filter(f=>f.alpha===1&&f.vertices[0][6]===.33)))near(Math.hypot(...v),28.5);
}
const items=keys.map(key=>({key,position:[1,2,3],angle:Math.PI/2,gearAP:57,background:null}));
assert.deepEqual(await decodeMarkers(await encodeMarkers(items),new Set(keys)),items);
for(const key of keys.filter(k=>!['Bomb_Quick','SpFirework'].includes(k)))assert.notDeepEqual(flat(key),utilityTriangles({...origin,angle:Math.PI/2},utilityByKey.get(key)));
console.log('PASS: 5 additions, excluded line marker and Jetpack, exact blast radii and AP, three landing centers, single decoy sphere, vacuum cone, separate rapid/cannon reach, rotation and share round trip.');

const old=[...items,{key:'SpJetpack',position:[0,0,0],angle:0,gearAP:0,background:null}];
assert.deepEqual(await decodeMarkers(await encodeMarkers(old),new Set(keys)),items);
const legacy=Buffer.from(JSON.stringify([1,old.map(({key,position,angle,background,gearAP})=>[key,position,angle,background,gearAP])])).toString('base64url');
assert.deepEqual(await decodeMarkers(legacy,new Set(keys)),items);
console.log('PASS: legacy and binary links drop only retired Jetpack, keeping other placements.');
