import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimateHandDepth, projectHandLandmark, cameraPalmNormal, fingerBendWeight, imageFingerDirection, worldPalmNormal } from "../../src/hands/HandPose.ts";

const width = 1280, height = 720, fov = 63;
const focal = height / (2 * Math.tan(fov * Math.PI / 360));
const distance = .6;
const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
world[0] = { x: 0, y: .045, z: 0 };
world[5] = { x: -.035, y: -.025, z: 0 };
world[9] = { x: 0, y: -.045, z: 0 };
world[17] = { x: .04, y: -.02, z: 0 };
const image = world.map(p => ({ x: .5 + p.x * focal / (width * distance), y: .5 + p.y * focal / (height * distance), z: 0 }));

test("fits camera distance from metric palm landmarks and image positions", () => {
    assert.ok(Math.abs(estimateHandDepth(image, world, width, height, fov) - distance) < 1e-8);
});

test("a turned palm does not change the estimated camera distance", () => {
    const angle = Math.PI / 3;
    const turned = world.map(p => ({
        x: p.x * Math.cos(angle),
        y: p.y,
        z: p.x * Math.sin(angle),
    }));
    const projected = turned.map(p => ({
        x: .5 + p.x * focal / (width * (distance + p.z)),
        y: .5 + p.y * focal / (height * (distance + p.z)),
        z: 0,
    }));
    const fitted = estimateHandDepth(projected, turned, width, height, fov);
    assert.ok(Math.abs(fitted - distance) < .05);
});

test("does not estimate distance from missing or collapsed landmarks", () => {
    assert.equal(estimateHandDepth([], [], width, height, fov), null);
    assert.equal(estimateHandDepth(image.map(() => ({ x: .5, y: .5, z: 0 })), world, width, height, fov), null);
});

test("projects a joint onto its camera image location in mirrored and normal views", () => {
    const landmark = { x: .25, y: .75, z: 0 };
    const target = { x: 0, y: 0, z: 0 };
    for (const mirrored of [true, false]) {
        projectHandLandmark(landmark, { x: 0, y: 0, z: -.02 }, 0, .6, width / height, fov, mirrored, target);
        const halfHeight = -target.z * Math.tan(fov * Math.PI / 360);
        const recoveredX = .5 + target.x / (2 * halfHeight * width / height * (mirrored ? -1 : 1));
        const recoveredY = .5 - target.y / (2 * halfHeight);
        assert.ok(Math.abs(recoveredX - landmark.x) < 1e-8);
        assert.ok(Math.abs(recoveredY - landmark.y) < 1e-8);
        assert.ok(target.z > -.6, "negative MediaPipe z moves the joint toward the camera");
    }
});


function palm(xCoordinates, zCoordinates = [0, 0, 0, 0]) {
    const points = [];
    points[0] = { x: 0, y: 0, z: 0 };
    for (const [i, joint] of [5, 9, 13, 17].entries()) {
        points[joint] = { x: xCoordinates[i], y: -.1, z: zCoordinates[i] };
    }
    return points;
}

test("metric palm normal remains defined when image points collapse edge-on", () => {
    const points = palm([0, 0, 0, 0], [-.04, -.015, .015, .04]);
    const normal = worldPalmNormal(points, false, "Left", { x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(normal.x) > .001, "world depth preserves the palm normal at a side view");
});

test("four knuckles define the palm-facing side for both hands", () => {
    const left = worldPalmNormal(palm([-.04, -.015, .015, .04]), true, "Left", { x: 0, y: 0, z: 0 });
    const right = worldPalmNormal(palm([.04, .015, -.015, -.04]), true, "Right", { x: 0, y: 0, z: 0 });
    assert.ok(left.z > 0);
    assert.ok(right.z > 0);
    const projected = palm([.04, .015, -.015, -.04]).map(p => p && { x: -p.x, y: -p.y, z: -p.z });
    const cameraNormal = cameraPalmNormal(projected, "Right", { x: 0, y: 0, z: 0 });
    assert.ok(cameraNormal.z > 0);
});
test("finger direction remains in the camera plane despite fingertip depth", () => {
    const start = { x: .45, y: .55, z: -.2 };
    const end = { x: .47, y: .45, z: .9 };
    const direction = imageFingerDirection(start, end, width / height, true, { x: 0, y: 0, z: 1 });
    assert.equal(direction.z, 0);
    assert.ok(direction.y > 0);
    assert.ok(direction.x < 0);
    const normal = { x: 0, y: 0, z: 1 };
    const right = {
        x: normal.y * direction.z - normal.z * direction.y,
        y: normal.z * direction.x - normal.x * direction.z,
        z: normal.x * direction.y - normal.y * direction.x,
    };
    const up = {
        x: direction.y * right.z - direction.z * right.y,
        y: direction.z * right.x - direction.x * right.z,
        z: direction.x * right.y - direction.y * right.x,
    };
    assert.equal(up.z, direction.y * direction.y + direction.x * direction.x);
});
test("straight fingers use the palm pose and visibly bent fingers use the local pose", () => {
    const base = { x: .5, y: .7, z: 0 };
    const middle = { x: .5, y: .6, z: 0 };
    assert.equal(fingerBendWeight(base, middle, { x: .5, y: .5, z: 0 }, 4 / 3), 0);
    assert.equal(fingerBendWeight(base, middle, { x: .6, y: .6, z: 0 }, 4 / 3), 1);
    const partial = fingerBendWeight(base, middle, { x: .53, y: .5, z: 0 }, 4 / 3);
    assert.ok(partial > 0 && partial < 1);
});