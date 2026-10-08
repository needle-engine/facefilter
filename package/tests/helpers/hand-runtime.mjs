// Bundle the real manager/HandInstance and math, replacing only browser/ML host services.
// No pose, anchor, stabilization, or attachment methods are copied into this harness.
import {build} from "esbuild";
import {readFile, readdir} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url));
const engineNames=new Set();
async function scan(dir) {
 for(const entry of await readdir(dir,{withFileTypes:true})) {
  const path=join(dir,entry.name);if(entry.isDirectory())await scan(path);
  else if(entry.name.endsWith(".ts")) {
   const text=await readFile(path,"utf8");
   for(const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@needle-tools\/engine['"]/g))
    for(const name of match[1].split(","))engineNames.add(name.trim().replace(/^type /,"").split(/\s+as\s+/)[0]);
  }
 }
}
await scan(join(root,"src"));
engineNames.add("TypeStore");
const special={Behaviour:"class {}",serializable:"()=>()=>{}",syncField:"()=>()=>{}",getParam:"()=>false",getTempVector:"()=>new Vector3()",
 onStart:"()=>{}",TypeStore:"{types:new Map(),add(name,type){if(!this.types.has(name))this.types.set(name,type)},get(name){return this.types.get(name)}}", NEEDLE_progressive:"{assignTextureLOD(){},assignMeshLOD(){}}"};
const engine='import {Vector3} from "three";'+[...engineNames].filter(Boolean).map(name=>`export const ${name}=${special[name]??"class {}"};`).join("\n");
const result=await build({absWorkingDir:root,stdin:{contents:'export * from "./src/TrackingManager.ts"; export * from "./src/Behaviours.ts"; export * from "./src/hands/HandTrackingBehaviour.ts"; export * from "./src/facemesh/FaceMeshBehaviour.ts"; import "./codegen/register_types.ts"; export {TypeStore} from "@needle-tools/engine";',resolveDir:root,sourcefile:"runtime.ts"},bundle:true,format:"cjs",platform:"node",write:false,
 external:["three","three/*"],logLevel:"silent",plugins:[{name:"headless-host",setup(build){
  build.onResolve({filter:/^@needle-tools\/engine$/},()=>({path:"engine",namespace:"host"}));
  build.onResolve({filter:/^@mediapipe\/tasks-vision$/},()=>({path:"mediapipe",namespace:"host"}));
  build.onLoad({filter:/.*/,namespace:"host"},args=>({contents:args.path==="engine"?engine:
   "export class FaceLandmarker{};export class HandLandmarker{};export class PoseLandmarker{};export class ImageSegmenter{};export class DrawingUtils{};export class FilesetResolver{};",loader:"js"}));
 }}]});
const module={exports:{}};
new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
export const {NeedleTrackingManager,HandInstance,FaceFilterRoot,FaceFilterHeadPosition,FaceMeshTexture,FilterBehaviour,TypeStore,HandTrackingBehaviour,HandTrackingSkinnedMeshRenderer}=module.exports;

export const THREE=createRequire(import.meta.url)("three");
