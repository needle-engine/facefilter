# Needle Engine FaceFilter

Add face and hand tracking to your [Needle Engine](https://needle.tools) projects with ease.
This project contains the sourcecode for the facefilter package as well as an example Unity project (see [quickstart](#quickstart) below for how to get started without an editor)


<p align="center">
<a href="https://www.npmjs.com/package/@needle-tools/facefilter" target="_blank"><img alt="NPM Version" src="https://img.shields.io/npm/v/@needle-tools/facefilter"></a>
<a href="https://www.npmjs.com/package/@needle-tools/facefilter" target="_blank"><img alt="NPM Last Update" src="https://img.shields.io/npm/last-update/@needle-tools/facefilter"></a>
</p>



---



# Features
- Blendshape mesh face tracking
- Texture face tracking with google/mediapipe canonical or procreate texture layouts (Use the `FaceMeshTexture` class)
- Video face tracking: Play a video as a face texture (Use the `FaceMeshVideo` class)
- Custom shader face meshes: Use custom materials on your face mesh (Use the `FaceMeshCustomShader` class)
- Tracking for multiple faces at once (with smoothing)
- *Can be used with Unity to create filters, animations, materials...*


## 2.0.0 beta: hand tracking demo

The working package version is `2.0.0-beta.0`. See the [package README](package/README.md#hand-tracking) for the attachment API and the [changelog](package/CHANGELOG.md) for changes.

### Run the web demo

From the repository root, install the package and start the example (Node.js 24 recommended):

```sh
cd package
npm ci
cd "../Unity FaceFilter Example/Needle/WebProject"
npm ci
npm start
```

Open the HTTPS address printed by Vite and allow camera access. The base URL preserves the exported Unity scene and its tracking settings. Add `?ring` to explicitly run the hand-only demo, which loads a [ring asset](https://cloud.needle.tools/-/assets/Z23hmXB12yGTI-ZAqHd0-optimized/file.glb) and attaches an instance to each tracked ring finger. The ring starts at an approximate 22 mm outer diameter, centered on its opening. **Autofit ring to finger mesh** is enabled in this demo: it centers and uniformly sizes the opening from cross-sections of the current skinned finger, with 0.5 mm clearance. Turn the checkbox off to restore the original size. It starts 75% of the way from the base knuckle toward the next finger joint. The debug panel's **Ring position** slider adjusts this interpolation live: 0 is the base knuckle, 1 is the next joint. Autofit samples the new slider position; with autofit off, moving the slider preserves ring size. The demo loads skinned WebXR hand meshes with depth-only occlusion by default, including at `/?ring`. Use the debug panel's **Hand mesh** selector to inspect the visible surface or wireframe.

### Debug hand tracking

Add these parameters to the demo URL:

| URL query | Result |
| --- | --- |
| No query | Ring plus visible hand mesh, without diagnostic markers or panel |
| `?debughandtracking` | Skeleton, 16 orientation markers per hand, labels, and capture panel |
| `?debughandtracking&ring` | Ring plus diagnostics |

`?debughands` remains an alias for existing bookmarks. Reload after changing the query. The debug UI lives in `src/handTrackingDebug.ts` and is imported only when enabled; `src/main.ts` coordinates startup, `src/ringDemo.ts` contains ring loading and placement, and `src/handMeshDemo.ts` contains the hand mesh display modes.

Use **Hand mesh** to choose **Visible surface**, **Wireframe**, **Depth occlusion only** (default), or **Off**. Depth mode writes the hand surface to the depth buffer before the ring, hiding ring fragments behind it without drawing the hand in color. Use **Hand thickness** to adjust pad-to-back thickness for both visible skin and depth occlusion (1.00 is the original; try 0.80 for a thinner occluder). Joint positions and finger lengths stay fixed; an autofitted ring follows the changed surface.

Uncheck **Show cubes and tracking lines** to hide cubes, arrows, labels, and landmark lines/dots together. The hand mesh and ring remain visible. Choose **No orientation markers** to hide only the cubes and their labels.

The models are copied from the generic WebXR hand profile used by Needle Engine, with their MIT license in `include/hand-models`. Their bones follow our camera-space hand landmarks and attachment orientations. MediaPipe has 21 landmarks; four additional metacarpal origins are inferred by fitting the model palm to the tracked wrist and knuckles. Hand thickness is a generic approximation, so occlusion near the silhouette and ring fit still require visual checking. Finger segments fit both tracked endpoints, and the untracked source forearm cuff is shortened to a 4 mm continuation in model space. The mesh hides when tracking is lost.

Use the panel to isolate a finger or the palm, toggle labels, or show white pad-normal arrows. Blue arrows point toward the fingertip; green faces mark the finger pad and red faces mark the back. T/I/M/R/P mean thumb/index/middle/ring/pinky; 1/2/3 mean base/middle/tip segments. The angle readout describes the index fingertip marker (I3).

**Save hand landmarks** downloads one frame. **Capture 5 seconds of tracking** downloads 50 samples at a nominal 10 Hz. Captures contain normalized and metric landmarks, camera settings, and marker transforms; they contain no camera images or audio.

### Replay and test without a camera

From `package`, run:

```sh
npm test
node --experimental-strip-types tests/replay-hand-frame.mjs "path/to/facefilter-hand-sequence.json"
node --experimental-strip-types tests/replay-hand-frame.mjs "path/to/facefilter-hand-frame.json" --json
```

Replay accepts a single frame or a sequence. It reports marker tilt, pitch, and roll; `--json` emits results for scripts and AI agents. Tests include sanitized straight and curled hand fixtures. These checks validate geometry and regression behavior; they do not establish the true physical pose from a single camera.

# Examples
- [Example with Blendshapes on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-blendshapes?file=src%2Fmain.ts)
- [Example with Sunglasses on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-glasses?file=src%2Fmain.ts)
- [Example with Texture Mesh on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter)
- [Example with ShaderToy on Stackblitz](https://stackblitz.com/edit/needle-engine-shadertoy-facefilter)
- [Example without a bundler on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html?file=index.html)
- [Example with HTML only 2D filter on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html-only?file=index.html) ([or github](https://github.com/needle-engine/facefilter/blob/main/package/examples/html/index.html))
- [Example with HTML only 3D filter on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html-only-3d?file=index.html) ([or github](https://github.com/needle-engine/facefilter/blob/main/package/examples/html/model.html))
- [Demo Video](https://github.com/user-attachments/assets/51300430-6290-4672-b2aa-f1e870b9e99c)


## Quickstart

Run `npm i @needle-tools/facefilter` in your web project   

Then see the code below or [full examples](#examples):


### Face Filter with Unity
1) Clone this repository
2) Open the Unity project at `Unity FaceFilter Example`
3) Open the Example scene in Unity and click play

**Note**: The Unity project uses Needle Engine 4.4 alpha.


### Face Filter with HTML only

See full examples in [/examples/html/](/package/examples/)   

#### Supported attributes

| | |
| -- | -- |
| `face-filter` | URL to either a image or model file. Supported formats: `glTF`, `GLB`, `FBX`, `OBJ` **or 2D** `jpeg`, `jpg`, `png`, `webp` |
| `face-filter-mask` | (optional, 2D only) URL to image file that will be used to mask out the face filter texture
| `face-filter-layout` | (optional, 2D only) Either `procreate`, `mediapipe` or `canonical`. Default `mediapipe`
| `face-filter-scale` | (optional, 3D only) Apply scale to the 3D face filter model (e.g. `face-filter-scale=".5"`)
| `face-filter-offset` | (optional, 3D only) Offset the 3D face filter model (e.g. `face-filter-offset="0.0, 0.1, 0.1"`)
| `face-filter-max-faces` | (optional) How many faces should be tracked automatically. Default: `1`
| `face-filter-show-video` | (optional) Should the camera videofeed be rendered in the background? Default: `true`. Can be set to `0` to hide the videofeed in the background.
| `face-filter-video-selector` | (optional) HTML selector for a HTMLVideoElement. Useful if you want to render provide your own video element on the website elsewhere. If none is provided a hidden video element will be created automatically. 


#### HTML Example
```html
<!DOCTYPE html>
<html>
  <head>
      <script type="importmap">
          {
            "imports": {
              "three": "https://cdn.jsdelivr.net/npm/@needle-tools/engine@4.4.0-alpha.5/dist/three.min.js",
              "@needle-tools/engine": "https://cdn.jsdelivr.net/npm/@needle-tools/engine@4.4.0-alpha.5/dist/needle-engine.min.js",
              "@needle-tools/facefilter": "https://cdn.jsdelivr.net/npm/@needle-tools/facefilter/dist/facefilter.min.js"
            }
          }
      </script>
      <script type="module" src="https://cdn.jsdelivr.net/npm/@needle-tools/facefilter/dist/facefilter.min.js"></script>
  </head>

  <body style="margin:0; padding:0;">
      <needle-engine
          background-color="#ffffdd"
          face-filter="https://cdn.needle.tools/static/facefilter/facemask-template-procreate.webp"
          face-filter-mask="https://cdn.needle.tools/static/facefilter/facemask-occlusion-procreate.webp"
          face-filter-layout="procreate"
          >
      </needle-engine>
  </body>
</html>
```
[Open 2D Example](https://stackblitz.com/edit/needle-engine-facefilter-html-only?file=index.html) – 
[Open 3D Example](https://stackblitz.com/edit/needle-engine-facefilter-html-only-3d?file=index.html)



### Face Mesh Texture Filter


```ts
import { onStart } from '@needle-tools/engine';
import { FaceMeshTexture, NeedleTrackingManager } from '@needle-tools/facefilter';

onStart(context => {
  const scene = context.scene;

  // Create a face filter tracking manager and add it to the scene
  const filtermanager = new NeedleTrackingManager();
  filtermanager.createMenuButton = true;
  scene.addComponent(filtermanager);

  // Creating a filter
  const filter = new FaceMeshTexture({
    layout: 'procreate', // we support both the google/mediapipe canonical layout and procreate/arkit layouts
    texture: {
      url: './assets/crocodile.webp', // provide a URL to the texture
      // texture: <your texture> // alternatively you can assign an existing texture directly
    },
  });
  // Activate one of your filters
  filtermanager.activateFilter(filter);
});
```
[Open Example](https://stackblitz.com/edit/needle-engine-facefilter)



### Face Mesh Blendshapes Filter


```ts
import { onStart } from '@needle-tools/engine';
import { FaceFilterRoot, NeedleTrackingManager } from '@needle-tools/facefilter';

onStart(async context => {
  const scene = context.scene;

  // Create a face filter tracking manager and add it to the scene
  const filtermanager = new NeedleTrackingManager();
  filtermanager.createMenuButton = false;
  scene.addComponent(filtermanager);

  // Creating a filter using a GLB/glTF URL model that has blendshapes
  const filter = await FaceFilterRoot.create('https://cloud.needle.tools/-/assets/Z23hmXBZWllze-ZWllze/file', {
    scale: 0.5,
    offset: { x: 0, y: 0.01, z: 0 },
  });
  if (filter) filtermanager.activateFilter(filter);
});
  ```
[Open Example](https://stackblitz.com/edit/needle-engine-facefilter-blendshapes?file=src%2Fmain.ts)


## Video

https://github.com/user-attachments/assets/51300430-6290-4672-b2aa-f1e870b9e99c



# Contributing

⚠️ TODO


# Contact

<b>[needle](https://needle.tools)</b> •
[Twitter](https://twitter.com/NeedleTools) •
[Forum](https://forum.needle.tools) •
[Youtube](https://www.youtube.com/@needle-tools)

### Recording tracking instability

The debug panel's five-second capture now uses recording version 2 and samples
each new tracking result observed by the render loop, instead of polling at
10 Hz. Each hand includes raw image/world landmarks, the raw estimated depth,
projected input joints, stabilized output joints, rejection reason, and
`measured` / `predicted` / `lost` status. Ring data includes the placement slider,
autofit switch, fitted camera-space position/quaternion/scale, local fit offset
and scale, and visibility. No camera images or audio are recorded.

Isolated depth, joint-length, and position spikes use bounded translation from
the latest reliable pose for at most 120 ms; the prediction preserves finger
lengths. Longer invalid periods hide the attachments until plausible tracking
returns. This does not reconstruct unseen motion or resolve every handedness
misclassification. Older captures remain useful, but cannot reproduce exact
ring fitting or tracking events that occurred between their 10 Hz samples.

The skinned model now maps fingertip surface points to MediaPipe's tip landmarks,
rather than placing the model's internal WebXR tip joints on those surface points.
Palm proportions remain approximate and need a matching image and landmark frame
when diagnosing silhouette mismatch.

Autofit now restricts fitting to the attached finger segment, rather than all
parts of that finger. It uses a closed cross-section around the attachment axis;
missing/open or oversized sections retain the last valid fit. Offset and size
changes use an 80 ms smoothing time constant to reduce visible breathing.

Sequence downloads use compact JSON and six decimal places, and omit the
16 redundant diagnostic marker transforms per hand. Full ring transforms and
raw/stabilized landmarks remain in every recorded tracking frame. Single-frame
landmark downloads still include diagnostic marker transforms.

The ring also uses attachment rotation smoothing (`rotationSmoothing: 0.12`).
This rejects isolated angular spikes using three distinct tracking results,
then damps rotation with a bounded angular speed; it resets after tracking loss. This introduces some rotational lag.
The filtered ring quaternion and smoothing setting are included in recordings.

Hand stabilization now runs on camera-space landmarks before palm orientation,
skinning, attachments, and debug lines are computed. Wrist translation and
wrist-relative shape use separate One Euro estimates, with one common blend
for the shape. Defaults: minimum cutoff 1 Hz, beta 25 (metres/second), derivative
cutoff 1 Hz. `manager.handLandmarkSmoothing` exposes these settings, and captures
record them alongside raw input and final output landmarks. The ring's secondary
rotation filter is lighter to avoid stacking the previous amount of lag.

The web demo uses a 1 cm camera near plane (the exported scene was 10 cm).
Orientation markers render above the hand occluder so its invisible depth surface
does not cut holes in diagnostic cubes; the ring still uses normal depth testing.

Hand orientation now carries the palm frame through base-knuckle flexion,
preventing the pad normal from becoming singular when a finger points out of
the palm. The optional perspective projection uses the mean palm depth as its reference and fits
metric scale after perspective unprojection. This avoids treating the palm's
estimated distance as wrist distance, which exaggerated close-up perspective.
Recordings identify this model as `mediapipe-image-xyz-palm-perspective`;
`estimatedDepth` is now the palm reference distance, not wrist distance.
Depth validity checks still reject landmarks within the camera safety margin.
Invalid frames use the short prediction window, then hide until tracking returns.
The camera defaults to an estimated 63-degree vertical FOV; this correction is not physical
camera calibration, and MediaPipe depth and the generic hand surface remain estimates.

Autofit measures cross-sections in the current finger frame, independently of
attachment rotation smoothing. Rotation lag must not enlarge the fit by cutting
an oblique slice through the finger. The fitted center is transformed back into
the rendered attachment frame.

### Camera projection without calibration

Hand-only tracking (`maxFaces = 0`, `maxHands > 0`) defaults to
`manager.handProjection = "auto"`. It renders the video, hand mesh, and
attachments with an orthographic image-space camera. Landmark XY coordinates
align with the video; relative MediaPipe Z supplies depth ordering for occlusion.
Moving the hand closer scales the hand and its attachments together without
adding perspective distortion from an assumed camera FOV.

No calibration marker, FOV slider, or user setup is required. This mode does not
measure the hardware FOV or recover physical camera distance. Landmark depth,
finger twist, and the generic hand surface remain estimates.

Recordings identify this mode as `mediapipe-image-orthographic`, with
`verticalFov: null`. `tracking.renderScale` converts normalized anatomical units
to image units; `estimatedDepth` is an inverse apparent scale, not a measured
distance. Debug mode displays ?Projection: image space (no camera calibration)?.

Applications that need the existing scene-camera integration can opt into
`manager.handProjection = "perspective"`. Mixed face/hand tracking also retains
perspective projection. The experimental MediaPipe FOV estimator applies only
to hand-only perspective mode and can remain at its 63-degree fallback when
measurements are ambiguous. It is not hardware camera calibration.

The ring demo uses `rotationFilter.mode: "twist"`: the opening axis follows the
current filtered finger segment exactly, while rotation around it is smoothed.
This prevents attachment rotation lag from tilting the band across the finger.
The mode is included in recordings. It does not correct biased landmark depth
or an incorrect inferred palm normal; it removes the additional axis lag.
