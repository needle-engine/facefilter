# Needle Engine FaceFilter

Add face and hand tracking to your Needle Engine projects with ease.


# Features
- Blendshape mesh face tracking
- Texture face tracking with google/mediapipe canonical or procreate texture layouts (Use the `FaceMeshTexture` class)
- Video face tracking: Play a video as a face texture (Use the `FaceMeshVideo` class)
- Custom shader face meshes: Use custom materials on your face mesh (Use the `FaceMeshCustomShader` class)
- Tracking for multiple faces at once (with smoothing)
- Hand tracking with stable Three.js joint anchors
- *Can be used with Unity to create filters, animations, materials...*


Current development version: **2.0.0-beta.0**.

## Quickstart

Run `npm i @needle-tools/facefilter` in your web project.

Use the same `three` version as your Needle Engine installation in the web project. This keeps Facefilter and the engine on one Three.js copy.

Then see the code or examples below:

### Hand tracking

For a standalone HTML page with a small JavaScript module, see the
[no-Unity hand attachment example](../examples/hand-tracking/). It includes camera
tracking, a finger attachment, and automatic hand occlusion using the packaged models.


Hand tracking uses MediaPipe's normalized image XYZ landmarks for position and
orientation in Needle Engine's camera space. Metric landmarks initialize a
shared hand-size reference for depth estimation. Attach a Three.js object to a stable joint before
or after a hand is detected. The package handles video mirroring, depth,
position, rotation, and temporary loss of tracking.

```ts
import { NeedleTrackingManager } from "@needle-tools/facefilter";
import { onStart, ObjectUtils } from "@needle-tools/engine";

onStart(context => {
  const manager = context.scene.addComponent(NeedleTrackingManager, {
    maxFaces: 0,
    maxHands: 2,
  });
  const marker = ObjectUtils.createPrimitive("Sphere", { scale: .02 });
  manager.getHand("Right").attachToHand(marker, "index_finger_tip");
});
```

