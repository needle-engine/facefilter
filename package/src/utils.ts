import { Camera, Material, Matrix4, Object3D, DoubleSide, MeshBasicMaterial, Mesh, Vector3Like, PerspectiveCamera, Vector2Like } from "three";
import { Category, FaceLandmarker, FaceLandmarkerResult, FilesetResolver, HandLandmarker, ImageSegmenter, Matrix, PoseLandmarker } from "@mediapipe/tasks-vision"
import { getTempVector, OneEuroFilter, Renderer } from "@needle-tools/engine";
import { mirror } from "./settings.js";
import { OneEuroFilterMatrix4 } from "./utils.filter.js";

let _occluderMaterial: MeshBasicMaterial | null = null;

const flipxMat = new Matrix4().makeScale(-1, 1, 1);
const offset = new Matrix4().makeTranslation(0.000, 0.015, -.01);
const offsetMirror = offset.clone().premultiply(flipxMat);
const $filter = Symbol("filter")

export namespace FacefilterUtils {

    const tempMatrix = new Matrix4();

    export function flipX(matrix: Matrix4) {
        matrix.premultiply(flipxMat);
    }

    export function applyFaceLandmarkMatrixToObject3D(obj: Object3D, mat: Matrix, camera: Camera) {
        const raw = tempMatrix.fromArray(mat.data);
        obj.matrixAutoUpdate = false;
        if (obj.parent !== camera)
            camera.add(obj);

        let matrix = obj.matrix;
        matrix.copy(raw);
        matrix.elements[12] *= 0.01;
        matrix.elements[13] *= 0.01;
        matrix.elements[14] *= 0.01;

        // obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
        // obj.position.multiplyScalar(0.01);
        // obj.quaternion.multiply(obj.quaternion)
        // obj.updateMatrix();
        // obj.quaternion

        // obj.matrix.premultiply(flipxMat);
        if (mirror) matrix.premultiply(offsetMirror);
        else matrix.premultiply(offset);


        // Interpolate matrix
        // if (matrix != obj.matrix) {
        //     for (let i = 0; i < matrix.elements.length; i++) {
        //         obj.matrix.elements[i] = Mathf.lerp(obj.matrix.elements[i], matrix.elements[i], 0.3);
        //     }
        // }
    }

