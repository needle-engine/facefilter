import { delayForFrames, onStart } from "@needle-tools/engine";
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { addDemoRings } from "./ringDemo.js";
import { addHandMeshes } from "./handMeshDemo.js";

const demoParams = new URLSearchParams(location.search);
const showHandDebug = demoParams.has("debughandtracking") || demoParams.has("debughands");
const showRing = demoParams.has("ring") || !showHandDebug;
onStart(async (context) => {
    context.menu.showQRCodeButton(true);
    await delayForFrames(10);
    const manager = NeedleTrackingManager.instance;
    if (!manager) return;
    if (context.mainCameraComponent) context.mainCameraComponent.nearClipPlane = .01;
    manager.maxFaces = 0;
    manager.maxHands = 2;

    const handMesh = await addHandMeshes(manager).catch(error => {
        console.error("[Hand mesh demo]", error);
        const notice = document.createElement("div");
        notice.textContent = "Hand mesh could not load. Check the console and reload.";
        notice.style.cssText = "position:fixed;top:12px;right:12px;z-index:10000;background:#182132;color:white;padding:12px";
        document.body.appendChild(notice);
        return undefined;
    });

    let ringDemo: Awaited<ReturnType<typeof addDemoRings>> | undefined;
    if (showRing) {
        const status = document.createElement("div");
        status.style.cssText = "position:fixed;bottom:16px;left:16px;z-index:10000;padding:8px 12px;border-radius:8px;background:#182132eb;color:white;font:12px system-ui";
        status.textContent = "Loading ring demo...";
        document.body.appendChild(status);

        ringDemo = await addDemoRings(manager).then(demo => {
            status.textContent = "Ring demo | show either hand";
            return demo;
        }).catch(error => {
            status.textContent = "Could not load the ring. Reload to retry.";
            console.error("[Ring demo]", error);
            return undefined;
        });
    }

    if (showHandDebug) {
        const { setupHandTrackingDebug } = await import("./handTrackingDebug.js");
        setupHandTrackingDebug(context, manager, handMesh, ringDemo);
    }
});
