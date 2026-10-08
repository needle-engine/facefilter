import { HandCameraCalibration } from "./hands/HandCameraCalibration.js";
import { HandLandmarkFilter } from "./hands/HandLandmarkFilter.js";
import { HandRotationFilter, type HandRotationFilterOptions } from "./hands/HandRotationFilter.js";
import { HandPoseStabilizer } from "./hands/HandPoseStabilizer.js";
import { HandAttachmentFit, type HandAttachmentAutoFit, type HandAutoFitStatus } from "./hands/HandAttachmentFit.js";
import { Application, AssetReference, Behaviour, ClearFlags, GameObject, getIconElement, getParam, getTempVector, Gizmos, instantiate, isDevEnvironment, isMobileDevice, Mathf, ObjectUtils, PromiseAllWithErrors, serializable, setParamWithoutReload, showBalloonMessage, showBalloonWarning, TypeStore, Vec3 } from '@needle-tools/engine';
import { FaceLandmarker, DrawingUtils, FaceLandmarkerResult, PoseLandmarker, PoseLandmarkerResult, ImageSegmenter, ImageSegmenterResult, Matrix, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { BlendshapeName, FacefilterUtils, MediapipeHelper } from './utils.js';
import { Camera as ThreeCamera, OrthographicCamera, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Quaternion, Texture, Vector3, Vector3Like } from 'three';
import { NeedleRecordingHelper } from './RecordingHelper.js';
import { FaceFilterRoot, FilterBehaviour } from './Behaviours.js';
import { mirror } from './settings.js';
import { VideoRenderer } from './VideoRenderer.js';
import { HandTrackingBehaviour } from './hands/HandTrackingBehaviour.js';
import { buildFingerBasis } from './hands/FingerPose.js';
import { projectImageHandLandmark, measurePalmSize, estimateHandProjection, HandScaleReference, projectHandLandmark, cameraPalmNormal, getHandProjectionIssue } from './hands/HandPose.js';

const debugHands = getParam("debughandtracking") === true || getParam("debughands") === true;
const debug = getParam("debugfilter") === true || debugHands;

declare type VideoClip = string;

function isHandAttachmentRoot(object: Object3D): boolean {
    const type = TypeStore.get("HandAttachment");
    return !!type && !!object.getComponent(type);
}

/**
 * Track faces and hands. See handProjection before integrating an existing scene camera.
 */
export class NeedleTrackingManager extends Behaviour {

    static get instance() { return this._instance; }
    private static _instance: NeedleTrackingManager | null = null;

    /** Auto uses image-space rendering in hand-only scenes. Perspective keeps
     * scene-camera integration and estimates its FOV. Scene leaves the application
     * camera and FOV unchanged; the application owns its calibration.
     */
    handProjection: "auto" | "perspective" | "scene" = "auto";
    /** Lightweight snapshot: no landmark arrays or scene objects. */
    get handTrackingStatus() {
        return {
            camera: this._video?.readyState && this._video.readyState >= 2 ? "ready" as const : "waiting" as const,
            detector: this.maxHands <= 0 ? "disabled" as const : this._handTrackingError?.startsWith("detector:") ? "error" as const : !this._handlandmarker ? "waiting" as const
                : this._handlandmarker instanceof Promise ? "loading" as const : "ready" as const,
            error: this._handTrackingError,
            projection: this.usesImageHandProjection ? "image" as const : "scene" as const,
            ownsCamera: this.usesImageHandProjection,
            trackedHands: this._hands.filter(hand => hand.isTracked).length,
        };
    }
    private readonly _handAttachmentUpdates = new Set<() => void>();
    /** @internal Runs even when an attachment's tracking anchor hides its component. */
    addHandAttachmentUpdate(listener: () => void): () => void {
        this._handAttachmentUpdates.add(listener);
        return () => this._handAttachmentUpdates.delete(listener);
    }
    private _handTrackingError: string | null = null;
    private _handImageCamera: OrthographicCamera | null = null;
    private _handImageSource: ThreeCamera | null = null;
    get usesImageHandProjection(): boolean { return this.context.mainCamera === this._handImageCamera; }

    private restoreHandCamera(): void {
        if (this._handImageSource && this.usesImageHandProjection) {
            this.context.mainCamera = this._handImageSource;
            for (const hand of this._handsBySide.values()) hand.remove();
        }
        this._handImageCamera?.removeFromParent(); this._handImageSource = null;
    }
    private updateHandCamera(): void {
        if (this.handProjection !== "auto" || this.maxFaces > 0 || this.maxHands <= 0) {
            this.restoreHandCamera(); return;
        }
        const source = this.context.mainCamera;
        if (source !== this._handImageCamera) {
            this._handImageSource = source;
            this._handImageCamera ??= new OrthographicCamera(-.5,.5,.5,-.5,.001,10);
            this._handImageCamera.name = "Hand image projection";
            this._handImageCamera.layers.mask = source.layers.mask;
            source.add(this._handImageCamera);
            this.context.mainCamera = this._handImageCamera;
            for (const hand of this._handsBySide.values()) hand.remove();
        }
        const camera = this._handImageCamera!;
        const aspect = this.context.domWidth / Math.max(1,this.context.domHeight);
        camera.left = -aspect/2; camera.right = aspect/2;
        camera.top = .5; camera.bottom = -.5;
        camera.updateProjectionMatrix(); camera.updateWorldMatrix(true,false);
    }

    private _cameraVerticalFov = 63;
    private readonly _handCameraCalibration = new HandCameraCalibration();
    private _calibrationSource = "";
    private _calibrationInput: object | undefined;
    /** Current estimated vertical FOV; 63 is the fallback while collecting. */
    get cameraVerticalFov(): number { return this._cameraVerticalFov; }
    /** Read-only diagnostic; an estimate is not hardware camera metadata. */
    get handCameraCalibration() { return this._handCameraCalibration.status; }

    private updateHandCameraCalibration(): void {
        // MediaPipe face metric transforms assume their original camera model.
        // Calibrate only the hand-only pipeline (including the ring demo).
        if (this.maxFaces > 0) {
            if (this._cameraVerticalFov !== 63) {
                this._cameraVerticalFov = 63;
                for (const hand of this._handsBySide.values()) hand.remove();
            }
            this._handCameraCalibration.reset(); this._calibrationSource = "";
            return;
        }
        if (this.maxHands <= 0) return;
        const track = this.video.srcObject instanceof MediaStream ? this.video.srcObject.getVideoTracks()[0] : undefined;
        const settings = track?.getSettings() as (MediaTrackSettings & { zoom?: number }) | undefined;
        const source = `${track?.id ?? this.video.currentSrc}:${this.videoWidth}:${this.videoHeight}:${settings?.zoom ?? 1}`;
        if (source !== this._calibrationSource) {
            this._calibrationSource = source;
            this._handCameraCalibration.reset(); this._calibrationInput = undefined;
            this._cameraVerticalFov = 63;
            for (const hand of this._handsBySide.values()) hand.remove();
        }
        const results = this._lastHandLandmarkResults;
        const image = results?.landmarks[0], world = results?.worldLandmarks[0];
        if (!image || !world || image === this._calibrationInput || !this.videoHeight) return;
        this._calibrationInput = image;
        const fov = this._handCameraCalibration.update(image, world, this.videoWidth / this.videoHeight, this.context.time.realtimeSinceStartup);
        if (fov !== null && fov !== this._cameraVerticalFov) {
            this._cameraVerticalFov = fov;
            // Never blend samples expressed in different camera projections.
            for (const hand of this._handsBySide.values()) hand.remove();
        }
    }

    /**
     * When enabled the max faces will be reduced if the performance is low
     * @default true
     */
    @serializable()
    autoManagePerformance: boolean = true;

    /**
     * Assign a url parameter. If set the active filter will be stored in the URL as a query parameter
     * @default null
     */
    @serializable()
    urlParameter: string | null = null;

    /**
     * When enabled the keyboard can be used to switch filters (A/D or ArrowLeft/ArrowRight)
     * @default true
     */
    @serializable()
    useKeyboard: boolean | undefined = true;

    /**
     * The maximum number of faces that will be tracked
     * @default 1
     */
    @serializable()
    maxFaces: number = 1;

    /**
     * The maximum number of hands that will be tracked
     * @default 0
     */
    @serializable()
    maxHands: number = 0;

    /**
     * The 3D object that will be attached to the face
     */
    @serializable(AssetReference)
    filters: AssetReference[] = [];

    /**
     * The occlusion mesh that will be used to hide 3D objects behind the face. 
     * @default null
     * @example
     * ```ts
     * const occluder = AssetReference.createFromUrl("https://cloud.needle.tools/-/assets/Z23hmXBZ1aJXtP-Z1aJXtP/file");
     * manager.occlusionMesh = occluder;
     * manager.createOcclusionMesh = true;
     * ```
     */
    @serializable(AssetReference)
    occlusionMesh: AssetReference | undefined = undefined;

    /**
     * When enabled the `occlusionMesh` property will be used to create an occlusion facemesh.   
     * If you do not show the occluder you can set this to false or enable `overrideDefaultOccluder` on the active filter behaviour
     * @default true
     */
    @serializable()
    createOcclusionMesh: boolean = true;

    /**
     * When enabled menu buttons for Recording, Switching Filters and Sharing will be created
     * @default true
     */
    @serializable()
    createMenuButton: boolean = true;

    /** When enabled a button for starting the recording will be created 
     * @default true
    */
    @serializable()
    createRecordingButton: boolean = true;

    /** When enabled a share button will be created 
     * @default true
    */
    @serializable()
    createShareButton: boolean = true;

    /** Assign a texture to display your logo in the recorded video.
     * @default null
     */
    // @nonSerialized
    @serializable(Texture)
    customLogo: Texture | null = null;

    /** Optional name of the downloaded video. If unset, the default name is used.
     */
    // @nonSerialized
    downloadName: string | null = null;

    /**
     * Test videos that can be used to test the face tracking. This is only available in development mode
     */
    @serializable(URL)
    testVideo: VideoClip[] | null = [];

    /**
     * Get access to the currently playing video. This is the camera by default
     */
    get video() {
        return this._video;
    }
    set video(value: HTMLVideoElement) {
        if (this._video && value !== this._video) {
            console.warn("[FaceFilterTrackingManager] The video element is already set. Updating the video element at runtime is not supported");
        }
        else {
            console.debug("[FaceFilterTrackingManager] Set video element");
            this._video = value;
        }
    }
    /** Width of the current video in pixel */
    get videoWidth() {
        return this._video.videoWidth;
    }
    /** Height of the current video in pixel */
    get videoHeight() {
        return this._video.videoHeight;
    }
    /**
     * Set the video to be visible. 
     * @default true
     * @returns {boolean} true if the video is visible, false if not
     */
    get showVideo() {
        return this._showVideo;
    }
    set showVideo(visible: boolean) {
        this._showVideo = visible;
    }
    private _showVideo: boolean = true;

    /**
     * The last result received from the face detector
     * @returns {FaceLandmarkerResult} the last result received from the face detector
     */
    get facelandmarkerResult(): FaceLandmarkerResult | null {
        return this._lastFaceLandmarkResults;
    }

    /** # Experimental, do not use yet
     * The last result received from the pose detector - this can be used to get the segmentation mask
     */
    get poselandmarkerResult(): PoseLandmarkerResult | null {
        return this._lastPoseLandmarkResults;
    }
    /** # Experimental, do not use yet
     * The last result received from the image segmentation */
    get lastImageSegmentationResults(): ImageSegmenterResult | null {
        return this._lastImageSegmentationResults;
    }

    /**
     * Get the blendshape value for a given name
     * @param shape the name of the blendshape e.g. JawOpen
     * @param index the index of the face to get the blendshape from. Default is 0
     * @returns the blendshape score for a given name e.g. JawOpen. -1 if not found
     */
    getBlendshapeValue(shape: BlendshapeName, index: number = 0): number {
        return FacefilterUtils.getBlendshapeValue(this._lastFaceLandmarkResults, shape, index);
    }

    /**
     * Activate the next filter in the list
     */
    selectNextFilter() {
        this.select((this._activeFilterIndex + 1) % this.filters.length);
    }
    /**
     * Activate the previous filter in the list
     */
    selectPreviousFilter() {
        let index = this._activeFilterIndex - 1;
        if (index < 0) index = this.filters.length - 1;
        this.select(index);
    }
    /**
     * Activate a filter by index. If you pass in a FilterBehaviour instance it will be added to the filters array and activated
     * @param index the index of the filter to activate
     * @returns true if the filter was activated successfully
     */
    select(index: number | FilterBehaviour | FaceFilterRoot): boolean {

        if (typeof index === "object") {
            const filter = index;
            index = this.filters.findIndex(f => f.asset?.getComponent(FilterBehaviour) === filter);
            if (index < 0) {
                if (filter instanceof FilterBehaviour || filter instanceof FaceFilterRoot) {
                    this.addFilter(filter, { activate: true });
                }
                else {
                    console.warn("[FaceFilterTrackingManager] Filter not found and is of unknown type");
                }
            }
        }

        if (index >= 0 && index < this.filters.length && typeof index === "number") {
            this._activeFilterIndex = index;
            if (this.urlParameter)
                setParamWithoutReload(this.urlParameter, index > 0 ? index.toString() : null);

            // preload the next filter
            const nextIndex = (index + 1) % this.filters.length;
            const nextFilter = this.filters[nextIndex];
            console.debug("Preload Filter #" + nextIndex)
            nextFilter?.loadAssetAsync();

            return true;
        }
        return false;
    }

    /**
     * Activate the filter if it's currently inactive
     */
    activateFilter(filter: FilterBehaviour) {
        this.select(filter);
    }
    /**
     * Deactivate the filter if it's currently active
     */
    deactivateFilter(filter: FilterBehaviour) {
        const index = this.filters.findIndex(f => f.asset?.getComponent(FilterBehaviour) === filter);
        if (index >= 0 && index === this._activeFilterIndex) {
            this._activeFilterIndex = -1;
        }
    }

    /** Add a new filter to the tracking manager. Use `{activate: true}` to activate the filter immediately or use the `select` method to activate it later 
     * 
     * ### Examples
     * ```ts Add a new filter to the tracking manager
        const filter = manager.addFilter(new FaceMeshTexture({
            layout: "procreate",
                texture: {
                url: "https://cdn.needle.tools/static/branding/logo_needle.png",
            }
        }));
     * ```
     * 
    */
    addFilter<T extends FilterBehaviour | FaceFilterRoot>(filter: T, opts?: { activate?: boolean }): T {
        if (!filter.gameObject) {
            const newObj = new Object3D();
            newObj.addComponent(filter);
        }
        if (!filter.gameObject.parent) {
            this.gameObject.add(filter.gameObject);
        }
        const assetReference = new AssetReference("", undefined, filter.gameObject);
        const index = this.filters.length;
        this.filters.push(assetReference);
        if (opts?.activate === true) {
            this.select(index);
        }
        return filter;
    }
    /**
     * Removes the filter from the available filters array.  
     * If the filter is currently active it will be deactivated
     */
    removeFilter(filter: FilterBehaviour) {
        const index = this.filters.findIndex(f => f.asset?.getComponent(FilterBehaviour) === filter);
        if (index >= 0) {
            this.filters.splice(index, 1);
        }
        if (index === this._activeFilterIndex) {
            this._activeFilterIndex = -1;
        }
    }
    /** The index of the currently active filter */
    get currentFilterIndex() {
        return this._activeFilterIndex;
    }

    /**
     * Get an array to the active face objects.  
     * @returns an array of the active face objects, these hold a reference to the face instance
     * @example
     * ```ts
     * const faces = manager.faces;
     * for(const face of faces) {
     *   // access the face index
     *   console.log(face.faceIndex);
     *   // access the 3D object
     *   console.log(face.instance);
     * }
     * ```
     */
    get faces() {
        return this._faces;
    }

    /**
     * Get an array to the hand objects.
     */
    get hands() {
        return this._hands;
    }

    /** A stable hand handle. Attach objects before detection starts; its joints appear when tracked. */
    getHand(side: "Left" | "Right"): HandInstance {
        let hand = this._handsBySide.get(side);
        if (!hand) {
            hand = new HandInstance(this, side);
            this._handsBySide.set(side, hand);
        }
        return hand;
    }


    // private findIndex(str: string): number {
    //     for (let i = 0; i < this.filters.length; i++) {
    //         const filter = this.filters[i];
    //         if (filter?.url?.includes(str)) {
    //             return i;
    //         }
    //     }
    //     return 0;
    // }

    /**
     * @returns the internal face landmarker instance (if any). This accessor can be used to modify the face detector options via the `setOptions` method
     */
    get faceLandmarker() {
        return getTaskRunner(this._facelandmarker);
    }


    /** Mediapipe */
    private _facelandmarker: FaceLandmarker | null | Promise<FaceLandmarker | null> = null;
    private _handlandmarker: HandLandmarker | null | Promise<HandLandmarker | null> = null;
    private _poselandmarker: PoseLandmarker | null | Promise<PoseLandmarker | null> = null;
    private _imageSegmentation: ImageSegmenter | null | Promise<ImageSegmenter | null> = null;


    /** Input */
    private _video!: HTMLVideoElement;
    private _videoReady: boolean = false;
    private _lastVideoTime: number = -1;
    private _videoRenderer: VideoRenderer | null = null;

    async awake() {
        if (NeedleTrackingManager._instance && NeedleTrackingManager._instance !== this) {
            console.warn("[NeedleTrackingManager] There is already an instance of the NeedleTrackingManager. Only one instance is supported.");
        }
        NeedleTrackingManager._instance = this;

        // create and start the video playback
        if (!this._video) {
            // If no video element was assigned by the user
            this._video = document.createElement("video");
            this._video.style.display = "none";
            this._video.autoplay = true;
            this._video.playsInline = true;
        }
        this.startCamera(this._video);
    }

    /** @internal */
    onEnable(): void {
        // Ensure our filters array is valid
        for (let i = this.filters.length - 1; i >= 0; i--) {
            const filter = this.filters[i];
            if (!filter) {
                this.filters.splice(i, 1);
                continue;
            }
            if (filter.asset && isHandAttachmentRoot(filter.asset)) {
                console.warn("Hand Attachment removed from face Filters. It tracks hands independently.");
                this.filters.splice(i, 1);
                continue;
            }
            if (filter.asset) {
                filter.asset.visible = false;
            }
        }

        // Select initial filter, either from URL or choose a random one
        if (this._activeFilterIndex === -1) {
            let didSelect = false;

            if (this.urlParameter) {
                const param = getParam("facefilter");
                if (typeof param === "string") {
                    const i = parseInt(param);
                    didSelect = this.select(i);
                }
                else if (typeof param === "number") {
                    didSelect = this.select(param);
                }
            }

            if (!didSelect) {
                // const random = Math.floor(Math.random() * this.filters.length);
                this.select(0);
            }
        }

        this._debug = getParam("debugfacefilter") == true || debugHands;
        window.addEventListener("keydown", this.onKeyDown);
        Application.registerWaitForInteraction(() => {
            this._video?.play();
        })
        this._videoRenderer?.enable();
        this._buttons.forEach((button) => this.context.menu.appendChild(button));
        this._faces.forEach((state) => state.remove());
    }

    /** @internal */
    onDisable(): void {
        this.restoreHandCamera();
        window.removeEventListener("keydown", this.onKeyDown);
        this._video?.pause();
        this._videoRenderer?.disable();
        this._buttons.forEach((button) => button.remove());
        this._faces.forEach((state) => state.remove());
        this._hands.forEach((hand) => hand.remove());
        this._hands.length = 0;
    }

    /** @internal */
    onDestroy(): void {
        const facelandmarker = getTaskRunner(this._facelandmarker);
        facelandmarker?.close();

        const handlandmarker = getTaskRunner(this._handlandmarker);
        handlandmarker?.close();

        const poselandmarker = getTaskRunner(this._poselandmarker);
        poselandmarker?.close();

        const imageSegmentation = getTaskRunner(this._imageSegmentation);
        imageSegmentation?.close();
        for (const hand of this._handsBySide.values()) hand.dispose();
        this._handsBySide.clear();
        this._handTrackingRoot?.removeFromParent();
        this._handTrackingRoot = null;
        if (NeedleTrackingManager._instance === this) NeedleTrackingManager._instance = null;
    }

    private async startCamera(video: HTMLVideoElement, tries: number = 0) {
        // Use camera stream
        const constraints = { video: true, audio: false };
        console.debug("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia(constraints).catch((e) => {
            this._handTrackingError = `camera: ${e.message}`;
            console.error("[Needle Tracking] Could not start camera: " + e.message);
            return null;
        });
        if (stream === null) {
            if (tries < 2) {
                await new Promise(r => setTimeout(r, 200 + 500 * tries));
                return this.startCamera(video, tries + 1);
            }
            if (isDevEnvironment()) showBalloonWarning("Could not start camera. Perhaps you need to allow camera access?");
            return;
        }
        this._handTrackingError = null;
        console.debug("Camera access granted");
        video.srcObject = stream;
        video.muted = true;
        const onReady = () => {
            video.removeEventListener("loadeddata", onReady);
            console.debug("Video ready");
            this._videoReady = true;
            this.createUI();
        }
        video.addEventListener("loadeddata", onReady);


        // Create a video texture that will be used to render the video feed
        this._videoRenderer ??= new VideoRenderer(this);
        this._videoRenderer.enable();


        // Add UI for switching test videos
        if (isDevEnvironment()) {
            if (this.testVideo && this.testVideo.length > 0) {
                let currentIndex: number = getParam("testvideo") as number;
                if (typeof currentIndex != "number") currentIndex = -1;
                this.context.menu.appendChild({
                    label: "Use Test Video",
                    title: "Switch between test videos - this button is only visible in development mode (when you run your website in a local server)",
                    icon: "videocam",
                    onClick: () => {
                        let nextIndex = (currentIndex + 1);
                        if (nextIndex === this.testVideo!.length) {
                            currentIndex = -1;
                            video.srcObject = stream;
                            video.play();
                            setParamWithoutReload("testvideo", null);
                            return;
                        }
                        else if (nextIndex > this.testVideo!.length) {
                            nextIndex = 0;
                        }
                        setParamWithoutReload("testvideo", nextIndex.toString());
                        currentIndex = nextIndex;
                        setVideoFromURL(nextIndex);
                    }
                });
                const setVideoFromURL = (index: number) => {
                    const video = this._video;
                    const url = this.testVideo![index];
                    if (!url) {
                        console.debug("No test video found at index " + index);
                        return;
                    }
                    video.src = url;
                    video.srcObject = null;
                    video.play();
                }
                if (currentIndex >= 0) {
                    setVideoFromURL(currentIndex);
                }
            }
        }
    }



    private _activeFilterIndex: number = -1;

    private readonly _faces: Array<FaceInstance> = [];
    private readonly _hands: Array<HandInstance> = [];
    private readonly _handsBySide = new Map<string, HandInstance>();
    private _handTrackingRoot: Object3D | null = null;
    /** @internal Camera-local container for explicit joints and attachments. */
    get handTrackingRoot(): Object3D {
        const root = this._handTrackingRoot ??= new Object3D();
        root.name = "Hand Tracking";
        if (root.parent !== this.context.mainCamera) this.context.mainCamera.add(root);
        return root;
    }

    /** @internal Shared scale prevents left/right detections establishing different units. */
    readonly handScaleReference = new HandScaleReference();

    private _lastTimeOptionsChanged: number = -1;
    private _appliedMaxFaces: number = -1;
    private _appliedMaxHands: number = -1;

    /** The last landmark result received */
    private _lastFaceLandmarkResults: FaceLandmarkerResult | null = null;
    private _lastHandLandmarkResults: HandLandmarkerResult | null = null;
    private _lastPoseLandmarkResults: PoseLandmarkerResult | null = null;
    private _lastImageSegmentationResults: ImageSegmenterResult | null = null;

    earlyUpdate(): void {

        // Handle video
        if (!this._video) return;
        if (!this._videoReady) return;
        if (this._video.currentTime === this._lastVideoTime) {
            // iOS hack: for some reason on Safari iOS the video stops playing sometimes. Playback state stays "playing" but currentTime does not change
            // So here we just restart the video every few frames to circumvent the issue for now
            if (this.context.time.frame % 20 === 0) this._video.play();
            return;
        }
        if (this._video.readyState < 2) return;
        this._lastVideoTime = this._video.currentTime;


        // Auto reduce tracked faces count if performance is low
        if (this.autoManagePerformance) {
            if (this.context.time.smoothedFps < 26 && this.context.time.frame % 10 === 0) {
                if (this._lastTimeOptionsChanged == -1) this._lastTimeOptionsChanged = this.context.time.realtimeSinceStartup;
                if (this.context.time.realtimeSinceStartup - this._lastTimeOptionsChanged > 5) {
                    this._lastTimeOptionsChanged = this.context.time.realtimeSinceStartup;
                    this.maxFaces -= 1;
                    console.warn("Reducing tracked faces to " + this.maxFaces + " due to low performance");
                }
            }
        }

        // Ensure face landmarker is created if max faces is > 0
        if (this.maxFaces > 0 && !this._facelandmarker) {
            this._appliedMaxFaces = this.maxFaces;
            this._facelandmarker = MediapipeHelper.createFaceLandmarker({
                maxFaces: this.maxFaces,
                // canvas: this.context.renderer.domElement,
            }).then(res => this._facelandmarker = res);
        }
        // Close the face landmarker if max faces is 0
        else if (this.maxFaces <= 0 && this._facelandmarker) {
            const landmarker = getTaskRunner(this._facelandmarker);
            console.log("Closing face landmarker");
            landmarker?.close();
            this._facelandmarker = null;
        }
        // Update max faces if it has changed
        else if (this.maxFaces != this._appliedMaxFaces) {
            const landmarker = getTaskRunner(this._facelandmarker);
            if (landmarker) {
                this._appliedMaxFaces = this.maxFaces;
                landmarker.setOptions({
                    numFaces: this.maxFaces,
                });
            }
        }

        // Ensure hand landmarker is created if max hands is > 0
        if (this.maxHands > 0 && !this._handlandmarker) {
            this._appliedMaxHands = this.maxHands;
            if (this._handTrackingError?.startsWith("detector:")) this._handTrackingError = null;
            this._handlandmarker = MediapipeHelper.createHandLandmarker({
                maxHands: this.maxHands
            }).then(res => {
                this._handTrackingError = null;
                return this._handlandmarker = res;
            }).catch(error => {
                this._handTrackingError = `detector: ${error instanceof Error ? error.message : String(error)}`;
                // Keep the failed promise until disabled/re-enabled; avoid a download retry every frame.
                console.error("[Hand tracking]", error);
                return null;
            });
        }
        // Close the hand landmarker if max hands is 0
        else if (this.maxHands <= 0 && this._handlandmarker) {
            const landmarker = getTaskRunner(this._handlandmarker);
            landmarker?.close();
            this._handlandmarker = null;
        }
        // Update max hands if it has changed
        else if (this.maxHands != this._appliedMaxHands) {
            const handlandmarker = getTaskRunner(this._handlandmarker);
            if (handlandmarker) {
                this._appliedMaxHands = this.maxHands;
                handlandmarker.setOptions({
                    numHands: this.maxHands,
                });
            }
        }


        try {
            // Update face results - the extra check is because of Safari iOS
            const facelandmarker = getTaskRunner(this._facelandmarker);
            if (facelandmarker && ("detectForVideo" in facelandmarker)) {
                this._lastFaceLandmarkResults = facelandmarker.detectForVideo(this._video, performance.now());
            }
            else this._lastFaceLandmarkResults = null;

            // Update hand results
            const handlandmarker = getTaskRunner(this._handlandmarker);
            if (handlandmarker && ("detectForVideo" in handlandmarker)) {
                this._lastHandLandmarkResults = handlandmarker.detectForVideo(this._video, performance.now());
            }
            else this._lastHandLandmarkResults = null;

            // Update pose results
            if (this._poselandmarker && ("detectForVideo" in this._poselandmarker)) {
                this._lastPoseLandmarkResults = this._poselandmarker.detectForVideo(this._video, performance.now());
            }
            else this._lastPoseLandmarkResults = null;

            // Update image segmentation results
            if (this._imageSegmentation && ("segmentForVideo" in this._imageSegmentation)) {
                this._lastImageSegmentationResults = this._imageSegmentation.segmentForVideo(this._video, performance.now());
            }
            else this._lastImageSegmentationResults = null;
            if (this._handTrackingError?.startsWith("frame:")) this._handTrackingError = null;
        }
        catch (err) {
            this._handTrackingError = `frame: ${err instanceof Error ? err.message : String(err)}`;
            console.error("Error while processing video frame", err);
        }

        // Apply results
        this.onFaceResultsUpdated(this._lastFaceLandmarkResults);
        this.onHandLandmarkerResultsUpdated(this._lastHandLandmarkResults);
    }

    /** @internal */
    onBeforeRender(): void {
        this.updateHandCamera();
        if (!this.usesImageHandProjection && this.handProjection !== "scene") this.updateHandCameraCalibration();

        // Video rendering and hand reconstruction must use the same FOV.
        if (this.context.mainCameraComponent) {
            if (this.handProjection !== "scene") {
                this.context.mainCameraComponent.fieldOfView = this.cameraVerticalFov;
                this.context.mainCameraComponent.clearFlags = ClearFlags.None;
            }
            this._videoRenderer?.onUpdate();
        }

        const faceResults = this._lastFaceLandmarkResults;
        if (faceResults) {
            for (let i = 0; i < faceResults.facialTransformationMatrixes.length; i++) {
                const face = this._faces[i];
                const matrix = faceResults.facialTransformationMatrixes[i];
                face?.render(matrix);
            }
        }

        const handResults = this._lastHandLandmarkResults;
        if (handResults) {
            for (let i = 0; i < handResults.landmarks.length; i++) {
                const hand = this._hands[i];
                hand?.render(handResults, i);
            }
        }
        for (const update of this._handAttachmentUpdates) update();
        this.updateDebugRendering();
    }

    private _blendshapeMirrorIndexMap: Map<number, number> | null = null;

    /**
     * Called when the face detector has a new result
     */
    protected onFaceResultsUpdated(faceResults: FaceLandmarkerResult | null) {

        if (!faceResults) {
            this._faces.forEach((state) => state.remove());
            this._faces.length = 0;
            return;
        }

        const matrices = faceResults.facialTransformationMatrixes;

        // Handle loosing face tracking
        for (let i = 0; i < this._faces.length; i++) {
            if (i >= matrices.length) {
                const state = this._faces[i];
                if ((state && this.context.time.realtimeSinceStartup - state.lastUpdateTime) > .5) {
                    state.remove();
                }
            }
        }

        // If we do not have any faces
        if (faceResults.facialTransformationMatrixes.length <= 0) {
            return;
        }

        if (this._appliedMaxFaces > 1) {
            MediapipeHelper.applyFiltering(faceResults, this.context.time.time);
        }

        if (mirror) {
            if (faceResults.faceBlendshapes) {
                for (const face of faceResults.faceBlendshapes) {
                    const blendshapes = face.categories;
                    // Check if we have an index mirror map
                    // If not we iterate through the blendshapes and create a map once
                    if (this._blendshapeMirrorIndexMap == null) {
                        this._blendshapeMirrorIndexMap = new Map();
                        for (let i = 0; i < blendshapes.length; i++) {
                            const left = blendshapes[i];
                            // assuming Left is before Right so we 
                            if (left.categoryName.endsWith("Left")) {
                                // Search for the next Right blendshape:
                                for (let k = i + 1; k < blendshapes.length; k++) {
                                    const right = blendshapes[k];
                                    if (right.categoryName.endsWith("Right")) {
                                        if (this._debug) {
                                            console.log("Blendshape Mirror: " + left.categoryName + " <-> " + right.categoryName);
                                        }
                                        this._blendshapeMirrorIndexMap.set(i, k);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    else {
                        for (const [leftIndex, rightIndex] of this._blendshapeMirrorIndexMap) {
                            const left = blendshapes[leftIndex];
                            const right = blendshapes[rightIndex];
                            if (left && right) {
                                const leftScore = left.score;
                                left.score = right.score;
                                right.score = leftScore;
                            }
                        }
                    }
                }
            }
        }

        const active = this.filters[this._activeFilterIndex];
        for (let i = 0; i < matrices.length; i++) {
            const state = this._faces[i] ?? new FaceInstance(this);
            state.update(active, i, matrices.length);
            this._faces[i] = state;
        }
    }

    private onHandLandmarkerResultsUpdated(handResults: HandLandmarkerResult | null) {
        const previous = this._hands.slice();
        this._hands.length = 0;
        // Detection identity is independent of the camera projection.
        if (handResults) {
            for (let i = 0; i < handResults.landmarks.length; i++) {
                const label = handResults.handedness[i]?.[0]?.categoryName;
                const key = label === "Left" || label === "Right" ? label : `hand:${i}`;
                let hand = this._handsBySide.get(key);
                if (!hand) {
                    hand = new HandInstance(this, key);
                    this._handsBySide.set(key, hand);
                }
                this._hands.push(hand);
            }
        }
        for (const hand of previous) {
            if (!this._hands.includes(hand)) hand.remove();
        }
    }

    private readonly _buttons: HTMLElement[] = [];

    private createUI() {
        if (!this.createMenuButton && !this.createRecordingButton && !this.createShareButton) return;


        if (this.createRecordingButton) {
            this._buttons.push(NeedleRecordingHelper.createButton({
                context: this.context,
                customLogo: this.customLogo,
                download_name: this.downloadName || undefined,
            }));
        }

        if (this.createMenuButton) {
            if (this.filters.length > 1) {
                this._buttons.push(this.context.menu.appendChild({
                    label: "Next Filter",
                    icon: "comedy_mask",
                    onClick: () => {
                        this.selectNextFilter();
                    }
                }));
            }
        }

        if (this.createShareButton) {
            this._buttons.push(this.context.menu.appendChild({
                label: "Share",
                icon: "share",
                onClick: function () {
                    if (isMobileDevice() && navigator.share) {
                        navigator.share({
                            title: "Needle Filter",
                            text: "Check this out",
                            url: window.location.href,
                        }).catch(e => {
                            // ignore cancel
                            console.warn(e);
                        });
                    }
                    else {
                        navigator.clipboard.writeText(window.location.href);
                        const element = this as HTMLElement;
                        element.innerText = "Copied";
                        element.prepend(getIconElement("done"));
                        setTimeout(() => {
                            element.innerText = "Share";
                            element.prepend(getIconElement("share"));
                        }, 2000)
                    }
                }
            }));
        }
    }


    /** Show hand landmark lines and joint spheres when debugging is enabled. */
    showHandDebugOverlays = true;
    /** Shared One Euro pose settings: Hz, velocity gain (metres/second), Hz. */
    readonly handLandmarkSmoothing = { minCutoff: 1, beta: 25, derivativeCutoff: 1 };

    private _debug = getParam("debugfacefilter") === true || debugHands;
    private _debugDrawing: DrawingUtils | null = null;
    private _debugContainer: HTMLDivElement | null = null;
    private _debugCanvas: HTMLCanvasElement | null = null;
    private _debugObjects: Object3D[] = [];

    private onKeyDown = (evt: KeyboardEvent) => {
        if (!this.useKeyboard) {
            return;
        }
        const key = evt.key.toLowerCase();
        if (debug && key === "f") {
            this.toggleDebug();
        }
        switch (key) {
            case "d":
            case "arrowright":
                this.selectNextFilter();
                break;
            case "a":
            case "arrowleft":
                this.selectPreviousFilter();
                break;

        }
    }
    private toggleDebug = () => {
        this._debug = !this._debug;
    }
    private updateDebugRendering() {
        if (!this._video) return;
        if (!this._debug) {
            if (this._debugContainer) {
                this._debugContainer.style.display = "none";
            }
            for (const obj of this._debugObjects) {
                obj.removeFromParent();
            }
            this._debugObjects.length = 0;
            return;
        }

        if (!this._debugDrawing) {
            this._debugContainer = document.createElement("div");
            this._debugCanvas = document.createElement("canvas");
            const ctx = this._debugCanvas.getContext("2d");
            if (!ctx) return;
            this._debugDrawing = new DrawingUtils(ctx);

            this.context.domElement.appendChild(this._debugContainer);
            this._debugContainer.appendChild(this._video);
            this._debugContainer.appendChild(this._debugCanvas);
            this._debugContainer.style.cssText = `
                pointer-events: none;
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                bottom: 0;
                width: 100%;
                height: 100%;
                padding: 0;
                overflow: hidden;
            `;
            this._video.style.cssText = `
                position: absolute;
                min-height: 100%;
                height: auto;
                width: auto;
                top: 50%;
                left: 50%; 
                transform: translate(-50%, -50%) scaleX(-1);
                display: block;
            `;
            this._debugCanvas.style.cssText = this._video.style.cssText;
            this._video.style.opacity = "0.2";

        };
        if (this._debugContainer)
            this._debugContainer.style.display = "";
        if (this._debugCanvas) {
            this._debugCanvas.width = this._video.videoWidth;
            this._debugCanvas.height = this._video.videoHeight;
            const ctx = this._debugCanvas.getContext("2d");
            ctx?.clearRect(0, 0, this._debugCanvas.width, this._debugCanvas.height);
        }
        this._lastFaceLandmarkResults?.faceLandmarks?.forEach((landmarks) => {
            this._debugDrawing?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_CONTOURS, { color: "#55FF44", lineWidth: 1 });
        });
        const camera = this.context.mainCamera;
        const handOverlays = this.showHandDebugOverlays && (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)
            ? this._hands.filter(hand => hand.isTracked).map(hand => {
                const tangent = camera instanceof PerspectiveCamera ? Math.tan(camera.fov * Math.PI / 360) : 0;
                const aspect = this.videoWidth / this.videoHeight;
                return Array.from({ length: 21 }, (_, i) => {
                    const point = hand.getJointPosition(i, _handPoint)!;
                    const height = camera instanceof OrthographicCamera ? camera.top-camera.bottom : -point.z * tangent * 2;
                    return { x: .5 + point.x / (height * aspect) * (mirror ? -1 : 1),
                        y: .5 - point.y / height, z: 0, visibility: 1 };
                });
            }) : [];
        handOverlays.forEach((landmarks) => {
            this._debugDrawing?.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#55FF44", lineWidth: 1 });
        });


        this._lastPoseLandmarkResults?.landmarks.forEach((landmarks) => {
            this._debugDrawing?.drawLandmarks(landmarks, { color: "#FF44FF", lineWidth: 1 });
        });
        handOverlays.forEach((landmarks) => {
            this._debugDrawing?.drawLandmarks(landmarks, { color: "#FF44FF", lineWidth: 1, radius: debugHands ? 2 : 6 });
        });
        // this._lastPoseLandmarkResults?.segmentationMasks?.forEach((mask) => {
        //     this._debugDrawing?.drawCategoryMask(mask, [[1, 1, 1, 1]]);
        // });

        if (this._lastFaceLandmarkResults?.faceLandmarks.length) {
            for (let i = 0; i < this._lastFaceLandmarkResults.facialTransformationMatrixes.length; i++) {
                if (!this._debugObjects[i]) {
                    const obj = new Object3D();
                    ObjectUtils.createPrimitive("ShaderBall", {
                        parent: obj,
                        scale: .3, // 30 cm
                    });
                    this._debugObjects[i] = obj;
                }
                const obj = this._debugObjects[i];
                const matrix = this._lastFaceLandmarkResults.facialTransformationMatrixes[i];
                FacefilterUtils.applyFaceLandmarkMatrixToObject3D(obj, matrix, this.context.mainCamera);
            }
        }
    }

}


/** Internal helper to just return null until the promise has resolved */
function getTaskRunner<T>(runner: null | T | Promise<T>): T | null {
    if (runner instanceof Promise) {
        return null;
    }
    if (runner == null) {
        return null;
    }
    return runner;
}


interface ITrackingInstance {
    /**  Removes the object from the scene when tracking is lost. Called by the tracking manager */
    remove(): void;
    /** @returns true if the object is currently being tracked (e.g. the face or hand) */
    get isTracked(): boolean;
    /** @returns the index of the tracked object (e.g. face 0 or hand 0) */
    get trackingIndex(): number;
}


export class FaceInstance implements ITrackingInstance {
    readonly manager: NeedleTrackingManager;
    get context() { return this.manager.context; }
    get lastUpdateTime() { return this._lastUpdateTime }

    /** The face instance when loaded and active */
    get instance() { return this._instance; }
    /** The index of the tracked face */
    get faceIndex() { return this._faceIndex; }

    get isTracked(): boolean {
        return this._instance !== null && this._instance.parent !== null;
    }
    get trackingIndex(): number {
        return this._faceIndex;
    }

    constructor(manager: NeedleTrackingManager) {
        this.manager = manager;
    }

    private _lastUpdateTime: number = -1;
    private _filter: AssetReference | null = null;
    private _instance: Object3D | null = null;
    private _filterBehaviour: FaceFilterRoot | null = null;
    private _faceIndex: number = -1;

    update(active: AssetReference | null, index: number, _currentFacesCount: number) {
        if (!active) {
            this.remove();
            return;
        }

        this._faceIndex = index;
        this._lastUpdateTime = this.context.time.realtimeSinceStartup;

        // If we have an active filter make sure it loads
        if (this._filter != active && !active.asset) {
            active.loadAssetAsync();
        }
        else if (active?.asset) {
            if (isHandAttachmentRoot(active.asset)) return;
            // Check if the active filter is still the one that *should* be active/visible
            if (active !== this._filter) {
                GameObject.remove(this._instance);
                this._filter = active; // < update the currently active
                // TODO: figure out a better way to update instances when the original behaviour script instannce changes. Currently a user has to manually query the currently active instances and update textures
                this._instance = this.manager.maxFaces > 1 ? instantiate(active.asset) : active.asset;
                this._filterBehaviour = this._instance.getOrAddComponent(FaceFilterRoot);
                GameObject.add(this._instance, this.context.scene);
            }

            if (this._instance && this._instance.parent !== this.context.scene) {
                this._instance.visible = true;
                GameObject.add(this._instance, this.context.scene);
            }
            this._filterBehaviour!.onResultsUpdated(this.manager, index);
        }
    }

    render(matrix: Matrix) {
        // Setup/manage occlusions
        if (this._filterBehaviour?.overrideDefaultOccluder) {
            if (this.occluder) {
                this.occluder.visible = false;
            }
        }
        else if (!this.manager.createOcclusionMesh) {
            if (this.occluder) this.occluder.visible = false;
        }
        else if (!this.occluder) {
            if (this.manager.createOcclusionMesh) {
                this.createOccluder();
            }
        }
        else {
            this.occluder.visible = true;
            FacefilterUtils.applyFaceLandmarkMatrixToObject3D(this.occluder, matrix, this.manager.context.mainCamera);
        }
    }


    remove() {
        GameObject.remove(this.occluder);
        GameObject.remove(this._instance);
    }


    private occluderPromise: Promise<Object3D> | null = null;
    private occluder: Object3D | null = null;
    private createOccluder(_force: boolean = false) {
        // If a occlusion mesh is assigned
        if (this.manager.occlusionMesh) {
            // Request the occluder mesh once
            if (!this.occluderPromise) {
                this.occluderPromise = this.manager.occlusionMesh.loadAssetAsync() as Promise<Object3D>;
                this.occluderPromise.then((occluder) => {
                    this.occluder = new Object3D();
                    this.occluder.add(instantiate(occluder));
                    FacefilterUtils.makeOccluder(this.occluder, -10);
                });
            }
        }
        // Fallback occluder mesh if no custom occluder is assigned
        else {
            this.occluder = new Object3D();
            const mesh = ObjectUtils.createOccluder("Sphere");
            // mesh.material.colorWrite = true;
            // mesh.material.wireframe = true;
            mesh.scale.x = .16;
            mesh.scale.y = .3;
            mesh.scale.z = .17;
            mesh.position.z = -.04;
            mesh.renderOrder = -1;
            mesh.updateMatrix();
            mesh.updateMatrixWorld();
            mesh.matrixAutoUpdate = false;
            this.occluder.add(mesh);
        }
    }
}

/** Joint name or interpolated position between two hand joints. */
export type HandAttachmentPoint = MediapipeHelper.HandKeypointName | {
    p0: MediapipeHelper.HandKeypointName,
    p1: MediapipeHelper.HandKeypointName,
    t01: number,
};
/** +Z follows the finger in both conventions. */
export type HandAttachmentCoordinateSpace = "hand-back" | "finger-pad";
export type HandAttachmentOption = {
    /** Default hand-back: +Y points outward from the back of the hand. finger-pad preserves the original tracking axes. */
    coordinateSpace?: HandAttachmentCoordinateSpace;
    offset?: Vector3Like;
    autoFit?: false | HandAttachmentAutoFit;
    /** Rotation damping in seconds. Default 0; try 0.12 for jewelry. */
    rotationSmoothing?: number;
    /** Optional One Euro tuning when rotation smoothing is enabled. */
    rotationFilter?: HandRotationFilterOptions;
};

const _handPoint = new Vector3();
const _handOtherPoint = new Vector3();
const _handSide = new Vector3();
const _handReferenceForward = new Vector3();
const _handPalmForward = new Vector3();
const _handForward = new Vector3();
const _handNormal = new Vector3();
const _handRight = new Vector3();
const _handUp = new Vector3();
const _handRotationMatrix = new Matrix4();
const _handRotation = new Quaternion();
const _handBackRotation = new Quaternion(0, 0, 1, 0);

export type HandAttachmentStatus = {
    state: "attached" | "detached";
    tracked: boolean;
    anchorVisible: boolean;
    /** Object flag only. This does not assert pixel visibility, frustum inclusion, or lack of occlusion. */
    objectVisible: boolean;
    autoFit: HandAutoFitStatus | null;
};
export type HandAttachmentHandle = {
    readonly object: Object3D;
    readonly status: HandAttachmentStatus;
    dispose(): void;
};

export class HandInstance implements ITrackingInstance {
    private static readonly owners = new WeakMap<Object3D, HandAttachmentHandle>();
    private readonly _attachments = new Map<Object3D, HandAttachmentHandle>();
    readonly manager: NeedleTrackingManager;
    readonly handedness: string;
    get context() { return this.manager.context; }
    get timeSinceLastUpdate() { return this._lastUpdateTime; }
    get isTracked() { return this._isTracked; }
    get trackingIndex() { return this._handIndex; }

    constructor(manager: NeedleTrackingManager, handedness: string = "unknown") {
        this.manager = manager;
        this.handedness = handedness;
    }

    private _lastUpdateTime = -1;
    private _isTracked = false;
    private _handIndex = -1;
    private _depth = 0;
    private _referencePalmSize: number | undefined;
    private _imageLandmarks: readonly { x: number; y: number; z: number }[] = [];
    private _worldLandmarks: readonly { x: number; y: number; z: number }[] = [];
    private readonly _cameraLandmarks: Vector3[] = [];
    private readonly _rawCameraLandmarks: Vector3[] = [];
    private readonly _poseStabilizer = new HandPoseStabilizer();
    private readonly _landmarkFilter = new HandLandmarkFilter();
    private _lastPoseImage: unknown;
    private _measurementTime = 0;
    private _rawEstimatedDepth: number | null = null;
    private _renderScale = 1;
    private _inputRenderScale = 1;
    /** Snapshot of raw and rendered poses for recording/replay. */
    get trackingDiagnostics() {
        return {
            measurementTime: this._measurementTime,
            rawEstimatedDepth: this._rawEstimatedDepth,
            state: this._poseStabilizer.state,
            reason: this._poseStabilizer.reason,
            rawCameraLandmarks: this._rawCameraLandmarks.map(p => p.toArray().map(v => v * this._inputRenderScale)),
            renderScale: this._renderScale,
            cameraLandmarks: this._cameraLandmarks.map(p => p.toArray()),
        };
    }
    private readonly _anchors = new Map<string, { point: HandAttachmentPoint, object: Object3D, coordinateSpace?: HandAttachmentCoordinateSpace, rotationFilter?: HandRotationFilter, rotationSmoothing?: number, rotationOptions?: HandRotationFilterOptions }>();
    private readonly _behaviours: HandTrackingBehaviour[] = [];
    private readonly _attachmentFits = new Map<Object3D, HandAttachmentFit>();
    private readonly _debugObjects: Object3D[] = [];

    addBehaviour(behaviour: HandTrackingBehaviour): void {
        if (!this._behaviours.includes(behaviour)) this._behaviours.push(behaviour);
    }

    removeBehaviour(behaviour: HandTrackingBehaviour): void {
        const index = this._behaviours.indexOf(behaviour);
        if (index >= 0) this._behaviours.splice(index, 1);
    }

    /** A camera-space joint that stays stable across brief tracking loss. */
    getJoint(point: HandAttachmentPoint): Object3D {
        const key = typeof point === "string" ? point : `${point.p0}:${point.p1}:${point.t01}`;
        let anchor = this._anchors.get(key);
        if (!anchor) {
            const object = new Object3D();
            object.name = `Hand ${this.handedness} ${key}`;
            object.visible = false;
            anchor = { point, object };
            this._anchors.set(key, anchor);
        }
        return anchor.object;
    }

    /** Attach a loaded object. Returns an idempotent cleanup handle; caller owns asset resources. */
    attachToHand(obj: Object3D, point: HandAttachmentPoint, opts: HandAttachmentOption = {}): HandAttachmentHandle {
        if (opts.coordinateSpace !== undefined && opts.coordinateSpace !== "hand-back" && opts.coordinateSpace !== "finger-pad")
            throw new Error("Hand attachment coordinateSpace must be hand-back or finger-pad.");
        const names = typeof point === "string" ? [point] : [point.p0, point.p1];
        if (names.some(name => MediapipeHelper.getJointIndex(name) < 0) ||
            (typeof point !== "string" && !Number.isFinite(point.t01)))
            throw new Error("Invalid hand attachment point: use named hand joints and a finite t01.");
        if (opts.offset && ![opts.offset.x, opts.offset.y, opts.offset.z].every(Number.isFinite))
            throw new Error("Hand attachment offset must be finite.");
        if (opts.autoFit && opts.autoFit.innerRadius !== undefined && (!(opts.autoFit.innerRadius > 0) || !Number.isFinite(opts.autoFit.innerRadius)))
            throw new Error("Hand attachment autoFit.innerRadius must be a positive radius in metres.");
        HandInstance.owners.get(obj)?.dispose();
        const key = `attachment:${obj.uuid}`;
        const object = new Object3D();
        object.name = `Hand ${this.handedness} attachment ${obj.name}`;
        object.visible = false;
        object.add(obj);
        this._anchors.set(key, {point, object, coordinateSpace: opts.coordinateSpace ?? "hand-back",
            rotationFilter: opts.rotationSmoothing && opts.rotationSmoothing > 0 ? new HandRotationFilter() : undefined,
            rotationSmoothing: opts.rotationSmoothing, rotationOptions: opts.rotationFilter});
        obj.position.set(opts.offset?.x ?? 0, opts.offset?.y ?? 0, opts.offset?.z ?? 0);
        if (opts.autoFit) {
            const name = typeof point === "string" ? point : point.p0;
            const finger = name.startsWith("pinky") ? "pinky-finger"
                : name.startsWith("thumb") ? "thumb" : name.split("_")[0] + "-finger";
            const segment = name.endsWith("_cmc") ? "metacarpal"
                : name.endsWith("_pip") ? "phalanx-intermediate"
                : name.endsWith("_dip") || name.endsWith("_ip") || name.endsWith("_tip") ? "phalanx-distal" : "phalanx-proximal";
            const measurement = new Object3D();
            measurement.visible = false;
            this._anchors.set(key + ":measurement", {point, object: measurement});
            this._attachmentFits.set(obj, new HandAttachmentFit(obj, opts.autoFit, finger, segment, measurement));
        }
        let detached = false;
        const handle: HandAttachmentHandle = {
            object: obj,
            get status(): HandAttachmentStatus {
                if (detached) return {state: "detached", tracked: false, anchorVisible: false, objectVisible: obj.visible, autoFit: null};
                return owner.getAttachmentStatus(obj)!;
            },
            dispose: () => {
                if (detached) return;
                detached = true;
                this._attachmentFits.get(obj)?.restore();
                this._attachmentFits.delete(obj);
                if (obj.parent === object) obj.removeFromParent();
                object.removeFromParent();
                this._anchors.get(key + ":measurement")?.object.removeFromParent();
                this._anchors.delete(key + ":measurement");
                this._anchors.delete(key);
                this._attachments.delete(obj);
                if (HandInstance.owners.get(obj) === handle) HandInstance.owners.delete(obj);
            },
        };
        const owner = this;
        this._attachments.set(obj, handle);
        HandInstance.owners.set(obj, handle);
        return handle;
    }

    /** Detach without destroying the object's geometry, materials, or textures. */
    detachFromHand(object: Object3D): void { this._attachments.get(object)?.dispose(); }

    getAttachmentStatus(object: Object3D): HandAttachmentStatus | null {
        if (!this._attachments.has(object)) return null;
        const anchor = this._anchors.get(`attachment:${object.uuid}`)?.object;
        return {state: "attached", tracked: this.isTracked, anchorVisible: !!anchor?.visible,
            objectVisible: object.visible, autoFit: this._attachmentFits.get(object)?.status ?? null};
    }

    /** Camera-local position of a detected joint, using MediaPipe image XYZ. */
    getJointPosition(index: number, target: Vector3): Vector3 | null {
        const joint = this._cameraLandmarks[index];
        return joint ? target.copy(joint) : null;
    }

    /** Camera-local, pad-facing joint orientation without allocating a scene object.
     * Returns null while tracking is lost or the segment cannot be resolved. */
    getJointRotation(point: HandAttachmentPoint, target: Quaternion): Quaternion | null {
        if (!this._isTracked) return null;
        const from = typeof point === "string" ? point : point.p0;
        const fromIndex = MediapipeHelper.getJointIndex(from);
        cameraPalmNormal(this._cameraLandmarks, this.handedness, _handNormal);
        // Reflection reverses the winding used to calculate a surface normal.
        if (!mirror) _handNormal.negate();
        _handNormal.normalize();
        _handPalmForward.subVectors(this._cameraLandmarks[9], this._cameraLandmarks[0]).normalize();
        const indexKnuckle = this._cameraLandmarks[5];
        const pinkyKnuckle = this._cameraLandmarks[17];
        _handSide.set(0, 0, 0);
        if (indexKnuckle && pinkyKnuckle) _handSide.subVectors(indexKnuckle, pinkyKnuckle);

        const previousIndex = MediapipeHelper.getPreviousJointIndex(from);
        const directionIndex = typeof point === "string" ? fromIndex : MediapipeHelper.getJointIndex(point.p1);
        const startIndex = typeof point === "string" ? Math.max(0, previousIndex) : fromIndex;
        const endIndex = previousIndex < 0 && typeof point === "string" ? 9 : directionIndex;
        const baseIndex = directionIndex >= 5
            ? 5 + Math.floor((directionIndex - 5) / 4) * 4
            : directionIndex >= 1 ? 1 : 0;
        const nextIndex = baseIndex === 0 ? 9 : baseIndex + 1;

        if (!this.getJointPosition(startIndex, _handOtherPoint) ||
            !this.getJointPosition(endIndex, _handPoint)) return null;
        _handForward.subVectors(_handPoint, _handOtherPoint);
        if (_handForward.lengthSq() < 1e-8 || _handNormal.lengthSq() < 1e-8) return null;
        _handForward.normalize();

        // Position, bone direction, and palm orientation now share one 3D
        // landmark set and one camera conversion, including fingertip depth.
        _handReferenceForward.copy(_handForward);
        const base = this._cameraLandmarks[baseIndex];
        const next = this._cameraLandmarks[nextIndex];
        if (startIndex !== 0 && base && next)
            _handReferenceForward.subVectors(next, base).normalize();
        if (!buildFingerBasis(_handForward, _handSide, _handNormal,
            _handReferenceForward, _handRight, _handUp, _handPalmForward)) return null;
        _handRotationMatrix.makeBasis(_handRight, _handUp, _handForward);
        _handRotation.setFromRotationMatrix(_handRotationMatrix);

        return target.copy(_handRotation);
    }

    render(results: HandLandmarkerResult, index: number): void {
        const camera = this.context.mainCamera;
        if (!(camera instanceof PerspectiveCamera) && !(camera instanceof OrthographicCamera)) return;
        const image = results.landmarks[index];
        if (!image) return;
        this._imageLandmarks = image;
        this._worldLandmarks = results.worldLandmarks[index] ?? [];
        this._referencePalmSize = this.manager.handScaleReference.getOrInitialize(this._worldLandmarks);
        const imageProjection = camera instanceof OrthographicCamera;
        const aspect = this.manager.videoWidth / this.manager.videoHeight;
        const imageSize = imageProjection ? measurePalmSize(image, aspect) : null;
        const renderScale = imageSize && this._referencePalmSize ? imageSize / this._referencePalmSize : 1;
        const originZ = [0,5,9,13,17].reduce((sum,i)=>sum+(image[i]?.z ?? NaN),0)/5;
        const projection = imageProjection
            ? (imageSize && this._referencePalmSize ? {depth: 1/renderScale, originZ} : null)
            : estimateHandProjection(image, this._worldLandmarks,
                this.manager.videoWidth, this.manager.videoHeight, camera.fov, this._referencePalmSize);
        const estimated = projection?.depth ?? null;
        const now = this.context.time.realtimeSinceStartup;
        this._rawEstimatedDepth = estimated;
        if (image !== this._lastPoseImage) {
            this._lastPoseImage = image;
            this._measurementTime = now;
            const dt = Math.min(.1, Math.max(0, now - this._lastUpdateTime));
            const suspectDepth = !imageProjection && !!this._depth && estimated !== null &&
                (estimated / this._depth > 1.35 || estimated / this._depth < .7);
            const blend = this._depth ? 1 - Math.exp(-12 * dt) : 1;
            const proposedDepth = estimated !== null ? this._depth + (estimated - this._depth) * blend : this._depth;
            if (!proposedDepth) return;
            let projectionIssue: string | undefined;
            this._inputRenderScale = imageProjection ? renderScale : 1;
            for (let joint = 0; joint < image.length; joint++) {
                const target = this._rawCameraLandmarks[joint] ??= new Vector3();
                if (imageProjection) {
                    projectImageHandLandmark(image[joint],originZ,aspect,mirror,target);
                    if (target.z >= -camera.near || target.z <= -camera.far) projectionIssue = "invalid image depth";
                    // Stabilization operates at a consistent anatomical scale;
                    // image growth is applied once after filtering.
                    target.multiplyScalar(1/renderScale);
                }
                else projectHandLandmark(image[joint], projection?.originZ ?? image[0].z, proposedDepth,
                    aspect, camera.fov, mirror, target);
            }
            this._rawCameraLandmarks.length = image.length;
            if (!projection) projectionIssue = "invalid hand projection";
            else if (!imageProjection) projectionIssue = getHandProjectionIssue(image,this._rawCameraLandmarks,proposedDepth,camera.near,true);
            const valid = this._poseStabilizer.update(this._rawCameraLandmarks, now, suspectDepth, projectionIssue);
            if (this._poseStabilizer.state === "measured") this._depth = proposedDepth;
            this._lastUpdateTime = now;
            if (valid) {
                const filtered = this._landmarkFilter.update(this._poseStabilizer.output, now, this.manager.handLandmarkSmoothing);
                const filteredPalmDepth = -[0,5,9,13,17].reduce((sum,i)=>sum+filtered[i].z,0)/5;
                this._renderScale = imageProjection && filteredPalmDepth > 1e-6 ? 1/filteredPalmDepth : 1;
                for (let i = 0; i < 21; i++) (this._cameraLandmarks[i] ??= new Vector3()).copy(filtered[i]).multiplyScalar(this._renderScale);
                this._cameraLandmarks.length = 21;
            }
        }
        if (this._poseStabilizer.state === "lost") {
            this._landmarkFilter.reset();
            this._isTracked = false;
            for (const { object, rotationFilter } of this._anchors.values()) { object.visible = false; rotationFilter?.reset(); }
            for (const object of this._debugObjects) object.visible = false;
            for (const behaviour of this._behaviours) behaviour.onHandTrackingLost();
            return;
        }
        this._isTracked = true;
        this._handIndex = index;
        for (const { point, object, coordinateSpace, rotationFilter, rotationSmoothing, rotationOptions } of this._anchors.values()) {
            const from = typeof point === "string" ? point : point.p0;
            const fromIndex = MediapipeHelper.getJointIndex(from);
            if (!this.getJointPosition(fromIndex, _handPoint)) continue;
            if (typeof point !== "string") {
                const toIndex = MediapipeHelper.getJointIndex(point.p1);
                if (this.getJointPosition(toIndex, _handOtherPoint))
                    _handPoint.lerp(_handOtherPoint, Math.max(0, Math.min(1, point.t01)));
            }
            const root = this.manager.handTrackingRoot;
            if (object.parent !== root) root.add(object);
            object.visible = true;
            object.position.copy(_handPoint);
            object.scale.setScalar(this._renderScale);

            if (!this.getJointRotation(point, _handRotation)) { object.visible = false; continue; }

            object.quaternion.copy(rotationFilter
                ? rotationFilter.update(_handRotation, this.context.time.deltaTime, rotationSmoothing!, this._measurementTime, rotationOptions)
                : _handRotation);
            if (coordinateSpace === "hand-back") object.quaternion.multiply(_handBackRotation);
        }
        if (debug && this.manager.showHandDebugOverlays) this.renderDebug(camera);
        else for (const object of this._debugObjects) object.visible = false;
        for (const behaviour of this._behaviours) {
            if (behaviour.activeAndEnabled) behaviour.onUpdateHandTracking(this, results, index, this._depth);
        }
        if (this._attachmentFits.size) {
            const meshes = this._behaviours.filter(b => b.activeAndEnabled).flatMap(b => b.skinnedMeshes);
            for (const [object, fit] of this._attachmentFits) {
                if (object.parent && [...this._anchors.values()].some(a => a.object === object.parent)) fit.update(meshes, this.context.time.deltaTime);
                else this._attachmentFits.delete(object);
            }
        }
    }

    remove(): void {
        this._poseStabilizer.reset();
        this._landmarkFilter.reset();
        this._lastPoseImage = undefined;
        this._depth = 0;
        this._isTracked = false;
        this._handIndex = -1;
        for (const { object, rotationFilter } of this._anchors.values()) { object.visible = false; rotationFilter?.reset(); }
        for (const object of this._debugObjects) object.visible = false;
        for (const behaviour of this._behaviours) behaviour.onHandTrackingLost();
    }

    dispose(): void {
        this.remove();
        for (const handle of [...this._attachments.values()]) handle.dispose();
        for (const { object } of this._anchors.values()) object.removeFromParent();
        for (const object of this._debugObjects) object.removeFromParent();
        this._anchors.clear();
        this._attachmentFits.clear();
        this._debugObjects.length = 0;
        this._behaviours.length = 0;
    }

    private renderDebug(camera: ThreeCamera): void {
        for (let i = 0; i < this._imageLandmarks.length; i++) {
            let object = this._debugObjects[i];
            if (!object) {
                object = ObjectUtils.createPrimitive("Sphere", { scale: debugHands ? .004 : .01, color: (i / this._imageLandmarks.length) * 0xffffff });
                this._debugObjects[i] = object;
            }
            if (this.getJointPosition(i, _handPoint)) {
                if (object.parent !== camera) camera.add(object);
                object.position.copy(_handPoint);
                object.visible = true;
            }
        }
    }
}

export { NeedleTrackingManager as NeedleFilterTrackingManager };
