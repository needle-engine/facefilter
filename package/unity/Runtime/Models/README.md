# Generic WebXR hand models

These are shared library assets, included in the `@needle-tools/facefilter` npm
package. Unity imports this directory and its `.meta` files; browser tracking,
the standalone HTML example, and the web demo use the same GLBs through
`getHandModelUrl()`. Browser projects do not need Unity installed. Keep one copy
here; no demo copies or symlinks are required.

Copied unchanged from `@webxr-input-profiles/assets@1.0.20`, `dist/profiles/generic-hand/{left,right}.glb`.
These are the same generic hand profile models loaded by Needle Engine's `XRHandMeshModel`.

Source: https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/
License: MIT, copyright (c) 2019 Amazon. See LICENSE.md.

MediaPipe measures 21 landmarks; WebXR has 25 joints. The wrist and four extra metacarpals share a palm deformation fitted from bind pose to the tracked wrist, index knuckle, and pinky knuckle. This preserves their skin continuity while adapting palm proportions. Finger thickness comes from the generic mesh, not a measured hand surface.

The selfie camera reflects image X. The demo consequently pairs the Left tracking handle with the right WebXR mesh and vice versa. Using matching names reverses the palm metacarpal ordering and folds the skin across the palm.

Thumb skin retains its authored roll transported with the palm, then swings and scales along the tracked thumb segments. It does not inherit the diagnostic finger markers' palm-facing roll.
