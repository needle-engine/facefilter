import {test} from "vitest";
import {strict as assert} from "node:assert";
import {readFile} from "node:fs/promises";

import {NeedleTrackingManager,HandTrackingBehaviour,HandTrackingSkinnedMeshRenderer,THREE} from "../helpers/hand-runtime.mjs";
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
 manager.hands[0].render(results,0);
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
 const bytes=await readFile(new URL("../../../Unity FaceFilter Example/Needle/WebProject/include/hand-models/right.glb",import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
 const {manager}=runtime(),hand=manager.getHand("Left");
 const skin=new HandTrackingSkinnedMeshRenderer();skin.gameObject=scene;skin.context=manager.context;skin.awake();
 const behaviour=new HandTrackingBehaviour();behaviour.gameObject=scene;behaviour.context=manager.context;
 scene.getOrAddComponent=()=>skin;behaviour.awake();behaviour.activeAndEnabled=true;skin.bindHand(hand);hand.addBehaviour(behaviour);
 const ring=new Mesh(new TorusGeometry(.01,.001,16,64));
 const handle=hand.attachToHand(ring,{p0:"ring_finger_mcp",p1:"ring_finger_pip",t01:.75},{autoFit:{smoothing:0}});
 for(const frame of capture.frames){
  hand.remove();feed(manager,structuredClone(frame));
  assert.ok(behaviour.skinnedMeshes.every(mesh=>mesh.visible));
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
