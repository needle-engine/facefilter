﻿import "./codegen/register_types.js";
import "./src/auto.js";

export {
    /** Same as NeedleFilterTrackingManager (use this for codegen) */
    NeedleFilterTrackingManager,
    NeedleFilterTrackingManager as NeedleFaceFilterTrackingManager

} from "./src/FaceFilter.js";


export {
    FaceFilterRoot,
    FaceFilterAnimator,
    FaceFilterBlendshapes,
    FaceFilterEyeBehaviour,
    FaceFilterHeadPosition
} from "./src/Behaviours.js";


export {
    FaceMeshBehaviour,
    FaceMeshTexture,
    FaceMeshCustomShader,
    FaceMeshVideo
} from "./src/facemesh/FaceMeshBehaviour.js";


export { NeedleRecordingHelper } from './src/RecordingHelper.js';


export {
    type BlendshapeName,
    FacefilterUtils as NeedleFaceFilterUtils
} from './src/utils.js';


export {
    ShaderToyFaceFilter,
    ReadyPlayerMeFacefilterSupport as ReadyPlayerMeFaceFilter,
} from "./src/examples/index.js"