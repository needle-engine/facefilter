import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Vector3 } from "three";
import { buildFingerBasis } from "../../src/hands/FingerPose.ts";

test("MCP flexion through the palm normal does not flip the finger pad", () => {
    const palmForward = new Vector3(0,1,0), palmNormal = new Vector3(0,0,1), palmSide = new Vector3(1,0,0);
    const right = new Vector3(), up = new Vector3(); let previous;
    for(let degrees=0;degrees<=170;degrees++) {
        const angle=degrees*Math.PI/180;
        const forward=new Vector3(0,Math.cos(angle),Math.sin(angle));
        assert.ok(buildFingerBasis(forward,palmSide,palmNormal,forward,right,up,palmForward));
        const expected=new Vector3(0,-Math.sin(angle),Math.cos(angle));
        assert.ok(up.distanceTo(expected)<1e-6);
        if(previous) assert.ok(up.angleTo(previous)<.02);
        previous=up.clone();
    }
});
