import { measureRingOpening } from "./RingOpening.js";
import { Matrix4, Object3D, SkinnedMesh, Vector3 } from "three";

/** Fit a circular opening to the tracked finger surface. Off unless supplied. */
export type HandAttachmentAutoFit = {
    /** Set false to restore the attachment's original position and scale. */
    enabled?: boolean;
    /** Adjustment to the measured fit. Clamped to 0.8?1.2; default 1. */
    fitFactor?: number;
    /** Opening radius at initial scale in anatomical metres. Omit to measure a rigid circular band aligned to Z. */
    innerRadius?: number;
    /** Surface clearance in metres. Default 0.0005 (0.5 mm). */
    clearance?: number;
    /** Half the band's axial width in metres. Default 0 (one cross-section). */
    halfWidth?: number;
    /** Reject oversized/ambiguous fits above this multiple of the initial size. Default 2. */
    maxScale?: number;
    /** Time constant in seconds for fit offset/scale smoothing. Default 0.08; 0 disables it. */
    smoothing?: number;
};

export type HandAutoFitStatus = {
    state: "waiting" | "fitted" | "held" | "disabled";
    reason: "not-updated" | "no-mesh" | "no-section" | "oversized" | "invalid-geometry" | "detached" | null;
    source: "measured" | "explicit";
    innerRadius: number | null;
    /** Last applied multiplier, relative to the original asset scale. */
    scale: number;
};

/** CPU surface slices, in anchor space. Runs after the current hand skin pose. */
export class HandAttachmentFit {
    private readonly originalScale: Vector3;
    private readonly originalPosition: Vector3;
    private readonly inverse = new Matrix4();
    private readonly anchorInverse = new Matrix4();
    private readonly transform = new Matrix4();
    private readonly vertices = new Map<SkinnedMesh, Vector3[]>();
    private readonly weights = new Map<SkinnedMesh, number[]>();
    private readonly intersections: Vector3[] = [];
    private readonly center = new Vector3();
    private readonly segments: Vector3[] = [];
    private applied = false;
    private readonly assetCenter = new Vector3();
    private readonly innerRadius: number;
    private _status: HandAutoFitStatus;
    get status(): HandAutoFitStatus { return { ...this._status }; }
    /** Restore the caller's transform without disposing shared geometry or materials. */
    restore(): void {
        this.object.scale.copy(this.originalScale);
        this.object.position.copy(this.originalPosition);
        this.applied = false;
    }
    private hold(reason: HandAutoFitStatus["reason"]): void {
        this._status = { ...this._status, state: this.applied ? "held" : "waiting", reason };
    }

    readonly object: Object3D;
    readonly options: HandAttachmentAutoFit;
    private readonly boneName: string;
    private readonly targetScale = new Vector3();
    private readonly measurementAnchor?: Object3D;

    constructor(object: Object3D, options: HandAttachmentAutoFit, finger: string, segment = "phalanx-proximal", measurementAnchor?: Object3D) {
        this.object = object;
        this.measurementAnchor = measurementAnchor;
        this.options = options;
        this.boneName = `${finger}-${segment}`;
        const measurement = options.innerRadius === undefined ? measureRingOpening(object) : null;
        this.innerRadius = options.innerRadius ?? measurement?.innerRadius ?? NaN;
        if (options.innerRadius !== undefined && (!(options.innerRadius > 0) || !Number.isFinite(options.innerRadius)))
            throw new Error("Hand attachment autoFit.innerRadius must be a positive radius in metres.");
        if (measurement) this.assetCenter.copy(measurement.center);
        this._status = { state: "waiting", reason: Number.isFinite(this.innerRadius) ? "not-updated" : "invalid-geometry",
            source: options.innerRadius === undefined ? "measured" : "explicit", innerRadius: Number.isFinite(this.innerRadius) ? this.innerRadius : null, scale: 1 };
        this.originalScale = object.scale.clone();
        this.originalPosition = object.position.clone();
    }

