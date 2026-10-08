# Hand attachment without Unity

A standalone HTML page with a small inline JavaScript module. It creates the
Needle Engine scene in code, attaches a cube to either ring finger, and requests
shared hand occlusion. No Unity scene, exported GLB scene, or copied hand assets
are needed. Vite handles npm imports and the library's packaged model URLs.

## Run from this repository

```sh
cd examples/hand-tracking
npm install
npm run dev
```

Open the HTTPS URL printed by Vite, accept the local development certificate,
and allow camera access. For a phone, use the network URL on the same Wi-Fi.
Camera access requires HTTPS (or localhost). Don't open the HTML as a file URL.
MediaPipe downloads its tracking assets, so the first run needs internet access.

`npm run build` creates a deployable `dist/` folder. Serve it over HTTPS.

## Use in a separate project

Copy this folder and replace the `file:../../package` dependency with
`@needle-tools/facefilter@next` (a 2.x release containing `HandAttachment`).
Then run `npm install`. Keep Needle Engine and Three.js on compatible versions.

All scene code is in `index.html`:

- Change `handedness` to `Left`, `Right`, `Any`, or `Both`.
- Change `finger`, `segment` (0?2), or `position` (0?1).
- Replace the cube with your model; author its offset as a child transform.
- `hand-back` means +Z along the finger and +Y outward from the back of the hand.
- `handOcclusion` loads the shared models from the Facefilter npm package.
  Their `unity/Runtime/Models` folder name does not require Unity to be installed.

This uses the same public API as Unity's Hand Attachment component.
