import {test} from "vitest";
import {strict as assert} from "node:assert";
import {readFile} from "node:fs/promises";

import {NeedleTrackingManager,HandAttachment,FaceInstance,HandTrackingBehaviour,HandTrackingSkinnedMeshRenderer,THREE} from "../helpers/hand-runtime.mjs";
const {Group,OrthographicCamera,PerspectiveCamera,Scene,Vector3,Mesh,TorusGeometry}=THREE;
const capture=JSON.parse(await readFile(new URL("../fixtures/hand-poses.json",import.meta.url),"utf8"));
function runtime(){
 const manager=new NeedleTrackingManager(),camera=new PerspectiveCamera(47,4/3,.01,100),scene=new Scene();scene.add(camera);
 manager.context={mainCamera:camera,scene,domWidth:640,domHeight:480,time:{realtimeSinceStartup:1,deltaTime:1/60}};
 manager._video={videoWidth:640,videoHeight:480,readyState:2};manager.maxFaces=0;manager.maxHands=2;
 return {manager,camera};
}
function feed(manager,frame) {
 const hand=frame.hands[0];const results={landmarks:[hand.imageLandmarks],worldLandmarks:[hand.worldLandmarks],handedness:[[{categoryName:hand.side}]]};
 manager.context.time.realtimeSinceStartup+=1/30;
 manager.updateHandCamera();manager.onHandLandmarkerResultsUpdated(results);
 manager._lastHandLandmarkResults=results;manager.updateDebugRendering=()=>{};manager.onBeforeRender();
}
test("actual runtime acquires recorded poses, interpolates attachments, loses and reacquires",()=>{
 const {manager}=runtime();const hand=manager.getHand("Left"),ring=new Mesh(new TorusGeometry(.01,.001));
 const point={p0:"ring_finger_mcp",p1:"ring_finger_pip",t01:.75};
 const attachment=hand.attachToHand(ring,point,{autoFit:{},rotationSmoothing:.12});
 assert.equal(attachment.status.tracked,false);
 for(const frame of capture.frames){ hand.remove();feed(manager,structuredClone(frame));
  assert.equal(hand.isTracked,true);assert.equal(attachment.status.anchorVisible,true);
  const expected=hand.getJointPosition(13,new Vector3()).lerp(hand.getJointPosition(14,new Vector3()),.75);
  assert.ok(ring.parent.position.distanceTo(expected)<1e-10);
  assert.equal(attachment.status.autoFit.source,"measured");assert.equal(attachment.status.autoFit.reason,"no-mesh");
 }
 manager.onHandLandmarkerResultsUpdated(null);assert.equal(attachment.status.tracked,false);
 feed(manager,structuredClone(capture.frames[0]));assert.equal(attachment.status.tracked,true);
 attachment.dispose();attachment.dispose();assert.equal(ring.parent,null);assert.equal(attachment.status.state,"detached");
 assert.equal(hand.getAttachmentStatus(ring),null);
});
test("cross-hand reattachment cleans up old ownership and stale handles cannot detach new owner",()=>{
 const {manager}=runtime();const object=new Group(),left=manager.getHand("Left"),right=manager.getHand("Right");
 const old=left.attachToHand(object,"ring_finger_mcp");const next=right.attachToHand(object,"ring_finger_mcp");
 assert.equal(old.status.state,"detached");old.dispose();assert.equal(next.status.state,"attached");
 assert.equal(left._anchors.size,0);right.dispose();assert.equal(object.parent,null);assert.equal(next.status.state,"detached");
});
test("scene camera mode preserves camera identity and auto restores it when leaving image mode",()=>{
 const {manager,camera}=runtime();manager.handProjection="scene";manager.updateHandCamera();assert.equal(manager.context.mainCamera,camera);
 manager.handProjection="auto";manager.updateHandCamera();assert.ok(manager.context.mainCamera instanceof OrthographicCamera);
 manager.handProjection="scene";manager.updateHandCamera();assert.equal(manager.context.mainCamera,camera);assert.equal(camera.fov,47);
 manager.context.mainCameraComponent={fieldOfView:47,clearFlags:123};
 manager.updateDebugRendering=()=>{};
 manager.onBeforeRender();
 assert.equal(manager.context.mainCameraComponent.fieldOfView,47);
 assert.equal(manager.context.mainCameraComponent.clearFlags,123);
});


