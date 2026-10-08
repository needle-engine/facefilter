import { strict as assert } from "node:assert";
import { test } from "vitest";
import { readFile } from "node:fs/promises";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { replayHandFrame } from "../replay-hand-frame.mjs";
import { projectHandLandmark } from "../../src/hands/HandPose.ts";

const capture = JSON.parse(await readFile(new URL("../fixtures/hand-poses.json", import.meta.url), "utf8"));

test("recorded straight fingertips do not acquire the world output's steep tilt", () => {
    const frame = capture.frames.find(frame => frame.pose === "straight");
    const samples = replayHandFrame(frame);
    for (const name of ["I3", "M3", "R3", "P3"]) {
        const sample = samples.find(sample => sample.name === name);
        assert.ok(sample.tilt < 40, `${name} unexpectedly tips toward the camera: ${sample.tilt}`);
    }
    const farther = structuredClone(frame);
    farther.hands[0].estimatedDepth *= 2;
    const fartherSamples = replayHandFrame(farther);
    for (let i = 0; i < samples.length; i++) {
        const a = new Quaternion().fromArray(samples[i].rotation);
        const b = new Quaternion().fromArray(fartherSamples[i].rotation);
        assert.ok(a.angleTo(b) < 1e-6, "metric scale must not alter the finger pose");
    }
});

test("recorded curl retains depth and a different fingertip orientation", () => {
    const frame = capture.frames.find(frame => frame.pose === "curled");
    const samples = replayHandFrame(frame);
    const base = new Quaternion().fromArray(samples.find(s => s.name === "I1").rotation);
    const tip = samples.find(s => s.name === "I3");
    assert.ok(base.angleTo(new Quaternion().fromArray(tip.rotation)) > Math.PI / 6);
    assert.ok(Math.abs(tip.pitch) > 20, "the curled finger must retain its out-of-plane depth");
});

test("all recorded joints still project onto their image landmarks in either mirror mode", () => {
    for (const frame of capture.frames) for (const mirrored of [false, true]) {
        const camera = new PerspectiveCamera(frame.verticalFov, frame.videoWidth / frame.videoHeight, .001, 10);
        for (const hand of frame.hands) for (const point of hand.imageLandmarks) {
            const projected = projectHandLandmark(point, hand.imageLandmarks[0].z, .5,
                camera.aspect, camera.fov, mirrored, new Vector3()).project(camera);
            assert.ok(Math.abs(projected.x - (point.x * 2 - 1) * (mirrored ? -1 : 1)) < 1e-8);
            assert.ok(Math.abs(projected.y - (1 - point.y * 2)) < 1e-8);
        }
    }
});
