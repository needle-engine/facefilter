import { Bone, Matrix4, Quaternion, SkinnedMesh, Vector3 } from "three";

// WebXR has four extra metacarpals. The remaining 21 origins map directly.
export const XR_HAND_JOINTS = [
    { name: "wrist", index: 0, from: "wrist", to: "middle_finger_mcp" },
    ...["thumb", "index-finger", "middle-finger", "ring-finger", "pinky-finger"].flatMap((finger, f) => {
        const base = 1 + f * 4;
        const prefix = ["thumb", "index_finger", "middle_finger", "ring_finger", "pinky"][f];
        const names = f === 0 ? ["cmc", "mcp", "ip", "tip"] : ["mcp", "pip", "dip", "tip"];
        const bones = f === 0 ? ["metacarpal", "phalanx-proximal", "phalanx-distal", "tip"]
            : ["phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"];
        const joints = bones.map((bone, i) => ({ name: `${finger}-${bone}`, index: base + i,
            from: `${prefix}_${names[Math.min(i, 2)]}`, to: `${prefix}_${names[Math.min(i + 1, 3)]}` }));
        if (f > 0) joints.unshift({ name: `${finger}-metacarpal`, index: -1,
            from: "wrist", to: `${prefix}_mcp` });
        return joints;
    }),
];

const xrAxes = new Quaternion(1, 0, 0, 0); // +Y/+Z anchors -> WebXR -Y/-Z.
const palmPairs = [[0, 5], [0, 9], [0, 17], [5, 9], [9, 17], [5, 17]];
function palmSize(points: readonly Vector3[]): number {
    return Math.sqrt(palmPairs.reduce((sum, [a, b]) => sum + points[a].distanceToSquared(points[b]), 0) / palmPairs.length);
}

/** Retarget a WebXR-named skin to camera-local landmark positions and anchor rotations. */
export class HandSkeleton {
    private readonly entries: { bone: Bone; spec: typeof XR_HAND_JOINTS[number]; bind: Matrix4; end: Vector3 | null; endIndex: number; depth: number }[];
    private readonly restPalmSize: number;
    private readonly points = Array.from({ length: 21 }, () => new Vector3());
    private readonly matrix = new Matrix4();
    private readonly inverseParent = new Matrix4();
    private readonly position = new Vector3();
    private readonly rotation = new Quaternion();
    private readonly restPalmInverse: Matrix4;
    private readonly palmDeformation = new Matrix4();
    private readonly palmX = new Vector3();
    private readonly palmY = new Vector3();
    private readonly palmZ = new Vector3();
    private readonly scale = new Vector3();
    private readonly thicknessMatrix = new Matrix4();
    private readonly thumbSource = new Vector3();
    private readonly thumbTarget = new Vector3();
    private readonly thumbSwing = new Quaternion();
    private readonly thumbMatrix = new Matrix4();

