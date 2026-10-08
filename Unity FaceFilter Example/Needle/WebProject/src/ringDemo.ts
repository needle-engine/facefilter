import { AssetReference } from "@needle-tools/engine";
import { NeedleTrackingManager, type HandAttachmentHandle } from "@needle-tools/facefilter";
import { Group, Matrix4, Quaternion, Vector3 } from "three";

const ringUrl = "https://cloud.needle.tools/-/assets/Z23hmXB12yGTI-ZAqHd0-optimized/file.glb";
// Initial display size only; the opening radius and center are measured by autoFit.
const originalOuterDiameter = 1.70714998;

export async function addDemoRings(manager: NeedleTrackingManager) {
    const asset = AssetReference.getOrCreateFromUrl(ringUrl, manager.context);
    const autoFit = { enabled: true, halfWidth: .0025, clearance: .0005 };
    const rotationSmoothing = .12;
    const rotationFilter = { minCutoff: 5, beta: 1.5, derivativeCutoff: 1, mode: "twist" as const };
    const rings = new Map<string, Group>();
    const attachments: Array<{ p0: "ring_finger_mcp"; p1: "ring_finger_pip"; t01: number }> = [];
    const handles: HandAttachmentHandle[] = [];
    const dispose = () => { for (const handle of handles) handle.dispose(); rings.clear(); };
    try {
        for (const side of ["Left", "Right"] as const) {
            const model = await asset.instantiate();
            if (!model) throw new Error("The ring asset could not be loaded.");
            const ring = new Group();
            ring.name = `${side} ring demo`;
            rings.set(side, ring);
            ring.add(model);
            ring.rotation.set(0, Math.PI / 2, Math.PI);
            ring.scale.setScalar(.022 / originalOuterDiameter);
            const point = { p0: "ring_finger_mcp", p1: "ring_finger_pip", t01: .75 } as const;
            // Hand anchors read this interpolation value every tracking frame.
            attachments.push(point);
            handles.push(manager.getHand(side).attachToHand(ring, point, { coordinateSpace: "finger-pad", autoFit, rotationSmoothing, rotationFilter }));
        }
    } catch (error) { dispose(); throw error; }
    return {
        dispose,
        get statuses() { return handles.map(handle => handle.status); },
        getSnapshot(side: string) {
            const ring = rings.get(side);
            if (!ring) return undefined;
            ring.updateWorldMatrix(true, false);
            const camera = manager.context.mainCamera;
            camera.updateWorldMatrix(true, false);
            const matrix = new Matrix4().copy(camera.matrixWorld).invert().multiply(ring.matrixWorld);
            const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
            matrix.decompose(position, rotation, scale);
            return { cameraPosition: position.toArray(), cameraQuaternion: rotation.toArray(),
                cameraScale: scale.toArray(), localPosition: ring.position.toArray(),
                localScale: ring.scale.toArray(), visible: manager.getHand(side as "Left" | "Right").isTracked };
        },
        autoFit,
        rotationSmoothing,
        rotationFilter,
        position: .75,
        setPosition(value: number) {
            if (!Number.isFinite(value)) return;
            this.position = Math.max(0, Math.min(1, value));
            for (const point of attachments) point.t01 = this.position;
        },
    };
}
