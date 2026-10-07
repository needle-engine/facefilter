import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { HandRotationFilter } from "../../src/hands/HandRotationFilter.ts";
const rotation = angle => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle);

test("small alternating rotation noise is suppressed", () => {
    const filter = new HandRotationFilter(); filter.update(rotation(0), 1/60, .12);
    let maximum = 0;
    for (let i = 0; i < 120; i++) {
        const output = filter.update(rotation(i % 2 ? .1 : -.1), 1/60, .12);
        maximum = Math.max(maximum, output.angleTo(rotation(0)));
    }
    assert.ok(maximum < .025, `remaining jitter: ${maximum}`);
});
test("sustained turns converge quickly without a fixed speed cap, and reacquisition resets", () => {
    const filter = new HandRotationFilter(); filter.update(rotation(0), 1/60, .12);
    const target = rotation(Math.PI / 2);
    let output;
    let previous = rotation(0);
    for (let i = 0; i < 12; i++) {
        output = filter.update(target, 1/60, .12);

        previous.copy(output);
    }
    assert.ok(output.angleTo(target) < .12);
    filter.reset(); output = filter.update(rotation(-1), 1/60, .12);
    assert.ok(output.angleTo(rotation(-1)) < 1e-7);
});
test("equivalent quaternion signs never introduce rotation flips", () => {
    const filter = new HandRotationFilter(), target = rotation(.4);
    filter.update(target, 1/60, .12);
    const negative = new Quaternion(-target.x, -target.y, -target.z, -target.w);
    assert.ok(filter.update(negative, 1/60, .12).angleTo(target) < 1e-7);
});


test("a single large outlier cannot vote repeatedly across render frames", () => {
    const filter = new HandRotationFilter();
    filter.update(rotation(0), 1/120, .12, 0);
    for (let i = 0; i < 6; i++) {
        const output = filter.update(rotation(1.3), 1/120, .12, .02);
        assert.ok(output.angleTo(rotation(0)) < 1e-7);
    }
    assert.ok(filter.update(rotation(0), 1/120, .12, .04).angleTo(rotation(0)) < 1e-7);
});


test("One Euro adaptation reduces lag compared with the same resting cutoff", () => {
    const adaptive = new HandRotationFilter(), fixed = new HandRotationFilter();
    const options = { minCutoff: 1, beta: 1.5, derivativeCutoff: 1 };
    let adaptiveLag = 0, fixedLag = 0;
    for (let i = 0; i < 60; i++) {
        const target = rotation(i * .025);
        const a = adaptive.update(target, 1/60, .12, i/60, options);
        const b = fixed.update(target, 1/60, .12, i/60, { ...options, beta: 0 });
        if (i > 20) { adaptiveLag += a.angleTo(target); fixedLag += b.angleTo(target); }
    }
    assert.ok(adaptiveLag < fixedLag * .5);
});


test("twist smoothing keeps the band perpendicular during rapid finger bends", () => {
    const filter = new HandRotationFilter(), full = new HandRotationFilter();
    const options = { minCutoff: 5, beta: 1.5, mode: "twist" };
    filter.update(rotation(0), 1/60, .12, 0, options);
    full.update(rotation(0), 1/60, .12, 0);
    let oldMaximum = 0;
    for (let i = 1; i <= 40; i++) {
        const swing = new Quaternion().setFromAxisAngle(new Vector3(1,.3,0).normalize(), i*.07);
        const target = swing.multiply(rotation(.5));
        const expected = new Vector3(0,0,1).applyQuaternion(target);
        const output = filter.update(target, 1/60, .12, i/60, options);
        const actual = new Vector3(0,0,1).applyQuaternion(output);
        assert.ok(actual.distanceTo(expected) < 1e-7, "hole axis must follow the tracked segment without extra lag");
        oldMaximum = Math.max(oldMaximum, new Vector3(0,0,1).applyQuaternion(full.update(target, 1/60, .12, i/60)).angleTo(expected));
        assert.ok(Math.abs(output.length()-1)<1e-8);
    }
    assert.ok(oldMaximum > .1, "this movement reproduces full-quaternion axis lag");
});
test("twist mode still suppresses roll spikes and resets on reacquisition", () => {
    const filter = new HandRotationFilter(), options = {mode:"twist"};
    filter.update(rotation(0), 1/60, .12, 0, options);
    const bend = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), .8);
    const target = bend.clone().multiply(rotation(1.2));
    const output = filter.update(target, 1/60, .12, 1/60, options);
    assert.ok(output.angleTo(bend) < 1e-7, "a single roll spike must not pass through with the swing");
    filter.reset();
    assert.ok(filter.update(target,1/60,.12,1,options).angleTo(target)<1e-7);
});
