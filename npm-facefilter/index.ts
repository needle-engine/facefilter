
// This is the main entry point of your npm package
// you can add your code here directly or use it to export your api

// Learn more about npm definition packages: 
// https://docs.needle.tools/npmdef


export { NeedleFilterTrackingManager as NeedleFaceFilterTrackingManager } from "./src/FaceFilter.js";
export * from "./src/Behaviours.js";
export * from "./src/facemesh/FaceMeshBehaviour.js";
export { NeedleRecordingHelper } from './src/RecordingHelper.js';
export { type BlendshapeName, FacefilterUtils as NeedleFaceFilterUtils } from './src/utils.js';
