import { delayForFrames, onStart } from "@needle-tools/engine";
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { cameraPalmNormal, fingerBendWeight, worldPalmNormal } from "../../../../package/src/hands/HandPose.js";
import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";

const showHandDebug = new URLSearchParams(location.search).has("debughands");

function createFingerMarker(): Group {
    const marker = new Group();
    const edge = new MeshBasicMaterial({ color: 0x30394d });
    const palm = new MeshBasicMaterial({ color: 0x19c889 });
    const back = new MeshBasicMaterial({ color: 0xf05b67 });
    const tip = new MeshBasicMaterial({ color: 0x77d7ff });
    const base = new MeshBasicMaterial({ color: 0x786e87 });
    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
    marker.add(new Mesh(new BoxGeometry(.018, .004, .026), [edge, edge, palm, back, tip, base]));

    // A solid blue arrow lies on the palm face and spans the tracked segment.
    const blue = new MeshBasicMaterial({ color: 0x3286ff, depthTest: false });
    const shaft = new Mesh(new BoxGeometry(.003, .001, .016), blue);
    shaft.position.set(0, .003, -.003);
    shaft.renderOrder = 1000;
    marker.add(shaft);
    const head = new Mesh(new ConeGeometry(.005, .008, 4), blue);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, .003, .009);
    head.renderOrder = 1000;
    marker.add(head);
    return marker;
}

onStart(async (context) => {
    context.menu.showQRCodeButton(true);
    await delayForFrames(10);
    const manager = NeedleTrackingManager.instance;
    if (!manager) return;
    manager.maxFaces = 0;
    manager.maxHands = 2;

    const markers: Array<{ side: "Left" | "Right", marker: Group }> = [];
    for (const side of ["Left", "Right"] as const) {
        const marker = createFingerMarker();
        manager.getHand(side).attachToHand(marker, {
            p0: "index_finger_dip",
            p1: "index_finger_tip",
            t01: .5,
        });
        markers.push({ side, marker });
    }

    if (showHandDebug) {
        const legend = document.createElement("div");
        const label = "Blue: fingertip | Green: finger pad | Red: back";
        legend.textContent = label;
        legend.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:10000;padding:8px 12px;border-radius:8px;background:#182132e8;color:white;font:13px system-ui;white-space:pre-line;pointer-events:none";
        document.body.appendChild(legend);

        const saveFrame = document.createElement("button");
        saveFrame.textContent = "Save hand landmarks";
        saveFrame.title = "Save one tracked frame as JSON. No camera image is included.";
        saveFrame.style.cssText = "position:fixed;left:12px;bottom:60px;z-index:10000;padding:8px 12px;border:0;border-radius:8px;background:#182132;color:white;font:13px system-ui;cursor:pointer";
        saveFrame.onclick = () => {
            const camera = context.mainCamera;
            const frames = markers.flatMap(({ side }) => {
                const hand = manager.getHand(side);
                if (!hand.isTracked) return [];
                // Debug-only access to the raw MediaPipe landmarks for a reproducible frame.
                const raw = hand as any;
                return [{
                    side,
                    imageLandmarks: raw._imageLandmarks,
                    worldLandmarks: raw._worldLandmarks,
                    estimatedDepth: raw._depth,
                }];
            });
            if (!frames.length) {
                saveFrame.textContent = "Show a hand first";
                setTimeout(() => saveFrame.textContent = "Save hand landmarks", 1500);
                return;
            }
            const data = {
                videoWidth: manager.videoWidth,
                videoHeight: manager.videoHeight,
                verticalFov: "fov" in camera ? camera.fov : null,
                mirrored: true,
                hands: frames,
            };
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "facefilter-hand-frame.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        document.body.appendChild(saveFrame);

        setInterval(() => {
            const camera = context.mainCamera;
            camera.updateWorldMatrix(true, false);
            const readouts: string[] = [];
            for (const { side, marker } of markers) {
                const hand = manager.getHand(side);
                if (!hand.isTracked) continue;
                const pip = hand.getJointPosition(6, new Vector3());
                const tip = hand.getJointPosition(8, new Vector3());
                if (!pip || !tip) continue;
                const pipScreen = camera.localToWorld(pip).project(camera);
                const tipScreen = camera.localToWorld(tip).project(camera);
                marker.updateWorldMatrix(true, false);
                const startScreen = marker.localToWorld(new Vector3(0, 0, -.013)).project(camera);
                const endScreen = marker.localToWorld(new Vector3(0, 0, .013)).project(camera);
                const fingerX = tipScreen.x - pipScreen.x;
                const fingerY = tipScreen.y - pipScreen.y;
                const markerX = endScreen.x - startScreen.x;
                const markerY = endScreen.y - startScreen.y;
                const fingerLength = Math.hypot(fingerX, fingerY);
                const markerLength = Math.hypot(markerX, markerY);
                if (fingerLength < 1e-6 || markerLength < 1e-6) continue;
                const dot = (fingerX * markerX + fingerY * markerY) / (fingerLength * markerLength);
                const alignment = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
                const normal = new Vector3(0, 1, 0).applyQuaternion(marker.getWorldQuaternion(new Quaternion())).normalize();
                const view = camera.getWorldPosition(new Vector3()).sub(marker.getWorldPosition(new Vector3())).normalize();
                const tilt = Math.acos(Math.max(-1, Math.min(1, normal.dot(view)))) * 180 / Math.PI;
                const projectedPoints: (Vector3 | undefined)[] = [];
                for (const index of [0, 5, 9, 13, 17]) projectedPoints[index] = hand.getJointPosition(index, new Vector3()) ?? undefined;
                const projectedNormal = cameraPalmNormal(projectedPoints, side, new Vector3()).normalize().applyQuaternion(camera.quaternion);
                const projectedTilt = Math.acos(Math.max(-1, Math.min(1, projectedNormal.dot(view)))) * 180 / Math.PI;
                // This raw landmark access is only for the temporary orientation diagnostic.
                const rawWorld = (hand as any)._worldLandmarks;
                const worldNormal = worldPalmNormal(rawWorld ?? [], true, side, new Vector3()).normalize().applyQuaternion(camera.quaternion);
                const worldTilt = Math.acos(Math.max(-1, Math.min(1, worldNormal.dot(view)))) * 180 / Math.PI;
                const bend = fingerBendWeight((hand as any)._imageLandmarks[5], (hand as any)._imageLandmarks[6], (hand as any)._imageLandmarks[8], manager.videoWidth / manager.videoHeight);
                readouts.push(`${side}: arrow ${alignment.toFixed(1)} deg | surface ${tilt.toFixed(1)} deg | bend ${bend.toFixed(2)} | palm ${worldTilt.toFixed(1)} deg | projected ${projectedTilt.toFixed(1)} deg`);
            }
            legend.textContent = [label, ...readouts].join("\n");
        }, 250);
    }
});