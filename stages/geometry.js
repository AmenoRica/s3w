// STG1: magic, vertex/index counts, 16-byte vertices, uint32 triangle indices.
// Positions use fixed 1/1000 units; normals use signed bytes; last byte is category.
export function decodeGeometry(raw,expectedVertices){
 if(raw.byteLength<12)throw Error('지형 파일이 완전하지 않습니다.');
 const view=new DataView(raw);
 if(view.getUint32(0,true)!==0x31475453)throw Error('지원하지 않는 지형 형식입니다.');
 const count=view.getUint32(4,true),size=view.getUint32(8,true);
 if(size!==expectedVertices||size%3||raw.byteLength!==12+count*16+size*4)throw Error('지형 파일이 완전하지 않습니다.');
 const vertices=new Float32Array(count*7);
 for(let i=0;i<count;i++){
  const offset=12+i*16;
  for(let axis=0;axis<3;axis++){vertices[i*7+axis]=view.getInt32(offset+axis*4,true)/1000;vertices[i*7+3+axis]=view.getInt8(offset+12+axis)/127}
  const category=view.getUint8(offset+15);if(category>3)throw Error('잘못된 표면 종류입니다.');vertices[i*7+6]=category;
 }
 const expanded=new Float32Array(size*7),indexOffset=12+count*16;
 for(let i=0;i<size;i++){const index=view.getUint32(indexOffset+i*4,true);if(index>=count)throw Error('잘못된 지형 파일입니다.');expanded.set(vertices.subarray(index*7,index*7+7),i*7)}
 return expanded;
}
