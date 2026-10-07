import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { Behaviour, serializable } from "@needle-tools/engine";
import { Mesh, Object3D, SkinnedMesh } from "three";
import { NeedleTrackingManager } from "../TrackingManager.js";
import type { HandInstance } from "../TrackingManager.js";
import { HandSkeleton, XR_HAND_JOINTS } from "./HandSkeleton.js";

/** Drive a WebXR-named skinned hand using the same pose as hand attachments. */
export class HandTrackingBehaviour extends Behaviour {
    @serializable()
    handedness: "Left" | "Right" = "Right";
    /** Pad-to-back mesh thickness; 1 is the authored thickness. */
    @serializable()
    meshThickness = 1;

    private _hand: HandInstance | null = null;
    private _skin: HandTrackingSkinnedMeshRenderer | null = null;
    private readonly _meshes: Mesh[] = [];

    /** Current tracked surfaces for attachment fitting. */
    get skinnedMeshes(): SkinnedMesh[] {
        return this._meshes.filter(mesh => (mesh as SkinnedMesh).isSkinnedMesh) as SkinnedMesh[];
    }

    awake() {
        // Keep the component owner active: an invisible owner stops lifecycle
        // callbacks and cannot recover when hand tracking returns.
        this.gameObject.traverse(object => {
            if ((object as Mesh).isMesh) this._meshes.push(object as Mesh);
        });
        this.onHandTrackingLost();
        this._skin = this.gameObject.getOrAddComponent(HandTrackingSkinnedMeshRenderer);
    }
    onEnable() {
        this._hand = NeedleTrackingManager.instance?.getHand(this.handedness) ?? null;
        if (this._hand) {
            this._skin?.bindHand(this._hand);
            this._hand.addBehaviour(this);
        }
    }
    start() { this.onEnable(); }
    onDisable() {
        this._hand?.removeBehaviour(this);
        this.onHandTrackingLost();
    }
    onDestroy() { this.onDisable(); }

    onHandTrackingLost() {
        for (const mesh of this._meshes) mesh.visible = false;
    }

    onUpdateHandTracking(hand: HandInstance, _res: HandLandmarkerResult, _index: number, _baseDepth: number) {
        const camera = this.context.mainCamera;
        if (this.gameObject.parent !== camera) camera.add(this.gameObject);
        camera.updateWorldMatrix(true, false);
        const visible = this._skin?.enabled !== false && !!this._skin?.updateHand(hand, this.meshThickness);
        for (const mesh of this._meshes) mesh.visible = visible;
    }
}

export class HandTrackingSkinnedMeshRenderer extends Behaviour {
    private readonly _skins: HandSkeleton[] = [];
    private readonly _anchors = new Map<string, Object3D>();
    private _hand: HandInstance | null = null;

    awake() {
        this.gameObject.updateWorldMatrix(true, true);
        this.gameObject.traverse(object => {
            if ((object as SkinnedMesh).isSkinnedMesh) this._skins.push(new HandSkeleton(object as SkinnedMesh, .004, true));
        });
        if (!this._skins.length) {
            console.error("HandTrackingSkinnedMeshRenderer requires a WebXR-named SkinnedMesh.");
            this.enabled = false;
        }
    }
    bindHand(hand: HandInstance) {
        if (this._hand === hand) return;
        this._hand = hand;
        this._anchors.clear();
        for (const spec of XR_HAND_JOINTS) {
            const point = spec.name === "wrist" ? "wrist" : { p0: spec.from, p1: spec.to, t01: 0 };
            const anchor = hand.getJoint(point as Parameters<HandInstance["getJoint"]>[0]);
            this._anchors.set(spec.name, anchor);
        }
    }
    updateHand(hand: HandInstance, thickness = 1): boolean {
        this.bindHand(hand);
        if (![...this._anchors.values()].every(anchor => anchor.visible)) return false;
        return this._skins.length > 0 && this._skins.every(skin => skin.update(
            (index, target) => hand.getJointPosition(index, target),
            name => this._anchors.get(name)?.quaternion,
            this.context.mainCamera.matrixWorld, thickness));
    }
}
