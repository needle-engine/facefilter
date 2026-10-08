import { AssetReference } from "@needle-tools/engine";
import { getHandModelUrl, HandTrackingBehaviour, NeedleTrackingManager } from "@needle-tools/facefilter";
import { DoubleSide, Mesh, MeshBasicMaterial, MeshNormalMaterial } from "three";

export type HandMeshMode = "visible" | "wireframe" | "depth" | "off";

/** Depth occlusion by default; visible modes are available for debugging. */
export async function addHandMeshes(manager: NeedleTrackingManager) {
    const solid = new MeshNormalMaterial({ side: DoubleSide });
    const wire = new MeshBasicMaterial({ color: 0x44eedd, wireframe: true, depthWrite: false });
    const hidden = new MeshBasicMaterial({ visible: false });
    const depth = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: DoubleSide });
    const meshes: Mesh[] = [];
    const trackers: HandTrackingBehaviour[] = [];
    for (const side of ["Left", "Right"] as const) {
        const url = getHandModelUrl(side);
        const model = await AssetReference.getOrCreateFromUrl(url, manager.context).instantiate();
        if (!model) throw new Error(`Could not load the ${side} hand mesh.`);
        model.name = `${side} tracked hand mesh`;
        // The component owner must stay active; tracking controls mesh visibility.
        model.visible = true;
        model.traverse(object => {
            if (!(object as Mesh).isMesh) return;
            const mesh = object as Mesh;
            mesh.visible = false;
            mesh.material = depth;
            mesh.renderOrder = -10;
            mesh.frustumCulled = false;
            mesh.castShadow = mesh.receiveShadow = false;
            meshes.push(mesh);
        });
        trackers.push(model.addComponent(HandTrackingBehaviour, { handedness: side }));
    }
    return {
        mode: "depth" as HandMeshMode,
        thickness: 1,
        setThickness(value: number) {
            this.thickness = Number.isFinite(value) ? Math.max(.25, Math.min(2, value)) : 1;
            for (const tracker of trackers) tracker.meshThickness = this.thickness;
        },
        setMode(mode: HandMeshMode) {
            this.mode = mode;
            for (const mesh of meshes) mesh.material = mode === "off" ? hidden : mode === "depth" ? depth : mode === "wireframe" ? wire : solid;
            // Hide rendering without interrupting tracking.
        },
    };
}
