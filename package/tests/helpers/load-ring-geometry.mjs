// Offline geometry-only decoder for the Draco-compressed demo ring.
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname,join} from "node:path";
import {BufferGeometry,Float32BufferAttribute,Group,Mesh} from "three";
export async function loadRingGeometry(path) {
 const require=createRequire(import.meta.url),decoderPath=join(require.resolve("three"),"../../examples/jsm/libs/draco/gltf/draco_decoder.js"),module={exports:{}};
 new Function("module","exports","require","__dirname",await readFile(decoderPath,"utf8"))(module,module.exports,require,dirname(decoderPath));
 const draco=await module.exports({}),b=await readFile(path),n=b.readUInt32LE(12),gltf=JSON.parse(b.subarray(20,20+n)),binary=b.subarray(28+n);
 const geometries=gltf.meshes.map(m=>m.primitives.map(p=>{
  const c=p.extensions.KHR_draco_mesh_compression,v=gltf.bufferViews[c.bufferView],bytes=binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
  const d=new draco.Decoder(),buffer=new draco.DecoderBuffer(),mesh=new draco.Mesh();buffer.Init(new Int8Array(bytes),bytes.length);
  const status=d.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw Error(status.error_msg());
  const a=new draco.DracoFloat32Array();d.GetAttributeFloatForAllPoints(mesh,d.GetAttributeByUniqueId(mesh,c.attributes.POSITION),a);
  const values=Float32Array.from({length:mesh.num_points()*3},(_,i)=>a.GetValue(i)),f=new draco.DracoInt32Array(),indices=[];
  for(let i=0;i<mesh.num_faces();i++){d.GetFaceFromMesh(mesh,i,f);indices.push(f.GetValue(0),f.GetValue(1),f.GetValue(2));}
  const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(values,3));geometry.setIndex(indices);
  for(const item of [a,f,mesh,buffer,d])draco.destroy(item);return geometry;
 }));
 const nodes=gltf.nodes.map(n=>{const g=new Group();
  if(n.matrix){g.matrix.fromArray(n.matrix);g.matrix.decompose(g.position,g.quaternion,g.scale);}
  else {if(n.translation)g.position.fromArray(n.translation);if(n.rotation)g.quaternion.fromArray(n.rotation);if(n.scale)g.scale.fromArray(n.scale);}
  if(n.mesh!==undefined)for(const geometry of geometries[n.mesh])g.add(new Mesh(geometry));return g;
 });
 gltf.nodes.forEach((n,i)=>n.children?.forEach(j=>nodes[i].add(nodes[j])));
 const root=new Group();for(const i of gltf.scenes[gltf.scene??0].nodes)root.add(nodes[i]);return root;
}
