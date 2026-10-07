import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Vector3, OrthographicCamera, Quaternion, Matrix4 } from "three";
import { projectImageHandLandmark, cameraPalmNormal, measurePalmSize } from "../../src/hands/HandPose.ts";
import { buildFingerBasis } from "../../src/hands/FingerPose.ts";
import { HandPoseStabilizer } from "../../src/hands/HandPoseStabilizer.ts";
import { HandLandmarkFilter } from "../../src/hands/HandLandmarkFilter.ts";
const base=Array.from({length:21},(_,i)=>({x:.4+(i%4)*.03,y:.7-Math.floor(i/4)*.08,z:-i*.004}));
base[0]={x:.5,y:.85,z:0};base[5]={x:.39,y:.6,z:-.04};base[9]={x:.47,y:.58,z:-.05};base[13]={x:.55,y:.61,z:-.04};base[14]={x:.56,y:.49,z:-.065};base[17]={x:.62,y:.66,z:-.03};
const points=(image,aspect,mirrored=true)=>image.map(p=>projectImageHandLandmark(p,[0,5,9,13,17].reduce((s,i)=>s+image[i].z,0)/5,aspect,mirrored,new Vector3()));
const rotation=pts=>{
    const normal=cameraPalmNormal(pts,"Left",new Vector3()).normalize();
    const forward=pts[14].clone().sub(pts[13]).normalize(),right=new Vector3(),up=new Vector3();
    buildFingerBasis(forward,pts[5].clone().sub(pts[17]),normal,forward,right,up,pts[9].clone().sub(pts[0]).normalize());
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right,up,forward));
};
test("hand growth and translation do not introduce finger tilt or roll",()=>{
    const reference=rotation(points(base,4/3));
    for(const scale of [.5,1,2,3]) {
        const image=base.map(p=>({x:.65+(p.x-.5)*scale,y:.65+(p.y-.65)*scale,z:p.z*scale+.02}));
        const actual=rotation(points(image,4/3));
        assert.ok(actual.angleTo(reference)<1e-7);
    }
});
test("image landmarks and attached ring size align in portrait/landscape viewports",()=>{
    for(const aspect of [4/3,9/16])for(const viewport of [2,9/16])for(const mirror of [false,true]) {
        const camera=new OrthographicCamera(-viewport/2,viewport/2,.5,-.5,.001,10);
        const ps=points(base,aspect,mirror);
        ps.forEach((p,i)=>{
            const screen=p.clone().project(camera);
            assert.ok(Math.abs(screen.x-(base[i].x-.5)*2*aspect/viewport*(mirror?-1:1))<1e-8);
            assert.ok(Math.abs(screen.y-(.5-base[i].y)*2)<1e-8);
        });
        const physicalPalm=.07, scale=measurePalmSize(ps)/physicalPalm;
        const ringWidth=2*.01*scale;
        const closer=base.map(p=>({x:.5+(p.x-.5)*2,y:.5+(p.y-.5)*2,z:p.z*2}));
        assert.ok(Math.abs((2*.01*measurePalmSize(points(closer,aspect,mirror))/physicalPalm)/ringWidth-2)<1e-8);
    }
});
test("relative depth remains available for occlusion without changing projected size",()=>{
    const camera=new OrthographicCamera(-.7,.7,.5,-.5,.001,10);
    const a=projectImageHandLandmark({x:.6,y:.4,z:-.1},0,4/3,true,new Vector3());
    const b=projectImageHandLandmark({x:.6,y:.4,z:.1},0,4/3,true,new Vector3());
    assert.ok(a.z>b.z,"nearer landmark must remain nearer");
    const pa=a.project(camera),pb=b.project(camera);
    assert.equal(pa.x,pb.x);assert.equal(pa.y,pb.y);assert.ok(pa.z<pb.z);
});
test("normalized pose filtering tolerates a far-to-close image scale change",()=>{
    const filter=new HandLandmarkFilter(),stabilizer=new HandPoseStabilizer();let measured=0;
    for(let i=0;i<180;i++) {
        const scale=1+i/180*2;
        const image=base.map(p=>({x:.5+(p.x-.5)*scale,y:.65+(p.y-.65)*scale,z:p.z*scale}));
        const raw=points(image,4/3),renderScale=measurePalmSize(raw)/.07;
        raw.forEach(p=>p.multiplyScalar(1/renderScale));
        if(stabilizer.update(raw,i/60)) {
            const filtered=filter.update(stabilizer.output,i/60,{minCutoff:1,beta:25,derivativeCutoff:1});
            assert.ok(filtered.every(p=>p.toArray().every(Number.isFinite)));
            if(stabilizer.state==="measured")measured++;
        }
    }
    assert.ok(measured>170,`${measured}/180 frames accepted`);
});
