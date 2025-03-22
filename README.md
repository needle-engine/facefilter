# Needle Engine FaceFilter

⚠️ **Note**: This project uses Needle Engine 4.4 alpha and is not production ready.

Add face tracking to your Needle Engine projects with ease.  
This project contains the sourcecode for the facefilter package as well as an example Unity project (see [quickstart](#quickstart) below for how to get started without an editor)

---

Install from [NPM](https://www.npmjs.com/package/@needle-tools/facefilter)

# Features
- Blendshape mesh face tracking
- Texture face tracking with google/mediapipe canonical or procreate texture layouts (Use the `FaceMeshTexture` class)
- Video face tracking: Play a video as a face texture (Use the `FaceMeshVideo` class)
- Custom shader face meshes: Use custom materials on your face mesh (Use the `FaceMeshCustomShader` class)
- Tracking for multiple faces at once (with smoothing)
- *Can be used with Unity to create filters, animations, materials...*



# Demo

https://github.com/user-attachments/assets/d5c95dd9-629f-4abc-b371-14467db0946d



## Quickstart

Install from NPM `npm i @needle-tools/facefilter'` in your Needle Engine web project   

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
- [Example on Needle Cloud with many filters](https://needle-face-filter-examples-z23hmxb18gxoo-latest.needle.run/?)
- [Example with Texture Mesh on Stackblitz](https://stackblitz.com/edit/needle-engine-facefilter)
- [Example with ShaderToy on Stackblitz](https://stackblitz.com/edit/needle-engine-shadertoy-facefilter)


# Contribution

⚠️ TODO


# Contact

<b>[needle — tools for unity](https://needle.tools)</b> •
[@NeedleTools](https://twitter.com/NeedleTools) •
[Forum](https://forum.needle.tools) •
[Youtube](https://www.youtube.com/@needle-tools)
