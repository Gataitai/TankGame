import {
    Box3,
    BufferAttribute,
    BufferGeometry,
    Float32BufferAttribute,
    InterleavedBufferAttribute,
    Material,
    Matrix3,
    Mesh,
    ShapeUtils,
    Vector2,
    Vector3,
} from "three";

/**
 * Breaks a mesh into pieces made from the mesh itself.
 *
 * The mesh's triangles are cut by random planes, one piece at a time, until there are enough pieces.
 * Triangles crossing a plane are split, interpolating every vertex attribute, so the pieces keep the
 * exact surface, UVs (texture), normals and colours of the original. Each cut is closed with a cap
 * (the "inside" of the object), which uses the same material with the texture projected onto it.
 * Pieces near the impact point are cut more often, so things shatter around where they were hit.
 */

/** A piece of a broken mesh, in world space: the geometry is centred on `center`. */
export type Fragment = {
    geometry: BufferGeometry;
    material: Material | Material[];
    center: Vector3;
    size: Vector3;
};

/** Where each attribute lives in a flattened vertex (an array of all its attribute values). */
type Layout = {
    names: string[];
    sizes: number[];
    offsets: number[];
    stride: number;
    normal: number;
    uv: number[];
    colors: number[];
};

type Vertex = number[];
type Triangle = { a: Vertex; b: Vertex; c: Vertex; group: number };
type Segment = [Vector3, Vector3];
type Piece = { triangles: Triangle[]; box: Box3 };

/** Cut points closer than this are welded together when building the caps. */
const WELD_PRECISION = 1e5;
const WELD_DISTANCE_SQ = 1e-8;
const MIN_TRIANGLE_AREA_SQ = 1e-14;
/** How far from the piece's centre (relative to its size) a cut may be. */
const CUT_JITTER = 0.35;
/** How much the cut direction varies around the piece's longest axis (0 = always across it). */
const CUT_RANDOMNESS = 0.8;

export function fractureMesh(mesh: Mesh, pieceCount: number, impact: Vector3): Fragment[] {
    const geometry = mesh.geometry;
    if (!geometry?.getAttribute("position")) return [];

    mesh.updateWorldMatrix(true, false);
    const layout = layoutOf(geometry);
    const triangles = readTriangles(mesh, layout);
    if (triangles.length === 0) return [];

    const pieces: Piece[] = [makePiece(triangles)];
    const maxAttempts = pieceCount * 4;
    for (let attempt = 0; attempt < maxAttempts && pieces.length < pieceCount; attempt++) {
        const index = pickPiece(pieces, impact);
        const piece = pieces[index];
        const { normal, constant } = randomPlane(piece.box);

        const { front, back, segments } = cut(piece.triangles, normal, constant);
        if (front.length === 0 || back.length === 0) continue; // Missed the piece, try another plane

        const caps = buildCaps(segments, normal, layout);
        front.push(...caps.front);
        back.push(...caps.back);
        pieces.splice(index, 1, makePiece(front), makePiece(back));
    }

    return pieces.map((piece) => toFragment(piece, layout, mesh.material));
}

// ---- Reading the mesh --------------------------------------------------------------------

function layoutOf(geometry: BufferGeometry): Layout {
    const names = ["position", ...Object.keys(geometry.attributes).filter((name) => name !== "position" && !name.startsWith("skin"))];
    const sizes: number[] = [];
    const offsets: number[] = [];
    let stride = 0;
    for (const name of names) {
        const size = geometry.getAttribute(name).itemSize;
        offsets.push(stride);
        sizes.push(size);
        stride += size;
    }

    const offsetOf = (name: string) => offsets[names.indexOf(name)] ?? -1;
    return {
        names,
        sizes,
        offsets,
        stride,
        normal: offsetOf("normal"),
        uv: names.filter((name) => /^uv\d*$/.test(name)).map(offsetOf),
        colors: names.filter((name) => name.startsWith("color")).map(offsetOf),
    };
}

function component(attribute: BufferAttribute | InterleavedBufferAttribute, index: number, c: number): number {
    switch (c) {
        case 0: return attribute.getX(index);
        case 1: return attribute.getY(index);
        case 2: return attribute.getZ(index);
        default: return attribute.getW(index);
    }
}

