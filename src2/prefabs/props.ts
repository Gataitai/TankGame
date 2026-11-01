import { Color, GridHelper, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { Body, Box, ConvexPolyhedron, Plane, Sphere as SphereShape, Vec3 } from "cannon-es";
import type { EntityId } from "@2/ecs/Ecs";
import { AreaCollider, Immovable, PhysicsBody, Transform } from "@2/components/Spatial";
import { Renderable } from "@2/components/Visual";
import { Breakable } from "@2/components/Gameplay";
import { boxGeometry, sphereGeometry, wedgeCentroid, wedgeGeometry, wedgeHull, WEDGE_FACES } from "@2/render/Geometries";
import { Palette, surfaceMaterial } from "@2/render/Materials";
import { PhysicsMaterials } from "@2/physics/PhysicsWorld";
import { game } from "@2/scene/Game";
import { GROUND_SIZE } from "@2/config";

/** Mass per unit of volume for loose (dynamic) props. */
const DENSITY = 0.6;

/** Default number of pieces a whole prop comes apart into. */
const PIECES = 10;

export type PropOptions = {
    /** A colour from the palette. White (plain scenery) when left out. */
    color?: number;
    /** Loose props are simulated: they can be pushed, stacked and knocked over. */
    dynamic?: boolean;
    /** An explosion breaks it into pieces. */
    destructible?: boolean;
    /** A single bullet breaks it too (implies destructible). */
    fragile?: boolean;
    mass?: number;
};

/**
 * Builds what every solid prop is made of: a mesh in the scene, a transform that *is* that mesh's
 * own position and rotation, and a physics body.
 *
 * Only props that can actually be broken get an AreaCollider, since the one thing area queries are
 * for is working out what an explosion caught — and most of the scenery is indestructible.
 */
function createProp(
    object: Mesh,
    position: Vector3,
    half: Vector3,
    options: PropOptions,
    addShape: (body: Body) => void,
    mass: number,
): EntityId {
    const { ecs, physics, scene } = game();
    const dynamic = options.dynamic ?? false;

    object.position.copy(position);
    object.castShadow = true;
    object.receiveShadow = true;
    scene.add(object);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: object.position,
        quaternion: object.quaternion,
        scale: object.scale,
    });
    ecs.add(entity, Renderable, { object });

    const body = new Body({
        mass: dynamic ? options.mass ?? mass : 0,
        material: dynamic ? PhysicsMaterials.prop : PhysicsMaterials.scenery,
        position: new Vec3(position.x, position.y, position.z),
        linearDamping: 0.08,
        angularDamping: 0.2,
        // Quick to settle and quick to sleep, so a stack that has come to rest stops being
        // nudged about by the solver's leftovers. Slow enough that a shove still reads.
        sleepSpeedLimit: 0.15,
        sleepTimeLimit: 0.4,
    });
    const q = object.quaternion;
    body.quaternion.set(q.x, q.y, q.z, q.w);
    addShape(body);
    ecs.add(entity, PhysicsBody, { body });
    physics.add(entity, body);

    if (!dynamic) ecs.add(entity, Immovable, true);

    const fragile = options.fragile ?? false;
    if (fragile || options.destructible) {
        ecs.add(entity, Breakable, { fragile, pieces: PIECES });
        ecs.add(entity, AreaCollider, { half });
    }
    return entity;
}

// ---- Ground -----------------------------------------------------------------------------

/**
 * The floor: a big plain slab with a grid over it, so you can still judge distance in an otherwise
 * featureless white scene, plus an endless static floor for physics.
 */
export function spawnGround(mapSize: number): EntityId {
    const { ecs, physics, scene } = game();

    const group = new Object3D();
    const slab = new Mesh(
        boxGeometry(new Vector3(GROUND_SIZE, GROUND_SIZE, 1)),
        surfaceMaterial(Palette.ground),
    );
    slab.position.z = -0.5; // Its top face sits exactly at z = 0
    slab.receiveShadow = true;
    group.add(slab);

    // GridHelper lies in the XZ plane; stand it up so it covers the ground with Z up
    const grid = new GridHelper(mapSize * 2, mapSize * 2, new Color(0xaab4bc), new Color(0xc6ced5));
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.002; // Just clear of the floor, to avoid z-fighting
    group.add(grid);
    scene.add(group);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: group.position,
        quaternion: group.quaternion,
        scale: group.scale,
    });
    ecs.add(entity, Renderable, { object: group });
    ecs.add(entity, Immovable, true);

    const body = new Body({ mass: 0, material: PhysicsMaterials.scenery });
    body.addShape(new Plane());
    ecs.add(entity, PhysicsBody, { body });
    physics.add(entity, body);
    return entity;
}