    function getNormalizedDistance(p1x: number, p1y: number, p2x: number, p2y: number) {
        const dx = p1x - p2x;
        const dy = p1y - p2y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    const REFERENCE_DEPTH = -.3; // The Z distance in Three.js units where you measured
    const REFERENCE_APPARENT_SIZE = .3; // The measured normalized distance (e.g., wrist-to-middleMCP) at REFERENCE_DEPTH
    export function calculateDepth(landmark1: Vector3Like, landmark2: Vector3Like) {
        const currentApparentSize = getNormalizedDistance(landmark1.x, landmark1.y, landmark2.x, landmark2.y);
        let estimatedWristDepth = REFERENCE_DEPTH;
        // console.debug(currentApparentSize);
        if (currentApparentSize > 0.0001) {
            estimatedWristDepth = REFERENCE_DEPTH * (REFERENCE_APPARENT_SIZE / currentApparentSize);
        }
        return estimatedWristDepth;
    }

    export function normalizedLandmarkerToCamera(landmark: Vector3Like, camera: PerspectiveCamera, videoWidth: number, videoHeight: number, baseDepth = .3, zScaleFactor = .5) {

        const aspect = videoWidth / videoHeight;

        const fovInRadians = camera.fov * (Math.PI / 180);
        const ZdistanceFromCamera = Math.abs(baseDepth); // Distance to reference plane
        const heightAtBaseDepth = 2 * Math.tan(fovInRadians / 2) * ZdistanceFromCamera;
        const widthAtBaseDepth = heightAtBaseDepth * aspect;

        const lmz = landmark.z;
        const depthOffsetWorld = lmz * widthAtBaseDepth * zScaleFactor;
        const targetZ = baseDepth - depthOffsetWorld;

        const distanceToLandmark = Math.abs(targetZ);
        const heightAtTargetZ = 2 * Math.tan(fovInRadians / 2) * distanceToLandmark;
        const widthAtTargetZ = heightAtTargetZ * aspect; // Or imageWidth / imageHeight

        const ndcX = landmark.x * 2 - 1;
        const ndcY = 1 - landmark.y * 2; // Invert Y

        // World coords relative to camera's view center at targetZ
        const worldX_rel = -ndcX * (widthAtTargetZ / 2);
        const worldY_rel = ndcY * (heightAtTargetZ / 2);

        // Add camera's position to get final world coords
        // (Assumes camera looks directly down -Z axis without rotation)
        // If camera is rotated, you need more complex unprojection using matrices or camera.unproject
        const finalWorldX = worldX_rel;
        const finalWorldY = worldY_rel;
        const finalWorldZ = targetZ;

        return getTempVector(finalWorldX, finalWorldY, finalWorldZ);
    }

    export function getBlendshape(result: FaceLandmarkerResult | null, shape: BlendshapeName, index: number = 0): Category | null {
        if (!result) return null;
        if (result?.faceBlendshapes?.length > index) {
            const blendshape = result.faceBlendshapes[index];
            for (const cat of blendshape.categories) {
                if (cat.categoryName === shape) {
                    return cat;
                }
            }
        }
        return null;
    }
    export function getBlendshapeValue(result: FaceLandmarkerResult | null, shape: BlendshapeName, index: number = 0): number {
        const cat = getBlendshape(result, shape, index);
        return cat ? cat.score : -1;
    }

    export function makeOccluder(obj: Object3D, renderOrder: number = -5) {
        if (!_occluderMaterial) {
            _occluderMaterial = new MeshBasicMaterial({

                colorWrite: false,
                depthWrite: true,
                side: DoubleSide,
            });
            // _occluderMaterial.transparent = true;
            // _occluderMaterial.opacity = .05;
            // _occluderMaterial.color = new Color("#ddffff");
            // _occluderMaterial.wireframe = true;
            // _occluderMaterial.colorWrite = true;
        }

        const occluderMaterial = _occluderMaterial as Material;
        assignMaterial(obj);
        obj.traverse(assignMaterial);

        function assignMaterial(child: any) {
            const obj = child as Object3D;
            obj.renderOrder = renderOrder;
            obj.matrixAutoUpdate = false;
            obj.updateMatrix();
            obj.updateMatrixWorld();
            obj.getComponents(Renderer).forEach(c => c.destroy());
            if (child.type === "Mesh" || child.type === "SkinnedMesh" || "material" in child) {
                const mat = (child as Mesh).material;
                if (Array.isArray(mat)) {
                    for (let i = 0; i < mat.length; i++) {
                        mat[i] = occluderMaterial;
                    }
                }
                else {
                    child.material = occluderMaterial;
                }
            }
        }
    }
}

/**
 * Blendshape Category Name options
 */
export type BlendshapeName =
    | "_neutral"
    | "browDownLeft"
    | "browDownRight"
    | "browInnerUp"
    | "browOuterUpLeft"
    | "browOuterUpRight"
    | "cheekPuff"
    | "cheekSquintLeft"
    | "cheekSquintRight"
    | "eyeBlinkLeft"
    | "eyeBlinkRight"
    | "eyeLookDownLeft"
    | "eyeLookDownRight"
    | "eyeLookInLeft"
    | "eyeLookInRight"
    | "eyeLookOutLeft"
    | "eyeLookOutRight"
    | "eyeLookUpLeft"
    | "eyeLookUpRight"
    | "eyeSquintLeft"
    | "eyeSquintRight"
    | "eyeWideLeft"
    | "eyeWideRight"
    | "jawForward"
    | "jawLeft"
    | "jawOpen"
    | "jawRight"
    | "mouthClose"
    | "mouthDimpleLeft"
    | "mouthDimpleRight"
    | "mouthFrownLeft"
    | "mouthFrownRight"
    | "mouthFunnel"
    | "mouthLeft"
    | "mouthLowerDownLeft"
    | "mouthLowerDownRight"
    | "mouthPressLeft"
    | "mouthPressRight"
    | "mouthPucker"
    | "mouthRight"
    | "mouthRollLower"
    | "mouthRollUpper"
    | "mouthShrugLower"
    | "mouthShrugUpper"
    | "mouthSmileLeft"
    | "mouthSmileRight"
    | "mouthStretchLeft"
    | "mouthStretchRight"
    | "mouthUpperUpLeft"
    | "mouthUpperUpRight"
    | "noseSneerLeft"
    | "noseSneerRight";


declare interface WasmFileset {
    /** The path to the Wasm loader script. */
    wasmLoaderPath: string;
    /** The path to the Wasm binary. */
    wasmBinaryPath: string;
    /** The optional path to the asset loader script. */
    assetLoaderPath?: string;
    /** The optional path to the assets binary. */
    assetBinaryPath?: string;
}
type MediapipeOpts = {
    files?: Promise<WasmFileset | null>,
    canvas?: HTMLCanvasElement,
    maxFaces?: number,
    maxHands?: number,
}

let wasm_files: Promise<WasmFileset | null> | null = null;

export namespace MediapipeHelper {


