import {utilityByKey,hasRoute,curlingLimits,routeDistance} from './utility-markers.js?v=20260920-ultrashot';
const fail=()=>{throw Error('Invalid marker link')},limit=150000,tau=Math.PI*2;
const base64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function validate(items,known,tolerance=.001){
 const point=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=10000);
 if(!Array.isArray(items)||items.length>1000)fail();
 for(const {key,position,angle=0,background=null,gearAP=0,start} of items){
  if(!known.has(key)||!point(position)||!Number.isFinite(angle)||(background!==null&&(typeof background!=='string'||!/^#[0-9a-f]{6}$/i.test(background)))||!Number.isInteger(gearAP)||gearAP<0||gearAP>57||(start!==undefined&&(!point(start)||!hasRoute(utilityByKey.get(key))||routeDistance(start,position,key==='Bomb_Curling')>(key==='Bomb_Curling'?curlingLimits(gearAP).max:utilityByKey.get(key).railLength)+tolerance||(key==='Bomb_Curling'&&routeDistance(start,position,true)<curlingLimits(gearAP).min-tolerance))))fail();
 }
 return items;
}
async function streamBytes(bytes,stream){
 const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail()}chunks.push(value)}}finally{reader.releaseLock()}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result;
}
// v2: key dictionary, count, then index/flags/int16 XYZ and optional fields.
// Coordinates are in hundredths; angles are 1/256 of a turn. v3 wraps v2 in gzip.
export async function encodeMarkers(items){
 const keys=[...new Set(items.map(item=>item.key))];validate(items,new Set(keys),.02);
 const bytes=[2],u8=v=>bytes.push(v),u16=v=>bytes.push(v&255,(v>>>8)&255);
 const point=p=>{for(const v of p){const n=Math.round(v*100);if(n< -32768||n>32767)fail();u16(n)}};
 u16(keys.length);
 for(const key of keys){if(!/^[A-Za-z0-9_]{1,255}$/.test(key))fail();u8(key.length);for(const c of key)u8(c.charCodeAt(0))}
 u16(items.length);
 for(const {key,position,angle=0,background=null,gearAP=0,start} of items){
  const index=keys.indexOf(key),direction=Math.round(((angle%tau+tau)%tau)*256/tau)%256;
  // A two-byte dictionary index is only needed for larger catalogs.
  if(index<128)u8(index);else{u8((index&127)|128);u8(index>>>7)}
  u8((direction?1:0)|(background?2:0)|(gearAP?4:0)|(start?8:0));point(position);
  if(direction)u8(direction);
  if(background)for(let i=1;i<7;i+=2)u8(parseInt(background.slice(i,i+2),16));
  if(gearAP)u8(gearAP);
  if(start)point(start);
 }
 const raw=Uint8Array.from(bytes);
 if(raw.length>limit)fail();
 if(globalThis.CompressionStream){
  const compressed=await streamBytes(raw,new CompressionStream('gzip'));
  if(compressed.length+1<raw.length)return base64(Uint8Array.from([3,...compressed]));
 }
 return base64(raw);
}
export async function decodeMarkers(value,known){
 if(!value)return [];
 // Retired Jetpack markers are ignored when opening an older shared scene.
 known=new Set([...known,'SpJetpack']);
 const retained=items=>items.filter(item=>item.key!=='SpJetpack');
 if(value.length>200000||!/^[A-Za-z0-9_-]+$/.test(value))fail();
 let bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 if(bytes[0]===91){
  const [version,rows]=JSON.parse(new TextDecoder().decode(bytes));
  if(version!==1||!Array.isArray(rows))fail();
  return retained(validate(rows.map(row=>{if(!Array.isArray(row)||row.length<5||row.length>6)fail();const [key,position,angle,background,gearAP,start]=row;return {key,position,angle,background,gearAP,...(start!==undefined?{start}:{})}}),known));
 }
 if(bytes[0]===3)bytes=await streamBytes(bytes.subarray(1),new DecompressionStream('gzip'));
 let offset=0;
 const u8=()=>{if(offset>=bytes.length)fail();return bytes[offset++]},u16=()=>u8()|(u8()<<8);
 const point=()=>Array.from({length:3},()=>{const n=u16();return (n>=32768?n-65536:n)/100});
 if(u8()!==2)fail();
 const keyCount=u16();if(keyCount>1000)fail();const keys=[];
 for(let i=0;i<keyCount;i++){const length=u8();let key='';for(let j=0;j<length;j++)key+=String.fromCharCode(u8());if(!known.has(key)||keys.includes(key))fail();keys.push(key)}
 const count=u16();if(count>1000)fail();const items=[];
 for(let i=0;i<count;i++){
  let index=u8();if(index&128)index=(index&127)|(u8()<<7);
  if(index>=keys.length)fail();
  const flags=u8();if(flags&240)fail();
  const item={key:keys[index],position:point(),angle:flags&1?u8()*tau/256:0,background:null,gearAP:0};
  if(flags&2)item.background='#'+[u8(),u8(),u8()].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(flags&4)item.gearAP=u8();
  if(flags&8)item.start=point();items.push(item);
 }
 if(offset!==bytes.length)fail();return retained(validate(items,known,.02));
}
