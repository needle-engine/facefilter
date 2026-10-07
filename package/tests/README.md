# Hand tracking tests

Use Node.js 24. From the `package` directory, run `npm ci` and `npm test`.
The unit suite covers projection, orientation, scale, and recorded-pose regressions without a camera.

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
