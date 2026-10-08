import { strict as assert } from "node:assert";
import { test } from "vitest";
import { Bone, CylinderGeometry, Float32BufferAttribute, Group, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { HandAttachmentFit } from "../../src/hands/HandAttachmentFit.ts";

function finger(name = "ring-finger-phalanx-proximal") {
    const geometry = new CylinderGeometry(.015, .008, .06, 64, 1, true).rotateX(Math.PI / 2);
    geometry.translate(.003, -.002, 0);
    const count = geometry.attributes.position.count;
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
    const bone = new Bone(); bone.name = name;
    mesh.add(bone); mesh.bind(new Skeleton([bone]));
    return mesh;
}

test("surface fit follows placement along a tapered finger and excludes neighboring fingers", () => {
    const root = new Group(), anchor = new Group(), ring = new Group();
    root.add(anchor); anchor.add(ring); ring.scale.setScalar(2);
    const mesh = finger(), neighbor = finger("middle-finger-phalanx-proximal");
    neighbor.position.x = .08; root.add(mesh, neighbor);
    const options = { enabled: true, smoothing: 0, innerRadius: .01, clearance: .0005 };
    const fit = new HandAttachmentFit(ring, options, "ring-finger");
    for (const z of [-.015, .015]) {
        anchor.position.z = z; root.updateMatrixWorld(true);
        fit.update([mesh, neighbor]);
        const radius = .008 + (.015 - .008) * (z + .03) / .06;
        assert.ok(Math.abs(ring.scale.x / 2 - (radius + .0005) / .01) < 1e-6);
        assert.ok(ring.position.distanceTo(new Vector3(.003, -.002, 0)) < 1e-6);
    }
    const scale = ring.scale.clone(), position = ring.position.clone();
    root.rotation.set(.4, -.8, .6); root.position.set(1, 2, 3); root.updateMatrixWorld(true);
    fit.update([mesh, neighbor]);
    assert.ok(ring.scale.distanceTo(scale) < 1e-6, "fit must be invariant under hand rotation");
    assert.ok(ring.position.distanceTo(position) < 1e-6);
    fit.update([]);
    assert.ok(ring.scale.distanceTo(scale) < 1e-6, "missing mesh retains last valid fit");
    options.enabled = false; fit.update([mesh]);
    assert.deepEqual(ring.scale.toArray(), [2, 2, 2]);
    assert.deepEqual(ring.position.toArray(), [0, 0, 0]);
});

test("band width includes wider sections and fitting never compounds its previous scale", () => {
    const root = new Group(), anchor = new Group(), ring = new Group(), mesh = finger();
    root.add(anchor, mesh); anchor.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, { innerRadius: .01, halfWidth: .003, clearance: 0 }, "ring-finger");
    for (let i = 0; i < 5; i++) fit.update([mesh]);
    const radius = .008 + .007 * .033 / .06;
    assert.ok(Math.abs(ring.scale.x - radius / .01) < 1e-6);
});


test("curled sections of the same finger cannot enlarge the local ring fit", () => {
    const root = new Group(), anchor = new Group(), ring = new Group();
    const base = finger(), foldedTip = finger("ring-finger-phalanx-distal");
    foldedTip.position.x = .05;
    root.add(anchor, base, foldedTip); anchor.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, { innerRadius: .01 }, "ring-finger");
    fit.update([base]); const expectedScale = ring.scale.clone(), expectedPosition = ring.position.clone();
    fit.update([base, foldedTip]);
    assert.ok(ring.scale.distanceTo(expectedScale) < 1e-6);
    assert.ok(ring.position.distanceTo(expectedPosition) < 1e-6);
    // Open or missing local contours must not pull the ring toward the tip.
    fit.update([foldedTip]);
    assert.ok(ring.scale.distanceTo(expectedScale) < 1e-6);
    assert.ok(ring.position.distanceTo(expectedPosition) < 1e-6);
});

test("oversized sections retain the last valid fit", () => {
    const root = new Group(), anchor = new Group(), ring = new Group(), mesh = finger();
    root.add(anchor, mesh); anchor.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, { innerRadius: .01 }, "ring-finger");
    fit.update([mesh]); const before = ring.scale.clone();
    mesh.scale.set(4, 4, 1); root.updateMatrixWorld(true); fit.update([mesh]);
    assert.ok(ring.scale.distanceTo(before) < 1e-6);
});


test("autofit is restricted to the attached segment even if a distal contour encloses its axis", () => {
    const root = new Group(), anchor = new Group(), ring = new Group();
    const base = finger(), distal = finger("ring-finger-phalanx-distal");
    distal.scale.set(.7, .7, 1);
    root.add(anchor, base, distal); anchor.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, { innerRadius: .01, smoothing: 0 }, "ring-finger");
    fit.update([base]); const before = ring.scale.clone();
    fit.update([base, distal]);
    assert.ok(ring.scale.distanceTo(before) < 1e-6);
    fit.update([distal]);
    assert.ok(ring.scale.distanceTo(before) < 1e-6);
});

test("small frame-to-frame fit changes are damped and converge to the measured size", () => {
    const root = new Group(), anchor = new Group(), ring = new Group(), mesh = finger();
    root.add(anchor, mesh); anchor.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, { innerRadius: .01, clearance: 0 }, "ring-finger");
    fit.update([mesh]); const first = ring.scale.x;
    mesh.scale.set(1.05, 1.05, 1); root.updateMatrixWorld(true);
    fit.update([mesh]);
    assert.ok(ring.scale.x > first && ring.scale.x < first * 1.02);
    for (let i = 0; i < 60; i++) fit.update([mesh]);
    assert.ok(Math.abs(ring.scale.x / first - 1.05) < 1e-5);
});

test("rotation lag cannot enlarge the fitted finger cross-section", () => {
    const root = new Group(), measured = new Group(), rendered = new Group(), ring = new Group(), mesh = finger();
    root.add(measured, rendered, mesh); rendered.add(ring); root.updateMatrixWorld(true);
    const fit = new HandAttachmentFit(ring, {innerRadius:.01,clearance:0,smoothing:0}, "ring-finger", "phalanx-proximal", measured);
    fit.update([mesh]);
    const scale = ring.scale.clone(), center = ring.getWorldPosition(new Vector3());
    for (const tilt of [.2, .5, .8, 1.1]) {
        rendered.rotation.set(tilt, .2, -.3); root.updateMatrixWorld(true);
        fit.update([mesh]); root.updateMatrixWorld(true);
        assert.ok(ring.scale.distanceTo(scale) < 1e-6, "rotating the rendered ring must not resize the measured finger");
        assert.ok(ring.getWorldPosition(new Vector3()).distanceTo(center) < 1e-6, "fit center must stay on the measured finger");
    }
    // Once the rotation catches up, the fitted size stays unchanged.
    rendered.rotation.set(0,0,0); root.updateMatrixWorld(true); fit.update([mesh]);
    assert.ok(ring.scale.distanceTo(scale) < 1e-6);
});
