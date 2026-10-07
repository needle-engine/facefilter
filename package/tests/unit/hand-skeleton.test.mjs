import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Matrix4, Quaternion, Vector3 } from "three";
import { HandSkeleton, XR_HAND_JOINTS } from "../../src/hands/HandSkeleton.ts";
import { projectHandLandmark } from "../../src/hands/HandPose.ts";
import { replayHandFrame } from "../replay-hand-frame.mjs";

const flip = new Quaternion(1, 0, 0, 0);
async function loadHand(side) {
    const bytes = await readFile(new URL(`../../../Unity FaceFilter Example/Needle/WebProject/include/hand-models/${side}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    gltf.scene.updateMatrixWorld(true);
    const mesh = gltf.scene.getObjectByProperty("isSkinnedMesh", true);
    assert.ok(mesh);
    return { mesh, scene: gltf.scene };
}
function bindData(mesh) {
    const poses = new Map(mesh.skeleton.bones.map((bone, i) => {
        const bind = mesh.skeleton.boneInverses[i].clone().invert();
        const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
        bind.decompose(position, rotation, scale);
        return [bone.name, { position, rotation }];
    }));
    const points = Array.from({length: 21}, () => new Vector3());
    for (const spec of XR_HAND_JOINTS) if (spec.index >= 0) points[spec.index].copy(poses.get(spec.name).position);
    return { poses, points };
}
for (const side of ["left", "right"]) test(`${side} WebXR skin follows a rigid pose and scale without mesh distortion`, async () => {
    const { mesh, scene } = await loadHand(side);
    const rig = new HandSkeleton(mesh);
    const { poses, points } = bindData(mesh);
    mesh.skeleton.update();
    const before = Array.from({length: mesh.geometry.attributes.position.count}, (_, i) => mesh.getVertexPosition(i, new Vector3()));
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), .9);
    const translation = new Vector3(.1, -.03, -.5);
    const scale = 1.3;
    const cameraWorld = new Matrix4().compose(new Vector3(2, 3, 4), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .3), new Vector3(1, 1, 1));
    const transform = new Matrix4().compose(translation, rotation, new Vector3(scale, scale, scale));
    const expectedWorld = cameraWorld.clone().multiply(transform);
    const targets = points.map(point => point.clone().applyMatrix4(transform));
    assert.equal(rig.update((i, target) => target.copy(targets[i]), name => rotation.clone().multiply(poses.get(name).rotation).multiply(flip.clone().invert()), cameraWorld), true);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    let maxError = 0;
    for (let i = 0; i < before.length; i++) {
        const actual = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
        const expected = before[i].clone().applyMatrix4(expectedWorld);
        maxError = Math.max(maxError, actual.distanceTo(expected));
    }
    assert.ok(maxError < 1e-5, `skin distortion: ${maxError}m`);
});

test("recorded poses keep palm order and tracked joints for both mirrored hands", async () => {
    const capture = JSON.parse(await readFile(new URL("../fixtures/hand-poses.json", import.meta.url), "utf8"));
    const reflectedFrames = capture.frames.map(frame => {
        const reflected = structuredClone(frame);
        for (const hand of reflected.hands) {
            hand.side = hand.side === "Left" ? "Right" : "Left";
            for (const point of hand.imageLandmarks) point.x = 1 - point.x;
        }
        return reflected;
    });
    for (const frame of [...capture.frames, ...reflectedFrames]) {
        const hand = frame.hands[0];
        const { mesh, scene } = await loadHand(hand.side === "Left" ? "right" : "left");
        const rig = new HandSkeleton(mesh);
        const points = hand.imageLandmarks.map(point => projectHandLandmark(point, hand.imageLandmarks[0].z,
            hand.estimatedDepth, frame.videoWidth / frame.videoHeight, frame.verticalFov, frame.mirrored, new Vector3()));
        const samples = replayHandFrame(frame);
        const rotations = new Map(samples.map(s => [s.name, new Quaternion().fromArray(s.rotation)]));
        const getRotation = name => {
            if (name === "wrist" || (name.endsWith("metacarpal") && !name.startsWith("thumb"))) return rotations.get("Palm");
            const code = name.startsWith("thumb") ? "T" : name.startsWith("index") ? "I" : name.startsWith("middle") ? "M" : name.startsWith("ring") ? "R" : "P";
            const spec = XR_HAND_JOINTS.find(s => s.name === name);
            const segment = Math.min((spec.index - 1) % 4 + 1, 3);
            return rotations.get(`${code}${segment}`);
        };
        assert.equal(rig.update((i, target) => target.copy(points[i]), getRotation, new Matrix4()), true);
        scene.updateMatrixWorld(true);
        mesh.skeleton.update();
        const indexBase = mesh.skeleton.bones.find(b => b.name === "index-finger-metacarpal").getWorldPosition(new Vector3());
        const pinkyBase = mesh.skeleton.bones.find(b => b.name === "pinky-finger-metacarpal").getWorldPosition(new Vector3());
        const lateral = points[5].clone().sub(points[17]).normalize();
        assert.ok(indexBase.clone().sub(pinkyBase).dot(lateral) > 0,
            "palm metacarpals must keep the same index-to-pinky order as the knuckles");
        for (const spec of XR_HAND_JOINTS.filter(s => s.index >= 0)) {
            const bone = mesh.skeleton.bones.find(b => b.name === spec.name);
            assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(points[spec.index]) < 1e-6, spec.name);
        }
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            const vertex = mesh.getVertexPosition(i, new Vector3());
            assert.ok(vertex.toArray().every(Number.isFinite));
            assert.ok(vertex.distanceTo(points[0]) < .5, "mesh escaped the hand bounds");
        }
        assert.equal(rig.update(() => null, getRotation, new Matrix4()), false);
    }
});

for (const side of ["left", "right"]) test(`${side} palm surface fits changed palm proportions without bulging between bones`, async () => {
    const { mesh, scene } = await loadHand(side);
    const rig = new HandSkeleton(mesh);
    const { poses, points } = bindData(mesh);
    mesh.skeleton.update();
    const x = points[5].clone().sub(points[0]);
    const y = points[17].clone().sub(points[0]);
    const z = x.clone().cross(y);
    z.multiplyScalar(1 / Math.sqrt(z.length()));
    const basis = new Matrix4().makeBasis(x, y, z).setPosition(points[0]);
    const fit = basis.clone().multiply(new Matrix4().makeScale(.6, 1.1, Math.sqrt(.66))).multiply(basis.clone().invert());
    const targets = points.map(p => p.clone().applyMatrix4(fit));
    const indices = mesh.geometry.attributes.skinIndex;
    const weights = mesh.geometry.attributes.skinWeight;
    const samples = [];
    for (let i = 0; i < indices.count; i++) {
        let palmOnly = true;
        for (let j = 0; j < 4; j++) {
            if (weights.getComponent(i, j) < 1e-6) continue;
            const name = mesh.skeleton.bones[indices.getComponent(i, j)].name;
            if (name !== "wrist" && (!name.endsWith("metacarpal") || name.startsWith("thumb"))) palmOnly = false;
        }
        if (palmOnly) samples.push([i, mesh.getVertexPosition(i, new Vector3()).applyMatrix4(fit)]);
    }
    assert.ok(samples.length > 20, "must cover actual palm skin vertices");
    assert.equal(rig.update((i, target) => target.copy(targets[i]), name => poses.get(name).rotation.clone().multiply(flip), new Matrix4()), true);
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    let error = 0;
    for (const [i, expected] of samples) error = Math.max(error, mesh.getVertexPosition(i, new Vector3()).distanceTo(expected));
    assert.ok(error < 1e-5, `palm skin escaped its fitted surface by ${error}m`);
});

for (const side of ["left", "right"]) test(`${side} thumb retains authored roll instead of inheriting finger-marker roll`, async () => {
    const { mesh, scene } = await loadHand(side);
    const rig = new HandSkeleton(mesh);
    const { poses, points } = bindData(mesh);
    mesh.skeleton.update();
    const before = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()));
    const twist = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    rig.update((i, target) => target.copy(points[i]), name => {
        const frame = poses.get(name).rotation.clone().multiply(flip);
        return name.startsWith("thumb") ? frame.multiply(twist) : frame;
    }, new Matrix4());
    scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    let maxError = 0;
    for (let i = 0; i < before.length; i++) maxError = Math.max(maxError, mesh.getVertexPosition(i, new Vector3()).distanceTo(before[i]));
    assert.ok(maxError < 1e-5, `marker roll distorted the authored thumb skin by ${maxError}m`);
});

for (const side of ["left", "right"]) test(`${side} palm metacarpals meet independently moved middle and ring knuckles`, async () => {
    const { mesh, scene } = await loadHand(side);
    const rig = new HandSkeleton(mesh);
    const { poses, points } = bindData(mesh);
    const targets = points.map(p => p.clone());
    targets[9].add(new Vector3(.008, -.012, .006));
    targets[13].add(new Vector3(-.009, .005, -.008));
    rig.update((i, target) => target.copy(targets[i]), name => poses.get(name).rotation.clone().multiply(flip), new Matrix4());
    scene.updateMatrixWorld(true);
    for (const [prefix, index] of [["middle-finger", 9], ["ring-finger", 13]]) {
        const bone = mesh.skeleton.bones.find(b => b.name === `${prefix}-metacarpal`);
        const bindInverse = mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)];
        const palmEnd = points[index].clone().applyMatrix4(bindInverse).applyMatrix4(bone.matrixWorld);
        assert.ok(palmEnd.distanceTo(targets[index]) < 1e-6, `${prefix} palm/finger junction has split`);
    }
});

test("thickness adjusts bone cross sections while preserving joint origins and length axes", async () => {
    const { mesh, scene } = await loadHand("right");
    const rig = new HandSkeleton(mesh);
    const { poses, points } = bindData(mesh);
    const update = thickness => {
        rig.update((i, target) => target.copy(points[i]), name => poses.get(name).rotation.clone().multiply(flip), new Matrix4(), thickness);
        scene.updateMatrixWorld(true);
        return mesh.skeleton.bones.map(b => b.matrixWorld.clone());
    };
    const full = update(1), thin = update(.7);
    for (let i = 0; i < full.length; i++) {
        const origin = new Vector3().setFromMatrixPosition(full[i]);
        assert.ok(origin.distanceTo(new Vector3().setFromMatrixPosition(thin[i])) < 1e-7);
        for (const axis of [0, 2]) assert.ok(new Vector3().setFromMatrixColumn(full[i], axis)
            .distanceTo(new Vector3().setFromMatrixColumn(thin[i], axis)) < 1e-7);
        const expected = new Vector3().setFromMatrixColumn(full[i], 1).multiplyScalar(.7);
        assert.ok(expected.distanceTo(new Vector3().setFromMatrixColumn(thin[i], 1)) < 1e-7);
    }
});

for (const side of ["left", "right"]) test(`${side} unequal finger lengths meet at every skinning joint`, async () => {
    const { mesh, scene } = await loadHand(side);
    const { poses, points } = bindData(mesh);
    const rig = new HandSkeleton(mesh);
    const targets = points.map(p => p.clone());
    for (const base of [5, 9, 13, 17]) for (let j = 1; j <= 3; j++)
        targets[base+j].copy(targets[base+j-1]).add(points[base+j].clone().sub(points[base+j-1]).multiplyScalar([.7, 1.2, .8][j-1]));
    rig.update((i, target) => target.copy(targets[i]), name => poses.get(name).rotation.clone().multiply(flip), new Matrix4());
    scene.updateMatrixWorld(true);
    for (const spec of XR_HAND_JOINTS.filter(s => s.index >= 5 && s.index % 4 !== 0)) {
        const bone = mesh.skeleton.bones.find(b => b.name === spec.name);
        const inverse = mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)];
        const endpoint = points[spec.index + 1].clone().applyMatrix4(inverse).applyMatrix4(bone.matrixWorld);
        assert.ok(endpoint.distanceTo(targets[spec.index + 1]) < 1e-6, spec.name);
    }
});

test("short cuff keeps palm vertices intact and does not alter a shared source geometry", async () => {
    const { mesh } = await loadHand("right");
    const { points } = bindData(mesh);
    const original = mesh.geometry;
    const before = original.attributes.position.array.slice();
    const axis = points[9].clone().sub(points[0]).normalize();
    new HandSkeleton(mesh, .004);
    assert.notEqual(mesh.geometry, original);
    assert.deepEqual(original.attributes.position.array, before);
    const vertex = new Vector3(), previous = new Vector3();
    let changed = 0;
    for (let i = 0; i < original.attributes.position.count; i++) {
        previous.fromBufferAttribute(original.attributes.position, i).applyMatrix4(mesh.bindMatrix);
        vertex.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.bindMatrix);
        const oldDistance = previous.clone().sub(points[0]).dot(axis);
        assert.ok(vertex.clone().sub(points[0]).dot(axis) >= -.004001);
        if (oldDistance >= 0) assert.ok(vertex.distanceTo(previous) < 1e-7);
        else changed++;
    }
    assert.ok(changed > 0);
});

for (const side of ["left", "right"]) test(`${side} fitted fingertip caps end at the surface landmarks`, async () => {
    const { mesh, scene } = await loadHand(side);
    const { points, poses } = bindData(mesh);
    const rig = new HandSkeleton(mesh, undefined, true);
    rig.update((i, target) => target.copy(points[i]), name => poses.get(name).rotation.clone().multiply(flip), new Matrix4());
    scene.updateMatrixWorld(true); mesh.skeleton.update();
    const vertex = new Vector3();
    for (const [finger, tip] of [["thumb",4],["index-finger",8],["middle-finger",12],["ring-finger",16],["pinky-finger",20]]) {
        const axis = points[tip].clone().sub(points[tip-1]).normalize();
        let furthest = -Infinity;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            let weight = 0;
            for (let c = 0; c < 4; c++) {
                const bone = mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,c)];
                if (bone.name.startsWith(finger+"-")) weight += mesh.geometry.attributes.skinWeight.getComponent(i,c);
            }
            if (weight < .5) continue;
            mesh.getVertexPosition(i, vertex).sub(points[tip]);
            furthest = Math.max(furthest, vertex.dot(axis));
        }
        assert.ok(Math.abs(furthest) < .001, `${finger} cap offset: ${furthest}`);
    }
});
