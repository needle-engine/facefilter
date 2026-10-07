import { Vector3 } from "three";

const edges = [[0, 5], [0, 9], [0, 17], [5, 17], ...[1, 5, 9, 13, 17].flatMap(base =>
    [[base, base + 1], [base + 1, base + 2], [base + 2, base + 3]])];

/** Reject isolated implausible poses; predict translation briefly without stretching fingers. */
export class HandPoseStabilizer {
    readonly output = Array.from({ length: 21 }, () => new Vector3());
    state: "measured" | "predicted" | "lost" = "lost";
    reason = "initial";
    private lastGood = -Infinity;
    private lastTime = -Infinity;
    private readonly good = Array.from({ length: 21 }, () => new Vector3());
    private readonly velocity = new Vector3();
    private lengths: number[] = [];
    private readonly delta = new Vector3();
    private recovery = 0;
    private readonly candidateWrist = new Vector3();

    reset(): void {
        this.lastGood = this.lastTime = -Infinity;
        this.velocity.set(0, 0, 0);
        this.lengths = [];
        this.recovery = 0;
        this.state = "lost";
        this.reason = "reset";
    }

    update(points: readonly Vector3[], time: number, suspectDepth = false, invalidReason?: string): boolean {
        if (!Number.isFinite(time)) return false;
        if (time <= this.lastTime) return this.state !== "lost";
        this.lastTime = time;
        const finite = points.length === 21 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
        const lengths = finite ? edges.map(([a, b]) => points[a].distanceTo(points[b])) : [];
        let reason = invalidReason || (!finite || lengths.some(v => v < .001) ? "invalid landmarks" : suspectDepth ? "depth spike" : "");
        const elapsed = time - this.lastGood;
        const dt = Math.min(.1, elapsed);
        if (!reason && this.lengths.length) {
            const bad = lengths.filter((v, i) => v / this.lengths[i] > 1.55 || v / this.lengths[i] < .65).length;
            const extreme = lengths.some((v, i) => v / this.lengths[i] > 2.5 || v / this.lengths[i] < .3);
            if (bad >= 3 || extreme) reason = "bone length spike";
            else {
                const span = this.lengths[3];
                this.delta.copy(this.good[0]).addScaledVector(this.velocity, Math.min(elapsed, .06));
                const jump = points[0].distanceTo(this.delta) > Math.max(.035, span * .65) + dt * .8;
                if (jump) {
                    // A genuinely relocated hand must persist across several
                    // measurements before it replaces the previous trajectory.
                    this.recovery = points[0].distanceTo(this.candidateWrist) < span * .4 ? this.recovery + 1 : 1;
                    this.candidateWrist.copy(points[0]);
                    if (this.recovery < 3) reason = "position spike";
                }
                else this.recovery = 0;
            }
        }
        if (reason === "depth spike" && finite && this.lengths.length && lengths.every((v, i) => v / this.lengths[i] > .65 && v / this.lengths[i] < 1.55)) {
            this.recovery = points[0].distanceTo(this.candidateWrist) < .025 ? this.recovery + 1 : 1;
            this.candidateWrist.copy(points[0]);
            if (this.recovery >= 3) { reason = ""; this.velocity.set(0, 0, 0); }
        }
        if (!reason) {
            if (this.lengths.length && elapsed > 0 && elapsed < .15) {
                this.delta.subVectors(points[0], this.good[0]).divideScalar(elapsed).clampLength(0, 1.5);
                this.velocity.lerp(this.delta, .4);
            }
            else this.velocity.set(0, 0, 0);
            for (let i = 0; i < 21; i++) this.good[i].copy(points[i]);
            this.lengths = this.lengths.length ? lengths.map((v, i) => this.lengths[i] * .98 + v * .02) : lengths;
            this.lastGood = time;
            this.state = "measured";
            this.reason = "";
        }
        else {
            if (reason !== "position spike" && reason !== "depth spike") this.recovery = 0;
            this.reason = reason;
            this.state = elapsed <= .12 ? "predicted" : "lost";
        }
        if (this.state === "lost") return false;
        // Damped, bounded extrapolation. Apply ONE translation to the entire
        // last reliable pose so prediction cannot grow fingers or the ring.
        const horizon = this.state === "predicted" ? .06 * (1 - Math.exp(-(time - this.lastGood) / .06)) : 0;
        for (let i = 0; i < 21; i++) this.output[i].copy(this.good[i]).addScaledVector(this.velocity, horizon);
        return true;
    }
}
