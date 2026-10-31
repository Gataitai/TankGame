import {
    BoxGeometry,
    BufferGeometry,
    CylinderGeometry,
    DodecahedronGeometry,
    Float32BufferAttribute,
    SphereGeometry,
    Vector3,
} from "three";

/**
 * Shared geometry, cached by shape. Nothing here is ever freed: these are handed to many entities
 * at once, which is why Renderable has an `ownsGeometry` flag for the ones that aren't shared.
 *
 * Plain boxes on purpose. Rounded boxes carry 300 triangles each instead of 12, and every one of
 * those triangles has to be read, cut and re-indexed when the thing is broken into pieces.
 */

const boxes = new Map<string, BoxGeometry>();
const spheres = new Map<number, SphereGeometry>();
const wedges = new Map<string, BufferGeometry>();

export function boxGeometry(size: Vector3): BoxGeometry {
    const key = `${size.x}x${size.y}x${size.z}`;
    let geometry = boxes.get(key);
    if (!geometry) {
        geometry = new BoxGeometry(size.x, size.y, size.z);
        boxes.set(key, geometry);
    }
    return geometry;
}

export function sphereGeometry(radius: number): SphereGeometry {
    let geometry = spheres.get(radius);
    if (!geometry) {
        geometry = new SphereGeometry(radius, 20, 12);
        spheres.set(radius, geometry);
    }
    return geometry;
}

// ---- Particles and beams ----------------------------------------------------------------

/** A chunk, for sparks, smoke and explosion debris. */
export const PARTICLE_GEOMETRY = new DodecahedronGeometry(1, 0);

/** One unit long, starting at the origin and pointing along +Y: the hitscan tracer. */
export const BEAM_GEOMETRY = new CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);

/** A rocket: a stubby cylinder with a nose, pointing along +Y. */
export const ROCKET_GEOMETRY = (() => {
    const length = 0.26;
    const radius = 0.075;
    const geometry = new CylinderGeometry(radius, radius, length, 10);
    geometry.translate(0, -length / 4, 0);
    return geometry;
})();

// ---- The wedge --------------------------------------------------------------------------

/** How far up the slope rises, and how long its footprint is. */
export type WedgeSize = { length: number; height: number };

const WEDGE_WIDTH = 1;

/**
 * The wedge's corners relative to the middle of its footprint at ground level, rising towards +Y:
 * A-B is the low edge, E-F the top edge above D-C.
 */
function wedgeCorners({ length, height }: WedgeSize): Vector3[] {
    const w = WEDGE_WIDTH / 2;
    const l = length / 2;
    return [
        new Vector3(-w, -l, 0), // A
        new Vector3(w, -l, 0), // B
        new Vector3(w, l, 0), // C
        new Vector3(-w, l, 0), // D
        new Vector3(-w, l, height), // E
        new Vector3(w, l, height), // F
    ];
}

/** Faces as corner indices, counter-clockwise seen from outside (what cannon-es expects). */
export const WEDGE_FACES = [
    [0, 3, 2, 1], // Bottom
    [3, 4, 5, 2], // Back (the high end)
    [0, 1, 5, 4], // Slope
    [0, 4, 3], // Left side
    [1, 2, 5], // Right side
];

/** The centre of mass, relative to the middle of the footprint. The body rotates around it. */
export const wedgeCentroid = ({ length, height }: WedgeSize): Vector3 =>
    new Vector3(0, length / 6, height / 3);

/** The wedge's corners relative to its centre of mass, for the physics shape. */
export const wedgeHull = (size: WedgeSize): Vector3[] => {
    const centroid = wedgeCentroid(size);
    return wedgeCorners(size).map((corner) => corner.sub(centroid));
};

/** Wedge mesh centred on its centre of mass, every face flat. */
export function wedgeGeometry(size: WedgeSize): BufferGeometry {
    const key = `${size.length}x${size.height}`;
    const cached = wedges.get(key);
    if (cached) return cached;

    const corners = wedgeHull(size);
    const positions: number[] = [];
    // Each face is drawn as triangles, wound so it faces outwards
    for (const face of WEDGE_FACES) {
        const order = face.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
        for (const i of order) {
            const corner = corners[face[i]];
            positions.push(corner.x, corner.y, corner.z);
        }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); // Non-indexed, so every face stays flat
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    wedges.set(key, geometry);
    return geometry;
}
