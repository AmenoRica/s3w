"""Merge coplanar faces and extrude wall regions, rather than every triangle."""
import argparse,collections,gzip,json,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--stage');p.add_argument('--python-libs',action='append',default=[]);p.add_argument('--source',type=Path,default=Path('outputs/all-minimaps'));args=p.parse_args();sys.path[:0]=args.python_libs
import numpy as np
from shapely import Polygon,Point,union_all,constrained_delaunay_triangles
BASE=Path(__file__).resolve().parents[1]
out=BASE/'outputs/simplified-minimaps';out.mkdir(exist_ok=True)

def simplify(source,meta):
 groups=collections.defaultdict(list);i=0;walls=0;originals=0
 while i<len(source):
  face=source[i,:,:3].astype(float);category=int(source[i,0,6]);n=np.cross(face[1]-face[0],face[2]-face[0]);n/=np.linalg.norm(n)
  wall=False
  if i+8<=len(source) and category!=2:
   front=face;back=source[i+1,[0,2,1],:3].astype(float)
   a,b,c=front;d,e,f=back
   expected=np.array([[a,b,c],[d,f,e],[a,d,e],[a,e,b],[b,e,f],[b,f,c],[c,f,d],[c,d,a]])
   wall=np.allclose(source[i:i+8,:,:3],expected,atol=2e-5,rtol=0) and abs(np.linalg.norm(a-d)-.5)<.001
  if wall:
   # Undo the old independent triangular prisms, including their per-triangle top lift.
   face=(face+source[i+1,[0,2,1],:3])/2
   face[face[:,1]>face[:,1].mean(),1]-=.03
   i+=8;walls+=1
  else:i+=1
  originals+=1
  n=np.cross(face[1]-face[0],face[2]-face[0]);n/=np.linalg.norm(n)
  axis=int(np.argmax(abs(n)))
  if n[axis]<0:n=-n
  normal=tuple(np.round(n,4));distance=round(float(n@face[0]),3)
  groups[(wall,category,normal,distance,axis)].append(face)
 assert walls==sum(a['wallTriangles'] for a in meta['actors'])
 assert originals==meta['sourceTriangles']
 output=[];worst_error=0;wall_regions=collections.defaultdict(list)
 def emit(tri,category):
  tri=np.array(tri);n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);length=np.linalg.norm(n)
  if length<1e-8:return
  block=np.empty((3,7),dtype='<f4');block[:,:3]=tri;block[:,3:6]=n/length;block[:,6]=category;output.append(block)
 for (wall,category,normal,distance,axis),faces in groups.items():
  n=np.cross(faces[0][1]-faces[0][0],faces[0][2]-faces[0][0]);n/=np.linalg.norm(n)
  if n[axis]<0:n=-n
  distance=float(n@faces[0][0]);axes=[j for j in range(3) if j!=axis]
  # Rounded planar union removes duplicate coverage and T-junction seams.
  polygons=[Polygon(np.round(f[:,axes],3)) for f in faces]
  region=union_all(polygons,grid_size=.001)
  if not region.is_valid:region=region.buffer(0)
  simple=region.simplify(.015,preserve_topology=True)
  error=region.symmetric_difference(simple).area/max(region.area,1e-9)
  if error>.002:simple=region
  worst_error=max(worst_error,error if error<=.002 else 0)
  def world(xy):
   point=np.zeros(3);point[axes]=xy;point[axis]=(distance-n[axes]@point[axes])/n[axis];return point
  parts=[simple] if simple.geom_type=='Polygon' else list(getattr(simple,'geoms',[]))
  for polygon in parts:
   if polygon.geom_type!='Polygon' or polygon.area<1e-9:continue
   triangles=constrained_delaunay_triangles(polygon)
   for triangle in triangles.geoms:
    tri=np.array([world(xy) for xy in list(triangle.exterior.coords)[:3]])
    if wall:
     emit(tri+n*.25,category);emit((tri-n*.25)[::-1],category)
    else:emit(tri,category)
   if wall:wall_regions[(normal,round(distance,3),axis)].append((polygon,category,n.copy(),distance))
 # Paint-category changes must not create internal diagonal wall caps.
 for (_,_,axis),regions in wall_regions.items():
  region=union_all([r[0] for r in regions],grid_size=.001)
  n,distance=regions[0][2:];axes=[j for j in range(3) if j!=axis]
  def world(xy):
   point=np.zeros(3);point[axes]=xy;point[axis]=(distance-n[axes]@point[axes])/n[axis];return point
  polygons=[region] if region.geom_type=='Polygon' else list(getattr(region,'geoms',[]))
  for polygon in polygons:
   if polygon.geom_type!='Polygon':continue
   for ring in [polygon.exterior,*polygon.interiors]:
    coords=list(ring.coords)
    for a,b in zip(coords,coords[1:]):
     midpoint=Point((np.array(a)+b)/2)
     category=min(regions,key=lambda r:r[0].distance(midpoint))[1]
     a,b=world(a),world(b);emit([a+n*.25,a-n*.25,b-n*.25],category);emit([a+n*.25,b-n*.25,b+n*.25],category)
 result=np.concatenate(output)
 assert np.isfinite(result).all()
 # No substantial change in the map envelope; the old 0.03 top lift is intentionally removed.
 assert np.max(abs(result[:,:3].min(0)-source[:,:,:3].reshape(-1,3).min(0)))<.08
 assert np.max(abs(result[:,:3].max(0)-source[:,:,:3].reshape(-1,3).max(0)))<.08
 return result,worst_error

manifest=json.loads((args.source/'manifest.json').read_text());report=[]
for stage in manifest['stages']:
 if args.stage and stage['key']!=args.stage:continue
 for mode in stage['modes']:
  directory=args.source/'data'/stage['key']/mode
  source=np.frombuffer(gzip.decompress((directory/'collision.bin.gz').read_bytes()),dtype='<f4').reshape(-1,3,7)
  meta=json.loads((directory/'collision.json').read_text())
  result,error=simplify(source,meta)
  folder=out/'data'/stage['key'];folder.mkdir(parents=True,exist_ok=True)
  (folder/f'{mode}.bin.gz').write_bytes(gzip.compress(result.tobytes(),mtime=0))
  row={'stage':stage['key'],'mode':mode,'before':len(source),'after':len(result)//3,'maxPlanarAreaChange':error}
  report.append(row);print(json.dumps(row),flush=True)
(out/('report-'+args.stage+'.json' if args.stage else 'report-salmon.json' if args.source.name=='salmon-minimaps' else 'report.json')).write_text(json.dumps(report,indent=2))
