// Replay a saved frame or sequence with the same projection and basis helpers as the runtime.
// Usage: node --experimental-strip-types tests/replay-hand-frame.mjs <capture.json> [--json]
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";
import { buildFingerBasis } from "../src/hands/FingerPose.ts";
import { cameraPalmNormal, projectImageHandLandmark, estimateHandDepth, estimateHandProjection, projectHandLandmark } from "../src/hands/HandPose.ts";

const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
const segments = ["T", "I", "M", "R", "P"].flatMap((finger, index) =>
    [1, 2, 3].map(segment => ({ name: `${finger}${segment}`, start: 1 + index * 4 + segment - 1, end: 2 + index * 4 + segment - 1, base: 1 + index * 4 })));
segments.push({ name: "Palm", start: 0, end: 9, base: 0 });

export function replayHandFrame(frame) {
    const samples = [];
    for (const hand of frame.hands) {
        const image = hand.imageLandmarks;
        const imageProjection = frame.poseMethod === "mediapipe-image-orthographic";
        const projection = frame.poseMethod === "mediapipe-image-xyz-palm-perspective"
            ? estimateHandProjection(image, hand.worldLandmarks, frame.videoWidth, frame.videoHeight, frame.verticalFov, hand.referencePalmSize) : null;
        const depth = hand.estimatedDepth || projection?.depth || estimateHandDepth(image, hand.worldLandmarks,
            frame.videoWidth, frame.videoHeight, frame.verticalFov);
        if (!depth || image.length !== 21) throw new Error(`Incomplete ${hand.side} hand frame`);
        const points = hand.tracking?.cameraLandmarks?.length === 21
            ? hand.tracking.cameraLandmarks.map(point => new Vector3().fromArray(point))
            : imageProjection ? image.map(point => projectImageHandLandmark(point,
                [0,5,9,13,17].reduce((s,i)=>s+image[i].z,0)/5,frame.videoWidth/frame.videoHeight,frame.mirrored,new Vector3()))
            : image.map(point => projectHandLandmark(point, projection?.originZ ?? image[0].z, depth,
                frame.videoWidth / frame.videoHeight, frame.verticalFov, frame.mirrored, new Vector3()));
        const normal = cameraPalmNormal(points, hand.side, new Vector3()).normalize();
        if (!frame.mirrored) normal.negate();
        const side = points[5].clone().sub(points[17]);
        for (const { name, start, end, base } of segments) {
            const forward = points[end].clone().sub(points[start]).normalize();
            const reference = base === 0 ? forward : points[base + 1].clone().sub(points[base]).normalize();
            const right = new Vector3(), up = new Vector3();
            if (!buildFingerBasis(forward, side, normal, reference, right, up, points[9].clone().sub(points[0]).normalize())) throw new Error(`Degenerate ${name} basis`);
            const position = points[start].clone().add(points[end]).multiplyScalar(.5);
            const view = imageProjection ? new Vector3(0,0,1) : position.clone().negate().normalize();
            const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward));
            const recorded = hand.attachments?.find(marker => marker.name === name);
            let recordedTilt = null;
            if (recorded?.cameraQuaternion && recorded.cameraPosition) {
                const recordedUp = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().fromArray(recorded.cameraQuaternion));
                const recordedView = imageProjection ? new Vector3(0,0,1) : new Vector3().fromArray(recorded.cameraPosition).negate().normalize();
                recordedTilt = angle(recordedUp, recordedView);
            }
            samples.push({ name, side: hand.side, tilt: angle(up, view),
                pitch: Math.asin(Math.max(-1, Math.min(1, forward.dot(view)))) * 180 / Math.PI,
                roll: Math.atan2(right.dot(view), up.dot(view)) * 180 / Math.PI,
                recordedTilt, position: position.toArray(), rotation: rotation.toArray() });
        }
    }
    return samples;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const filename = process.argv[2];
    if (!filename) throw new Error("Usage: replay-hand-frame.mjs <capture.json> [--json]");
    const capture = JSON.parse(await readFile(filename, "utf8"));
    const frames = capture.frames ?? [capture];
    const results = frames.map(replayHandFrame);
    if (process.argv.includes("--json")) console.log(JSON.stringify(results));
    else {
        const groups = new Map();
        for (const sample of results.flat()) {
            const key = `${sample.side} ${sample.name}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(sample);
        }
        const median = values => {
            values.sort((a, b) => a - b);
            return +values[Math.floor(values.length / 2)].toFixed(1);
        };
        console.log(`Replayed ${frames.length} frames. Angles in degrees; surface tilt 0 faces the camera.`);
        console.table([...groups].map(([marker, samples]) => ({ marker,
            recordedTilt: samples[0].recordedTilt === null ? null : median(samples.map(s => s.recordedTilt)),
            currentTilt: median(samples.map(s => s.tilt)),
            currentRange: `${Math.min(...samples.map(s => s.tilt)).toFixed(1)} - ${Math.max(...samples.map(s => s.tilt)).toFixed(1)}`,
            pitch: median(samples.map(s => s.pitch)), roll: median(samples.map(s => s.roll))
        })));
    }
}
