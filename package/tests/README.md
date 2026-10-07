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