    export function createFiles(): Promise<WasmFileset | null> {
        if (wasm_files) {
            return wasm_files;
        }
        console.debug("Loading mediapipe wasm files...");
        wasm_files = FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        ).catch((e) => {
            console.error(e);
            console.error("Could not load mediapipe wasm files...");
            return null;
        });
        return wasm_files;
    }

    function ensureWasmIsLoaded<T>(opts: MediapipeOpts | null | undefined, cb: (files: WasmFileset) => Promise<T | null>) {
        // this either loads the wasm OR returns the already loaded wasm (if the opts object contains a files object already)
        const { files = createFiles() } = opts || {};
        if (!files) {
            console.error("Could not load mediapipe wasm files...");
            return Promise.resolve(null);
        }
        return files.then(res => {
            if (!res) {
                return null;
            }
            // call the callback with the loaded wasm
            return cb(res);
        })
    }

    export function createFaceLandmarker(opts?: MediapipeOpts): Promise<FaceLandmarker | null> {
        return ensureWasmIsLoaded(opts, files => FaceLandmarker.createFromOptions(files,
            {
                runningMode: "VIDEO",
                baseOptions: {
                    delegate: "GPU",
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
                },
                numFaces: opts?.maxFaces || 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                canvas: opts?.canvas,
            }
        ));
    }

    export function createHandLandmarker(opts?: MediapipeOpts): Promise<HandLandmarker | null> {
        return ensureWasmIsLoaded(opts, files => HandLandmarker.createFromOptions(files,
            {
                runningMode: "VIDEO",
                baseOptions: {
                    delegate: "GPU",
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
                },
                numHands: opts?.maxHands || 2,
                canvas: opts?.canvas,
            }
        ));
    }

    export function createPoseLandmarker(opts?: MediapipeOpts): Promise<PoseLandmarker | null> {
        return ensureWasmIsLoaded(opts, files => PoseLandmarker.createFromOptions(files,
            {
                runningMode: "VIDEO",
                baseOptions: {
                    delegate: "GPU",
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
                },
                numPoses: 1,
                outputSegmentationMasks: true,
                canvas: opts?.canvas,
            }
        ));
    }


    // https://mediapipe-studio.webapps.google.com/studio/demo/image_segmenter
    export function createImageSegmentation(opts?: MediapipeOpts): Promise<ImageSegmenter | null> {
        return ensureWasmIsLoaded(opts, files => ImageSegmenter.createFromOptions(files,
            {
                runningMode: "VIDEO",
                baseOptions: {
                    delegate: "GPU",
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
                },
                canvas: opts?.canvas,
            }
        ));
    }



