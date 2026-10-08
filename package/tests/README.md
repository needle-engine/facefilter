# Face-filter tests

Use Node.js 24. From the `package` directory, run `npm ci` and `npm test`.
The Vitest suite covers face registration and placement, hand projection, orientation,
scale, attachment ownership, and recorded-pose regressions without a camera.

```sh
npm test                         # Run once (CI)
npm run test:watch               # Watch during development
npm test -- face-placement      # Select a test file
npm test -- -t "opening"          # Select test names
```

The Node environment needs no browser or Unity. Runtime tests execute the production
manager and components with browser/ML host services stubbed. They do not run MediaPipe
inference or verify camera-image alignment.

Replay a debug capture with:

```sh
node --experimental-strip-types tests/replay-hand-frame.mjs "path/to/capture.json"
```

Add `--json` for machine-readable per-frame results. Both single frames and sequences are supported.
See the [repository guide](../../README.md#debug-hand-tracking) for capture controls.
Fixtures in `fixtures/hand-poses.json` contain landmarks only.

The `vite` folder is a separate development integration project using local package paths.

## Headless release smoke test

Run `npm run test:release` from `package` after `npm ci` (Node.js 24).
It checks Unity/npm version alignment, the manager's preserved script GUID and
migration metadata, Unity GUID uniqueness, TypeScript release compilation,
browser bundling, and npm tarball contents. It uses a temporary staging folder
and prints the resulting tarball path. It does not publish or run publish hooks.

This is a packaging and source-contract check. It does not execute Unity's
serializer, C# compiler, APIUpdater, scene export, or graphics rendering.
Those checks still need a Unity editor smoke test.
