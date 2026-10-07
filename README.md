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

Open the HTTPS address printed by Vite and allow camera access. The default demo loads a [ring asset](https://cloud.needle.tools/-/assets/Z23hmXB12yGTI-ZAqHd0-optimized/file.glb) and attaches an instance to each tracked ring finger. Its starting outer diameter is approximately 22 mm; placement and fit are approximate. The demo does not implement hand occlusion, so the ring's far side can remain visible through the finger.

### Debug hand tracking

Add these parameters to the demo URL:

| URL query | Result |
| --- | --- |
| No query | Ring demo without diagnostic markers or panel |
| `?debughandtracking` | Skeleton, 16 orientation markers per hand, labels, and capture panel |
| `?debughandtracking&ring` | Ring plus diagnostics |

`?debughands` remains an alias for existing bookmarks. Reload after changing the query. The debug UI lives in `src/handTrackingDebug.ts` and is imported only when enabled; `src/main.ts` contains the ring demo and startup code.

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