/** All triangles of the mesh, in world space. */
function readTriangles(mesh: Mesh, layout: Layout): Triangle[] {
    const geometry = mesh.geometry;
    const attributes = layout.names.map((name) => geometry.getAttribute(name));
    const matrix = mesh.matrixWorld;
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    // Mirrored meshes (negative scale) have their winding flipped by the transform
    const flip = matrix.determinant() < 0;

    const point = new Vector3();
    const cache = new Map<number, Vertex>();
    const vertexAt = (i: number): Vertex => {
        let vertex = cache.get(i);
        if (vertex) return vertex;

        vertex = new Array(layout.stride);
        attributes.forEach((attribute, a) => {
            for (let c = 0; c < layout.sizes[a]; c++) {
                vertex![layout.offsets[a] + c] = component(attribute, i, c);
            }
        });

        point.fromArray(vertex, 0).applyMatrix4(matrix).toArray(vertex, 0);
        if (layout.normal >= 0) {
            point.fromArray(vertex, layout.normal).applyMatrix3(normalMatrix).normalize().toArray(vertex, layout.normal);
        }
        cache.set(i, vertex);
        return vertex;
    };

    const index = geometry.index;
    const vertexCount = index ? index.count : geometry.getAttribute("position").count;
    const groups = geometry.groups.length > 0
        ? geometry.groups
        : [{ start: 0, count: vertexCount, materialIndex: 0 }];

    const triangles: Triangle[] = [];
    for (const group of groups) {
        const end = Math.min(group.start + group.count, vertexCount);
        for (let i = group.start; i + 2 < end; i += 3) {
            const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
            const a = vertexAt(ia);
            const b = vertexAt(flip ? ic : ib);
            const c = vertexAt(flip ? ib : ic);
            pushTriangle(triangles, a, b, c, group.materialIndex ?? 0);
        }
    }
    return triangles;
}

// ---- Cutting -----------------------------------------------------------------------------

/** Picks the piece to cut next: big pieces close to the impact first. */
function pickPiece(pieces: Piece[], impact: Vector3): number {
    const size = new Vector3();
    const center = new Vector3();
    let best = 0;
    let bestScore = -Infinity;
    pieces.forEach((piece, i) => {
        piece.box.getSize(size).addScalar(0.02);
        const volume = size.x * size.y * size.z;
        const distance = piece.box.getCenter(center).distanceTo(impact);
        const score = (volume / (0.4 + distance)) * (0.75 + Math.random() * 0.5);
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    });
    return best;
}

/** A plane roughly across the piece's longest side, through a point near its centre. */
function randomPlane(box: Box3): { normal: Vector3; constant: number } {
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    const longest = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
    const normal = new Vector3().setComponent(longest, 1);
    const random = new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    normal.addScaledVector(random, CUT_RANDOMNESS).normalize();

    const point = center.add(new Vector3(
        (Math.random() - 0.5) * size.x * CUT_JITTER,
        (Math.random() - 0.5) * size.y * CUT_JITTER,
        (Math.random() - 0.5) * size.z * CUT_JITTER,
    ));
    return { normal, constant: normal.dot(point) };
}

/**
 * Splits triangles by the plane normal·p = constant into the front (positive) and back side.
 * Also returns the segments where the plane cuts through the surface, used to build the caps.
 */
function cut(triangles: Triangle[], normal: Vector3, constant: number): { front: Triangle[]; back: Triangle[]; segments: Segment[] } {
    const front: Triangle[] = [];
    const back: Triangle[] = [];
    const segments: Segment[] = [];
    const distance = (v: Vertex) => normal.x * v[0] + normal.y * v[1] + normal.z * v[2] - constant;

    for (const triangle of triangles) {
        const { a, b, c, group } = triangle;
        const da = distance(a);
        const db = distance(b);
        const dc = distance(c);
        const fa = da >= 0;
        const fb = db >= 0;
        const fc = dc >= 0;

        if (fa && fb && fc) {
            front.push(triangle);
            continue;
        }
        if (!fa && !fb && !fc) {
            back.push(triangle);
            continue;
        }

        // Rotate (keeping the winding) so that `p` is the vertex alone on its side
        let p: Vertex, q: Vertex, r: Vertex, dp: number, dq: number, dr: number;
        if (fa !== fb && fa !== fc) [p, q, r, dp, dq, dr] = [a, b, c, da, db, dc];
        else if (fb !== fa && fb !== fc) [p, q, r, dp, dq, dr] = [b, c, a, db, dc, da];
        else [p, q, r, dp, dq, dr] = [c, a, b, dc, da, db];

        const pq = intersect(p, q, dp, dq);
        const pr = intersect(p, r, dp, dr);
        const alone = dp >= 0 ? front : back;
        const others = dp >= 0 ? back : front;

        pushTriangle(alone, p, pq, pr, group);
        pushTriangle(others, pq, q, r, group);
        pushTriangle(others, pq, r, pr, group);

        const start = new Vector3(pq[0], pq[1], pq[2]);
        const end = new Vector3(pr[0], pr[1], pr[2]);
        if (start.distanceToSquared(end) > WELD_DISTANCE_SQ) segments.push([start, end]);
    }

    return { front, back, segments };
}