test("recorded poses drive the production skin and measured ring fitting together",async()=>{
 const {GLTFLoader}=await import("three/examples/jsm/loaders/GLTFLoader.js");
 const bytes=await readFile(new URL("../../unity/Runtime/Models/right.glb",import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
 const {manager}=runtime(),hand=manager.getHand("Left");
 const skin=new HandTrackingSkinnedMeshRenderer();skin.gameObject=scene;skin.context=manager.context;skin.awake();
 const behaviour=new HandTrackingBehaviour();behaviour.gameObject=scene;behaviour.context=manager.context;
 scene.getOrAddComponent=()=>skin;behaviour.awake();behaviour.activeAndEnabled=true;skin.bindHand(hand);hand.addBehaviour(behaviour);
 assert.equal(hand._anchors.size,0,"binding a skin must not allocate scene anchors");
 const ring=new Mesh(new TorusGeometry(.01,.001,16,64));
 const handle=hand.attachToHand(ring,{p0:"ring_finger_mcp",p1:"ring_finger_pip",t01:.75},{autoFit:{smoothing:0}});
 for(const frame of capture.frames){
  hand.remove();feed(manager,structuredClone(frame));
  assert.ok(behaviour.skinnedMeshes.every(mesh=>mesh.visible));
  assert.equal(hand._anchors.size,2,"only attachment and fit measurement anchors are needed");
  assert.equal(ring.parent.parent.name,"Hand Tracking");
  assert.equal(handle.status.autoFit.state,"fitted",JSON.stringify(handle.status.autoFit));
  assert.ok(Number.isFinite(ring.scale.x)&&ring.scale.x>0&&ring.scale.x<=2);
 }
 manager.onHandLandmarkerResultsUpdated(null);
 assert.ok(behaviour.skinnedMeshes.every(mesh=>!mesh.visible));
 handle.dispose();assert.equal(ring.scale.x,1);assert.equal(hand._attachmentFits.size,0);
});

test("detector failures are reported as errors rather than permanent loading",()=>{
 const {manager}=runtime();manager._handlandmarker=Promise.resolve(null);
 manager._handTrackingError="detector: unavailable";
 assert.equal(manager.handTrackingStatus.detector,"error");
 manager.maxHands=0;assert.equal(manager.handTrackingStatus.detector,"disabled");
});


test("Unity attachment adapter preserves scene settings, recovers tracking, and restores its target",()=>{
 const {manager}=runtime(),controller=new Group(),model=new Group();controller.add(model);model.position.set(1,2,3);
 const attachment=new HandAttachment();attachment.manager=manager;attachment.gameObject=controller;attachment.target=model;
 attachment.handedness="Left";attachment.start();
 assert.equal(manager.maxFaces,0);assert.equal(manager.maxHands,2);
 const hand=manager.getHand("Left");assert.equal(attachment.status.error,null);
 feed(manager,structuredClone(capture.frames[0]));assert.equal(attachment.status.attachment.tracked,true);
 manager.onHandLandmarkerResultsUpdated(null);assert.equal(attachment.status.attachment.tracked,false);assert.equal(controller.visible,true);
 feed(manager,structuredClone(capture.frames[0]));assert.equal(attachment.status.attachment.tracked,true);
 attachment.onDisable();assert.equal(model.parent,controller);assert.deepEqual(model.position.toArray(),[1,2,3]);assert.equal(hand._attachments.size,0);
 attachment.onEnable();assert.equal(attachment.status.attachment.state,"attached");attachment.onDestroy();assert.equal(model.parent,controller);
});

test("Unity attachment adapter maps every finger segment and rejects an ancestor target",()=>{
 const {manager}=runtime(),controller=new Group(),model=new Group();controller.add(model);
 const attachment=new HandAttachment();attachment.manager=manager;attachment.gameObject=controller;attachment.target=model;
 for(const finger of ["thumb","index","middle","ring","pinky"])for(let segment=0;segment<3;segment++){
  attachment.finger=finger;attachment.segment=segment;attachment.attach();assert.equal(attachment.status.error,null);assert.equal(attachment.status.attachment.state,"attached");attachment.detach();
 }
 const parent=new Group();parent.add(controller);attachment.target=parent;attachment.attach();assert.match(attachment.status.error,/ancestor/);assert.equal(controller.parent,parent);
});


test("self attachment finds its manager and survives visibility-driven disable callbacks",()=>{
 const {manager}=runtime(),parent=new Group(),object=new Group();parent.add(object);
 manager.context.scene.getComponentsInChildren=()=>[manager];
 const attachment=new HandAttachment();attachment.context=manager.context;attachment.gameObject=object;attachment.enabled=true;attachment.handedness="Left";
 attachment.start();assert.equal(attachment.status.error,null);assert.equal(attachment.status.attachment.state,"attached");
 attachment.onDisable();assert.equal(attachment.status.attachment.state,"attached");
 feed(manager,structuredClone(capture.frames[0]));attachment.onEnable();assert.equal(attachment.status.attachment.tracked,true);
 manager.onHandLandmarkerResultsUpdated(null);attachment.onDisable();assert.equal(attachment.status.attachment.state,"attached");
 feed(manager,structuredClone(capture.frames[0]));assert.equal(attachment.status.attachment.tracked,true);
 attachment.enabled=false;attachment.onDisable();assert.equal(object.parent,parent);assert.equal(attachment.status.attachment,null);
});

test("empty hand component loads the packaged mirrored model and ignores a late load after destruction",async()=>{
 const {GLTFLoader}=await import("three/examples/jsm/loaders/GLTFLoader.js");
 const bytes=await readFile(new URL("../../unity/Runtime/Models/right.glb",import.meta.url));
 const load=()=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
 const {scene:model}=await load(),{manager}=runtime(),root=new Group();
 const skin=new HandTrackingSkinnedMeshRenderer();skin.gameObject=model;skin.context=manager.context;
 model.getOrAddComponent=()=>{skin.awake();return skin;};
 const controller=new HandTrackingBehaviour();controller.context=manager.context;controller.gameObject=root;controller.handedness="Left";
 globalThis.__facefilterLoadModel=async url=>{assert.ok(url.endsWith("/right.glb"));return model;};
 try {
  controller.awake();assert.equal(controller.modelStatus.state,"loading");await controller._loading;
  assert.equal(controller.modelStatus.state,"ready");assert.ok(controller.skinnedMeshes.length>0);
  assert.equal(model.parent,manager.context.mainCamera);assert.equal(root.parent,null,"Loading a hand must not reparent an accessory's owner");
  controller._skin.updateHand=()=>true;controller.onUpdateHandTracking(manager.getHand("Left"));assert.equal(root.parent,null);controller.onHandTrackingLost();
  assert.ok(controller.skinnedMeshes.every(mesh=>!mesh.visible&&!mesh.material.colorWrite));
  controller.onDestroy();assert.equal(model.parent,null);
  let resolve;globalThis.__facefilterLoadModel=()=>new Promise(r=>resolve=r);
  const late=new HandTrackingBehaviour();late.gameObject=new Group();late.context=manager.context;late.awake();late.onDestroy();
  const {scene:lateModel}=await load();resolve(lateModel);await late._loading;assert.equal(lateModel.parent,null);assert.equal(late.gameObject.children.length,0);
 } finally {delete globalThis.__facefilterLoadModel;}
});


test("Any hand switches only after loss and Both creates two independently tracked visuals",()=>{
 const {manager}=runtime(),root=new Group(),object=new Group();root.add(object);
 const attachment=new HandAttachment();attachment.manager=manager;attachment.gameObject=object;attachment.enabled=true;attachment.handedness="Any";
 attachment.start();const right=structuredClone(capture.frames[0]);right.hands[0].side="Right";
 feed(manager,right);feed(manager,right);assert.equal(attachment.status.hand,"Right");assert.equal(attachment.status.attachment.tracked,true);
 attachment.onDisable();assert.equal(attachment.status.attachment,null); // Explicit callback while the anchor is visible.
 attachment.handedness="Both";attachment.attach();assert.ok(attachment._copy);assert.notEqual(attachment._copy,object);
 assert.equal(manager.getHand("Left")._attachments.size,1);assert.equal(manager.getHand("Right")._attachments.size,1);
 feed(manager,right);assert.equal(attachment.status.attachment.tracked,false);assert.equal(attachment.status.secondAttachment.tracked,true);
 attachment.onDisable();assert.ok(attachment._copy,"Hidden left owner must retain the right copy");
 const copy=attachment._copy;attachment.onDestroy();assert.equal(copy.parent,null);assert.equal(object.parent,root);assert.equal(manager._handAttachmentUpdates.size,0);
});

test("palm and wrist placement use hand anchors without finger autofit",()=>{
 const {manager}=runtime();
 for(const placement of ["palm","wrist"]){
  const attachment=new HandAttachment();attachment.manager=manager;attachment.gameObject=new Group();attachment.finger=placement;attachment.autoFit=true;
  attachment.attach();assert.equal(attachment.status.error,null);assert.equal(attachment.status.attachment.autoFit,null);attachment.detach();
 }
});

test("a Hand Attachment in face Filters is excluded without hiding or converting its root",()=>{
 const {manager}=runtime(),object=new Group();object.getComponent=type=>type===HandAttachment?{}:null;
 manager.filters=[{asset:object}];const oldWindow=globalThis.window;globalThis.window={addEventListener(){}};
 try {manager.onEnable();} finally {globalThis.window=oldWindow;}
 assert.equal(manager.filters.length,0);assert.equal(object.visible,true);
 object.getOrAddComponent=()=>{throw new Error("Must not create FaceFilterRoot for a hand attachment");};
 const face=new FaceInstance(manager);face.update({asset:object},0,1);assert.equal(object.parent,null);
});


test("runtime occlusion toggles share models and removal preserves another requester",()=>{
 const {manager}=runtime(),previous=THREE.Object3D.prototype.addComponent;
 let created=0,removed=0;
 THREE.Object3D.prototype.addComponent=function(type,options){
  assert.equal(type,HandTrackingBehaviour);assert.equal(options.implicitOcclusion,true);created++;
  return {onDestroy(){removed++;}};
 };
 const a=new HandAttachment(),b=new HandAttachment();
 for(const attachment of [a,b]){attachment.manager=manager;attachment.gameObject=new Group();attachment.handedness="Right";attachment.attach();}
 try {
  a.handOcclusion=true;b.handOcclusion=true;assert.equal(created,1);
  a.handOcclusion=false;assert.equal(removed,0);
  a.handOcclusion=true;b.onDestroy();assert.equal(removed,0);
  a.onDestroy();assert.equal(removed,1);
 } finally {a.detach();b.detach();if(previous)THREE.Object3D.prototype.addComponent=previous;else delete THREE.Object3D.prototype.addComponent;}
});


test("Unity and direct attachments share hand-back axes without modifying authored rotations", () => {
 const {manager}=runtime(),owner=new Group(),model=new Group(),child=new Group();
 owner.add(model);model.add(child);child.position.y=.0065;
 model.rotation.set(.1,.2,.3);const authored=model.quaternion.clone();
 const attachment=new HandAttachment();attachment.manager=manager;attachment.gameObject=model;attachment.handedness="Left";attachment.rotationSmoothing=0;
 const hand=manager.getHand("Left"),point={p0:"ring_finger_mcp",p1:"ring_finger_pip",t01:.75};
 const direct=new Group(),pad=new Group();
 hand.attachToHand(direct,point,{offset:{x:0,y:.0065,z:0}});
 hand.attachToHand(pad,point,{coordinateSpace:"finger-pad"});
 for(let i=0;i<3;i++){
  attachment.attach();assert.equal(attachment.status.error,null);
  feed(manager,structuredClone(capture.frames[0]));
  assert.ok(model.quaternion.angleTo(authored)<1e-7);
  assert.ok(model.parent.quaternion.angleTo(direct.parent.quaternion)<1e-7);
  const up=new Vector3(0,1,0).applyQuaternion(direct.parent.quaternion);
  const padUp=new Vector3(0,1,0).applyQuaternion(pad.parent.quaternion);
  assert.ok(up.dot(padUp)<-.999999);
  const along=new Vector3(0,0,1).applyQuaternion(direct.parent.quaternion);
  const padAlong=new Vector3(0,0,1).applyQuaternion(pad.parent.quaternion);
  assert.ok(along.dot(padAlong)>.999999);
  const delta=direct.position.clone().applyQuaternion(direct.parent.quaternion);
  assert.ok(delta.dot(up)>0,"positive offset follows the selected convention");
  attachment.detach();assert.ok(model.quaternion.angleTo(authored)<1e-7);assert.equal(model.parent,owner);
 }
 attachment.coordinateSpace="finger-pad";attachment.attach();feed(manager,structuredClone(capture.frames[0]));
 assert.ok(model.parent.quaternion.angleTo(pad.parent.quaternion)<1e-7);attachment.detach();
 assert.throws(()=>hand.attachToHand(new Group(),point,{coordinateSpace:"typo"}),/coordinateSpace/);
});


test("explicit joints are grouped and scene-free rotations match their poses",()=>{
 const {manager,camera}=runtime(),hand=manager.getHand("Left");
 const joint=hand.getJoint("ring_finger_pip"),rotation=new THREE.Quaternion();
 assert.equal(hand.getJointRotation("ring_finger_pip",rotation),null);
 for(const frame of capture.frames){
  feed(manager,structuredClone(frame));
  assert.ok(hand.getJointRotation("ring_finger_pip",rotation));
  assert.ok(joint.quaternion.angleTo(rotation)<1e-7);
  assert.equal(joint.parent.name,"Hand Tracking");assert.equal(joint.parent.parent,manager.context.mainCamera);
 }
 const root=joint.parent;hand.remove();assert.equal(joint.visible,false);
 assert.equal(hand.getJointRotation("ring_finger_pip",rotation),null);
 hand.dispose();assert.equal(root.children.length,0);
});
