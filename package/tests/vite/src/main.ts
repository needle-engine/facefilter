import { delayForFrames, ObjectUtils, onStart } from "@needle-tools/engine";
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { MeshNormalMaterial } from "three";

onStart(async (context) => {
    context.menu.showQRCodeButton(true);
    await delayForFrames(10);
    const manager = NeedleTrackingManager.instance;
    if (!manager) return;
    manager.maxFaces = 0;
    manager.maxHands = 2;

    // Configure both hands before detection. The anchors survive brief tracking loss.
    for (const side of ["Left", "Right"] as const) {
        const cube = ObjectUtils.createPrimitive("Cube", {
            scale: [.03, .01, .05],
            material: new MeshNormalMaterial(),
        });
        manager.getHand(side).attachToHand(cube, "index_finger_tip");
    }
});
