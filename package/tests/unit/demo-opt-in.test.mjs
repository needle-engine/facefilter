import { strict as assert } from "node:assert";
import { test } from "vitest";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const source = (await readFile(new URL("../../../Unity FaceFilter Example/Needle/WebProject/src/main.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "");
const {code} = await transform(source, {loader: "ts", format: "cjs"});
for (const query of ["", "?facefilter=1", "?ring"]) test(`demo opt-in preserves exported scenes: ${query || "root"}`, async () => {
    let callback, meshes = 0, rings = 0;
    const manager = {maxFaces: 1, maxHands: 0};
    const camera = {nearClipPlane: .1};
    new Function("location", "onStart", "delayForFrames", "NeedleTrackingManager", "addHandMeshes", "addDemoRings", code)(
        {search: query}, cb => callback = cb, async () => {}, {instance: manager},
        async () => { meshes++; }, async () => { rings++; });
    await callback({menu: {showQRCodeButton() {}}, mainCameraComponent: camera});
    assert.equal(manager.maxFaces, query === "?ring" ? 0 : 1);
    assert.equal(manager.maxHands, query === "?ring" ? 2 : 0);
    assert.equal(meshes, query === "?ring" ? 1 : 0);
    assert.equal(rings, query === "?ring" ? 1 : 0);
    assert.equal(camera.nearClipPlane, .1);
});
