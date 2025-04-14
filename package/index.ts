import "./codegen/register_types.js";
import "./src/auto.js";

export {
    /** @deprecated Use NeedleTrackingManager */
    NeedleTrackingManager as NeedleFaceFilterTrackingManager,
    NeedleTrackingManager as NeedleTrackingManager

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