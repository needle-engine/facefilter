import { SharedHandMesh } from "../../src/hands/SharedHandMesh.ts";
import { strict as assert } from "node:assert";
import { test } from "vitest";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { Group, Mesh, PerspectiveCamera, OrthographicCamera } from "three";

// Exercise the component's lifecycle without starting the browser-only engine.
// Engine activation follows owner visibility, which must stay true throughout.
const source = (await readFile(new URL("../../src/hands/HandTrackingBehaviour.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?$/gm, "");
const { code } = await transform(source, { loader: "ts", format: "cjs", target: "es2022",
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });

test("hand skin starts, disappears, reacquires, and toggles without disabling its owner", () => {
    const registered = new Set();
    const hand = { addBehaviour: b => registered.add(b), removeBehaviour: b => registered.delete(b) };
    let validPose = true;
    const skin = { enabled: true, bindHand() {}, updateHand: () => validPose };
    const module = { exports: {} };
    new Function("SharedHandMesh", "Behaviour", "serializable", "NeedleTrackingManager", "module", "exports", code)(
        SharedHandMesh,
        class {}, () => () => {}, { instance: { getHand: () => hand } }, module, module.exports);
    const controller = new module.exports.HandTrackingBehaviour();
    const root = new Group();
    const mesh = new Mesh();
    mesh.isSkinnedMesh = true;
    root.add(mesh);
    root.getOrAddComponent = () => skin;
    controller.gameObject = root;
    controller.context = { mainCamera: new PerspectiveCamera() };
    controller.awake();
    assert.equal(root.visible, true, "awake must not deactivate the owner");
    assert.equal(mesh.visible, false);
    controller.onEnable();
    controller.start();
    assert.equal(registered.size, 1);
    controller.onUpdateHandTracking(hand);
    assert.equal(mesh.visible, true);
    controller.onHandTrackingLost();
    assert.equal(mesh.visible, false);
    assert.equal(root.visible, true);
    assert.equal(registered.has(controller), true, "loss must retain the subscription");
    controller.onUpdateHandTracking(hand);
    assert.equal(mesh.visible, true, "tracking must recover");
    validPose = false;
    controller.onUpdateHandTracking(hand);
    assert.equal(mesh.visible, false);
    assert.equal(root.visible, true, "an incomplete first frame must not deadlock tracking");
    controller.onDisable();
    assert.equal(registered.size, 0);
    controller.onEnable();
    validPose = true;
    controller.onUpdateHandTracking(hand);
    assert.equal(mesh.visible, true);
    controller.onDestroy();
    assert.equal(mesh.visible, false);
    assert.equal(registered.size, 0);
});


test("hand detection survives switching to the image camera and reacquires after loss", async () => {
    const managerSource = await readFile(new URL("../../src/TrackingManager.ts", import.meta.url), "utf8");
    const method = managerSource.slice(managerSource.indexOf("    private onHandLandmarkerResultsUpdated("),
        managerSource.indexOf("    private readonly _buttons:"));
    const { code } = await transform(`export class Manager { ${method} }`, { loader: "ts", format: "cjs" });
    class Hand { constructor(manager, side) { this.side = side; this.losses = 0; } remove() { this.losses++; } }
    const module = { exports: {} };
    new Function("HandInstance", "PerspectiveCamera", "module", "exports", code)(Hand, PerspectiveCamera, module, module.exports);
    const manager = new module.exports.Manager();
    manager.context = { mainCamera: new PerspectiveCamera() };
    manager._hands = []; manager._handsBySide = new Map();
    const detection = { landmarks: [[]], handedness: [[{categoryName: "Left"}]] };
    manager.onHandLandmarkerResultsUpdated(detection);
    const hand = manager._hands[0];
    assert.ok(hand);
    manager.context.mainCamera = new OrthographicCamera();
    manager.onHandLandmarkerResultsUpdated(detection);
    assert.equal(manager._hands[0], hand, "image camera must retain the hand that owns the ring");
    assert.equal(hand.losses, 0);
    manager.onHandLandmarkerResultsUpdated(null);
    assert.equal(hand.losses, 1);
    manager.onHandLandmarkerResultsUpdated(detection);
    assert.equal(manager._hands[0], hand, "reacquisition must reuse attachments");
});
