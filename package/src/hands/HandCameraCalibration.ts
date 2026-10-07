import type { HandPoint } from "./HandPose.js";

export type HandCameraCalibrationStatus = {
    state: "collecting" | "estimated";
    verticalFov: number | null;
    acceptedSamples: number;
    reprojectionError: number | null;
};
const candidates = Array.from({ length: 17 }, (_, i) => 25 + i * 5);
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Small pivoted linear solver used by the damped camera-pose fit.
function solve(matrix: number[][], rhs: number[]): number[] | null {
    const n = rhs.length;
    const a = matrix.map((row, i) => [...row, rhs[i]]);
    for (let j = 0; j < n; j++) {
        let pivot = j;
        for (let i = j + 1; i < n; i++) if (Math.abs(a[i][j]) > Math.abs(a[pivot][j])) pivot = i;
        if (Math.abs(a[pivot][j]) < 1e-12) return null;
        [a[j], a[pivot]] = [a[pivot], a[j]];
        const d = a[j][j];
        for (let k = j; k <= n; k++) a[j][k] /= d;
        for (let i = 0; i < n; i++) if (i !== j) {
            const f = a[i][j];
            for (let k = j; k <= n; k++) a[i][k] -= f * a[j][k];
        }
    }
    return a.map(row => row[n]);
}

/** Fit rotation and translation for one candidate focal length. Camera axes:
 * +X right, +Y down, +Z forward, matching unmirrored MediaPipe image input.
 * Centered principal point and square pixels; no lens-distortion model.
 */
function poseError(world: number[][], image: number[][], focal: number, span: number): number {
    const mx = image.reduce((s, p) => s + p[0], 0) / image.length;
    const my = image.reduce((s, p) => s + p[1], 0) / image.length;
    const worldSpan = Math.sqrt(world.reduce((s, p) => s + p[0] ** 2 + p[1] ** 2, 0) / world.length);
    const depth = focal * worldSpan / span;
    let params = [0, 0, 0, mx * depth / focal, my * depth / focal, depth];
    const residual = (p: number[]) => {
        const angle = Math.hypot(p[0], p[1], p[2]);
        const s = angle > 1e-8 ? Math.sin(angle) / angle : 1;
        const c = angle > 1e-8 ? (1 - Math.cos(angle)) / (angle * angle) : .5;
        const result: number[] = [];
        for (let i = 0; i < world.length; i++) {
            const [x, y, z] = world[i];
            const cx = p[1] * z - p[2] * y, cy = p[2] * x - p[0] * z, cz = p[0] * y - p[1] * x;
            const tx = x + s * cx + c * (p[1] * cz - p[2] * cy) + p[3];
            const ty = y + s * cy + c * (p[2] * cx - p[0] * cz) + p[4];
            const tz = z + s * cz + c * (p[0] * cy - p[1] * cx) + p[5];
            if (tz <= .05) return null;
            result.push(focal * tx / tz - image[i][0], focal * ty / tz - image[i][1]);
        }
        return result;
    };
    let r = residual(params);
    if (!r) return Infinity;
    let error = r.reduce((s, v) => s + v * v, 0), damping = .001;
    for (let iteration = 0; iteration < 22; iteration++) {
        const columns: number[][] = [];
        for (let j = 0; j < 6; j++) {
            const shifted = params.slice(); shifted[j] += 1e-4;
            const next = residual(shifted);
            if (!next) return Infinity;
            columns.push(next.map((v, i) => (v - r![i]) / 1e-4));
        }
        const matrix = columns.map((a, i) => columns.map((b, j) => a.reduce((s, v, k) => s + v * b[k], 0) + (i === j ? damping : 0)));
        const rhs = columns.map(a => -a.reduce((s, v, i) => s + v * r![i], 0));
        const delta = solve(matrix, rhs);
        if (!delta) return Infinity;
        const trial = params.map((v, i) => v + delta[i]);
        const next = residual(trial);
        const nextError = next?.reduce((s, v) => s + v * v, 0) ?? Infinity;
        if (next && nextError < error) {
            params = trial; r = next; error = nextError; damping = Math.max(1e-8, damping / 3);
            if (Math.hypot(...delta) < 1e-6) break;
        }
        else damping *= 5;
    }
    return Math.sqrt(error / (world.length * 2));
}

/** Estimate intrinsics from multiple independent hand detections, never from
 * normalized landmark Z. MediaPipe world landmarks are model estimates, so a
 * stable result is still an estimated FOV, not hardware-provided calibration.
 */
export class HandCameraCalibration {
    private samples: { fov: number; error: number; time: number }[] = [];
    private lastTime = -Infinity;
    private estimate: number | null = null;
    private error: number | null = null;
    get status(): HandCameraCalibrationStatus {
        return { state: this.estimate === null ? "collecting" : "estimated", verticalFov: this.estimate,
            acceptedSamples: this.samples.length, reprojectionError: this.error };
    }
    reset(): void { this.samples = []; this.lastTime = -Infinity; this.estimate = null; this.error = null; }

    update(imagePoints: readonly HandPoint[], worldPoints: readonly HandPoint[], aspect: number, time: number): number | null {
        if (this.estimate !== null) return this.estimate;
        // At most five pose fits per second; rendering never adds duplicate votes.
        if (!Number.isFinite(time) || time - this.lastTime < .2) return null;
        this.lastTime = time;
        this.samples = this.samples.filter(sample => time - sample.time < 8);
        if (imagePoints.length !== 21 || worldPoints.length !== 21 || !(aspect > 0)) return null;
        if ([...imagePoints, ...worldPoints].some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
        if (imagePoints.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
        const image = imagePoints.map(p => [(p.x - .5) * aspect, p.y - .5]);
        const mean = [0, 1, 2].map(j => worldPoints.reduce((s, p) => s + [p.x, p.y, p.z][j], 0) / 21);
        const world = worldPoints.map(p => [p.x - mean[0], p.y - mean[1], p.z - mean[2]]);
        const scale = Math.sqrt(world.reduce((s, p) => s + p.reduce((v, x) => v + x * x, 0), 0) / 21);
        if (scale < 1e-5) return null;
        for (const p of world) for (let j = 0; j < 3; j++) p[j] /= scale;
        const center = [0, 1].map(j => image.reduce((s, p) => s + p[j], 0) / 21);
        const span = Math.sqrt(image.reduce((s, p) => s + (p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2, 0) / 21);
        if (span < .06) return null;
        const errors = candidates.map(fov => poseError(world, image, .5 / Math.tan(fov * Math.PI / 360), span));
        const best = errors.indexOf(Math.min(...errors));
        const error = errors[best];
        // Boundary optima, bad shape agreement, and flat focal-length curves
        // do not contain reliable calibration information.
        if (best < 2 || best > candidates.length - 3 || error / span > .035) return null;
        const alternative = Math.min(...errors.filter((_, i) => Math.abs(i - best) >= 3));
        if (alternative - error < Math.max(.00015, error * .03)) return null;
        this.samples.push({ fov: candidates[best], error, time });
        if (this.samples.length < 10 || time - this.samples[0].time < 2) return null;
        const values = this.samples.map(s => s.fov).sort((a, b) => a - b);
        const spread = values[Math.floor(values.length * .9)] - values[Math.floor(values.length * .1)];
        if (spread > 10) return null;
        this.estimate = median(values);
        this.error = median(this.samples.map(s => s.error));
        return this.estimate;
    }
}
