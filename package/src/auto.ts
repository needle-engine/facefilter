import { isDevEnvironment, onStart, showBalloonError, Vec3 } from "@needle-tools/engine";
import { FaceFilterRoot, FaceMeshTexture, NeedleFaceFilterTrackingManager } from "..";
import { FaceLayout } from "./facemesh/utils.facemesh";

/**
 * Use <needle-engine> html attributes to create a facemask
 */

onStart(async ctx => {
    let facefilterValue = ctx.domElement.getAttribute("face-filter");
    if (facefilterValue) {
        console.debug("Face filter detected", facefilterValue, { isImage: isImage(facefilterValue), isModel: isModel(facefilterValue) });

        // Setup filter
        let filter: FaceFilterRoot | FaceMeshTexture | null = null;
        let manager: NeedleFaceFilterTrackingManager | null = null;

        let maxFaces = 1;
        const maxFacesAttribute = ctx.domElement.getAttribute("face-filter-max-faces");
        if (maxFacesAttribute) {
            const number = parseInt(maxFacesAttribute);
            console.debug(`Setting max faces to ${number}`);
            if (!isNaN(number)) {
                maxFaces = number;
            }
            else console.warn(`Invalid value for "face-filter-max-faces" attribute: "${maxFacesAttribute}". Expected a number`);
        }

        if (isImage(facefilterValue)) {
            let layout: FaceLayout | null | undefined = ctx.domElement.getAttribute("face-filter-layout") as any;;
            switch (layout) {
                case "procreate":
                case "mediapipe":
                case "canonical":
                    // Do nothing
                    break;
                default:
                    if (layout) {
                        const msg = `Invalid value for "face-filter-layout" attribute: "${layout}". Supported values are: "procreate", "mediapipe", "canonical"`;
                        console.warn(msg);
                        if (isDevEnvironment()) showBalloonError(msg);
                    }
                    layout = "mediapipe";
                    break;

            }
            console.debug(`Selected facefilter layout: ${layout}. Use "face-filter-layout" attribute to change layout`);

            let faceFilterMask: string | null | undefined = ctx.domElement.getAttribute("face-filter-mask");
            if (!faceFilterMask || !isImage(faceFilterMask)) {
                faceFilterMask = undefined;
            }
            manager = ctx.scene.addComponent(NeedleFaceFilterTrackingManager, { maxFaces: maxFaces });
            filter = new FaceMeshTexture({
                layout: layout,
                texture: {
                    url: facefilterValue
                },
                mask: {
                    url: faceFilterMask
                }
            });
            manager.activateFilter(filter);
        }
        else if (isModel(facefilterValue)) {
            let facefilterScale: string | null | number = ctx.domElement.getAttribute("face-filter-scale");
            let facefilterOffsetAttribute: string | null = ctx.domElement.getAttribute("face-filter-offset");
            const faceFilterOffset = { x: 0, y: 0, z: 0 }

            if (typeof facefilterScale === "string") {
                facefilterScale = parseFloat(facefilterScale);
            }
            if (typeof facefilterOffsetAttribute === "string") {
                const values = facefilterOffsetAttribute.split(",").map(v => parseFloat(v));
                if (values.length === 3) {
                    faceFilterOffset.x = values[0] || 0;
                    faceFilterOffset.y = values[1] || 0;
                    faceFilterOffset.z = values[2] || 0;
                }
            }

            manager = ctx.scene.addComponent(NeedleFaceFilterTrackingManager, { maxFaces: maxFaces });
            filter = await FaceFilterRoot.create(facefilterValue, {
                scale: Number.isNaN(facefilterScale) ? 1 : facefilterScale || 1,
                offset: faceFilterOffset,
            });
            if (filter) {
                filter.gameObject.visible = false;
                manager.activateFilter(filter);
            }
        }
        else {
            const msg = `Value for "face-filter" attribute is not a valid image or model: "${facefilterValue}". Please provide a valid image or model url (Supported formats: .jpeg, .jpg, .png, .webp, .glb, .gltf, .fbx, .obj)`;
            console.error(msg);
            if (isDevEnvironment()) showBalloonError(msg);
            return;
        }


        updateShowVideo(manager, ctx.domElement);

        const videoSelector = ctx.domElement.getAttribute("face-filter-video-selector");
        if(videoSelector) {
            const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
            if(!videoElement) console.error(`Video element not found for selector "${videoSelector}"`);
            else { 
                console.debug(`Using video element "${videoSelector}"`);
                manager.video = videoElement;
            }
        }


        // Handle runtime updating of the filter attribute
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(mutation => {
                switch (mutation.type) {
                    case "attributes":
                        switch (mutation.attributeName) {
                            case "face-filter": {
                                const newValue = ctx.domElement.getAttribute("face-filter");
                                if (newValue !== facefilterValue) {
                                    console.debug(`Face filter changed from "${facefilterValue}" to "${newValue}"`);
                                    if (filter instanceof FaceMeshTexture) {
                                        if (newValue && isImage(newValue)) {
                                            filter.updateTexture(newValue);

                                            for (const obj of manager.getFaceObjects()) {
                                                const faceMesh = obj.instance?.getComponentInChildren(FaceMeshTexture);
                                                faceMesh?.updateTexture(newValue);
                                            }
                                        }
                                    }
                                }
                            }
                            break;

                            case "face-filter-video": {
                                updateShowVideo(manager, ctx.domElement);
                            }
                            break;
                        }

                }
            })
        });
        observer.observe(ctx.domElement, { attributes: true });

    }
});

function updateShowVideo(filter: NeedleFaceFilterTrackingManager, domElement:HTMLElement) {
    const attributeValue = domElement.getAttribute("face-filter-show-video");
    if(attributeValue === null || attributeValue === undefined) {
        filter.showVideo = true;
    }
    else {
        filter.showVideo = attributeValue === "true" || attributeValue === "1" || attributeValue === "yes" || attributeValue === "on" || attributeValue?.length === 0;
    }

}

function isImage(str: string) {
    return str.toLowerCase().match(/\.(jpeg|jpg|png|webp)$/);
}
function isModel(str: string) {
    return str.toLowerCase().match(/\.(glb|gltf|fbx|obj)$/) || str.includes("cloud.needle.tools");
}