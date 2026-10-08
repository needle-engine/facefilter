import { delayForFrames, onStart } from "@needle-tools/engine";
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { addDemoRings } from "./ringDemo.js";
import { addHandMeshes } from "./handMeshDemo.js";

const demoParams = new URLSearchParams(location.search);
const showHandDebug = demoParams.has("debughandtracking") || demoParams.has("debughands");
const showRing = demoParams.has("ring");
onStart(async (context) => {
    context.menu.showQRCodeButton(true);
    // Exported scenes own their tracking settings. Only explicit demo URLs opt in.
    if (!showRing && !showHandDebug) return;
    await delayForFrames(10);
    const manager = NeedleTrackingManager.instance;
    if (!manager) return;
    if (showRing) {
        manager.maxFaces = 0;
        manager.maxHands = 2;
    }

    const handMesh = manager.maxHands > 0 ? await addHandMeshes(manager).catch(error => {
        console.error("[Hand mesh demo]", error);
        return undefined;
    }) : undefined;

    const ringDemo = showRing ? await addDemoRings(manager).catch(error => {
        console.error("[Ring demo]", error);
        return undefined;
    }) : undefined;

    if (showHandDebug) {
        const { setupHandTrackingDebug } = await import("./handTrackingDebug.js");
        setupHandTrackingDebug(context, manager, handMesh, ringDemo);
    }
});
