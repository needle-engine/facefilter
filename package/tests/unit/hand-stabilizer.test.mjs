import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Vector3 } from "three";
import { HandPoseStabilizer } from "../../src/hands/HandPoseStabilizer.ts";
const pose = () => {
    const p = [new Vector3(0, 0, -.4)];
    for (let f = 0; f < 5; f++) for (let j = 0; j < 4; j++) p.push(new Vector3((f-2)*.02, .04+j*.025, -.4));
    return p;
};
test("isolated finger growth predicts a bounded rigid translation and immediately recovers", () => {
    const filter = new HandPoseStabilizer(), first = pose();
    assert.equal(filter.update(first, 0), true);
    const next = first.map(p => p.clone().add(new Vector3(.004, 0, 0)));
    filter.update(next, .033);
    const broken = next.map(p => p.clone()); broken[14].y += .1;
    assert.equal(filter.update(broken, .066), true);
    assert.equal(filter.state, "predicted");
    assert.equal(filter.reason, "bone length spike");
    assert.ok(filter.output[14].distanceTo(filter.output[13]) - next[14].distanceTo(next[13]) < 1e-8);
    assert.ok(filter.output[0].distanceTo(next[0]) < .005);
    assert.equal(filter.update(next, .099), true);
    assert.equal(filter.state, "measured");
});
test("prediction expires, repeated timestamp cannot train velocity, and reset reacquires", () => {
    const filter = new HandPoseStabilizer(), points = pose();
    filter.update(points, 1);
    filter.update(points, 1.04, true);
    const snapshot = filter.output.map(p => p.toArray());
    filter.update(points.map(p => p.clone().multiplyScalar(2)), 1.04);
    assert.deepEqual(filter.output.map(p => p.toArray()), snapshot);
    assert.equal(filter.update(points, 1.13, true), false);
    assert.equal(filter.state, "lost");
    filter.reset();
    assert.equal(filter.update(points, 1.2), true);
});
test("normal translation and rotation preserve real articulation", () => {
    const filter = new HandPoseStabilizer(), points = pose();
    filter.update(points, 0);
    const origin = points[0];
    const turned = points.map(p => p.clone().sub(origin).applyAxisAngle(new Vector3(0, 1, 0), .7).add(origin).add(new Vector3(.01, 0, 0)));
    assert.equal(filter.update(turned, .033), true);
    assert.equal(filter.state, "measured");
    assert.deepEqual(filter.output.map(p=>p.toArray()), turned.map(p=>p.toArray()));
});
