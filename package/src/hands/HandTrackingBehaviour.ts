import { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { Behaviour, Gizmos, IComponent } from "@needle-tools/engine";
import { PerspectiveCamera, SkinnedMesh } from "three";
import type { HandInstance } from "../TrackingManager.js";
import { FacefilterUtils } from "../utils.js";

interface IHandTrackingBehaviour extends Pick<IComponent, "enabled"> {
    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number): void;
}

export class HandTrackingBehaviour extends Behaviour {

    private readonly _handBehaviours: IHandTrackingBehaviour[] = [];

    awake() {
        this._handBehaviours.push(this.gameObject.getOrAddComponent(HandTrackingSkinnedMeshRenderer));
    }

    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number) {

        const camera = this.context.mainCamera;

        if (this.gameObject.parent !== camera) {
            camera.add(this.gameObject);
        }

        for (const beh of this._handBehaviours) {
            if (beh.enabled === false) continue;
            beh.onUpdateHandTracking(hand, res, index, baseDepth);
        }
    }

}

export class HandTrackingSkinnedMeshRenderer extends Behaviour implements IHandTrackingBehaviour {


    private _skinnedMesh: SkinnedMesh | null = null;
    private get skinnedMesh() { return this._skinnedMesh as any as SkinnedMesh; }

    awake() {
        this.gameObject.traverse(o => {
            if (this._skinnedMesh) return; // already found it
            if (o.type === "SkinnedMesh") {
                this._skinnedMesh = o as SkinnedMesh;
            }
        });
    }

    onEnable(): void {
        if (this._skinnedMesh?.type !== "SkinnedMesh") {
            console.error("HandTrackingSkinnedMeshRenderer can only be attached to SkinnedMesh objects.");
            this.enabled = false;
            return;
        }
    }

    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number): void {
        const camera = this.context.mainCamera;
        if ((camera instanceof PerspectiveCamera)) {
            const skinnedMesh = this.skinnedMesh;
            const handLm = res.landmarks[index];
            const manager = hand.manager;
            for (const bone of skinnedMesh.skeleton.bones) {
                if(!bone.visible) {
                    continue;
                }
                const boneName = bone.userData?.name || bone.name;
                const index = XRHAND_BONE_NAME_TO_MEDIAPIPE_INDEX[boneName];
                if (index === -1) {
                    continue; // Skip if no mapping found
                }
                const landmark = handLm[index];
                const pos = FacefilterUtils.normalizedLandmarkerToCamera(landmark, camera, manager.videoWidth, manager.videoHeight, baseDepth);
                // TODO: skinning doesnt look correct yet
                bone.position.set(pos.x, pos.y, pos.z);
                // const wp = pos.add(this.context.mainCamera.worldPosition);
                // bone.worldPosition = wp;
            }
        }
    }
}

// Single constant defining the mapping from Three.js bone name to MediaPipe index
const XRHAND_BONE_NAME_TO_MEDIAPIPE_INDEX: { [key: string]: number } = {
    // Wrist
    'wrist': 0,

    // Thumb - Mapped to distal joint/tip or controlling joint
    'thumb-metacarpal': 2,       // Leads TO MCP
    'thumb-phalanx-proximal': 3, // Leads TO IP
    'thumb-phalanx-distal': 3,   // Controlled BY IP
    'thumb-tip': 4,              // Tip

    // Index Finger
    'index-finger-metacarpal': 5,        // Leads TO MCP
    'index-finger-phalanx-proximal': 6,  // Leads TO PIP
    'index-finger-phalanx-intermediate': 7, // Leads TO DIP
    'index-finger-phalanx-distal': 7,    // Controlled BY DIP
    'index-finger-tip': 8,               // Tip

    // Middle Finger
    'middle-finger-metacarpal': 9,        // Leads TO MCP
    'middle-finger-phalanx-proximal': 10, // Leads TO PIP
    'middle-finger-phalanx-intermediate': 11,// Leads TO DIP
    'middle-finger-phalanx-distal': 11,   // Controlled BY DIP
    'middle-finger-tip': 12,              // Tip

    // Ring Finger
    'ring-finger-metacarpal': 13,        // Leads TO MCP
    'ring-finger-phalanx-proximal': 14, // Leads TO PIP
    'ring-finger-phalanx-intermediate': 15,// Leads TO DIP
    'ring-finger-phalanx-distal': 15,   // Controlled BY DIP
    'ring-finger-tip': 16,              // Tip

    // Pinky Finger
    'pinky-finger-metacarpal': 17,        // Leads TO MCP
    'pinky-finger-phalanx-proximal': 18, // Leads TO PIP
    'pinky-finger-phalanx-intermediate': 19,// Leads TO DIP
    'pinky-finger-phalanx-distal': 19,   // Controlled BY DIP
    'pinky-finger-tip': 20               // Tip

    // Note: MediaPipe index 1 (THUMB_CMC) is not directly mapped
    // as there's no specific 'thumb-cmc' bone in the provided Three.js names.
};