export type HandPoint = { x: number; y: number; z: number };

// Palm edges are more stable than finger tips and cover different hand orientations.
const palmPairs = [[0, 5], [0, 9], [0, 17], [5, 9], [9, 17], [5, 17]] as const;

/** Estimate camera distance from the apparent size of MediaPipe's metric hand landmarks. */
export function estimateHandDepth(image: readonly HandPoint[], world: readonly HandPoint[], videoWidth: number, videoHeight: number, verticalFovDegrees: number): number | null {
    if (videoWidth <= 0 || videoHeight <= 0 || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) return null;
    const focalPixels = videoHeight / (2 * Math.tan(verticalFovDegrees * Math.PI / 360));
    const estimates: number[] = [];
    for (const [a, b] of palmPairs) {
        const ia = image[a], ib = image[b], wa = world[a], wb = world[b];
        if (!ia || !ib || !wa || !wb) continue;
        const imageDistance = Math.hypot((ia.x - ib.x) * videoWidth, (ia.y - ib.y) * videoHeight);
        // World x/y are camera-facing metric coordinates. Use their projected span so
        // turning the palm does not look like moving the whole hand away.
        const worldSpan = Math.hypot(wa.x - wb.x, wa.y - wb.y);
        if (imageDistance > 1 && worldSpan > .005) {
            const distance = focalPixels * worldSpan / imageDistance;
            if (Number.isFinite(distance) && distance > .05 && distance < 10) estimates.push(distance);
        }
    }
    if (!estimates.length) return null;
    estimates.sort((a, b) => a - b);
    const middle = Math.floor(estimates.length / 2);
    return estimates.length % 2 ? estimates[middle] : (estimates[middle - 1] + estimates[middle]) / 2;
}

/** Place an image landmark on the camera ray, using its metric offset from the wrist. */
export function projectHandLandmark<T extends HandPoint>(image: HandPoint, world: HandPoint | undefined, wristWorldZ: number, depth: number, videoAspect: number, verticalFovDegrees: number, mirrored: boolean, target: T): T {
    // MediaPipe z decreases toward the camera; Three.js camera space looks toward -z.
    const z = -depth - ((world?.z ?? wristWorldZ) - wristWorldZ);
    const halfHeight = -z * Math.tan(verticalFovDegrees * Math.PI / 360);
    target.x = (image.x - .5) * 2 * halfHeight * videoAspect * (mirrored ? -1 : 1);
    target.y = (.5 - image.y) * 2 * halfHeight;
    target.z = z;
    return target;
}

const palmKnuckles = [5, 9, 13, 17] as const;

/** Fit a palm normal from the wrist and all four knuckles. */
function palmNormal<T extends HandPoint>(landmarks: readonly (HandPoint | undefined)[], handedness: string, xSign: number, ySign: number, zSign: number, target: T): T {
    target.x = target.y = target.z = 0;
    const wrist = landmarks[0];
    if (!wrist) return target;
    for (let i = 0; i < palmKnuckles.length - 1; i++) {
        const a = landmarks[palmKnuckles[i]];
        const b = landmarks[palmKnuckles[i + 1]];
        if (!a || !b) continue;
        const ax = (a.x - wrist.x) * xSign;
        const ay = (a.y - wrist.y) * ySign;
        const az = (a.z - wrist.z) * zSign;
        const bx = (b.x - wrist.x) * xSign;
        const by = (b.y - wrist.y) * ySign;
        const bz = (b.z - wrist.z) * zSign;
        target.x += ay * bz - az * by;
        target.y += az * bx - ax * bz;
        target.z += ax * by - ay * bx;
    }
    if (handedness === "Right") {
        target.x = -target.x;
        target.y = -target.y;
        target.z = -target.z;
    }
    return target;
}

/** Palm-facing normal from MediaPipe's metric world landmarks. */
export function worldPalmNormal<T extends HandPoint>(landmarks: readonly (HandPoint | undefined)[], mirrored: boolean, handedness: string, target: T): T {
    return palmNormal(landmarks, handedness, mirrored ? -1 : 1, -1, -1, target);
}

/** Palm-facing normal from landmarks already placed in Three.js camera space. */
export function cameraPalmNormal<T extends HandPoint>(landmarks: readonly (HandPoint | undefined)[], handedness: string, target: T): T {
    return palmNormal(landmarks, handedness, 1, 1, 1, target);
}
/** Follow the finger in the camera image without using uncertain fingertip depth. */
export function imageFingerDirection<T extends HandPoint>(start: HandPoint, end: HandPoint, videoAspect: number, mirrored: boolean, target: T): T {
    target.x = (end.x - start.x) * videoAspect * (mirrored ? -1 : 1);
    target.y = start.y - end.y;
    target.z = 0;
    return target;
}
/** Image-space bend between the finger's base and its longer distal span. */
export function fingerBendWeight(base: HandPoint, middle: HandPoint, tip: HandPoint, videoAspect: number): number {
    const ax = (middle.x - base.x) * videoAspect;
    const ay = base.y - middle.y;
    const bx = (tip.x - middle.x) * videoAspect;
    const by = middle.y - tip.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (lengths < 1e-8) return 0;
    const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths));
    const angle = Math.acos(cosine) * 180 / Math.PI;
    const t = Math.max(0, Math.min(1, (angle - 12) / 28));
    return t * t * (3 - 2 * t);
}