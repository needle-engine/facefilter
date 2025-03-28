# Needle Engine FaceFilter

Add face tracking to your Needle Engine projects with ease.


# Features
- Blendshape mesh face tracking
- Texture face tracking with google/mediapipe canonical or procreate texture layouts (Use the `FaceMeshTexture` class)
- Video face tracking: Play a video as a face texture (Use the `FaceMeshVideo` class)
- Custom shader face meshes: Use custom materials on your face mesh (Use the `FaceMeshCustomShader` class)
- Tracking for multiple faces at once (with smoothing)
- *Can be used with Unity to create filters, animations, materials...*


## Quickstart

Run `npm i @needle-tools/facefilter` in your web project   

Then see the code or examples below:


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
import { FaceMeshTexture, NeedleFaceFilterTrackingManager } from '@needle-tools/facefilter';

onStart(context => {
  const scene = context.scene;

  // Create a face filter tracking manager and add it to the scene
  const filtermanager = new NeedleFaceFilterTrackingManager();
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
import { FaceMeshTexture, NeedleFaceFilterTrackingManager } from '@needle-tools/facefilter';

onStart(context => {
  const scene = context.scene;

  // Create a face filter tracking manager and add it to the scene
  const filtermanager = new NeedleFaceFilterTrackingManager();
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
