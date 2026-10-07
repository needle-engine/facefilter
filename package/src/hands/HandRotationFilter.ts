import { Quaternion, Vector3 } from "three";

/** One Euro tuning. Angular velocity is measured in radians/second. */
export type HandRotationFilterOptions = {
    minCutoff?: number;
    beta?: number;
    derivativeCutoff?: number;
    /** Twist mode keeps anchor +Z aligned to the current finger. The shared
     * landmark filter already smooths its direction; only roll may lag.
     * Default full preserves the previous quaternion smoothing behavior.
     */
    mode?: "full" | "twist";
};

/** Quaternion One Euro adaptation: filter signed angular velocity, then slerp.
 * Based on https://gery.casiez.net/1euro/; three-sample spike rejection precedes it.
 */
export class HandRotationFilter {
    private readonly value = new Quaternion();
    private readonly aligned = new Quaternion();
    private readonly swing = new Quaternion();
    private readonly filteredDirection = new Vector3();
    private readonly targetDirection = new Vector3();

    private output(target: Quaternion, options: HandRotationFilterOptions): Quaternion {
        if (options.mode !== "twist") return this.value;
        this.filteredDirection.set(0, 0, 1).applyQuaternion(this.value).normalize();
        this.targetDirection.set(0, 0, 1).applyQuaternion(target).normalize();
        // Parallel-transport the smoothed frame onto the CURRENT segment axis.
        // This correction changes swing, retaining the filtered roll. Keep it
        // separate from filter history so render frequency cannot add samples.
        this.swing.setFromUnitVectors(this.filteredDirection, this.targetDirection);
        return this.aligned.copy(this.value).premultiply(this.swing).normalize();
    }
    private readonly history = [new Quaternion(), new Quaternion(), new Quaternion()];
    private samples = 0;
    private cursor = 0;
    private lastMeasurement: number | undefined;
    private initialized = false;
    private readonly previousInput = new Quaternion();
    private readonly delta = new Quaternion();
    private readonly velocity = new Vector3();
    private readonly derivative = new Vector3();
    private cutoff = 1;
    private previousInputTime: number | undefined;
    private elapsed = 0;

    reset(): void {
        this.initialized = false;
        this.samples = this.cursor = 0;
        this.lastMeasurement = undefined;
        this.previousInputTime = undefined;
        this.elapsed = 0;
        this.velocity.set(0, 0, 0);
    }

    update(target: Quaternion, deltaTime: number, timeConstant: number, measurementTime?: number, options: HandRotationFilterOptions = {}): Quaternion {
        if (!this.initialized || timeConstant <= 0) {
            this.value.copy(target).normalize();
            for (const q of this.history) q.copy(this.value);
            this.samples = 3;
            this.initialized = true;
            this.lastMeasurement = measurementTime;
            this.previousInputTime = measurementTime;
            this.previousInput.copy(this.value);
            this.velocity.set(0, 0, 0);
            this.cutoff = options.minCutoff ?? 1 / (2 * Math.PI * Math.max(timeConstant, .001));
            return this.output(target, options);
        }
        if (!Number.isFinite(deltaTime) || deltaTime <= 0) return this.output(target, options);
        // Render frames can reuse a detector result. Only a new measurement
        // may vote in the short history, otherwise a spike votes for itself.
        this.elapsed += deltaTime;
        const fresh = measurementTime === undefined || measurementTime !== this.lastMeasurement;
        if (fresh) {
            this.history[this.cursor].copy(target).normalize();
            this.cursor = (this.cursor + 1) % 3;
            this.lastMeasurement = measurementTime;
        }
        // Quaternion medoid: the orientation closest to the other samples.
        // This rejects a one-result excursion without Euler wraparound issues.
        let selected = this.history[0], best = Infinity;
        for (let i = 0; i < this.samples; i++) {
            let score = 0;
            for (let j = 0; j < this.samples; j++) score += this.history[i].angleTo(this.history[j]);
            if (score < best) { best = score; selected = this.history[i]; }
        }
        if (fresh) {
            const sampleDt = measurementTime !== undefined && this.previousInputTime !== undefined
                ? measurementTime - this.previousInputTime : this.elapsed;
            if (sampleDt > 0 && Number.isFinite(sampleDt)) {
                // World/camera-space angular increment, using the shortest arc.
                this.delta.copy(this.previousInput).invert().premultiply(selected).normalize();
                if (this.delta.w < 0) this.delta.set(-this.delta.x, -this.delta.y, -this.delta.z, -this.delta.w);
                const sine = Math.hypot(this.delta.x, this.delta.y, this.delta.z);
                const angle = 2 * Math.atan2(sine, this.delta.w);
                this.derivative.set(this.delta.x, this.delta.y, this.delta.z)
                    .multiplyScalar(sine > 1e-8 ? angle / (sine * sampleDt) : 0);
                const derivativeCutoff = Math.max(.001, options.derivativeCutoff ?? 1);
                const derivativeAlpha = 1 / (1 + 1 / (2 * Math.PI * derivativeCutoff * sampleDt));
                // Filter the signed vector BEFORE taking its magnitude, so
                // alternating jitter cannot masquerade as sustained motion.
                this.velocity.lerp(this.derivative, derivativeAlpha);
                this.cutoff = Math.max(.001, options.minCutoff ?? 1 / (2 * Math.PI * timeConstant))
                    + Math.max(0, options.beta ?? 1.5) * this.velocity.length();
                this.previousInput.copy(selected);
                this.previousInputTime = measurementTime;
                this.elapsed = 0;
            }
        }
        const alpha = 1 / (1 + 1 / (2 * Math.PI * this.cutoff * deltaTime));
        this.value.slerp(selected, alpha).normalize();
        return this.output(target, options);
    }
}
