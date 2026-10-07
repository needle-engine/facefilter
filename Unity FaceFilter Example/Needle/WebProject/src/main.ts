import { AssetReference, delayForFrames, onStart } from "@needle-tools/engine";
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { Box3, Group, Vector3 } from "three";

const demoParams = new URLSearchParams(location.search);
const showHandDebug = demoParams.has("debughandtracking") || demoParams.has("debughands");
const showRing = demoParams.has("ring") || !showHandDebug;
const ringUrl = "https://cloud.needle.tools/-/assets/Z23hmXB12yGTI-ZAqHd0-optimized/file.glb";

async function addDemoRings(manager: NeedleTrackingManager) {
    const asset = AssetReference.getOrCreateFromUrl(ringUrl, manager.context);
    for (const side of ["Left", "Right"] as const) {
        // Instantiate separately: loadAssetAsync would reparent the shared asset.
        const model = await asset.instantiate();
        if (!model) throw new Error("The ring asset could not be loaded.");
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        if (!(size.z > 0)) throw new Error("The ring asset has no measurable width.");
        const ring = new Group();
        ring.name = `${side} ring demo`;
        ring.add(model);
        model.position.sub(center);
        // This asset's hole runs along X; hand anchors point along +Z.
        // Flip Y so the ornament faces the back of the finger (-Y).
        ring.rotation.set(0, Math.PI / 2, Math.PI);
        ring.scale.setScalar(.022 / size.z); // Approximate 22 mm outer diameter.
        manager.getHand(side).attachToHand(ring, {
            p0: "ring_finger_mcp", p1: "ring_finger_pip", t01: .3,
        });
    }
}

onStart(async (context) => {
    context.menu.showQRCodeButton(true);
    await delayForFrames(10);
    const manager = NeedleTrackingManager.instance;
    if (!manager) return;
    manager.maxFaces = 0;
    manager.maxHands = 2;

    if (showRing) {
        const status = document.createElement("div");
        status.style.cssText = "position:fixed;bottom:16px;left:16px;z-index:10000;padding:8px 12px;border-radius:8px;background:#182132eb;color:white;font:12px system-ui";
        status.textContent = "Loading ring demo...";
        document.body.appendChild(status);
        void addDemoRings(manager).then(() => {
            status.textContent = "Ring demo | show either hand";
        }).catch(error => {
            status.textContent = "Could not load the ring. Reload to retry.";
            console.error("[Ring demo]", error);
        });
    }

    if (showHandDebug) {
        const { setupHandTrackingDebug } = await import("./handTrackingDebug.js");
        setupHandTrackingDebug(context, manager);
    }
});