    update(meshes: readonly SkinnedMesh[], deltaTime = 1 / 60): void {
        if (this.options.enabled === false) {
            if (this.applied) {
                this.object.scale.copy(this.originalScale);
                this.object.position.copy(this.originalPosition);
                this.applied = false;
            }
            this._status = { ...this._status, state: "disabled", reason: null, scale: 1 };
            return;
        }
        if (!Number.isFinite(this.innerRadius)) { this.hold("invalid-geometry"); return; }
        const anchor = this.object.parent;
        if (!anchor) { this.hold("detached"); return; }
        anchor.updateWorldMatrix(true, false);
        this.anchorInverse.copy(anchor.matrixWorld).invert();
        // Measure perpendicular to the current finger, independently of the
        // rendered attachment's rotation lag. An oblique slice is an ellipse
        // and must not be mistaken for a thicker finger.
        const measurementAnchor = this.measurementAnchor ?? anchor;
        measurementAnchor.updateWorldMatrix(true, false);
        this.inverse.copy(measurementAnchor.matrixWorld).invert();
        let count = 0;
        const halfWidth = Math.max(0, this.options.halfWidth ?? 0);
        const slices = halfWidth > 0 ? [-halfWidth, 0, halfWidth] : [0];
        for (const mesh of meshes) {
            if (!mesh.visible) continue;
            mesh.updateWorldMatrix(true, false);
            mesh.skeleton.update();
            this.transform.multiplyMatrices(this.inverse, mesh.matrixWorld);
            const geometry = mesh.geometry;
            let points = this.vertices.get(mesh);
            let weights = this.weights.get(mesh);
            if (!points || points.length !== geometry.attributes.position.count) {
                points = Array.from({ length: geometry.attributes.position.count }, () => new Vector3());
                weights = points.map((_, i) => {
                    let weight = 0;
                    for (let c = 0; c < 4; c++) {
                        const bone = mesh.skeleton.bones[geometry.attributes.skinIndex.getComponent(i, c)];
                        if ((bone.userData?.name || bone.name) === this.boneName)
                            weight += geometry.attributes.skinWeight.getComponent(i, c);
                    }
                    return weight;
                });
                this.vertices.set(mesh, points);
                this.weights.set(mesh, weights);
            }
            for (let i = 0; i < points.length; i++) mesh.getVertexPosition(i, points[i]).applyMatrix4(this.transform);
            const indices = geometry.index;
            const indexCount = indices?.count ?? points.length;
            for (const slice of slices) {
                let segmentCount = 0;
                const z = this.originalPosition.z + slice;
                for (let i = 0; i < indexCount; i += 3) {
                    const ia = indices ? indices.getX(i) : i;
                    const ib = indices ? indices.getX(i + 1) : i + 1;
                    const ic = indices ? indices.getX(i + 2) : i + 2;
                    // Restrict to the ATTACHED phalanx, excluding other sections
                    // of the same finger, the palm, and neighboring fingers that
                    // cross this infinite plane too.
                    if (weights![ia] < .25 || weights![ib] < .25 || weights![ic] < .25) continue;
                    for (let edge = 0; edge < 3; edge++) {
                        const a = points[edge === 0 ? ia : edge === 1 ? ib : ic];
                        const b = points[edge === 0 ? ib : edge === 1 ? ic : ia];
                        if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
                            const point = this.segments[segmentCount++] ??= new Vector3();
                            point.copy(a).lerp(b, (z - a.z) / (b.z - a.z));
                        }
                    }
                }
                // A curled finger can cross the same plane several times.
                // Use only the closed contour surrounding the attachment axis.
                const contour = enclosingContour(this.segments, segmentCount, this.originalPosition);
                if (!contour) continue;
                for (const point of contour) (this.intersections[count++] ??= new Vector3()).copy(point);
            }
        }
        // Missing mesh/section: retain the last valid fit, never collapse it.
        if (count < 6) { this.hold(meshes.some(mesh => mesh.visible) ? "no-section" : "no-mesh"); return; }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < count; i++) {
            const p = this.intersections[i];
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        this.center.set((minX + maxX) / 2, (minY + maxY) / 2, this.originalPosition.z);
        let radius = 0;
        for (let i = 0; i < count; i++) {
            const p = this.intersections[i];
            radius = Math.max(radius, Math.hypot(p.x - this.center.x, p.y - this.center.y));
        }
        const clearance = Math.max(0, this.options.clearance ?? .0005);
        const adjustment = Number.isFinite(this.options.fitFactor) ? Math.max(.8, Math.min(1.2, this.options.fitFactor!)) : 1;
        const factor = (radius + clearance) / this.innerRadius * adjustment;
        if (!Number.isFinite(factor) || factor <= 0 || factor > (this.options.maxScale ?? 2)) { this.hold("oversized"); return; }
        const smoothing = this.options.smoothing ?? .08;
        const blend = !this.applied || smoothing <= 0 ? 1 : 1 - Math.exp(-Math.max(0, deltaTime) / smoothing);
        this.targetScale.copy(this.originalScale).multiplyScalar(factor);
        // The fitted center belongs to the measurement frame; the object is
        // parented to the independently smoothed rendering frame.
        this.center.applyMatrix4(measurementAnchor.matrixWorld).applyMatrix4(this.anchorInverse);
        this.center.addScaledVector(this.assetCenter, -factor);
        this.object.position.lerp(this.center, blend);
        this.object.scale.lerp(this.targetScale, blend);
        this.applied = true;
        this._status = { ...this._status, state: "fitted", reason: null, scale: this.originalScale.x ? this.object.scale.x / this.originalScale.x : factor };
    }
}

