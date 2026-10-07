// Replay actual MediaPipe input through the automatic camera estimator.
import { readFile } from "node:fs/promises";
import { HandCameraCalibration } from "../src/hands/HandCameraCalibration.ts";
const path = process.argv[2];
if (!path) throw new Error("Usage: replay-hand-calibration.mjs <capture.json>");
const capture = JSON.parse(await readFile(path, "utf8"));
const calibration = new HandCameraCalibration();
let source = "", firstLock = null, samples = 0, maximumMs = 0;
for (const [index, frame] of (capture.frames ?? [capture]).entries()) {
    const dimensions = `${frame.videoWidth}:${frame.videoHeight}`;
    if (dimensions !== source) { source = dimensions; calibration.reset(); }
    const hand = frame.hands[0];
    if (!hand) continue;
    const before = performance.now();
    const fov = calibration.update(hand.imageLandmarks, hand.worldLandmarks,
        frame.videoWidth / frame.videoHeight, frame.timestamp / 1000);
    maximumMs = Math.max(maximumMs, performance.now() - before);
    samples++;
    if (fov !== null && firstLock === null) firstLock = index;
}
console.log(JSON.stringify({frames: samples, firstLock, ...calibration.status,
    maxProcessingMs: +maximumMs.toFixed(2)}, null, 2));
