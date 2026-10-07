import { Vector3 } from "three";

export type HandLandmarkFilterOptions = { minCutoff: number; beta: number; derivativeCutoff: number };

/** One Euro filtering of wrist translation and wrist-relative hand shape.
 * One common shape blend avoids unrelated per-joint response speeds. */
export class HandLandmarkFilter {
    readonly output = Array.from({ length: 21 }, () => new Vector3());
    private readonly previous = Array.from({ length: 21 }, () => new Vector3());
    private readonly filtered = Array.from({ length: 21 }, () => new Vector3());
    private readonly velocity = Array.from({ length: 21 }, () => new Vector3());
    private readonly input = Array.from({ length: 21 }, () => new Vector3());
    private readonly derivative = new Vector3();
    private time = -Infinity;

    reset(): void { this.time = -Infinity; }

    update(points: readonly Vector3[], time: number, options: HandLandmarkFilterOptions): readonly Vector3[] {
        if (time <= this.time) return this.output;
        const dt = time - this.time;
        for (let i = 0; i < 21; i++) {
            this.input[i].copy(points[i]);
            if (i) this.input[i].sub(points[0]);
        }
        if (!Number.isFinite(dt) || dt > .25) {
            for (let i = 0; i < 21; i++) {
                this.previous[i].copy(this.input[i]); this.filtered[i].copy(this.input[i]);
                this.velocity[i].set(0, 0, 0); this.output[i].copy(points[i]);
            }
            this.time = time;
            return this.output;
        }
        const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * Math.max(.001, cutoff) * dt));
        const derivativeAlpha = alpha(options.derivativeCutoff);
        let shapeSpeed = 0;
        for (let i = 0; i < 21; i++) {
            this.derivative.subVectors(this.input[i], this.previous[i]).divideScalar(dt);
            this.velocity[i].lerp(this.derivative, derivativeAlpha);
            this.previous[i].copy(this.input[i]);
            if (i) shapeSpeed = Math.max(shapeSpeed, this.velocity[i].length());
        }
        const shapeAlpha = alpha(options.minCutoff + options.beta * shapeSpeed);
        const wristAlpha = alpha(options.minCutoff + options.beta * this.velocity[0].length());
        for (let i = 0; i < 21; i++) {
            this.filtered[i].lerp(this.input[i], i ? shapeAlpha : wristAlpha);
            this.output[i].copy(this.filtered[i]);
            if (i) this.output[i].add(this.filtered[0]);
        }
        this.time = time;
        return this.output;
    }
}