/** Segment pairs from triangle/plane intersections. Keep the smallest closed
 * contour containing the bone axis, excluding folded-back finger sections. */
function enclosingContour(segments: readonly Vector3[], count: number, origin: Vector3): Vector3[] | null {
    const points: Vector3[] = [], neighbors: Set<number>[] = [], lookup = new Map<string, number>();
    const vertex = (p: Vector3) => {
        const key = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`;
        let index = lookup.get(key);
        if (index === undefined) {
            index = points.length; lookup.set(key, index); points.push(p); neighbors.push(new Set());
        }
        return index;
    };
    for (let i = 0; i + 1 < count; i += 2) {
        const a = vertex(segments[i]), b = vertex(segments[i + 1]);
        if (a === b) continue;
        neighbors[a].add(b); neighbors[b].add(a);
    }
    const seen = new Set<number>();
    let selected: Vector3[] | null = null, selectedArea = Infinity;
    for (let start = 0; start < points.length; start++) {
        if (seen.has(start)) continue;
        const component = [start]; seen.add(start);
        for (let i = 0; i < component.length; i++) for (const next of neighbors[component[i]]) {
            if (!seen.has(next)) { seen.add(next); component.push(next); }
        }
        if (component.length < 6 || component.some(i => neighbors[i].size !== 2)) continue;
        const ordered = [start]; let previous = -1, current = start;
        do {
            const next = [...neighbors[current]].find(i => i !== previous)!;
            previous = current; current = next;
            if (current !== start) ordered.push(current);
        } while (current !== start && ordered.length <= component.length);
        let inside = false, area = 0;
        for (let i = 0; i < ordered.length; i++) {
            const a = points[ordered[i]], b = points[ordered[(i + 1) % ordered.length]];
            area += a.x * b.y - b.x * a.y;
            if ((a.y > origin.y) !== (b.y > origin.y) &&
                origin.x < (b.x - a.x) * (origin.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        if (inside && Math.abs(area) < selectedArea) {
            selectedArea = Math.abs(area); selected = ordered.map(i => points[i]);
        }
    }
    return selected;
}