// ---- Block ------------------------------------------------------------------------------

export type BlockOptions = PropOptions & {
    /** Width (x), depth (y) and height (z). A 1x1x1 cube by default. */
    size?: Vector3;
    /** Rotation around the vertical axis, in radians. */
    rotation?: number;
};

/** A plain box. Static scenery by default; loose ones can be shoved around and stacked. */
export function spawnBlock(position: Vector3, options: BlockOptions = {}): EntityId {
    const size = options.size ?? new Vector3(1, 1, 1);
    const mesh = new Mesh(boxGeometry(size), surfaceMaterial(options.color));
    mesh.rotation.z = options.rotation ?? 0;

    const half = size.clone().multiplyScalar(0.5);
    return createProp(
        mesh,
        position,
        half,
        options,
        (body) => body.addShape(new Box(new Vec3(half.x, half.y, half.z))),
        size.x * size.y * size.z * DENSITY,
    );
}

// ---- Ball -------------------------------------------------------------------------------

export type BallOptions = PropOptions & { radius?: number };

/** A ball. Loose by default: shoot it and it rolls. */
export function spawnBall(position: Vector3, options: BallOptions = {}): EntityId {
    const radius = options.radius ?? 0.4;
    const mesh = new Mesh(sphereGeometry(radius), surfaceMaterial(options.color ?? Palette.green));
    const volume = (4 / 3) * Math.PI * radius ** 3;

    return createProp(
        mesh,
        position,
        new Vector3(radius, radius, radius),
        { dynamic: true, ...options },
        (body) => body.addShape(new SphereShape(radius)),
        volume * DENSITY,
    );
}

// ---- Ramp -------------------------------------------------------------------------------

/** The direction in which a ramp goes up. */
export type RampDirection = "+x" | "-x" | "+y" | "-y";

/** Rotation around Z that turns +Y (the unrotated rise direction) into each direction. */
const ROTATIONS: Record<RampDirection, number> = {
    "+y": 0,
    "-x": Math.PI / 2,
    "-y": Math.PI,
    "+x": -Math.PI / 2,
};

export type RampOptions = PropOptions & {
    rise?: RampDirection;
    /** Length along the slope, in tiles (2 by default). Always 1 tile wide. */
    length?: number;
    /** Height of the high end (1 by default). */
    height?: number;
};

const UP = new Vector3(0, 0, 1);

/**
 * A wedge you can walk up. Positioned by the middle of its footprint at its bottom, so it lines up
 * with the tile grid: a 2-long ramp covers the two tiles either side of that point.
 */
export function spawnRamp(base: Vector3, options: RampOptions = {}): EntityId {
    const size = { length: options.length ?? 2, height: options.height ?? 1 };
    const rise = options.rise ?? "+y";
    const rotation = ROTATIONS[rise];
    const centroid = wedgeCentroid(size).applyAxisAngle(UP, rotation);

    const mesh = new Mesh(wedgeGeometry(size), surfaceMaterial(options.color ?? Palette.blue));
    mesh.quaternion.setFromAxisAngle(UP, rotation);

    const hull = wedgeHull(size).map((corner) => new Vec3(corner.x, corner.y, corner.z));
    const alongX = rise === "+x" || rise === "-x";
    const half = alongX
        ? new Vector3(size.length / 2, 0.5, size.height / 2)
        : new Vector3(0.5, size.length / 2, size.height / 2);

    return createProp(
        mesh,
        base.clone().add(centroid),
        half,
        options,
        (body) => body.addShape(new ConvexPolyhedron({ vertices: hull, faces: WEDGE_FACES })),
        ((size.length * size.height) / 2) * DENSITY,
    );
}

// ---- Cleanup ----------------------------------------------------------------------------

/**
 * Takes a Renderable out of the scene and frees whatever it owns. Registered as
 * Renderable.onRemove by World, so no call site can forget it.
 */
export function releaseRenderable(renderable: Renderable): void {
    const { object, ownsGeometry, ownsMaterial } = renderable;
    object.removeFromParent();

    if (ownsGeometry || ownsMaterial) {
        object.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            if (ownsGeometry) mesh.geometry?.dispose();
            if (ownsMaterial) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const material of materials) (material as MeshStandardMaterial | undefined)?.dispose();
            }
        });
    }
    object.clear();
}
