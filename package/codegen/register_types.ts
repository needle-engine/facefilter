/* eslint-disable */
import { TypeStore } from "@needle-tools/engine"

// Import types
import { FaceFilterRoot } from "../src/Behaviours.js";
import { FaceFilterHeadPosition } from "../src/Behaviours.js";
import { FaceFilterBlendshapes } from "../src/Behaviours.js";
import { FaceFilterAnimator } from "../src/Behaviours.js";
import { FaceFilterEyeBehaviour } from "../src/Behaviours.js";
import { NeedleTrackingManager } from "../src/TrackingManager.js";
import { NeedleOcclusionMesh } from "../src/HelperComponents.js";
import { NeedleBackgroundMesh } from "../src/HelperComponents.js";
import { ReadyPlayerMeFacefilterSupport } from "../src/examples/ReadyPlayerMe.js";
import { ShaderToyFaceFilter } from "../src/examples/ShaderToy.js";
import { FaceMeshTexture } from "../src/facemesh/FaceMeshBehaviour.js";
import { FaceMeshCustomShader } from "../src/facemesh/FaceMeshBehaviour.js";
import { FaceMeshVideo } from "../src/facemesh/FaceMeshBehaviour.js";
import { FaceGeometry } from "../src/facemesh/utils.facemesh.js";

// Register types
TypeStore.add("FaceFilterRoot", FaceFilterRoot);
TypeStore.add("FaceFilterHeadPosition", FaceFilterHeadPosition);
TypeStore.add("FaceFilterBlendshapes", FaceFilterBlendshapes);
TypeStore.add("FaceFilterAnimator", FaceFilterAnimator);
TypeStore.add("FaceFilterEyeBehaviour", FaceFilterEyeBehaviour);
TypeStore.add("NeedleFilterTrackingManager", NeedleTrackingManager);
TypeStore.add("NeedleOcclusionMesh", NeedleOcclusionMesh);
TypeStore.add("NeedleBackgroundMesh", NeedleBackgroundMesh);
TypeStore.add("ReadyPlayerMeFacefilterSupport", ReadyPlayerMeFacefilterSupport);
TypeStore.add("ShaderToyFaceFilter", ShaderToyFaceFilter);
TypeStore.add("FaceMeshTexture", FaceMeshTexture);
TypeStore.add("FaceMeshCustomShader", FaceMeshCustomShader);
TypeStore.add("FaceMeshVideo", FaceMeshVideo);
TypeStore.add("FaceGeometry", FaceGeometry);
