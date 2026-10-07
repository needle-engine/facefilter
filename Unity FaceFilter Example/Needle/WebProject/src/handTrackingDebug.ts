import type { Context } from "@needle-tools/engine";
import type { NeedleTrackingManager } from "@needle-tools/facefilter";
import { cameraPalmNormal, worldPalmNormal } from "../../../../package/src/hands/HandPose.js";
import { BoxGeometry, CanvasTexture, ConeGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Quaternion, Sprite, SpriteMaterial, Vector3 } from "three";

// Demo-only diagnostics. Loaded on demand by ?debughandtracking.
function createFingerMarker(color = 0x30394d, name = ""): Group {
    const marker = new Group();
    const edge = new MeshBasicMaterial({ color });
    const palm = new MeshBasicMaterial({ color: 0x19c889 });
    const back = new MeshBasicMaterial({ color: 0xf05b67 });
    const tip = new MeshBasicMaterial({ color: 0x77d7ff });
    const base = new MeshBasicMaterial({ color: 0x786e87 });
    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
    const thickness = name ? .012 : .004;
    const box = new BoxGeometry(.018, thickness, .026);
    marker.add(new Mesh(box, [edge, edge, palm, back, tip, base]));
    if (name) marker.add(new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color: 0x172033 })));

    // A solid blue arrow lies on the palm face and spans the tracked segment.
    const blue = new MeshBasicMaterial({ color: 0x3286ff, depthTest: false });
    const shaft = new Mesh(new BoxGeometry(.003, .001, .016), blue);
    shaft.position.set(0, thickness / 2 + .001, -.003);
    shaft.renderOrder = 1000;
    marker.add(shaft);
    const head = new Mesh(new ConeGeometry(.005, .008, 4), blue);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, thickness / 2 + .001, .009);
    head.renderOrder = 1000;
    marker.add(head);
    if (name) {
        const normal = new Group();
        normal.name = "pad-normal";
        normal.visible = false;
        normal.position.y = thickness / 2;
        const white = new MeshBasicMaterial({ color: 0xffffff });
        const stem = new Mesh(new BoxGeometry(.0015, .015, .0015), white);
        stem.position.y = .0075;
        const arrow = new Mesh(new ConeGeometry(.0035, .006, 8), white);
        arrow.position.y = .018;
        normal.add(stem, arrow);
        marker.add(normal);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#182132";
        ctx.fillRect(0, 0, 128, 64);
        ctx.font = "bold 40px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText(name, 64, 32);
        const label = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false }));
        label.name = "debug-label";
        label.position.set(.015, .006, 0);
        label.scale.set(.016, .008, 1);
        label.renderOrder = 1001;
        marker.add(label);
    }
    return marker;
}

