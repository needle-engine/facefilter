import { strict as assert } from "node:assert";
import { test } from "vitest";
import { estimateHandDepth, estimateHandProjection, HandScaleReference, measurePalmSize, projectHandLandmark, cameraPalmNormal, fingerBendWeight, imageFingerDirection, worldPalmNormal } from "../../src/hands/HandPose.ts";

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
        z: p.z * focal / (width * distance),
    }));
    const fitted = estimateHandDepth(projected, turned, width, height, fov);
    assert.ok(Math.abs(fitted - distance) < .05);
});

test("does not estimate distance from missing or collapsed landmarks", () => {
    assert.equal(estimateHandDepth([], [], width, height, fov), null);
    assert.equal(estimateHandDepth(image.map(() => ({ x: .5, y: .5, z: 0 })), world, width, height, fov), null);
});

test("projects a joint onto its camera image location in mirrored and normal views", () => {
    const landmark = { x: .25, y: .75, z: -.02 };
    const target = { x: 0, y: 0, z: 0 };
    for (const mirrored of [true, false]) {
        projectHandLandmark(landmark, 0, .6, width / height, fov, mirrored, target);
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
test("bend diagnostic distinguishes straight fingers from curled fingers", () => {
    const base = { x: .5, y: .7, z: 0 };
    const middle = { x: .5, y: .6, z: 0 };
    assert.equal(fingerBendWeight(base, middle, { x: .5, y: .5, z: 0 }, 4 / 3), 0);
    assert.equal(fingerBendWeight(base, middle, { x: .6, y: .6, z: 0 }, 4 / 3), 1);
    const partial = fingerBendWeight(base, middle, { x: .53, y: .5, z: 0 }, 4 / 3);
    assert.ok(partial > 0 && partial < 1);
});

test("normalized depth uses image width, matches x units, and ignores wrist z origin", () => {
    for (const aspect of [4 / 3, 9 / 16]) {
        const project = p => projectHandLandmark(p, .03, .5, aspect, 60, false, { x: 0, y: 0, z: 0 });
        const center = project({ x: .5, y: .5, z: .03 });
        const horizontal = project({ x: .6, y: .5, z: .03 });
        const closer = project({ x: .5, y: .5, z: -.07 });
        assert.ok(Math.abs((horizontal.x - center.x) - (closer.z - center.z)) < 1e-8);
        assert.equal(center.z, -.5);
    }
});

test("hand-size reference prevents world-model size changes from changing distance", () => {
    const reference = measurePalmSize(world);
    const smallerWorld = world.map(p => ({ x: p.x * .5, y: p.y * .5, z: p.z * .5 }));
    assert.ok(Math.abs(estimateHandDepth(image, smallerWorld, width, height, fov, reference) - distance) < 1e-8);
    const closerImage = image.map(p => ({ x: .5 + (p.x - .5) * 2, y: .5 + (p.y - .5) * 2, z: p.z * 2 }));
    assert.ok(Math.abs(estimateHandDepth(closerImage, world, width, height, fov, reference) - distance / 2) < 1e-8,
        "actual image growth still moves the hand closer");
});

test("left and right hands share one scale despite different initial world-size estimates", () => {
    const reference = new HandScaleReference();
    assert.equal(reference.getOrInitialize([]), undefined);
    const leftSize = reference.getOrInitialize(world);
    const rightWorld = world.map(p => ({ x: -p.x * .6, y: p.y * .6, z: p.z * .6 }));
    const rightImage = image.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));
    const rightSize = reference.getOrInitialize(rightWorld);
    assert.equal(leftSize, rightSize);
    const leftDepth = estimateHandDepth(image, world, width, height, fov, leftSize);
    const rightDepth = estimateHandDepth(rightImage, rightWorld, width, height, fov, rightSize);
    assert.ok(Math.abs(leftDepth - rightDepth) < 1e-8, "matching apparent hands must render identical objects at the same scale");
    assert.equal(reference.getOrInitialize([]), leftSize, "tracking loss must retain the shared reference");
});

// Generate real perspective image rays and palm-relative normalized depth from
// one metric hand. Close/far reconstructions must preserve its physical size.
test("palm-referenced projection reconstructs close and off-axis tilted hands", () => {
    const metric = Array.from({length: 21}, (_, i) => ({x: ((i % 4) - 1.5) * .012, y: -.01 * i, z: 0}));
    metric[0] = {x: 0, y: .065, z: .04};
    metric[5] = {x: -.033, y: -.025, z: -.01};
    metric[9] = {x: -.01, y: -.04, z: -.016};
    metric[13] = {x: .013, y: -.034, z: -.014};
    metric[17] = {x: .036, y: -.018, z: 0};
    const origin = [0,5,9,13,17].reduce((s, i) => s + metric[i].z, 0) / 5;
    const tangent = Math.tan(fov * Math.PI / 360);
    for (const aspect of [4/3, 9/16]) for (const depth of [.12, .25, .6]) {
        const cameraPoints = metric.map(p => ({x:p.x+.025, y:-p.y-.025, z:-(depth+p.z-origin)}));
        const normalized = cameraPoints.map(p => ({
            x:.5+p.x/(-p.z*2*tangent*aspect), y:.5-p.y/(-p.z*2*tangent),
            z:((-p.z)-(-cameraPoints[0].z))/(2*depth*tangent*aspect),
        }));
        const fit = estimateHandProjection(normalized, metric, 1000*aspect, 1000, fov);
        assert.ok(fit);
        assert.ok(Math.abs(fit.depth-depth) < 1e-9);
        normalized.forEach((p, i) => {
            const actual = projectHandLandmark(p, fit.originZ, fit.depth, aspect, fov, false, {x:0,y:0,z:0});
            assert.ok(Math.hypot(actual.x-cameraPoints[i].x, actual.y-cameraPoints[i].y, actual.z-cameraPoints[i].z) < 1e-9);
        });
        // Physical ring width relative to its placement depth must be unchanged
        // by reconstruction, even close to the camera.
        const ring = projectHandLandmark(normalized[13], fit.originZ, fit.depth, aspect, fov, false, {x:0,y:0,z:0});
        assert.ok(Math.abs(.02/-ring.z - .02/-cameraPoints[13].z) < 1e-9);
    }
});
test("palm projection rejects incomplete and non-finite measurements", () => {
    assert.equal(estimateHandProjection([],world,width,height,fov),null);
    const invalid=image.map(p=>({...p})); invalid[13].z=NaN;
    assert.equal(estimateHandProjection(invalid,world,width,height,fov),null);
});
