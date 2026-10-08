import {test} from "vitest";
import {strict as assert} from "node:assert";
import {BoxGeometry, Group, Mesh, TorusGeometry} from "three";
import {measureRingOpening} from "../../src/hands/RingOpening.ts";
import {HandAttachmentFit} from "../../src/hands/HandAttachmentFit.ts";

test("opening measurement ignores ornament bounds and preserves the asset", () => {
    const ring = new Group();
    const band = new Mesh(new TorusGeometry(1,.12,16,96));
    band.position.set(.3,-.2,.1); ring.add(band);
    const gem = new Mesh(new BoxGeometry(.35,.7,.25));gem.position.set(.3,1,.1);ring.add(gem);
    ring.scale.setScalar(.01);ring.rotation.z=.4;ring.position.set(9,8,7);
    const position=ring.position.clone();
    const result=measureRingOpening(ring);
    assert.ok(result);assert.ok(Math.abs(result.innerRadius-.0088)<.00008);
    const expected=band.position.clone().multiplyScalar(.01).applyQuaternion(ring.quaternion);
    assert.ok(result.center.distanceTo(expected)<.0001);
    assert.deepEqual(ring.position,position);
    const fit=new HandAttachmentFit(ring,{enabled:true},"ring-finger");
    assert.equal(fit.status.source,"measured");assert.ok(fit.status.innerRadius>0);
    new Group().add(ring);fit.update([]);assert.equal(fit.status.reason,"no-mesh");
});
test("measurement rejects solid geometry, wrong axis, and competing openings", () => {
    assert.equal(measureRingOpening(new Mesh(new BoxGeometry(2,2,2))),null);
    const wrong=new Mesh(new TorusGeometry(1,.12,16,64));wrong.rotation.x=Math.PI/2;
    assert.equal(measureRingOpening(wrong),null);
    const ambiguous=new Group();
    for(const x of [-2,2]){ const ring=new Mesh(new TorusGeometry(1,.12,16,64));ring.position.x=x;ambiguous.add(ring); }
    assert.equal(measureRingOpening(ambiguous),null);
    const fit=new HandAttachmentFit(new Mesh(new BoxGeometry()),{},"ring-finger");
    fit.update([]);assert.equal(fit.status.reason,"invalid-geometry");
});
