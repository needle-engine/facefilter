// Replays a frame saved by the demo's ?debughands button. No camera image is needed.
// Usage: node --experimental-strip-types tests/replay-hand-frame.mjs path/to/facefilter-hand-frame.json
import { readFile } from "node:fs/promises";
import { Vector3 } from "three";
import { buildFingerBasis } from "../src/hands/FingerPose.ts";
import { cameraPalmNormal, estimateHandDepth, fingerBendWeight, imageFingerDirection, projectHandLandmark, worldPalmNormal } from "../src/hands/HandPose.ts";

const filename = process.argv[2];
if (!filename) {
    console.error("Usage: node --experimental-strip-types tests/replay-hand-frame.mjs <capture.json>");
    process.exit(2);
}
const capture = JSON.parse(await readFile(filename, "utf8"));
const aspect = capture.videoWidth / capture.videoHeight;
const toDegrees = value => Math.acos(Math.max(-1, Math.min(1, value))) * 180 / Math.PI;

for (const hand of capture.hands) {
    const image = hand.imageLandmarks;
    const world = hand.worldLandmarks;
    const depth = hand.estimatedDepth || estimateHandDepth(image, world, capture.videoWidth, capture.videoHeight, capture.verticalFov);
    if (!depth || !image?.[8] || !world?.[0]) throw new Error(`Incomplete ${hand.side} hand frame`);
    const project = index => projectHandLandmark(image[index], world[index], world[0].z, depth,
        aspect, capture.verticalFov, capture.mirrored, new Vector3());
    const points = [];
    for (const index of [0, 5, 9, 13, 17]) points[index] = project(index);
    const worldNormal = worldPalmNormal(world, capture.mirrored, hand.side, new Vector3()).normalize();
    const projectedNormal = cameraPalmNormal(points, hand.side, new Vector3()).normalize();
    const forward = imageFingerDirection(image[7], image[8], aspect, capture.mirrored, new Vector3()).normalize();
    const midpoint = project(7).add(project(8)).multiplyScalar(.5);
    const view = midpoint.clone().negate().normalize();
    const tilt = normal => toDegrees(normal.dot(view));
    const resolved = normal => {
        const right = new Vector3().crossVectors(normal, forward).normalize();
        return new Vector3().crossVectors(forward, right).normalize();
    };
    const worldPoint = index => new Vector3(
        world[index].x * (capture.mirrored ? -1 : 1), -world[index].y, -world[index].z);
    const worldFinger = worldPoint(8).sub(worldPoint(6));
    const fingerXY = Math.hypot(worldFinger.x, worldFinger.y);
    const localForward = forward.clone().setZ(fingerXY > 1e-6 ? worldFinger.z / fingerXY : 0).normalize();
    const localRight = worldPoint(5).sub(worldPoint(17));
    localRight.addScaledVector(localForward, -localRight.dot(localForward)).normalize();
    const localUp = new Vector3().crossVectors(localForward, localRight).normalize();
    if (localUp.dot(worldNormal) < 0) localUp.negate();
    const rayForward = project(8).sub(project(6)).normalize();
    const raySide = worldPoint(5).sub(worldPoint(17));
    const rayRight = new Vector3();
    const rayUp = new Vector3();
    buildFingerBasis(rayForward, raySide, worldNormal, worldPoint(6).sub(worldPoint(5)).normalize(), rayRight, rayUp);
    console.log(JSON.stringify({
        side: hand.side,
        depth,
        worldTilt: tilt(worldNormal),
        projectedTilt: tilt(projectedNormal),
        worldResolvedTilt: tilt(resolved(worldNormal)),
        projectedResolvedTilt: tilt(resolved(projectedNormal)),
        fingerLocalTilt: tilt(localUp),
        rayFingerLocalTilt: tilt(rayUp),
        straightToLocalSideDot: new Vector3().crossVectors(worldNormal, forward).normalize().dot(rayRight),
        bendWeight: fingerBendWeight(image[5], image[6], image[8], aspect),
        imageBendAngle: toDegrees(new Vector3(image[6].x - image[5].x, image[5].y - image[6].y, 0).normalize().dot(new Vector3(image[8].x - image[6].x, image[6].y - image[8].y, 0).normalize())),
        rayFingerDepthAngle: Math.atan2(rayForward.z, Math.hypot(rayForward.x, rayForward.y)) * 180 / Math.PI,
        fingerDepthAngle: Math.atan2(localForward.z, Math.hypot(localForward.x, localForward.y)) * 180 / Math.PI,
        worldNormal: worldNormal.toArray(),
        projectedNormal: projectedNormal.toArray(),
        fingerDirection: forward.toArray(),
    }, null, 2));
}