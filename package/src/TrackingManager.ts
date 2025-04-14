import { Application, AssetReference, Behaviour, ClearFlags, GameObject, getIconElement, getParam, getTempVector, Gizmos, instantiate, isDevEnvironment, isMobileDevice, Mathf, ObjectUtils, PromiseAllWithErrors, serializable, setParamWithoutReload, showBalloonMessage, showBalloonWarning } from '@needle-tools/engine';
import { FaceLandmarker, DrawingUtils, FaceLandmarkerResult, PoseLandmarker, PoseLandmarkerResult, ImageSegmenter, ImageSegmenterResult, Matrix, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { BlendshapeName, FacefilterUtils, MediapipeHelper } from './utils.js';
import { MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Texture } from 'three';
import { NeedleRecordingHelper } from './RecordingHelper.js';
import { FaceFilterRoot, FilterBehaviour } from './Behaviours.js';
import { mirror } from './settings.js';
import { VideoRenderer } from './VideoRenderer.js';

const debug = getParam("debugfilter");

declare type VideoClip = string;

/**
 * Use the NeedleFilterTrackingManager to track faces and apply filters to them
 */
export class NeedleTrackingManager extends Behaviour {

    static get instance() { return this._instance; }
    private static _instance: NeedleTrackingManager | null = null;

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

    /** Assign a texture to display your logo in the recorded video.   
     * Note: this requires an active PRO license: https://needle.tools/pricing
     */
    // @nonSerialized
    @serializable(Texture)
    customLogo: Texture | null = null;

    /** The name of the downloaded video. If null the video will not be downloadable  
     * Note: this requires an active PRO license: https://needle.tools/pricing
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
     * @returns an array of th active face objects, thise hold a reference to the face instance
     */
    getActiveFaceObjects() {
        return Array.from(this._faces)
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

        this._debug = getParam("debugfacefilter") == true;
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
        window.removeEventListener("keydown", this.onKeyDown);
        this._video?.pause();
        this._videoRenderer?.disable();
        this._buttons.forEach((button) => button.remove());
        this._faces.forEach((state) => state.remove());
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
    }

    private async startCamera(video: HTMLVideoElement) {
        // Use camera stream
        const constraints = { video: true, audio: false };
        const stream = await navigator.mediaDevices.getUserMedia(constraints).catch((e) => {
            if (isDevEnvironment()) showBalloonWarning(`Could not start camera: ${e.message}. Perhaps you need to allow camera access?`);
            console.error("[Needle Tracking] Could not start camera: " + e.message);
            return null;
        });
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
                    label: "Toggle Example Video",
                    title: "Switch between example videos - this button is only visible in development mode (when you run your website in a local server)",
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
            this._handlandmarker = MediapipeHelper.createHandLandmarker({
                maxHands: this.maxHands
            }).then(res => this._handlandmarker = res);
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
        }
        catch (err) {
            console.error("Error while processing video frame", err);
        }

        // Apply results
        this.onFaceResultsUpdated(this._lastFaceLandmarkResults);
        this.onHandLandmarkerResultsUpdated(this._lastHandLandmarkResults);
    }

    /** @internal */
    onBeforeRender(): void {

        // Currently we need to force the FOV
        if (this.context.mainCameraComponent) {
            this.context.mainCameraComponent.fieldOfView = 63;
            this.context.mainCameraComponent.clearFlags = ClearFlags.None;
            this._videoRenderer?.onUpdate();
        }

        this.updateDebugRendering();

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
                if ((this.context.time.realtimeSinceStartup - state.lastUpdateTime) > .5) {
                    state?.remove();
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
                                            console.log("Blendshape Mirror: " + left.categoryName + " ↔ " + right.categoryName);
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

        if (!handResults) {
            this._hands.forEach((state) => state.remove());
            this._hands.length = 0;
            return;
        }

        const camera = this.context.mainCamera;

        if (!(camera instanceof PerspectiveCamera)) {
            return;
        }

        if (this._hands.length > handResults.handedness?.length) {
            for (let i = this._hands.length - 1; i >= 0; i--) {
                const hand = this._hands[i];
                if (i >= handResults.handedness.length) {
                    hand.remove();
                }
            }
        }
        else if (this._hands.length < handResults.handedness?.length) {
            const hand = new HandInstance(this);
            this._hands.push(hand);
        }
    }

    private readonly _buttons: HTMLElement[] = [];

    private createUI() {
        if (!this.createMenuButton) return;
        // Create menu Buttons
        const recordingButton = NeedleRecordingHelper.createButton({
            context: this.context,
            customLogo: this.customLogo,
            download_name: this.downloadName || undefined,
        });
        this._buttons.push(recordingButton);

        if (this.filters.length > 1) {
            const nextFilterButton = this.context.menu.appendChild({
                label: "Next Filter",
                icon: "comedy_mask",
                onClick: () => {
                    this.selectNextFilter();
                }
            });
            this._buttons.push(nextFilterButton);
        }


        const shareButton = this.context.menu.appendChild({
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
        });
        this._buttons.push(shareButton);
    }


    private _debug = getParam("debugfacefilter");
    private _debugDrawing: DrawingUtils | null = null;
    private _debugContainer: HTMLDivElement | null = null;
    private _debugCanvas: HTMLCanvasElement | null = null;
    private _debugObjects: Object3D[] = [];

    private onKeyDown = (evt: KeyboardEvent) => {
        if (!this.useKeyboard) {
            return;
        }
        const key = evt.key.toLowerCase();
        if (this._debug && key === "f") {
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
        this._lastHandLandmarkResults?.landmarks?.forEach((landmarks) => {
            this._debugDrawing?.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#55FF44", lineWidth: 1 });
        });


        this._lastPoseLandmarkResults?.landmarks.forEach((landmarks) => {
            this._debugDrawing?.drawLandmarks(landmarks, { color: "#FF44FF", lineWidth: 1 });
        });
        this._lastHandLandmarkResults?.landmarks.forEach((landmarks) => {
            this._debugDrawing?.drawLandmarks(landmarks, { color: "#FF44FF", lineWidth: 1 });
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


class FaceInstance {
    readonly manager: NeedleTrackingManager;
    get context() { return this.manager.context; }
    get lastUpdateTime() { return this._lastUpdateTime }

    /** The face instance when loaded and active */
    get instance() { return this._instance; }
    /** The index of the tracked face */
    get faceIndex() { return this._faceIndex; }

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



class HandInstance {
    readonly manager: NeedleTrackingManager;
    get context() { return this.manager.context; }
    constructor(manager: NeedleTrackingManager) {
        this.manager = manager;
    }

    private _lastUpdateTime: number = -1;
    private _handObjects: Object3D[] = [];

    render(results: HandLandmarkerResult, index: number) {

        // https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js?hl=en#handle_and_display_results

        const hand = results.landmarks[index];
        if (!hand) { return; }

        const camera = this.context.mainCamera;
        if (!(camera instanceof PerspectiveCamera)) { return; }



        const wrist = hand[MediapipeHelper.getJointIndex("wrist")];
        const middleMCP = hand[MediapipeHelper.getJointIndex("middle_finger_mcp")];
        const depth = FacefilterUtils.calculateDepth(wrist, middleMCP);

        if (this._handObjects.length != hand.length) {
            for (let i = 0; i < hand.length; i++) {
                const obj = ObjectUtils.createPrimitive("Sphere", {
                    scale: .3,
                    color: (i / hand.length) * 0xFFFFFF
                });
                this._handObjects.push(obj);
            }
        }
        for (let i = 0; i < hand.length; i++) {
            const obj = this._handObjects[i];
            const segment = hand[i];
            const pos = FacefilterUtils.normalizedLandmarkerToWorld(segment, camera, this.manager.videoWidth, this.manager.videoHeight, depth);
            if (obj.parent != camera) camera.add(obj);
            obj.position.copy(pos);
            // obj.position.lerp(pos, this.context.time.deltaTime / .033);
        }
    }

    remove() {
        for (const obj of this._handObjects) {
            GameObject.remove(obj);
        }
        this._handObjects.length = 0;
    }
}