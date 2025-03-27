import { onStart } from "@needle-tools/engine";
import { FaceFilterRoot, FaceMeshTexture, NeedleFaceFilterTrackingManager } from "..";

/**
 * Use <needle-engine> html attributes to create a facemask
 */

onStart(async ctx => {
    const facefilter = ctx.domElement.getAttribute("face-filter");
    if (facefilter) {
        const isImage = facefilter.toLowerCase().match(/\.(jpeg|jpg|png|webp)$/);
        const isModel = facefilter.toLowerCase().match(/\.(glb|gltf|fbx|obj)$/) || facefilter.includes("cloud.needle.tools");
        console.debug("Face filter detected", facefilter, { isImage, isModel });

        if (isImage) {
            const manager = ctx.scene.addComponent(NeedleFaceFilterTrackingManager);
            manager.activateFilter(new FaceMeshTexture({
                texture: {
                    url: facefilter
                }
            }));
        }
        else if (isModel) {
            let facefilterScale: string | null | number = ctx.domElement.getAttribute("face-filter-scale");
            if (typeof facefilterScale === "string") {
                facefilterScale = parseFloat(facefilterScale);
            }
            const manager = ctx.scene.addComponent(NeedleFaceFilterTrackingManager);
            const filter = await FaceFilterRoot.create(facefilter, {
                scale: Number.isNaN(facefilterScale) ? 1 : facefilterScale || 1,
                offset: { x: 0, y: 0, z: 0 },
            });
            if (filter) {
                filter.gameObject.visible = false;
                manager.activateFilter(filter);
            }
        }

    }
});
