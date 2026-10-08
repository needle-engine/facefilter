import { strict as assert } from "node:assert";
import { test } from "vitest";
import { HandCameraCalibration } from "../../src/hands/HandCameraCalibration.ts";

const world = Array.from({length:21}, (_,i) => ({x:((i%4)-1.5)*.023, y:(Math.floor(i/4)-2.5)*.027, z:Math.sin(i*1.7)*.027}));
function project(points, fov, depth, aspect=4/3, tilt=.25) {
    const focal=.5/Math.tan(fov*Math.PI/360);
    return points.map(p=>{
        const x=p.x*Math.cos(tilt)+p.z*Math.sin(tilt)+.015;
        const z=-p.x*Math.sin(tilt)+p.z*Math.cos(tilt)+depth;
        return {x:.5+focal*x/z/aspect,y:.5+focal*(p.y-.02)/z,z:123};
    });
}
for(const fov of [35,63,85]) test(`estimates a ${fov} degree camera from changing poses and distances`,()=>{
    const filter=new HandCameraCalibration();
    for(let i=0;i<30;i++) filter.update(project(world,fov,.4+i*.002,4/3,.2+i*.01),world,4/3,i*.25);
    assert.equal(filter.status.state,"estimated");
    assert.ok(Math.abs(filter.status.verticalFov-fov)<=5, JSON.stringify(filter.status));
    const locked=filter.status.verticalFov;
    filter.update(project(world,110,.2),world,4/3,30);
    assert.equal(filter.status.verticalFov,locked,"later tracking errors must not move a locked camera");
    filter.reset(); assert.equal(filter.status.verticalFov,null);
});
test("portrait camera estimates vertical FOV without using landmark Z",()=>{
    const filter=new HandCameraCalibration();
    for(let i=0;i<30;i++) filter.update(project(world,50,.32,9/16,.2+i*.01),world,9/16,i*.25);
    assert.equal(filter.status.verticalFov,50);
});
test("front-facing planar points cannot distinguish focal length from distance",()=>{
    const flat=world.map(p=>({...p,z:0})),filter=new HandCameraCalibration();
    for(let i=0;i<30;i++) filter.update(project(flat,63,.35,4/3,0),flat,4/3,i*.25);
    assert.equal(filter.status.verticalFov,null);
});
test("repeated frames, invalid data and inconsistent cameras do not calibrate",()=>{
    const filter=new HandCameraCalibration();
    for(let i=0;i<30;i++) filter.update(project(world,50,.3),world,4/3,0);
    assert.ok(filter.status.acceptedSamples<=1);
    filter.reset();
    for(let i=0;i<40;i++) filter.update(project(world,i%2?45:75,.35),world,4/3,i*.25);
    assert.equal(filter.status.verticalFov,null);
    filter.update([],world,4/3,15);
    filter.update(project(world,50,.3).map(p=>({...p,x:NaN})),world,4/3,16);
    assert.equal(filter.status.verticalFov,null);
});
