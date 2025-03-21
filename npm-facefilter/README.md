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

Run `npm i @needle-tools/facefilter'` in your web project   

Then see the code or examples below:

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

# Examples
- [Example on github with Unity project](https://github.com/needle-engine/facefilter)
- [Example on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter)


# Contribution
See [github](https://github.com/needle-engine/facefilter) for more information


# Contact

<b>[needle — tools for unity](https://needle.tools)</b> •
[@NeedleTools](https://twitter.com/NeedleTools) •
[Forum](https://forum.needle.tools) •
[Youtube](https://www.youtube.com/@needle-tools)
