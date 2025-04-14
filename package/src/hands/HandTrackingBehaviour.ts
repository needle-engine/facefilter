import { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { Behaviour, Gizmos, IComponent } from "@needle-tools/engine";
import { SkinnedMesh } from "three";
import type { HandInstance } from "../TrackingManager.js";
import { FacefilterUtils } from "../utils.js";

interface IHandTrackingBehaviour extends Pick<IComponent, "enabled"> {
    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number): void;
}

export class HandTrackingBehaviour extends Behaviour {

    private readonly _handBehaviours: IHandTrackingBehaviour[] = [];

    awake() {
        console.log(this.gameObject)
        this.gameObject.traverse(o => {
            if (o.type === "SkinnedMesh") {
                const beh = o.getOrAddComponent(HandTrackingSkinnedMeshRenderer);
                this._handBehaviours.push(beh);
                console.log("HandTrackingSkinnedMeshRenderer added to", o.name);
            }
        });
    }

    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number) {
        for (const beh of this._handBehaviours) {
            if (beh.enabled === false) continue;
            beh.onUpdateHandTracking(hand, res, index, baseDepth);
        }
    }

}

class HandTrackingSkinnedMeshRenderer extends Behaviour implements IHandTrackingBehaviour {

    onEnable(): void {
        if (this.gameObject.type !== "SkinnedMesh") {
            console.error("HandTrackingSkinnedMeshRenderer can only be attached to SkinnedMesh objects.");
            this.enabled = false;
        }
    }

    private get skinnedMesh() { return this.gameObject as any as SkinnedMesh; }

    onUpdateHandTracking(hand: HandInstance, res: HandLandmarkerResult, index: number, baseDepth: number): void {

        const skinnedMesh = this.skinnedMesh;
        const handLm = res.landmarks[index];
        const wrist = handLm[0];
        const manager = hand.manager;
        const pos = FacefilterUtils.normalizedLandmarkerToCamera(wrist, this.context.mainCamera, manager.videoWidth, manager.videoHeight, baseDepth);
        const wp = this.context.mainCamera.worldPosition.add(pos);
        Gizmos.DrawWireSphere(wp, .3, 0xff0000)
        // skinnedMesh.skeleton.bones[0].position.set(wp.x, wp.y, wp.z);
        // skinnedMesh.skeleton.bones[0].updateMatrix(true);
    }


}