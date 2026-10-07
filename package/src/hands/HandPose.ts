export type HandPoint = { x: number; y: number; z: number };

// Palm edges are more stable than finger tips and cover different hand orientations.
const palmPairs = [[0, 5], [0, 9], [0, 17], [5, 9], [9, 17], [5, 17]] as const;

/** RMS palm-edge length. Image coordinates use height units for y and width units for x/z. */
export function measurePalmSize(points: readonly HandPoint[], videoAspect = 1): number | null {
    let sum = 0;
    for (const [a, b] of palmPairs) {
        const start = points[a], end = points[b];
        if (!start || !end) return null;
        const dx = (end.x - start.x) * videoAspect;
        const dy = end.y - start.y;
        const dz = (end.z - start.z) * videoAspect;
        const squared = dx * dx + dy * dy + dz * dz;
        if (!Number.isFinite(squared)) return null;
        sum += squared;
    }
    const size = Math.sqrt(sum / palmPairs.length);
    return size > 1e-8 ? size : null;
}

/** One stable metric reference for both hands tracked by a manager. */
export class HandScaleReference {
    private _size: number | undefined;

    get size(): number | undefined { return this._size; }

    getOrInitialize(world: readonly HandPoint[]): number | undefined {
        this._size ??= measurePalmSize(world) ?? undefined;
        return this._size;
    }
}

/** Estimate distance using the full 3D palm span and a stable metric size reference. */
export function estimateHandDepth(image: readonly HandPoint[], world: readonly HandPoint[], videoWidth: number, videoHeight: number, verticalFovDegrees: number, referencePalmSize?: number): number | null {
    if (videoWidth <= 0 || videoHeight <= 0 || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) return null;
    const metricSize = referencePalmSize ?? measurePalmSize(world);
    const imageSize = measurePalmSize(image, videoWidth / videoHeight);
    if (!metricSize || !imageSize) return null;
    // Keeping metricSize fixed prevents changes in the model's world-hand size
    // from looking like motion toward the camera. Image z retains foreshortening.
    const distance = metricSize / (imageSize * 2 * Math.tan(verticalFovDegrees * Math.PI / 360));
    return Number.isFinite(distance) && distance > .05 && distance < 10 ? distance : null;
}

/** Fit a perspective hand using a shared palm depth origin.
 * The image XYZ scale describes the palm, not the farther-away wrist.
 * Solve metric scale AFTER unprojecting the rays so an off-axis/close palm
 * is measured in camera space instead of using weak-perspective image lengths.
 */
export function estimateHandProjection(image: readonly HandPoint[], world: readonly HandPoint[], videoWidth: number, videoHeight: number, verticalFovDegrees: number, referencePalmSize?: number): { depth: number; originZ: number } | null {
    if (image.length !== 21 || videoWidth <= 0 || videoHeight <= 0 || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) return null;
    const originZ = [0, 5, 9, 13, 17].reduce((sum, i) => sum + image[i].z, 0) / 5;
    const metricSize = referencePalmSize ?? measurePalmSize(world);
    if (!metricSize || !Number.isFinite(originZ)) return null;
    const aspect = videoWidth / videoHeight;
    const projected = image.map(point => projectHandLandmark(point, originZ, 1, aspect, verticalFovDegrees, false, { x: 0, y: 0, z: 0 }));
    if (projected.some(point => !Number.isFinite(point.z) || point.z >= 0)) return null;
    const cameraSize = measurePalmSize(projected);
    if (!cameraSize) return null;
    const depth = metricSize / cameraSize;
    return Number.isFinite(depth) && depth > .05 && depth < 10 ? { depth, originZ } : null;
}

/** Place a normalized MediaPipe XYZ landmark on its camera ray. */
export function projectHandLandmark<T extends HandPoint>(image: HandPoint, depthOriginZ: number, depth: number, videoAspect: number, verticalFovDegrees: number, mirrored: boolean, target: T): T {
    const tangent = Math.tan(verticalFovDegrees * Math.PI / 360);
    // Image-landmark z has the same scale as normalized x (image width), not y.
    // Convert it at the supplied reference plane; worldLandmarks are a separate pose estimate
    // and their z must not be substituted into this image-coordinate skeleton.
    const imageWidthAtReference = 2 * depth * tangent * videoAspect;
    const z = -depth - (image.z - depthOriginZ) * imageWidthAtReference;
    const halfHeight = -z * tangent;
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


/** Reject depth reconstructions that would magnify attachments at/behind the
 * camera, especially when MediaPipe is extrapolating an off-image wrist. */
export function getHandProjectionIssue(image: readonly HandPoint[], cameraPoints: readonly HandPoint[], wristDepth: number, near: number, palmReferenced = false): string | undefined {
    if (image.length !== 21 || cameraPoints.length !== 21) return "incomplete projection";
    const closest = Math.min(...cameraPoints.map(p => -p.z));
    if (!Number.isFinite(closest) || closest <= Math.max(near + .02, .03)) return "hand depth crosses camera safety margin";
    const wrist = image[0];
    const wristOutside = wrist.x < 0 || wrist.x > 1 || wrist.y < 0 || wrist.y > 1;
    if (!palmReferenced && wristOutside && closest < wristDepth * .5) return "off-frame wrist with unstable relative depth";
    return undefined;
}

/** Calibration-free overlay coordinates. Image height is one camera unit.
 * Relative image Z orders surfaces; it is not interpreted as camera distance.
 * Uniform image growth/translation therefore cannot change the hand's pose.
 */
export function projectImageHandLandmark<T extends HandPoint>(image: HandPoint, originZ: number, videoAspect: number, mirrored: boolean, target: T): T {
    target.x = (image.x - .5) * videoAspect * (mirrored ? -1 : 1);
    target.y = .5 - image.y;
    target.z = -1 - (image.z - originZ) * videoAspect;
    return target;
}