    function flip(results: FaceLandmarkerResult, i0: number, i1: number) {
        if (results.facialTransformationMatrixes) {
            const mat0 = results.facialTransformationMatrixes[i0];
            const mat1 = results.facialTransformationMatrixes[i1];
            results.facialTransformationMatrixes[i0] = mat1;
            results.facialTransformationMatrixes[i1] = mat0;
        }

        if (results.faceBlendshapes) {
            const bs0 = results.faceBlendshapes[i0];
            const bs1 = results.faceBlendshapes[i1];
            results.faceBlendshapes[i0] = bs1;
            results.faceBlendshapes[i1] = bs0;
        }
        if (results.faceLandmarks) {
            const lm0 = results.faceLandmarks[i0];
            const lm1 = results.faceLandmarks[i1];
            results.faceLandmarks[i0] = lm1;
            results.faceLandmarks[i1] = lm0;
        }
    }

    const bsfilters = new Array<OneEuroFilter>();
    const matrixFilters = new Array<OneEuroFilterMatrix4>();
    const tempMatrix = new Matrix4();

    export function applyFiltering(results: FaceLandmarkerResult, time: number) {

        // if we have multiple faces we need to sort them (left to right)
        if (results.facialTransformationMatrixes?.length > 1) {
            for (let index = 0; index < results.facialTransformationMatrixes.length; index++) {
                const mat = results.facialTransformationMatrixes[index];
                const x = mat.data[12];
                for (let i = 0; i < results.facialTransformationMatrixes.length; i++) {
                    const cur = results.facialTransformationMatrixes[i];
                    const x2 = cur.data[12];
                    if (x2 < x) {
                        flip(results, index, i);
                        break;
                    }
                }
            }
        }


        for (let i = 0; i < results.facialTransformationMatrixes.length; i++) {
            const cur = results.facialTransformationMatrixes[i];
            const filter = matrixFilters[i] ??= new OneEuroFilterMatrix4(3, 0.5, 1.0);
            matrixFilters[i] = filter;
            const raw = tempMatrix.fromArray(cur.data);
            const filtered = filter.filter(raw, time);
            cur.data = filtered.elements;
        }

        for (let i = 0; i < results.faceBlendshapes.length; i++) {
            const bs = results.faceBlendshapes[i];
            for (const cat of bs.categories) {
                const filter = bsfilters[i] ??= new OneEuroFilter(0.05, .2, 1);
                bsfilters[i] = filter;
                cat.score = filter.filter(cat.score, time);
            }
        }
    }

    export type HandKeypointName = "wrist" | "thumb_cmc" | "thumb_mcp" | "thumb_ip" | "thumb_tip" | "index_finger_mcp" | "index_finger_pip" | "index_finger_dip" | "index_finger_tip" | "middle_finger_mcp" | "middle_finger_pip" | "middle_finger_dip" | "middle_finger_tip" | "ring_finger_mcp" | "ring_finger_pip" | "ring_finger_dip" | "ring_finger_tip" | "pinky_mcp" | "pinky_pip" | "pinky_dip" | "pinky_tip";

    /** 
     * Get the index of a hand joint by its name.  
     * @link https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models
     */
    export function getJointIndex(joint: HandKeypointName): number {
        switch (joint) {
            case "wrist": return 0;
            case "thumb_cmc": return 1;
            case "thumb_mcp": return 2;
            case "thumb_ip": return 3;
            case "thumb_tip": return 4;
            case "index_finger_mcp": return 5;
            case "index_finger_pip": return 6;
            case "index_finger_dip": return 7;
            case "index_finger_tip": return 8;
            case "middle_finger_mcp": return 9;
            case "middle_finger_pip": return 10;
            case "middle_finger_dip": return 11;
            case "middle_finger_tip": return 12;
            case "ring_finger_mcp": return 13;
            case "ring_finger_pip": return 14;
            case "ring_finger_dip": return 15;
            case "ring_finger_tip": return 16;
            case "pinky_mcp": return 17;
            case "pinky_pip": return 18;
            case "pinky_dip": return 19;
            case "pinky_tip": return 20;
        }
        return -1;
    }


}