/**
 * The point where the edge p-q crosses the plane, with every attribute interpolated.
 * The edge is always walked in the same direction, so the two triangles sharing an edge get
 * exactly the same point (which keeps the cap outlines closed).
 */
function intersect(p: Vertex, q: Vertex, dp: number, dq: number): Vertex {
    if (comparePositions(p, q) > 0) {
        [p, q] = [q, p];
        [dp, dq] = [dq, dp];
    }
    const t = dp / (dp - dq);
    return p.map((value, i) => value + (q[i] - value) * t);
}

function comparePositions(p: Vertex, q: Vertex): number {
    return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
}

function pushTriangle(target: Triangle[], a: Vertex, b: Vertex, c: Vertex, group: number): void {
    // Skip slivers left over when a vertex lies (almost) exactly on a cut
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz < MIN_TRIANGLE_AREA_SQ) return;
    target.push({ a, b, c, group });
}

// ---- Caps --------------------------------------------------------------------------------

/**
 * Closes the cut: the segments are joined into outlines, which are triangulated (holes included).
 * The front piece gets the cap facing away from the plane normal, the back piece the mirrored one.
 * The cap's texture coordinates map the original texture once across the cut surface.
 */
function buildCaps(segments: Segment[], normal: Vector3, layout: Layout): { front: Triangle[]; back: Triangle[] } {
    const front: Triangle[] = [];
    const back: Triangle[] = [];
    const loops = chainLoops(segments);
    if (loops.length === 0) return { front, back };

    // 2D coordinates on the plane
    const u = new Vector3(1, 0, 0);
    if (Math.abs(normal.x) > 0.9) u.set(0, 1, 0);
    u.sub(normal.clone().multiplyScalar(normal.dot(u))).normalize();
    const v = new Vector3().crossVectors(normal, u);

    const outlines = loops
        .map((points) => {
            const flat = points.map((p) => new Vector2(p.dot(u), p.dot(v)));
            return { points, flat, area: Math.abs(ShapeUtils.area(flat)), depth: 0, parent: -1 };
        })
        .filter((outline) => outline.area > 1e-8)
        .sort((a, b) => b.area - a.area);

    // Outlines inside an odd number of others are holes of the smallest one around them
    outlines.forEach((outline, i) => {
        for (let j = i - 1; j >= 0; j--) {
            if (pointInPolygon(outline.flat[0], outlines[j].flat)) {
                outline.parent = j;
                outline.depth = outlines[j].depth + 1;
                break;
            }
        }
    });

    const outward = normal.clone().negate(); // The front piece's cap faces the back side
    const edge1 = new Vector3();
    const edge2 = new Vector3();

    outlines.forEach((outline, i) => {
        if (outline.depth % 2 === 1) return;
        const holes = outlines.filter((other) => other.parent === i && other.depth % 2 === 1);

        const points = [outline.points, ...holes.map((hole) => hole.points)].flat();
        const flat = [outline.flat, ...holes.map((hole) => hole.flat)].flat();
        const faces = ShapeUtils.triangulateShape(outline.flat.slice(), holes.map((hole) => hole.flat.slice()));

        // Map the texture once over the cap, keeping its aspect ratio
        const min = new Vector2(Infinity, Infinity);
        const max = new Vector2(-Infinity, -Infinity);
        flat.forEach((p) => {
            min.min(p);
            max.max(p);
        });
        const extent = Math.max(max.x - min.x, max.y - min.y, 1e-6);
        const capVertices = points.map((p, k) =>
            capVertex(layout, p, outward, (flat[k].x - min.x) / extent, (flat[k].y - min.y) / extent));
        const backVertices = points.map((p, k) =>
            capVertex(layout, p, normal, (flat[k].x - min.x) / extent, (flat[k].y - min.y) / extent));

        for (const [i0, i1, i2] of faces) {
            edge1.subVectors(points[i1], points[i0]);
            edge2.subVectors(points[i2], points[i0]);
            const facesOutward = edge1.cross(edge2).dot(outward) >= 0;
            const [a, b, c] = facesOutward ? [i0, i1, i2] : [i0, i2, i1];

            pushTriangle(front, capVertices[a], capVertices[b], capVertices[c], 0);
            pushTriangle(back, backVertices[a], backVertices[c], backVertices[b], 0);
        }
    });

    return { front, back };
}

