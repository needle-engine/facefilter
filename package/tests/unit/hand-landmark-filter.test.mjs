import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Vector3 } from "three";
import { HandLandmarkFilter } from "../../src/hands/HandLandmarkFilter.ts";
const options = { minCutoff: 1, beta: 25, derivativeCutoff: 1 };
const pose = Array.from({ length: 21 }, (_, i) => new Vector3(i*.004, i*.003, -.3));

test("shared pose suppresses translation jitter without stretching fingers", () => {
    const filter = new HandLandmarkFilter(); filter.update(pose, 0, options);
    let maximum = 0;
    for (let frame = 1; frame < 120; frame++) {
        const input = pose.map(p => p.clone().add(new Vector3(frame%2 ? .002 : -.002, 0, 0)));
        const result = filter.update(input, frame/60, options);
        maximum = Math.max(maximum, Math.abs(result[0].x));
        for (let i = 1; i < 21; i++) assert.ok(Math.abs(result[i].distanceTo(result[0]) - pose[i].distanceTo(pose[0])) < 1e-7);
    }
    assert.ok(maximum < .0005);
});
test("moving hand responds faster than a fixed resting cutoff and reset does not interpolate across loss", () => {
    const adaptive = new HandLandmarkFilter(), fixed = new HandLandmarkFilter();
    let a, b, target;
    for (let i = 0; i < 60; i++) {
        target = pose.map(p => p.clone().add(new Vector3(i*.003,0,0)));
        a = adaptive.update(target, i/60, options);
        b = fixed.update(target, i/60, { ...options, beta: 0 });
    }
    assert.ok(a[0].distanceTo(target[0]) < b[0].distanceTo(target[0]) * .5);
    adaptive.reset();
    assert.deepEqual(adaptive.update(pose, 2, options).map(p=>p.toArray()), pose.map(p=>p.toArray()));
});
