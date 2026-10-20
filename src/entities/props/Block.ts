import { Box3, Mesh, MeshStandardMaterial, Texture, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Box, Vec3 } from "cannon-es";
import Entity from "@/entities/Entity";
import { PhysicsMaterials } from "@/physics/PhysicsWorld";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";

/** Mass per unit of volume for loose (dynamic) wooden objects. */
export const WOOD_DENSITY = 0.6;

/** Options shared by the wooden building blocks (blocks, walls, balls and ramps). */
export type PropOptions = {
    /** Texture to use; a random wall texture when not set. */
    texture?: Texture;
    /** Dynamic objects are simulated: they can be pushed, knocked over and stacked. Static ones never move. */
    dynamic?: boolean;
    /** Missiles, mines and explosions break it into pieces. */
    destructible?: boolean;
    /** A single bullet breaks it too (implies destructible). */
    fragile?: boolean;
    /** Mass when dynamic. Defaults to its volume times WOOD_DENSITY. */
    mass?: number;
};

export type BlockOptions = PropOptions & {
    /**
     * Width (x), depth (y) and height (z). Defaults to a 1x1x1 cube. Like wooden toy blocks,
     * nothing is bigger than 1 by 2.
     */
    size?: Vector3;
    /** Rotation around the vertical axis, in radians. */
    rotation?: number;
};

// Shared per size / texture, so a thousand blocks still use a handful of GPU resources
const geometries = new Map<string, RoundedBoxGeometry>();
const materials = new Map<Texture, MeshStandardMaterial>();

function geometryFor(size: Vector3): RoundedBoxGeometry {
    const key = `${size.x}x${size.y}x${size.z}`;
    let geometry = geometries.get(key);
    if (!geometry) {
        const radius = Math.min(0.05, Math.min(size.x, size.y, size.z) / 4);
        geometry = markShared(new RoundedBoxGeometry(size.x, size.y, size.z, 2, radius));
        geometries.set(key, geometry);
    }
    return geometry;
}

/** One shared material per texture, used by every wooden prop. */
export function materialFor(texture: Texture): MeshStandardMaterial {
    let material = materials.get(texture);
    if (!material) {
        material = markShared(new MeshStandardMaterial({ map: texture }));
        materials.set(texture, material);
    }
    return material;
}

/** Applies the common prop options to an entity. */
export function applyPropOptions(entity: Entity, options: PropOptions): void {
    entity.isStatic = !options.dynamic;
    entity.fragile = options.fragile ?? false;
    entity.destructible = (options.destructible ?? false) || entity.fragile;
}

/**
 * A wooden building block: a box with slightly rounded edges. Walls are 1x1x1 blocks.
 * Static by default; dynamic blocks can be pushed around by tanks and knocked over.
 */
class Block extends Entity {
    protected readonly _options: BlockOptions;
    protected readonly _size: Vector3;

    constructor(position: Vector3, options: BlockOptions = {}) {
        super(position);
        this._options = options;
        this._size = options.size?.clone() ?? new Vector3(1, 1, 1);
        this.mesh.rotation.z = options.rotation ?? 0;
        applyPropOptions(this, options);
    }

    public async load(): Promise<void> {
        const texture = this._options.texture ?? this.getTexture();
        this.setMesh(new Mesh(geometryFor(this._size), materialFor(texture)));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Box3().setFromObject(this.mesh);

        const { x, y, z } = this._size;
        const dynamic = this._options.dynamic ?? false;
        const body = this.createBody({
            mass: dynamic ? this._options.mass ?? x * y * z * WOOD_DENSITY : 0,
            material: dynamic ? PhysicsMaterials.prop : PhysicsMaterials.scenery,
            linearDamping: 0.05,
            angularDamping: 0.1,
        });
        body.addShape(new Box(new Vec3(x / 2, y / 2, z / 2)));
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getRandomWallTexture();
    }
}

export default Block;