function capVertex(layout: Layout, position: Vector3, normal: Vector3, s: number, t: number): Vertex {
    const vertex: Vertex = new Array(layout.stride).fill(0);
    position.toArray(vertex, 0);
    if (layout.normal >= 0) normal.toArray(vertex, layout.normal);
    for (const offset of layout.uv) {
        vertex[offset] = s;
        vertex[offset + 1] = t;
    }
    for (const offset of layout.colors) {
        const size = layout.sizes[layout.offsets.indexOf(offset)];
        for (let c = 0; c < size; c++) vertex[offset + c] = 1;
    }
    return vertex;
}

/** Joins cut segments into closed outlines. Open chains (from meshes with holes) are dropped. */
function chainLoops(segments: Segment[]): Vector3[][] {
    const key = (p: Vector3) =>
        `${Math.round(p.x * WELD_PRECISION)},${Math.round(p.y * WELD_PRECISION)},${Math.round(p.z * WELD_PRECISION)}`;

    const byKey = new Map<string, number[]>();
    const register = (p: Vector3, index: number) => {
        const k = key(p);
        const list = byKey.get(k);
        if (list) list.push(index);
        else byKey.set(k, [index]);
    };
    segments.forEach(([a, b], i) => {
        register(a, i);
        register(b, i);
    });

    const used = new Uint8Array(segments.length);
    const findNext = (point: Vector3): number => {
        for (const index of byKey.get(key(point)) ?? []) {
            if (!used[index]) return index;
        }
        // Rounding put a matching point in a neighbouring bucket: look for it directly
        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue;
            const [a, b] = segments[i];
            if (a.distanceToSquared(point) < WELD_DISTANCE_SQ || b.distanceToSquared(point) < WELD_DISTANCE_SQ) return i;
        }
        return -1;
    };

    const loops: Vector3[][] = [];
    for (let start = 0; start < segments.length; start++) {
        if (used[start]) continue;
        used[start] = 1;

        const first = segments[start][0];
        const loop = [first, segments[start][1]];
        let closed = false;
        for (;;) {
            const current = loop[loop.length - 1];
            if (current.distanceToSquared(first) < WELD_DISTANCE_SQ) {
                loop.pop();
                closed = true;
                break;
            }
            const next = findNext(current);
            if (next < 0) break;
            used[next] = 1;
            const [a, b] = segments[next];
            loop.push(a.distanceToSquared(current) <= b.distanceToSquared(current) ? b : a);
        }

        if (closed && loop.length >= 3) loops.push(loop);
    }
    return loops;
}

function pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if ((a.y > point.y) !== (b.y > point.y)
            && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

// ---- Output ------------------------------------------------------------------------------

function makePiece(triangles: Triangle[]): Piece {
    const box = new Box3();
    const point = new Vector3();
    for (const { a, b, c } of triangles) {
        box.expandByPoint(point.fromArray(a));
        box.expandByPoint(point.fromArray(b));
        box.expandByPoint(point.fromArray(c));
    }
    return { triangles, box };
}

function toFragment(piece: Piece, layout: Layout, material: Material | Material[]): Fragment {
    const triangles = Array.isArray(material)
        ? [...piece.triangles].sort((x, y) => x.group - y.group)
        : piece.triangles;
    const center = piece.box.getCenter(new Vector3());
    const size = piece.box.getSize(new Vector3());

    const vertexCount = triangles.length * 3;
    const arrays = layout.sizes.map((size) => new Float32Array(vertexCount * size));
    let n = 0;
    for (const { a, b, c } of triangles) {
        for (const vertex of [a, b, c]) {
            layout.names.forEach((_, i) => {
                const size = layout.sizes[i];
                const offset = layout.offsets[i];
                for (let k = 0; k < size; k++) arrays[i][n * size + k] = vertex[offset + k];
            });
            n++;
        }
    }

    // Centre the geometry on the piece so it rotates around its own middle
    const positions = arrays[0];
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= center.x;
        positions[i + 1] -= center.y;
        positions[i + 2] -= center.z;
    }

    const geometry = new BufferGeometry();
    layout.names.forEach((name, i) => geometry.setAttribute(name, new Float32BufferAttribute(arrays[i], layout.sizes[i])));
    normalizeNormals(geometry);

    if (Array.isArray(material)) {
        let start = 0;
        for (let i = 1; i <= triangles.length; i++) {
            if (i === triangles.length || triangles[i].group !== triangles[start].group) {
                geometry.addGroup(start * 3, (i - start) * 3, triangles[start].group);
                start = i;
            }
        }
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, material, center, size };
}

function normalizeNormals(geometry: BufferGeometry): void {
    const normals = geometry.getAttribute("normal");
    if (!normals) return;
    const n = new Vector3();
    for (let i = 0; i < normals.count; i++) {
        n.fromBufferAttribute(normals, i);
        if (n.lengthSq() > 0) n.normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
    }
}
