import { Box3, Matrix4, Mesh, Object3D, Vector3 } from "three";

export type RingOpeningMeasurement = {
    /** In attachment-parent units, with the root object's translation excluded. */
    innerRadius: number;
    center: Vector3;
    /** Number of agreeing slices through the band. */
    samples: number;
};

/** Measure a closed, approximately circular band whose opening axis is +Z.
 * Includes root/child rotation and scale, excludes the root's translation and ancestors.
 * The ring must be a loaded, rigid triangle mesh. Returns null for ambiguous geometry.
 * Ornament bounds are never used as the opening radius. Runs once at attachment time.
 */
export function measureRingOpening(object: Object3D): RingOpeningMeasurement | null {
    object.updateWorldMatrix(true, true);
    const inverse = new Matrix4().copy(object.matrixWorld).invert();
    const placement = new Matrix4().compose(new Vector3(), object.quaternion, object.scale);
    const triangles: Vector3[][] = [], bounds = new Box3();
    let unsupported = false;
    object.traverse(node => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        if ((mesh as Mesh & {isSkinnedMesh?: boolean; isInstancedMesh?: boolean}).isSkinnedMesh ||
            (mesh as Mesh & {isInstancedMesh?: boolean}).isInstancedMesh) { unsupported = true; return; }
        const geometry = mesh.geometry, attr = geometry.attributes.position;
        if (!attr) return;
        const matrix = new Matrix4().multiplyMatrices(placement, inverse).multiply(mesh.matrixWorld);
        const points = Array.from({length: attr.count}, (_, i) => new Vector3().fromBufferAttribute(attr, i).applyMatrix4(matrix));
        for (const point of points) bounds.expandByPoint(point);
        const count = geometry.index?.count ?? attr.count;
        for (let i = 0; i + 2 < count; i += 3)
            triangles.push([0,1,2].map(j => points[geometry.index ? geometry.index.getX(i+j) : i+j]));
    });
    if (unsupported || bounds.isEmpty()) return null;
    const size = bounds.getSize(new Vector3()), tolerance = Math.max(size.length() * 1e-6, 1e-10);
    if (!Number.isFinite(size.length()) || size.z <= tolerance) return null;
    const candidates: {radius: number; center: Vector3; slice: number}[] = [];
    for (let slice = 0; slice < 33; slice++) {
        const z = bounds.min.z + size.z * (slice + .5) / 33;
        const vertices: Vector3[] = [], links: Set<number>[] = [], lookup = new Map<string, number>();
        const index = (point: Vector3) => {
            const key = `${Math.round(point.x/tolerance)},${Math.round(point.y/tolerance)}`;
            let value = lookup.get(key);
            if (value === undefined) { value = vertices.length; lookup.set(key, value); vertices.push(point); links.push(new Set()); }
            return value;
        };
        for (const triangle of triangles) {
            const hits: Vector3[] = [];
            for (let edge = 0; edge < 3; edge++) {
                const a = triangle[edge], b = triangle[(edge+1)%3];
                if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z))
                    hits.push(a.clone().lerp(b, (z-a.z)/(b.z-a.z)));
            }
            if (hits.length !== 2) continue;
            const a = index(hits[0]), b = index(hits[1]);
            if (a !== b) { links[a].add(b); links[b].add(a); }
        }
        const seen = new Set<number>(), loops: Vector3[][] = [];
        for (let start = 0; start < vertices.length; start++) {
            if (seen.has(start)) continue;
            const component = [start]; seen.add(start);
            for (let i = 0; i < component.length; i++) for (const next of links[component[i]])
                if (!seen.has(next)) { seen.add(next); component.push(next); }
            if (component.length < 12 || component.some(i => links[i].size !== 2)) continue;
            const ordered = [vertices[start]]; let previous = -1, current = start;
            do {
                const next = [...links[current]].find(i => i !== previous)!;
                previous = current; current = next;
                if (current !== start) ordered.push(vertices[current]);
            } while (current !== start && ordered.length <= component.length);
            if (current === start) loops.push(ordered);
        }
        for (const loop of loops) {
            const box = new Box3().setFromPoints(loop), center = box.getCenter(new Vector3());
            const radii = loop.map(p => Math.hypot(p.x-center.x, p.y-center.y));
            const radius = Math.min(...radii), largest = Math.max(...radii);
            if (radius <= tolerance || largest/radius > 1.15 || !contains(loop, center)) continue;
            // A hole must be enclosed by a distinct outer boundary. A sphere or
            // gemstone alone has only one contour and cannot pass this check.
            if (!loops.some(outer => outer !== loop && loop.every(p => contains(outer, p)))) continue;
            candidates.push({radius, center, slice});
        }
    }
    if (!candidates.length) return null;
    // Ignore smaller ornamental holes, but reject two competing band openings.
    const largest = candidates.reduce((a,b) => a.radius > b.radius ? a : b);
    const band = candidates.filter(c => Math.hypot(c.center.x-largest.center.x,c.center.y-largest.center.y) < largest.radius*.1);
    if (candidates.some(c => c.radius > largest.radius*.7 && !band.includes(c))) return null;
    const samples = new Set(band.map(c => c.slice)).size;
    if (samples < 3) return null;
    const tightest = band.reduce((a,b) => a.radius < b.radius ? a : b);
    const center = tightest.center.clone();
    center.z = (Math.min(...band.map(c => c.center.z)) + Math.max(...band.map(c => c.center.z))) / 2;
    return { innerRadius: tightest.radius, center, samples };
}
function contains(loop: readonly Vector3[], point: Vector3): boolean {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i], b = loop[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
    }
    return inside;
}
