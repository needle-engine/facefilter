import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getHandProjectionIssue } from "../../src/hands/HandPose.ts";
import { HandPoseStabilizer } from "../../src/hands/HandPoseStabilizer.ts";
import { Vector3 } from "three";
const image = Array.from({length:21},()=>({x:.5,y:.5,z:0}));
const points = Array.from({length:21},(_,i)=>new Vector3(i*.004,i*.003,-.15));
test("invalid close-depth geometry cannot enter through acquisition or repeated recovery", () => {
    const candidate = points.map(p=>p.clone()); candidate[16].z=-.0001;
    const reason = getHandProjectionIssue(image,candidate,.15,.01);
    assert.ok(reason?.includes("safety margin"));
    const filter = new HandPoseStabilizer();
    for(let i=0;i<10;i++) assert.equal(filter.update(candidate,i/60,false,reason),false);
});
test("offscreen wrist is allowed unless combined with extreme relative depth", () => {
    const outside = image.map(p=>({...p})); outside[0].y=1.05;
    assert.equal(getHandProjectionIssue(outside,points,.15,.01),undefined);
    const candidate = points.map(p=>p.clone()); candidate[16].z=-.05;
    assert.ok(getHandProjectionIssue(outside,candidate,.15,.01)?.includes("off-frame wrist"));
    assert.equal(getHandProjectionIssue(image,candidate,.15,.01),undefined);
});

test("palm-referenced reconstruction permits valid close geometry with an offscreen wrist", () => {
    const outside = image.map(p=>({...p})); outside[0].y=1.05;
    const candidate = points.map(p=>p.clone()); candidate[16].z=-.05;
    assert.equal(getHandProjectionIssue(outside,candidate,.15,.01,true),undefined);
    candidate[16].z=-.005;
    assert.ok(getHandProjectionIssue(outside,candidate,.15,.01,true)?.includes("safety margin"));
});
