import { requestHandOcclusion } from "./HandTrackingBehaviour.js";
import { Behaviour, serializable } from "@needle-tools/engine";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Object3D, Vector3 } from "three";
import { NeedleTrackingManager, type HandAttachmentCoordinateSpace, type HandAttachmentHandle, type HandAttachmentPoint, type HandAttachmentOption } from "../TrackingManager.js";

/** Unity authoring adapter. Attaches its own object by default and finds the scene manager automatically. */
export class HandAttachment extends Behaviour {
    @serializable(NeedleTrackingManager)
    manager: NeedleTrackingManager | null = null;
    @serializable(Object3D)
    target: Object3D | null = null;
    @serializable()
    handedness: "Left" | "Right" | "Any" | "Both" = "Any";
    @serializable()
    finger: "wrist" | "palm" | "thumb" | "index" | "middle" | "ring" | "pinky" = "ring";
    @serializable()
    segment = 0;
    @serializable()
    position = 0.75;
    @serializable(Vector3)
    offset = new Vector3();
    @serializable()
    autoFit = false;
    /** +Y outward from the hand back by default; matches attachToHand(). */
    @serializable()
    coordinateSpace: HandAttachmentCoordinateSpace = "hand-back";
    @serializable()
    fitFactor = 1;
    /** Zero selects automatic mesh measurement. Positive values are metres. */
    @serializable()
    innerRadius = 0;
    @serializable()
    halfWidth = 0.002;
    @serializable()
    clearance = 0.0005;
    @serializable()
    rotationSmoothing = 0.12;

    private _occlusion = false;
    private _requestManager: NeedleTrackingManager | null = null;
    private _occlusionReleases: Array<() => void> = [];
    @serializable()
    get handOcclusion(): boolean { return this._occlusion; }
    set handOcclusion(value: boolean) {
        if (this._occlusion === value) return;
        this._occlusion = value;
        this.updateOcclusionRequests();
    }
    private updateOcclusionRequests() {
        for (const release of this._occlusionReleases) release();
        this._occlusionReleases.length = 0;
        if (!this._occlusion || !this._requestManager) return;
        const sides: Array<"Left" | "Right"> = this.handedness === "Any" || this.handedness === "Both"
            ? ["Left", "Right"] : [this.handedness];
        for (const side of sides) this._occlusionReleases.push(requestHandOcclusion(this._requestManager, side));
    }
    private _handle: HandAttachmentHandle | null = null;
    private _secondHandle: HandAttachmentHandle | null = null;
    private _copy: Object3D | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _side: "Left" | "Right" = "Right";
    private _target: Object3D | null = null;
    private _parent: Object3D | null = null;
    private _position = new Vector3();
    private _error: string | null = null;
    private _started = false;
    get status() { return { attachment: this._handle?.status ?? null, secondAttachment: this._secondHandle?.status ?? null, hand: this._side, error: this._error }; }

    start() { this._started = true; this.attach(); }
    onEnable() { if (this._started) this.attach(); }
    update() { if (!this._handle && !this._error) this.attach(); }
    onDisable() {
        // Hiding the tracking anchor deactivates its descendants in Needle.
        // Keep the attachment registered so manager-driven reacquisition can show it again.
        if (this.enabled !== false && this._target === this.gameObject && this._handle && !this._handle.status.anchorVisible) return;
        this.detach();
    }
    onDestroy() { this.detach(); }

    /** Attach with current settings. To reapply runtime changes, call detach() first. Does not change manager limits. */
    attach(): void {
        if (this._handle) return;
        this._error = null;
        const manager = this.manager ?? this.context.scene.getComponentsInChildren(NeedleTrackingManager)[0];
        if (!manager) return;
        const target = this.target ?? this.gameObject;
        for (let node: Object3D | null = this.gameObject.parent; node; node = node.parent) {
            if (node === target) { this._error = "Target must not be an ancestor of this component."; return; }
        }
        const joints = this.finger === "thumb" ? ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"]
            : [`${this.finger === "pinky" ? "pinky" : this.finger + "_finger"}_mcp`,
               `${this.finger === "pinky" ? "pinky" : this.finger + "_finger"}_pip`,
               `${this.finger === "pinky" ? "pinky" : this.finger + "_finger"}_dip`,
               `${this.finger === "pinky" ? "pinky" : this.finger + "_finger"}_tip`];
        const segment = Math.max(0, Math.min(2, Math.floor(this.segment)));
        const point: HandAttachmentPoint = this.finger === "wrist" ? "wrist"
            : this.finger === "palm" ? {p0: "wrist", p1: "middle_finger_mcp", t01: Math.max(0, Math.min(1, this.position))}
            : { p0: joints[segment], p1: joints[segment + 1], t01: Math.max(0, Math.min(1, this.position)) } as HandAttachmentPoint;
        const parent = target.parent, position = target.position.clone();
        try {
            const options: HandAttachmentOption = {
                coordinateSpace: this.coordinateSpace, offset: this.offset, rotationSmoothing: Number.isFinite(this.rotationSmoothing) ? Math.max(0, Math.min(.5, this.rotationSmoothing)) : .12, rotationFilter: { mode: "twist" },
                autoFit: this.autoFit && this.finger !== "wrist" && this.finger !== "palm" ? {
                    innerRadius: this.innerRadius > 0 ? this.innerRadius : undefined,
                    fitFactor: this.fitFactor,
                    halfWidth: Number.isFinite(this.halfWidth) ? Math.max(0, Math.min(.01, this.halfWidth)) : .002,
                    clearance: Number.isFinite(this.clearance) ? Math.max(0, Math.min(.002, this.clearance)) : .0005 } : false,
            };
            this._side = this.handedness === "Right" ? "Right" : this.handedness === "Any" && manager.getHand("Right").isTracked ? "Right" : "Left";
            if (this.handedness === "Both") {
                this._copy = clone(target);
                // Visual copy only: never duplicate exported component/controller registrations.
                this._copy.traverse(object => { object.userData = {}; });
                this._copy.name = target.name + " (other hand)";
            }
            this._handle = manager.getHand(this._side).attachToHand(target, point, options);
            this._target = target; this._parent = parent; this._position.copy(position);
            if (this._copy) this._secondHandle = manager.getHand("Right").attachToHand(this._copy, point, options);
            this._requestManager = manager; this.updateOcclusionRequests();
            if (this.handedness === "Any") {
                this._unsubscribe = manager.addHandAttachmentUpdate(() => {
                    if (this._handle?.status.state !== "attached" || manager.getHand(this._side).isTracked) return;
                    const other = this._side === "Left" ? "Right" : "Left";
                    if (!manager.getHand(other).isTracked) return;
                    this._handle.dispose();
                    this._side = other;
                    this._handle = manager.getHand(other).attachToHand(target, point, options);
                });
            }
        } catch (error) {
            this.detach();
            this._error = error instanceof Error ? error.message : String(error);
        }
    }

    detach(): void {
        this._requestManager = null; this.updateOcclusionRequests();
        this._unsubscribe?.(); this._unsubscribe = null;
        this._secondHandle?.dispose(); this._secondHandle = null;
        this._copy?.removeFromParent(); this._copy = null;
        const owned = this._handle?.status.state === "attached";
        this._handle?.dispose();
        // A stale component must not reparent an object subsequently attached elsewhere.
        if (owned && this._target) {
            if (this._parent) this._parent.add(this._target);
            this._target.position.copy(this._position);
        }
        this._handle = null; this._target = null; this._parent = null; this._error = null;
    }
}