`getHand("Left")` and `getHand("Right")` return stable handles. `hand.getJoint(name)`
returns the underlying `Object3D` anchor if you want to parent several objects
or read its world transform. Anchors are hidden while the hand is not tracked.
For alignment debugging, add `?debughandtracking` to the page URL (`?debughands`
is also supported). It draws the detected hand skeleton and projected joint
markers. The repository web demo additionally loads a diagnostic panel with
16 orientation markers per hand, finger selection, and JSON capture. See the
[demo and replay guide](https://github.com/needle-engine/facefilter#debug-hand-tracking).
Joint local +Z follows the finger and local +Y faces the palm side.
`manager.handLandmarkSmoothing` configures the shared One Euro landmark filter
(default `{ minCutoff: 1, beta: 25, derivativeCutoff: 1 }`; velocity is in
metres/second). It runs before palm orientation, skinning and all attachments.
Wrist translation is separated from hand shape, so translation filtering does
not stretch individual fingers. One common shape blend keeps response timing
consistent across joints. The debug lines use the filtered pose too.

`hand.trackingDiagnostics` returns a snapshot of input/output camera-space
landmarks, measurement time (engine seconds), raw depth estimate, and the
current stabilization status/reason. Short invalid poses use bounded translation
prediction for up to 120 ms, preserving finger lengths; longer invalid periods
hide the hand until tracking recovers. Loss of detection resets this history.


Attach between joints with `hand.attachToHand(object, { p0: "ring_finger_mcp",
p1: "ring_finger_pip", t01: .3 })`. Here `t01` interpolates from the first joint
to the second. Scale and rotate the model locally to fit the anchor axes. The
repository demo uses this API for a ring on either hand.

For rotation jitter, enable quaternion One Euro filtering:

```ts
hand.attachToHand(ring, point, {
  rotationSmoothing: 0.12,
  rotationFilter: { minCutoff: 1, beta: 1.5, derivativeCutoff: 1 },
});
```

`rotationSmoothing: 0` disables filtering. When enabled, `minCutoff` controls
resting steadiness (lower is steadier) and `beta` controls the motion response
(higher reduces lag during turns). Cutoffs are in Hz; angular velocity uses
radians/second. Without explicit settings, the resting cutoff is derived from
`rotationSmoothing` and beta defaults to 1.5.

This is a quaternion adaptation of the [One Euro filter](https://gery.casiez.net/1euro/):
low-pass signed angular velocity, compute a speed-dependent cutoff, then apply
quaternion interpolation. A three-measurement outlier stage precedes it. A
reused detector result cannot vote repeatedly or inflate the velocity estimate.
There is no fixed angular speed limit. Filtering has a dedicated attachment
anchor, so it does not change the shared joint anchors or the mesh. History
resets on tracking loss. Some lag remains; the filter cannot recover the true
orientation from sustained incorrect landmarks. The demo exposes live cutoff
and response controls and records their settings with the ring quaternion.

#### Optional surface fitting

`autoFit` is off by default. For a circular ring opening, enable it with:

```ts
const fit = { enabled: true, halfWidth: 0.002, clearance: 0.0005 };
hand.attachToHand(ring, {
  p0: "ring_finger_mcp", p1: "ring_finger_pip", t01: 0.75,
}, { autoFit: fit });
// Toggle at runtime. False restores the original position and scale.
fit.enabled = false;
```

Omit `innerRadius` to measure the loaded rigid mesh's circular opening and center
automatically. Orient its hole axis along the attachment's +Z axis and set the
initial model scale before attaching. Measurement uses nested closed mesh
cross-sections, excluding the ornament's bounding box. It runs once per attachment.
Unsupported, ambiguous, skinned, or instanced assets report `invalid-geometry`;
they keep their initial transform. Inspect the returned handle's `status.autoFit`.

For unsupported assets, supply `innerRadius` in metres **at the initial object
scale**, excluding decorations, and center the opening at the object origin.
Reattach after replacing the asset or changing its initial orientation/scale.
`halfWidth` is the axial sampling distance on either side of the center plane.
The fitter uses the current `HandTrackingBehaviour` skin for the same hand,
restricts triangles to the attached finger segment and selects the closed
cross-section containing its axis, centers the object across the finger, and
uniformly scales it. It preserves placement along the finger (+Z). This is a
circular-opening fit, not a general asset fitting algorithm. No mesh or no
valid section retains the previous fit (or the initial transform). Folded-back
sections of the same finger cannot contribute to the fit. `maxScale` defaults
to `2` and rejects oversized fits. `smoothing` defaults to `0.08` seconds for
fit offset and size; set it to `0` for an immediate response.

The demo enables this option and exposes an **Autofit ring to finger mesh**
checkbox. A fit to the generic mesh is not a measurement of the real finger;
check visible/wireframe mode when diagnosing occlusion.

`HandTrackingBehaviour` drives a WebXR-named skinned hand mesh from the same
tracked pose. Set its `handedness` to `"Left"` or `"Right"`. Its `meshThickness`
factor controls pad-to-back thickness (default `1`, e.g. `0.8` for thinner
occlusion), keeping tracked joint positions unchanged. The web demo includes
both generic WebXR meshes (opposite anatomical side for the mirrored selfie
view), visible/wireframe inspection, and a depth-only mode
for ring occlusion. Thickness and the four extra WebXR metacarpals are inferred
from the generic mesh, so the occluder is approximate. Finger bone lengths match
their tracked endpoints. The untracked forearm cuff is shortened to a 4 mm
continuation in model space, without moving the wrist landmark.

The 3D camera distance is estimated from the hand model; a single camera cannot
measure exact physical distance.


### Face Filter with HTML only

See full examples in `/examples/html/`   

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
[Open Example on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter)



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
[Open Example on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-blendshapes?file=src%2Fmain.ts)


# Examples
- [Full project & source on Github](https://github.com/needle-engine/facefilter)
- [Example with Blendshapes on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-blendshapes?file=src%2Fmain.ts)
- [Example with Sunglasses on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-glasses?file=src%2Fmain.ts)
- [Example with Texture Mesh on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter)
- [Example with ShaderToy on Stackblitz](https://stackblitz.com/edit/needle-engine-shadertoy-facefilter)
- [Example without a bundler on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html?file=index.html)
- [Example with HTML only 2D filter on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html-only?file=index.html) ([or github](https://github.com/needle-engine/facefilter/blob/main/package/examples/html/index.html))
- [Example with HTML only 3D filter on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter-html-only-3d?file=index.html) ([or github](https://github.com/needle-engine/facefilter/blob/main/package/examples/html/model.html))
- [Demo Video](https://github.com/user-attachments/assets/51300430-6290-4672-b2aa-f1e870b9e99c)

# Contributing
See [Github](https://github.com/needle-engine/facefilter) for more information

# Package Dependencies

Source files are 75 kB (gzip).  
This package contains files for the Unity integration and are not included in web builds.   


# Contact

<b>[needle](https://needle.tools)</b> •
[Twitter](https://twitter.com/NeedleTools) •
[Forum](https://forum.needle.tools) •
[Youtube](https://www.youtube.com/@needle-tools)

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

To preserve the application's camera, FOV, and clear flags, use
`manager.handProjection = "scene"`. Your application owns camera calibration and
video alignment in this mode. Switching out of image mode restores the previous
camera when it is still owned by this manager.

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


### Upgrading Unity projects from 1.x to 2.x

Update the Unity package `com.needle.face-filter` and the web dependency
`@needle-tools/facefilter` together. Use the matching 2.x prerelease for both;
keep existing 1.x projects on their pinned versions until you migrate them.
The publish helper synchronizes the bundled Unity `package.json` and
`needle-facefilter.npmdef` with the npm release version during `prepublishOnly`.

The manager is now `NeedleTrackingManager`. Its script GUID is unchanged, and
its hand-written partial class has `MovedFrom` metadata for the old
`NeedleFilterTrackingManager` class. Open an existing scene and verify that
its manager and filter references are intact. Update custom C# and TypeScript
references to the new name; replace `getActiveFaceObjects()` with `.faces`.
Re-export existing scenes for the new runtime type registration. Previously
exported web scenes using the old component name must not be paired with the
2.x runtime without migration.


## Hand attachment integration reference

### Coordinate and ownership contract

| Item | Contract |
| --- | --- |
| Hand identity | `getHand("Left")` / `getHand("Right")` returns a persistent handle; check `isTracked` for current availability. |
| Placement | `{ p0, p1, t01 }` interpolates between named joints. Use 0?1 for points inside a segment. The ring demo uses MCP ? PIP at 0.75. |
| Attachment axes | `coordinateSpace: "hand-back"` (default): +Z follows the finger, +Y points outward from the back of the hand. `"finger-pad"` points +Y toward the pad. Offsets and child transforms use the selected frame. |
| Raw joint axes | `getJoint()` retains the low-level pad-facing tracking frame. |
| Asset transform | Set rotation and scale before attaching. `offset` sets local position in anatomical metres. Image projection converts this scale to image units. |
| Pose units | Image-mode joint positions are camera-relative image units, not physical metres. Relative depth supports ordering, not measured camera distance. |
| Autofit | Requires an active `HandTrackingBehaviour` skin for the same hand; only the selected finger segment contributes. |
| Tracking loss | Owned anchors hide automatically and recover on reacquisition. Do not disable the owning tracking component. |
| Cleanup | `handle.dispose()` or `hand.detachFromHand(object)` detaches the asset and releases its private anchors/filter. Disposal is idempotent. |
| Resources | The caller owns asset geometry/materials/textures. Detaching does not dispose shared resources or restore the former parent. Autofit restores its initial position/scale. |
| Reattachment | Attaching an object again disposes its old attachment, including when moving between hands. An old handle cannot detach a new attachment. |

Hand skins read joint poses without adding per-joint objects to the scene.
`getJointRotation(point, quaternion)` reads a camera-local, pad-facing rotation
without creating an anchor; it returns null when tracking is lost. Explicit joints
and attachment anchors are grouped under the manager's `Hand Tracking` camera child.

Use `attachToHand` for owned objects. `getJoint` exposes a shared anchor; treat
that anchor and its placement descriptor as read-only. Attachment descriptors
are retained, so an application's slider can update `t01` directly.

### Diagnostics

- `manager.handTrackingStatus`: video readiness, detector state, error string,
  projection mode, camera ownership, and tracked hand count.
- `hand.trackingDiagnostics`: accepted/predicted/rejected pose state and reason,
  plus raw/rendered arrays for debug recording. Avoid polling these arrays for a status label.
- `handle.status` or `hand.getAttachmentStatus(object)`: attachment ownership,
  tracking, anchor/object visibility flags, and autofit status. Visibility flags
  do not guarantee visible pixels: clipping and occlusion still apply.
- `status.autoFit`: measured/explicit radius, last scale multiplier, state, and
  reason (`no-mesh`, `no-section`, `oversized`, `invalid-geometry`, etc.). Missing
  or rejected sections retain the last valid fit; no geometry is enlarged to match another finger.

Asset loading is separate from tracking. Await the loader and handle rejection
before attaching. A loaded asset may still be waiting for the first tracked hand.

### Example: load, track, inspect, and detach

The repository's `src/ringDemo.ts` is the complete two-hand example, including
asset orientation, loading failures, snapshots, and `dispose()`. For a model
already authored with its opening along Z:

```ts
import { AssetReference } from "@needle-tools/engine";
import type { NeedleTrackingManager } from "@needle-tools/facefilter";

export async function attachRing(manager: NeedleTrackingManager, url: string) {
  const object = await AssetReference.getOrCreateFromUrl(url, manager.context).instantiate();
  if (!object) throw new Error("Ring asset failed to load");
  // Set model rotation and initial metre scale here, before measurement.
  const hand = manager.getHand("Left");
  const handle = hand.attachToHand(object, {
    p0: "ring_finger_mcp", p1: "ring_finger_pip", t01: 0.75,
  }, { autoFit: {}, rotationSmoothing: 0.12 });
  return {
    object,
    get status() { return handle.status; },
    dispose() { handle.dispose(); },
  };
}
```

Call this from your component's async setup; show a loading state while awaiting
it and an error state on rejection. Read `status.tracked` for waiting/tracking
UI. Call `dispose()` when removing the example. If setup completes after your
component was destroyed, dispose the returned attachment immediately.
Configure the manager and add the hand skin explicitly in the owning scene.
This helper does not change face/hand limits or select a camera mode.


### Local Unity package development

When a local npm definition points at this package, disable **Allow Codegen**
(`"allowCodegen": false`). The installed `com.needle.face-filter` package already
supplies the C# components and stable script GUIDs. Regenerating a second set in
Assets can create invalid wrappers for runtime-only classes such as `HandInstance`
and conflict with the supplied components. Remove unreferenced duplicate generated
wrappers from Assets after disabling generation; retain the shipped Unity package.


## Attach an object to a finger in Unity

1. On the scene's **Tracking Manager**, set **Max Hands** to 1 or 2.
2. Add **Needle Engine / Hand Tracking / Hand Attachment** to the object you want to track.
3. Choose **Hand** (default **Any**), **Placement** (finger, palm, or wrist), and a segment for finger placement. **Position Along Segment** runs from the first joint (0) to the next (1). For a ring, start with Ring / Base / 0.75.
4. Rotate and scale the object to fit the hand gizmo. For placement adjustments, attach a parent object and position the model as its child. **Tracking Offset** is available under Optional Overrides.
5. Export and open the browser. Live camera tracking runs in the browser.

The component attaches its own GameObject and finds the scene manager automatically.
Unity authoring uses +Z along the finger and +Y away from the back of the hand.
`HandAttachment` and `attachToHand()` both default to `coordinateSpace: "hand-back"`.
The anchor performs the conversion; authored object rotations are never modified.
Use `"finger-pad"` explicitly for assets authored against the previous pad-facing API.
In Unity this setting is under Optional Overrides.
**Optional Overrides** lets you select another target or manager. Tracking loss hides
the attachment; the manager keeps it registered so it can recover. Explicitly disabling
the component detaches the model and restores its former parent and position.
The adapter never changes face/hand limits or camera settings. In TypeScript,
`HandAttachment.status` reports setup errors and attachment state. To apply changed
runtime settings, call `detach()` followed by `attach()`.

Hand selection:

- **Left / Right:** show only on the selected hand.
- **Any** (default): follow one available hand, keeping it until tracking is lost before switching.
- **Both:** original on the left and a visual clone on the right. Set Max Hands to 2 for simultaneous tracking. The copy shares asset resources; it does not duplicate component scripts.

Hand attachments must not be added to the manager's face **Filters** list. The runtime
excludes hand attachment roots from that list to prevent the face system from moving them.

### Automatic hand mesh

The shared GLBs live in `unity/Runtime/Models/{left,right}.glb` inside the
`@needle-tools/facefilter` npm package. Unity imports them with their `.meta` files;
the browser runtime, standalone example, and web demo load those same assets.
**Unity is not required for browser use.** No copying or symlinks are needed.
For custom loading, `getHandModelUrl("Left" | "Right")` returns the model URL
for a tracking side, including the anatomical-side swap for the mirrored camera.


Add **Hand Mesh Tracking** to an empty object and choose the hand. It uses an existing
WebXR-named skinned mesh if present; otherwise **Use Built-in Hand if Empty** loads the
packaged generic GLB. The built-in model defaults to **Occlusion**, hiding objects
behind the hand. Choose **Visible** or **Wireframe** to inspect it. Custom mesh materials
are preserved. `modelStatus` reports loading, readiness, and errors.

**Mesh Thickness** ranges from 0.1 to 2; 1 is the original thickness. It adjusts
pad-to-back thickness independently of joint positions.

**Hand Occlusion** on Hand Attachment is optional. It shares one implicit occluding
mesh per manager/hand across all requesting attachments, or reuses an enabled explicit
Hand Mesh Tracking component. Toggling the option or disabling/destroying attachments
releases their requests. Only the final release removes an implicit mesh; an explicit
tracker remains caller-owned. If that tracker is removed while requests remain, an
implicit mesh takes over. Any/Both requests cover both hands.

**Autofit Ring to Hand Mesh** is optional. Enable Hand Occlusion to supply its mesh
automatically, or add Hand Mesh Tracking for the same hand. Orient the ring opening along Z.
**Fit Factor** adjusts the measured fit from 0.8 to 1.2 (default 1).
**Advanced Fit Measurements** contains automatic opening measurement (default), an
optional explicit opening radius at the initial model scale, band half width (0?10 mm),
and clearance (0?2 mm). The Unity adapter bounds width and clearance at runtime too.
**Rotation Smoothing** ranges from 0 to 0.5 seconds; 0 disables smoothing.

### Scene preview

With Scene **Gizmos** enabled, the hand preview remains faintly visible when unselected.
Select the component or any child for the stronger preview and placement guides. Hand Attachment displays the packaged hand around the selected
finger/position, aligned to the accessory. Hand Mesh Tracking previews its default
model when empty and shows bone guides for custom meshes. Solid/wireframe rendering
matches the head gizmo. Co-located attachment and hand tracking components share the
attachment-aligned preview, drawn once. These are authored-model placement guides, not live camera
tracking or an estimate of the real person's finger thickness; fitting is applied
in the browser.
