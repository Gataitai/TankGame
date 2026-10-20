import { Box3, BufferGeometry, Float32BufferAttribute, Mesh, Quaternion, Sphere, Texture, Vector3 } from "three";
import { ConvexPolyhedron, Vec3 } from "cannon-es";
import Entity from "@/entities/Entity";
import { applyPropOptions, materialFor, WOOD_DENSITY, type PropOptions } from "@/entities/props/Block";
import { PhysicsMaterials } from "@/physics/PhysicsWorld";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";

/** The direction in which the ramp goes up. */
export type RampDirection = "+x" | "-x" | "+y" | "-y";

export type RampOptions = PropOptions & {
    /** Direction the ramp rises towards (default "+y"). */
    rise?: RampDirection;
    /** Length along the slope's direction: 1 or 2 tiles (default 2). Always 1 tile wide. */
    length?: number;
    /** Height of the high end (default 1). */
    height?: number;
};

const WIDTH = 1;

/** Rotation around Z that turns +Y (the unrotated rise direction) into each direction. */
const ROTATIONS: Record<RampDirection, number> = {
    "+y": 0,
    "-x": Math.PI / 2,
    "-y": Math.PI,
    "+x": -Math.PI / 2,
};

type Dimensions = { length: number; height: number };

/**
 * The wedge's corners, relative to the middle of its footprint at ground level, rising towards +Y:
 * A-B is the low edge, E-F the top edge above D-C.
 */
function corners({ length, height }: Dimensions): Vector3[] {
    const w = WIDTH / 2;
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
const FACES = [
    [0, 3, 2, 1], // Bottom
    [3, 4, 5, 2], // Back (the high end)
    [0, 1, 5, 4], // Slope
    [0, 4, 3], // Left side
    [1, 2, 5], // Right side
];

/** The centre of mass, relative to the middle of the footprint. The body rotates around it. */
const centroidOf = ({ length, height }: Dimensions) => new Vector3(0, length / 6, height / 3);

const geometries = new Map<string, BufferGeometry>();

/** Wedge mesh centred on its centre of mass, with the texture mapped once onto every face. */
function geometryFor(dimensions: Dimensions): BufferGeometry {
    const key = `${dimensions.length}x${dimensions.height}`;
    const cached = geometries.get(key);
    if (cached) return cached;

    const centroid = centroidOf(dimensions);
    const p = corners(dimensions).map((corner) => corner.sub(centroid));
    const positions: number[] = [];
    const uvs: number[] = [];

    // Each face is drawn as triangles with its own texture coordinates [corner, u, v]
    const face = (vertices: [number, number, number][]) => {
        const triangles = vertices.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
        for (const i of triangles) {
            const [corner, u, v] = vertices[i];
            positions.push(p[corner].x, p[corner].y, p[corner].z);
            uvs.push(u, v);
        }
    };
    face([[0, 0, 0], [3, 0, 1], [2, 1, 1], [1, 1, 0]]); // Bottom
    face([[3, 1, 0], [4, 1, 1], [5, 0, 1], [2, 0, 0]]); // Back
    face([[0, 0, 0], [1, 1, 0], [5, 1, 1], [4, 0, 1]]); // Slope
    face([[0, 1, 0], [4, 0, 1], [3, 0, 0]]); // Left side
    face([[1, 0, 0], [2, 1, 0], [5, 1, 1]]); // Right side

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals(); // Non-indexed, so every face stays flat
    markShared(geometry);
    geometries.set(key, geometry);
    return geometry;
}

const _local = new Vector3();
const _inverse = new Quaternion();

/**
 * A wooden wedge that tanks can drive up to get higher. At most 1 by 2 tiles, like the other blocks.
 *
 * It's positioned by the middle of its footprint (at its bottom), so it lines up with the tile grid:
 * a 2-long ramp covers the two tiles on either side of that point along its rise direction.
 */
class Ramp extends Entity {
    private readonly _options: RampOptions;
    private readonly _dimensions: Dimensions;

    /** `base`: middle of the ramp's footprint, at the height of its bottom. */
    constructor(base: Vector3, options: RampOptions = {}) {
        const dimensions = { length: options.length ?? 2, height: options.height ?? 1 };
        const rotation = ROTATIONS[options.rise ?? "+y"];
        const centroid = centroidOf(dimensions).applyAxisAngle(new Vector3(0, 0, 1), rotation);
        super(base.clone().add(centroid));

        this._options = options;
        this._dimensions = dimensions;
        this.mesh.rotation.z = rotation;
        applyPropOptions(this, options);
    }

    public async load(): Promise<void> {
        const texture: Texture = this._options.texture ?? ResourceManager.instance.getRandomWallTexture();
        this.setMesh(new Mesh(geometryFor(this._dimensions), materialFor(texture)));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Box3().setFromObject(this.mesh);

        const centroid = centroidOf(this._dimensions);
        const vertices = corners(this._dimensions).map((corner) => {
            corner.sub(centroid);
            return new Vec3(corner.x, corner.y, corner.z);
        });

        const { length, height } = this._dimensions;
        const dynamic = this._options.dynamic ?? false;
        const body = this.createBody({
            mass: dynamic ? this._options.mass ?? (WIDTH * length * height / 2) * WOOD_DENSITY : 0,
            material: dynamic ? PhysicsMaterials.prop : PhysicsMaterials.scenery,
            linearDamping: 0.05,
            angularDamping: 0.1,
        });
        body.addShape(new ConvexPolyhedron({ vertices, faces: FACES }));
    }

    /** The bounding box is a poor fit for a wedge, so shots flying over the low end must miss. */
    public intersectsSphere(sphere: Sphere): boolean {
        if (!super.intersectsSphere(sphere)) return false;

        // Sphere centre in the ramp's own frame, relative to the middle of the footprint
        _inverse.copy(this.mesh.quaternion).invert();
        _local.copy(sphere.center).sub(this.position).applyQuaternion(_inverse).add(centroidOf(this._dimensions));

        // Distance above the slope (whose plane goes through the low edge at y = -length / 2)
        const { length, height } = this._dimensions;
        const aboveSlope = (-height * (_local.y + length / 2) + length * _local.z) / Math.hypot(height, length);
        return aboveSlope <= sphere.radius;
    }
}

export default Ramp;