    constructor(mesh: SkinnedMesh, wristExtension?: number, fitTipSurface = false) {
        // Inverse bind matrices describe the authored rest pose, independent of
        // current node transforms or a previously animated frame.
        const rest = new Map<string, Matrix4>();
        mesh.skeleton.bones.forEach((bone, i) => rest.set(bone.userData?.name || bone.name,
            mesh.skeleton.boneInverses[i].clone().invert()));
        if (fitTipSurface) {
            // WebXR tip joints lie inside the fingertip cap. MediaPipe's tip
            // landmark is on its end surface. Rebase only the tip bind origins
            // to that surface, keeping the authored geometry and weights.
            mesh.skeleton.boneInverses = mesh.skeleton.boneInverses.map(m => m.clone());
            const geometry = mesh.geometry;
            const vertex = new Vector3(), axis = new Vector3(), origin = new Vector3();
            for (const finger of ["thumb", "index-finger", "middle-finger", "ring-finger", "pinky-finger"]) {
                const tip = rest.get(`${finger}-tip`), distal = rest.get(`${finger}-phalanx-distal`);
                if (!tip || !distal) continue;
                origin.setFromMatrixPosition(tip);
                axis.setFromMatrixPosition(distal).sub(origin).negate().normalize();
                let extension = 0;
                for (let i = 0; i < geometry.attributes.position.count; i++) {
                    let weight = 0;
                    for (let c = 0; c < 4; c++) {
                        const bone = mesh.skeleton.bones[geometry.attributes.skinIndex.getComponent(i, c)];
                        if ((bone.userData?.name || bone.name).startsWith(finger + "-"))
                            weight += geometry.attributes.skinWeight.getComponent(i, c);
                    }
                    if (weight < .5) continue;
                    vertex.fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(mesh.bindMatrix).sub(origin);
                    extension = Math.max(extension, vertex.dot(axis));
                }
                tip.setPosition(origin.addScaledVector(axis, extension));
                const index = mesh.skeleton.bones.findIndex(b => (b.userData?.name || b.name) === `${finger}-tip`);
                mesh.skeleton.boneInverses[index].copy(tip).invert();
            }
        }
        const wrist = rest.get("wrist");
        if (!wrist) throw new Error("Hand mesh is missing the WebXR wrist bone.");
        const restPoints = Array.from({ length: 21 }, () => new Vector3());
        this.entries = XR_HAND_JOINTS.map(spec => {
            const bone = mesh.skeleton.bones.find(b => (b.userData?.name || b.name) === spec.name);
            const bind = rest.get(spec.name);
            if (!bone || !bind) throw new Error(`Hand mesh is missing ${spec.name}.`);
            const position = new Vector3().setFromMatrixPosition(bind);
            if (spec.index >= 0) restPoints[spec.index].copy(position);
            let depth = 0;
            for (let parent = bone.parent; parent; parent = parent.parent) depth++;
            const nextIndex = spec.index < 0
                ? 5 + ["index-finger", "middle-finger", "ring-finger", "pinky-finger"].findIndex(prefix => spec.name.startsWith(prefix)) * 4
                : spec.index >= 1 ? (spec.index % 4 === 0 ? -1 : spec.index + 1) : -1;
            const nextSpec = XR_HAND_JOINTS.find(s => s.index === nextIndex);
            const nextBind = nextSpec ? rest.get(nextSpec.name) : undefined;
            // Tip inherits the distal segment direction.
            const end = spec.index === 4
                ? new Vector3().setFromMatrixPosition(bind).multiplyScalar(2).sub(new Vector3().setFromMatrixPosition(rest.get("thumb-phalanx-distal")!))
                : nextBind ? new Vector3().setFromMatrixPosition(nextBind) : null;
            return { bone, spec, bind, end, endIndex: nextIndex, depth };
        }).sort((a, b) => a.depth - b.depth);
        this.restPalmSize = palmSize(restPoints);
        if (this.restPalmSize < 1e-6) throw new Error("Hand mesh has a degenerate palm bind pose.");
        this.restPalmInverse = this.palmFrame(restPoints, new Matrix4()).invert();
        if (wristExtension !== undefined && Number.isFinite(wristExtension)) {
            // The WebXR asset includes a forearm cuff, but MediaPipe supplies
            // no forearm joints. Keep only a short continuation past the wrist.
            // Edit a private geometry copy; preserve all skin weights and bones.
            mesh.geometry = mesh.geometry.clone();
            const positions = mesh.geometry.attributes.position;
            const origin = restPoints[0];
            const forward = restPoints[9].clone().sub(origin).normalize();
            const vertex = new Vector3();
            let extent = 0;
            for (let i = 0; i < positions.count; i++) {
                vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.bindMatrix).sub(origin);
                extent = Math.max(extent, -vertex.dot(forward));
            }
            const factor = extent > 0 ? Math.min(1, Math.max(.0001, wristExtension) / extent) : 1;
            const inverseBind = mesh.bindMatrix.clone().invert();
            for (let i = 0; i < positions.count; i++) {
                vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.bindMatrix);
                const distance = vertex.clone().sub(origin).dot(forward);
                if (distance < 0) vertex.addScaledVector(forward, distance * (factor - 1));
                vertex.applyMatrix4(inverseBind);
                positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
            positions.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
            mesh.geometry.computeBoundingBox();
            mesh.geometry.computeBoundingSphere();
        }
        mesh.frustumCulled = false;
    }

    private palmFrame(points: readonly Vector3[], target: Matrix4): Matrix4 {
        this.palmX.subVectors(points[5], points[0]);
        this.palmY.subVectors(points[17], points[0]);
        this.palmZ.crossVectors(this.palmX, this.palmY);
        // Match the measured palm plane; infer thickness from its area scale.
        const area = this.palmZ.length();
        if (area > 1e-12) this.palmZ.multiplyScalar(1 / Math.sqrt(area));
        return target.makeBasis(this.palmX, this.palmY, this.palmZ).setPosition(points[0]);
    }

    update(getPosition: (index: number, target: Vector3) => Vector3 | null,
        getRotation: (name: string) => Quaternion | undefined, cameraWorld: Matrix4, thickness = 1): boolean {
        const thicknessFactor = Number.isFinite(thickness) ? Math.max(.25, Math.min(2, thickness)) : 1;
        this.thicknessMatrix.makeScale(1, thicknessFactor, 1);
        for (let i = 0; i < 21; i++) {
            if (!getPosition(i, this.points[i]) || !this.points[i].toArray().every(Number.isFinite)) return false;
        }
        const wrist = getRotation("wrist");
        if (!wrist) return false;
        const size = palmSize(this.points) / this.restPalmSize;
        if (!Number.isFinite(size) || size < 1e-6) return false;
        this.palmFrame(this.points, this.palmDeformation);
        if (Math.abs(this.palmDeformation.determinant()) < 1e-12) return false;
        this.palmDeformation.multiply(this.restPalmInverse);
        this.scale.setScalar(size);
        for (const { bone, spec, bind, end, endIndex } of this.entries) {
            if (spec.index === 0) {
                // Palm skin weights span the wrist and metacarpals. Give them
                // ONE coherent deformation, fitted to the wrist and knuckles,
                // instead of independently pointing each at a different MCP.
                this.matrix.copy(this.palmDeformation).multiply(bind).premultiply(cameraWorld);
            }
            else if ((spec.index < 0 || spec.index <= 4) && end) {
                // Carry the authored roll through the palm fit. Metacarpals
                // must reach their own measured MCP, including middle/ring;
                // thumbs retain their anatomical roll while following joints.
                this.matrix.copy(this.palmDeformation).multiply(bind);
                this.position.setFromMatrixPosition(this.matrix);
                this.thumbSource.copy(end).applyMatrix4(this.palmDeformation).sub(this.position);
                if (spec.index < 0) this.thumbTarget.subVectors(this.points[endIndex], this.position);
                else {
                    const start = spec.index === 4 ? 3 : spec.index;
                    const finish = spec.index === 4 ? 4 : spec.index + 1;
                    this.thumbTarget.subVectors(this.points[finish], this.points[start]);
                }
                const sourceLength = this.thumbSource.length();
                const targetLength = this.thumbTarget.length();
                if (sourceLength < 1e-8 || targetLength < 1e-8) return false;
                this.thumbSwing.setFromUnitVectors(this.thumbSource.divideScalar(sourceLength), this.thumbTarget.divideScalar(targetLength));
                this.matrix.setPosition(0, 0, 0);
                // Stretch along the actual bind segment, which need not lie
                // exactly on the bone's local Z axis. Keep its cross section.
                const u = this.thumbSource, k = targetLength / sourceLength - 1;
                this.thumbMatrix.set(1+k*u.x*u.x, k*u.x*u.y, k*u.x*u.z, 0,
                    k*u.y*u.x, 1+k*u.y*u.y, k*u.y*u.z, 0,
                    k*u.z*u.x, k*u.z*u.y, 1+k*u.z*u.z, 0, 0, 0, 0, 1);
                this.matrix.premultiply(this.thumbMatrix);
                this.thumbMatrix.makeRotationFromQuaternion(this.thumbSwing);
                this.matrix.premultiply(this.thumbMatrix);
                this.matrix.setPosition(spec.index < 0 ? this.position : this.points[spec.index]).premultiply(cameraWorld);
            }
            else {
                const orientation = getRotation(spec.name);
                if (!orientation) return false;
                this.rotation.copy(orientation).multiply(xrAxes);
                this.position.copy(this.points[spec.index]);
                this.matrix.compose(this.position, this.rotation, this.scale);
                if (end && endIndex >= 0) {
                    // A palm-wide uniform scale does not fit individual finger
                    // lengths. Match BOTH ends so blended skin at the knuckles
                    // does not get pulled toward a different implied joint.
                    this.thumbMatrix.copy(bind).invert();
                    this.thumbSource.copy(end).applyMatrix4(this.thumbMatrix).applyMatrix4(this.matrix).sub(this.position);
                    this.thumbTarget.subVectors(this.points[endIndex], this.position);
                    const sourceLength = this.thumbSource.length(), targetLength = this.thumbTarget.length();
                    if (sourceLength < 1e-8 || targetLength < 1e-8) return false;
                    this.thumbSwing.setFromUnitVectors(this.thumbSource.divideScalar(sourceLength), this.thumbTarget.divideScalar(targetLength));
                    const u = this.thumbSource, k = targetLength / sourceLength - 1;
                    this.thumbMatrix.set(1+k*u.x*u.x, k*u.x*u.y, k*u.x*u.z, 0,
                        k*u.y*u.x, 1+k*u.y*u.y, k*u.y*u.z, 0,
                        k*u.z*u.x, k*u.z*u.y, 1+k*u.z*u.z, 0, 0, 0, 0, 1);
                    this.matrix.setPosition(0, 0, 0).premultiply(this.thumbMatrix);
                    this.thumbMatrix.makeRotationFromQuaternion(this.thumbSwing);
                    this.matrix.premultiply(this.thumbMatrix).setPosition(this.position);
                }
                this.matrix.premultiply(cameraWorld);
            }
            // Reduce pad-to-back thickness around each bone origin.
            // Joint positions and finger lengths are unchanged.
            this.matrix.multiply(this.thicknessMatrix);
            if (bone.parent) {
                bone.parent.updateWorldMatrix(true, false);
                this.inverseParent.copy(bone.parent.matrixWorld).invert();
                this.matrix.premultiply(this.inverseParent);
            }
            this.matrix.decompose(bone.position, bone.quaternion, bone.scale);
            // Palm fitting can include shear. Preserve the complete affine
            // matrix instead of losing it through TRS decomposition.
            bone.matrixAutoUpdate = false;
            bone.matrix.copy(this.matrix);
            bone.updateWorldMatrix(false, false);
        }
        return true;
    }
}
