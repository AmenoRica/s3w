import {transform} from './range-math.js';

// Trace from the near plane to just in front of the marker's terrain anchor.
// The inverse projection works for both orthographic and perspective cameras.
export function markerOccluded(position,projected,inverse,blocked,ceiling=Infinity){
 if(!inverse||!blocked)return false;
 const near=transform([projected[0],projected[1],-1],inverse);
 const delta=position.map((v,i)=>v-near[i]),distance=Math.hypot(...delta);
 if(!Number.isFinite(distance)||distance<=.03)return false;
 return blocked(near,delta.map(v=>v/distance),distance-.03,ceiling);
}

export const markerScale=zoom=>.3*(zoom>1?Math.sqrt(zoom):zoom);