export function setupHandTrackingDebug(context: Context, manager: NeedleTrackingManager) {
    const markers: Array<{ side: "Left" | "Right", marker: Group }> = [];
    const debugMarkers: Array<{ side: "Left" | "Right", group: string, name: string, marker: Group }> = [];
    const fingers = [
        { name: "Thumb", code: "T", color: 0xffbf47, joints: ["thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip"] },
        { name: "Index", code: "I", color: 0x55baff, joints: ["index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip"] },
        { name: "Middle", code: "M", color: 0xb68bff, joints: ["middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip"] },
        { name: "Ring", code: "R", color: 0xff8db6, joints: ["ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip"] },
        { name: "Pinky", code: "P", color: 0x7bdccb, joints: ["pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"] },
    ] as const;
    for (const side of ["Left", "Right"] as const) {
        const hand = manager.getHand(side);
        for (const finger of fingers) {
            for (let segment = 0; segment < 3; segment++) {
                const isIndexTip = finger.name === "Index" && segment === 2;
                const marker = createFingerMarker(finger.color, `${finger.code}${segment + 1}`);
                marker.scale.setScalar(.6);
                hand.attachToHand(marker, { p0: finger.joints[segment], p1: finger.joints[segment + 1], t01: .5 });
                debugMarkers.push({ side, group: finger.name, name: `${finger.code}${segment + 1}`, marker });
                if (isIndexTip) markers.push({ side, marker });
            }
        }
        const palm = createFingerMarker(0xffffff, "Palm");
        palm.scale.setScalar(.8);
        hand.attachToHand(palm, { p0: "wrist", p1: "middle_finger_mcp", t01: .5 });
        debugMarkers.push({ side, group: "Palm", name: "Palm", marker: palm });
    }

    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;left:12px;top:12px;z-index:10000;max-width:min(340px,calc(100vw - 48px));max-height:40vh;overflow:auto;padding:10px 12px;border-radius:10px;background:#182132eb;color:white;font:12px/1.5 system-ui;display:flex;flex-direction:column;gap:8px";
    document.body.appendChild(panel);
    const title = document.createElement("strong");
    title.textContent = "Hand orientation | 16 markers per hand";
    panel.appendChild(title);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Visible hand markers");
    for (const name of ["All", ...fingers.map(finger => finger.name), "Palm"]) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name === "All" ? "All fingers + palm" : name;
        select.appendChild(option);
    }
    select.onchange = () => {
        for (const entry of debugMarkers) entry.marker.visible = select.value === "All" || entry.group === select.value;
    };
    panel.appendChild(select);
    const names = document.createElement("div");
    names.textContent = "T thumb | I index | M middle | R ring | P pinky\n1 base segment | 2 middle | 3 fingertip";
    names.style.whiteSpace = "pre-line";
    panel.appendChild(names);
    const labels = document.createElement("label");
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = true;
    toggle.onchange = () => {
        for (const entry of debugMarkers) {
            const label = entry.marker.getObjectByName("debug-label");
            if (label) label.visible = toggle.checked;
        }
    };
    labels.append(toggle, " Show marker labels");
    panel.appendChild(labels);
    const normals = document.createElement("label");
    const showNormals = document.createElement("input");
    showNormals.type = "checkbox";
    showNormals.onchange = () => {
        for (const entry of debugMarkers) {
            const normal = entry.marker.getObjectByName("pad-normal");
            if (normal) normal.visible = showNormals.checked;
        }
    };
    normals.append(showNormals, " Show outward pad arrows (white)");
    panel.appendChild(normals);
    const legend = document.createElement("div");
    const label = "Pose: MediaPipe image XYZ (including depth)\nBlue: fingertip | Green: finger pad | Red: back";
    legend.textContent = label;
    legend.style.cssText = "white-space:pre-line;font-size:11px;opacity:.9";
    panel.appendChild(legend);

    const saveFrame = document.createElement("button");
    saveFrame.textContent = "Save hand landmarks";
    saveFrame.title = "Save one tracked frame as JSON. No camera image is included.";
    saveFrame.style.cssText = "padding:8px 12px;border:1px solid #69768a;border-radius:6px;background:#263449;color:white;font:inherit;cursor:pointer";
    const captureFrame = () => {
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
                referencePalmSize: raw._referencePalmSize,
                attachments: debugMarkers.filter(entry => entry.side === side).map(entry => ({
                    name: entry.name,
                    cameraPosition: entry.marker.parent?.position.toArray(),
                    cameraQuaternion: entry.marker.parent?.quaternion.toArray(),
                    markerScale: entry.marker.scale.toArray(),
                })),
            }];
        });
        return {
            poseMethod: "mediapipe-image-xyz",
            videoWidth: manager.videoWidth,
            videoHeight: manager.videoHeight,
            verticalFov: "fov" in camera ? camera.fov : null,
            mirrored: true,
            timestamp: performance.now(),
            hands: structuredClone(frames),
        };
    };
    const download = (data: unknown, filename: string) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    saveFrame.onclick = () => {
        const data = captureFrame();
        if (!data.hands.length) {
            saveFrame.textContent = "Show a hand first";
            setTimeout(() => saveFrame.textContent = "Save hand landmarks", 1500);
            return;
        }
        download(data, "facefilter-hand-frame.json");
    };
    panel.appendChild(saveFrame);
    const record = document.createElement("button");
    record.textContent = "Capture 5 seconds of tracking";
    record.title = "Saves joint positions and marker transforms only; no camera images or audio.";
    record.style.cssText = saveFrame.style.cssText;
    record.onclick = () => {
        record.disabled = true;
        const sequence: ReturnType<typeof captureFrame>[] = [];
        let ticks = 0;
        const timer = setInterval(() => {
            sequence.push(captureFrame());
            ticks++;
            record.textContent = `Capturing... ${(5 - ticks / 10).toFixed(1)}s`;
            if (ticks < 50) return;
            clearInterval(timer);
            record.disabled = false;
            record.textContent = "Capture 5 seconds of tracking";
            download({ version: 1, frames: sequence }, "facefilter-hand-sequence.json");
        }, 100);
    };
    panel.appendChild(record);

    setInterval(() => {
        const camera = context.mainCamera;
        camera.updateWorldMatrix(true, false);
        const readouts: string[] = [];
        for (const { side, marker } of markers) {
            const hand = manager.getHand(side);
            if (!hand.isTracked) continue;
            const dip = hand.getJointPosition(7, new Vector3());
            const tip = hand.getJointPosition(8, new Vector3());
            if (!dip || !tip) continue;
            const dipScreen = camera.localToWorld(dip).project(camera);
            const tipScreen = camera.localToWorld(tip).project(camera);
            marker.updateWorldMatrix(true, false);
            const startScreen = marker.localToWorld(new Vector3(0, 0, -.013)).project(camera);
            const endScreen = marker.localToWorld(new Vector3(0, 0, .013)).project(camera);
            const fingerX = tipScreen.x - dipScreen.x;
            const fingerY = tipScreen.y - dipScreen.y;
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
            readouts.push(`${side} I3: arrow ${alignment.toFixed(1)} deg | surface ${tilt.toFixed(1)} deg | palm ${worldTilt.toFixed(1)} deg | projected ${projectedTilt.toFixed(1)} deg`);
        }
        legend.textContent = [label, ...readouts].join("\n");
    }, 250);
}
