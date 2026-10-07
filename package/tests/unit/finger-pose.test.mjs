import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Vector3 } from "three";
import { buildFingerBasis } from "../../src/hands/FingerPose.ts";
import { worldPalmNormal } from "../../src/hands/HandPose.ts";

test("a curled finger rotates its surface away from the palm plane", () => {
    const forward = new Vector3(.73, .06, .68).normalize();
    const palmSide = new Vector3(-.56, -.37, .74).normalize();
    const palmFacing = new Vector3(.74, .18, .65).normalize();
    const right = new Vector3();
    const up = new Vector3();
    const referenceForward = new Vector3(.3, .83, .47).normalize();
    assert.equal(buildFingerBasis(forward, palmSide, palmFacing, referenceForward, right, up), true);
    assert.ok(Math.abs(right.dot(forward)) < 1e-6);
    assert.ok(Math.abs(up.dot(forward)) < 1e-6);
    assert.ok(new Vector3().crossVectors(referenceForward, right).dot(palmFacing) > 0);
    assert.ok(Math.abs(up.z) < .4, "curled finger surface becomes nearly edge-on");
});

test("a straight finger keeps its palm-facing side", () => {
    const right = new Vector3();
    const up = new Vector3();
    assert.equal(buildFingerBasis(new Vector3(0, 1, 0), new Vector3(1, 0, 0),
        new Vector3(0, 0, 1), new Vector3(0, 1, 0), right, up), true);
    assert.ok(up.distanceTo(new Vector3(0, 0, 1)) < 1e-6);
});
test("finger side does not flip when the tip curls past the palm", () => {
    const side = new Vector3(1, 0, 0);
    const palm = new Vector3(0, 0, 1);
    const base = new Vector3(0, 1, 0);
    const beforeRight = new Vector3(), beforeUp = new Vector3();
    const afterRight = new Vector3(), afterUp = new Vector3();
    buildFingerBasis(new Vector3(0, .1, .995).normalize(), side, palm, base, beforeRight, beforeUp);
    buildFingerBasis(new Vector3(0, -.1, .995).normalize(), side, palm, base, afterRight, afterUp);
    assert.ok(beforeRight.dot(afterRight) > .99, "the side axis stays continuous");
    assert.ok(beforeUp.dot(afterUp) > .98, "the surface rotates smoothly through edge-on");
});
test("mirrored left and right hands keep the palm-facing side", () => {
    for (const [side, sign] of [["Left", 1], ["Right", -1]]) {
        const points = [];
        points[0] = { x: 0, y: 0, z: 0 };
        for (const [i, x] of [[5, -.04], [9, -.015], [13, .015], [17, .04]]) {
            points[i] = { x: x * sign, y: -.1, z: 0 };
        }
        const facing = worldPalmNormal(points, true, side, new Vector3()).normalize();
        const index = points[5], pinky = points[17];
        const palmSide = new Vector3(pinky.x - index.x, 0, 0);
        const right = new Vector3(), up = new Vector3();
        buildFingerBasis(new Vector3(0, 1, 0), palmSide, facing,
            new Vector3(0, 1, 0), right, up);
        assert.ok(up.dot(facing) > .99, `${side} palm faces its marker`);
    }
});
test("splayed straight fingers keep pad roll independent of the cross-palm axis", () => {
    const palm = new Vector3(0, 0, 1);
    for (const spread of [-.7, 0, .7]) {
        const base = new Vector3(spread, 1, .3).normalize();
        const expectedPad = palm.clone().addScaledVector(base, -palm.dot(base)).normalize();
        for (const across of [new Vector3(1, 0, 0), new Vector3(1, .4, 0).normalize()]) {
            const right = new Vector3(), up = new Vector3();
            assert.ok(buildFingerBasis(base, across, palm, base, right, up));
            assert.ok(up.distanceTo(expectedPad) < 1e-6, "a splayed finger retains its base pad orientation");
        }
    }
});

test("a fully folded finger retains its side and turns the pad over", () => {
    const right = new Vector3(), up = new Vector3();
    assert.ok(buildFingerBasis(new Vector3(0, -1, 0), new Vector3(1, 0, 0),
        new Vector3(0, 0, 1), new Vector3(0, 1, 0), right, up));
    assert.ok(right.distanceTo(new Vector3(-1, 0, 0)) < 1e-6);
    assert.ok(up.distanceTo(new Vector3(0, 0, -1)) < 1e-6);
});
