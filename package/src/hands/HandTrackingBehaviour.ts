/// <reference path="../assets.d.ts" />
import leftHandUrl from "../../unity/Runtime/Models/left.glb?url";
import rightHandUrl from "../../unity/Runtime/Models/right.glb?url";
import { SharedHandMesh } from "./SharedHandMesh.js";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { AssetReference, Behaviour, destroy, serializable } from "@needle-tools/engine";
import { DoubleSide, Mesh, MeshBasicMaterial, MeshNormalMaterial, Object3D, SkinnedMesh } from "three";
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

    /** Use the packaged generic hand if this object has no skinned mesh. */
    @serializable()
    useDefaultModel = true;
    /** Material mode for the packaged model only. Custom mesh materials are preserved. */
    @serializable()
    defaultModelMode: "occlusion" | "visible" | "wireframe" = "occlusion";
    private _modelState: "waiting" | "loading" | "ready" | "error" = "waiting";
    private _modelError: string | null = null;
    get modelStatus() { return { state: this._modelState, error: this._modelError }; }
    private _loading: Promise<void> | null = null;
    private _destroyed = false;
    private _enabled = false;
    private _defaultModel: Object3D | null = null;
    private _defaultMaterial: MeshBasicMaterial | MeshNormalMaterial | null = null;

    /** @internal */
    implicitOcclusion = false;
    /** @internal */
    trackingManager: NeedleTrackingManager | null = null;
    private _releaseProvider: (() => void) | null = null;
    private _hand: HandInstance | null = null;
    private _skin: HandTrackingSkinnedMeshRenderer | null = null;
    private readonly _meshes: Mesh[] = [];

    /** Current tracked surfaces for attachment fitting. */
    get skinnedMeshes(): SkinnedMesh[] {
        return this._meshes.filter(mesh => (mesh as SkinnedMesh).isSkinnedMesh) as SkinnedMesh[];
    }

    awake() {
        if (this.gameObject.getObjectByProperty("isSkinnedMesh", true)) this.setupMesh();
        else if (this.useDefaultModel) this._loading = this.loadDefaultModel();
        else { this._modelState = "error"; this._modelError = "No WebXR-named skinned hand mesh found."; }
    }
    private setupMesh() {
        this._meshes.length = 0;
        const root = this._defaultModel ?? this.gameObject;
        root.traverse(object => { if ((object as Mesh).isMesh) this._meshes.push(object as Mesh); });
        this.onHandTrackingLost();
        this._skin = root.getOrAddComponent(HandTrackingSkinnedMeshRenderer);
        if (this._hand) this._skin.bindHand(this._hand);
        this._modelState = "ready";
    }
    private async loadDefaultModel(): Promise<void> {
        this._modelState = "loading";
        try {
            // Mirrored tracking needs the opposite anatomical source mesh.
            const url = this.handedness === "Left" ? rightHandUrl : leftHandUrl;
            const model = await AssetReference.getOrCreateFromUrl(url, this.context).instantiate();
            if (!model) throw new Error("Could not load the default hand mesh.");
            if (this._destroyed) { destroy(model, true, false); return; }
            this._defaultModel = model;
            this._defaultMaterial = this.defaultModelMode === "visible" ? new MeshNormalMaterial({side: DoubleSide})
                : new MeshBasicMaterial({side: DoubleSide, color: 0x44eedd, wireframe: this.defaultModelMode === "wireframe",
                    colorWrite: this.defaultModelMode !== "occlusion", depthWrite: this.defaultModelMode !== "wireframe"});
            model.traverse(object => {
                const mesh = object as Mesh;
                if (!mesh.isMesh) return;
                mesh.material = this._defaultMaterial!; mesh.visible = false;
                mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
            });
            this.context.mainCamera.add(model);
            this.setupMesh();
            if (this._enabled) this.onEnable();
        } catch (error) {
            if (this._destroyed) return;
            this._modelState = "error";
            this._modelError = error instanceof Error ? error.message : String(error);
            console.error("[Hand mesh]", this._modelError);
        }
    }
    onEnable() {
        this._enabled = true;
        const manager = this.trackingManager ?? NeedleTrackingManager.instance;
        this._hand = manager?.getHand(this.handedness) ?? null;
        if (manager && !this.implicitOcclusion && !this._releaseProvider)
            this._releaseProvider = sharedMesh(manager, this.handedness).provide(this);
        if (this._hand) { this._skin?.bindHand(this._hand); this._hand.addBehaviour(this); }
    }
    start() { this.onEnable(); }
    update() { if (!this._hand && this._enabled) this.onEnable(); }
    onDisable() { this._enabled = false; this._releaseProvider?.(); this._releaseProvider = null; this._hand?.removeBehaviour(this); this.onHandTrackingLost(); }
    onDestroy() {
        if (this._destroyed) return;
        this._destroyed = true; this.onDisable();
        if (this._defaultModel) destroy(this._defaultModel, true, false);
        this._defaultModel = null; this._defaultMaterial?.dispose();
    }

    onHandTrackingLost() {
        for (const mesh of this._meshes) mesh.visible = false;
    }

    onUpdateHandTracking(hand: HandInstance, _res: HandLandmarkerResult, _index: number, _baseDepth: number) {
        const camera = this.context.mainCamera;
        const root = this._defaultModel ?? this.gameObject;
        if (root.parent !== camera) camera.add(root);
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


const sharedMeshes = new WeakMap<NeedleTrackingManager, Map<string, SharedHandMesh>>();
function sharedMesh(manager: NeedleTrackingManager, side: "Left" | "Right"): SharedHandMesh {
    let hands = sharedMeshes.get(manager);
    if (!hands) { hands = new Map(); sharedMeshes.set(manager, hands); }
    let shared = hands.get(side);
    if (!shared) {
        shared = new SharedHandMesh(() => {
            const root = new Object3D(); root.name = `${side} shared hand occlusion`;
            manager.context.scene.add(root);
            const tracker = root.addComponent(HandTrackingBehaviour, {
                handedness: side, implicitOcclusion: true, trackingManager: manager,
                useDefaultModel: true, defaultModelMode: "occlusion",
            });
            return () => { tracker.onDestroy(); destroy(root); };
        });
        hands.set(side, shared);
    }
    return shared;
}
/** @internal Shared by Unity attachment components; explicit trackers take precedence. */
export function requestHandOcclusion(manager: NeedleTrackingManager, side: "Left" | "Right"): () => void {
    return sharedMesh(manager, side).request();
}
