import assert from 'node:assert/strict';
import {markerOccluded,markerScale} from '../stages/marker-visibility.js';
import {createRangeOcclusion} from '../stages/range-occlusion.js';
import {inverseMatrix,transform} from '../stages/range-math.js';
const face=(points,normal,category=1)=>points.flatMap(p=>[...p,...normal,category]);
const wall=category=>face([[-5,-5,5],[5,-5,5],[0,5,5]],[0,0,1],category);
const floor=face([[-20,0,-20],[20,0,-20],[0,0,20]],[0,1,0]);
const scene=(...faces)=>createRangeOcclusion(new Float32Array(faces.flat()));
const front=[.1,0,0,0,0,.1,0,0,0,0,-.1,0,0,0,0,1],top=[.1,0,0,0,0,0,-.1,0,0,.1,0,0,0,0,0,1];
function hidden(point,view,blocked,ceiling){return markerOccluded(point,transform(point,view),inverseMatrix(view),blocked,ceiling)}
assert.equal(hidden([0,0,0],front,scene(wall(1))),true);
assert.equal(hidden([0,0,6],front,scene(wall(1))),false);
assert.equal(hidden([8,0,0],front,scene(wall(1))),false);
assert.equal(hidden([0,0,0],top,scene(floor)),false,'supporting floor must not dim its own marker');
for(const cat of [2,3])assert.equal(hidden([0,0,0],front,scene(wall(cat))),false,'grates and rails do not dim markers');
const roof=face([[-5,5,-5],[5,5,-5],[0,5,5]],[0,1,0]);
assert.equal(hidden([0,0,0],top,scene(roof)),true);
assert.equal(hidden([0,0,0],top,scene(roof),4),false,'hidden high terrain must not dim markers');
// Camera at z=10, looking toward -z, near=1/far=100.
const perspective=[1,0,0,0,0,1,0,0,0,0,-101/99,-1,0,0,810/99,10];
assert.equal(hidden([0,0,0],perspective,scene(wall(1))),true);
assert.equal(hidden([0,0,6],perspective,scene(wall(1))),false);
assert.equal(markerOccluded([0,0,0],[0,0,0],null,scene(wall(1))),false);
assert.equal(markerScale(1),.3);assert.equal(markerScale(4),.6);assert.equal(markerScale(.5),.15);
assert.ok(markerScale(9)>markerScale(4)&&markerScale(9)<9*.3);
console.log('PASS: camera occlusion in orthographic/perspective, front/behind walls, self-floor, grates/rails, hidden ceiling, and slower zoom scaling shared by all markers.');
