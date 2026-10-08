import {test} from "vitest";
import {strict as assert} from "node:assert";
import {FaceFilterRoot,FaceFilterHeadPosition,FaceMeshTexture,FilterBehaviour,TypeStore,THREE} from "../helpers/hand-runtime.mjs";
const {Group,Matrix4,Vector3}=THREE;
test("hidden raccoon head marker applies inverse scale without changing the authored hierarchy",()=>{
 const scene=new Group(),root=new Group(),intermediate=new Group(),head=new Group();scene.add(root);root.add(intermediate);intermediate.add(head);
 root.position.set(1,2,3);root.scale.setScalar(4);intermediate.position.set(0,.01,0);
 head.position.set(0,.02,.022);head.scale.setScalar(1.987818);root.visible=false;
 root.getComponentsInChildren=type=>type===FaceFilterHeadPosition?[{gameObject:head}]:[];
 scene.updateMatrixWorld(true);const before=root.matrix.clone(),parent=root.parent;
 const controller=new FaceFilterRoot();controller.gameObject=root;controller._initialScale=root.scale.clone();controller.setupHead();
 assert.equal(root.parent,parent);assert.deepEqual(root.matrix.elements,before.elements);assert.equal(root.matrixAutoUpdate,true);
 const scale=new Vector3().setFromMatrixScale(controller._headMatrix);
 assert.ok(Math.abs(scale.x-1/1.987818)<1e-8);
 const marker=new Matrix4().multiplyMatrices(intermediate.matrix,head.matrix);
 const expected=new Matrix4().makeScale(-1,1,1).multiply(marker.clone().invert());
 assert.deepEqual(controller._headMatrix.elements,expected.elements);
});

// Exercise the same first-registration-wins rule as Needle Engine. Mixing a
// compiled copy with source breaks instanceof component discovery.
test("Unity registers the same face constructors used by the manager",()=>{
 assert.equal(TypeStore.get("FaceFilterRoot"),FaceFilterRoot);
 assert.equal(TypeStore.get("FaceFilterHeadPosition"),FaceFilterHeadPosition);
 assert.equal(TypeStore.get("FaceMeshTexture"),FaceMeshTexture);
 assert.ok(new (TypeStore.get("FaceMeshTexture"))() instanceof FilterBehaviour);
});

test("registered face texture receives landmark updates through the current root",()=>{
 const texture=new THREE.Texture();
 const mask=new (TypeStore.get("FaceMeshTexture"))();
 mask.texture=texture;
 mask.context={renderer:{outputColorSpace:THREE.SRGBColorSpace},mainCamera:new THREE.PerspectiveCamera(63,1,.01,100),domWidth:640,domHeight:480};
 mask.createMesh();
 assert.equal(mask.material.uniforms.map.value,texture);
 const root=new FaceFilterRoot();
 root.gameObject={getOrAddComponent(){},getComponentsInChildren(type){return mask instanceof type?[mask]:[]}};
 const face=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
 const manager={facelandmarkerResult:{faceLandmarks:[face]},maxFaces:1,currentFilterIndex:0,videoWidth:640,videoHeight:480};
 root.onResultsUpdated(manager,0);
 root.onResultsUpdated(manager,0);
 assert.equal(mask.mesh.parent,mask.context.mainCamera);
 assert.ok(mask.mesh.geometry.getAttribute("position").version>0);
});
