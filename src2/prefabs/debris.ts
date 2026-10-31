import { Box3, Mesh, Vector3 } from "three";
import { Body, Sphere as SphereShape, Vec3 } from "cannon-es";
import type { EntityId } from "@2/ecs/Ecs";
import { PhysicsBody, Transform } from "@2/components/Spatial";
import { Lifetime, Renderable } from "@2/components/Visual";
import { Debris } from "@2/components/Gameplay";
import type { Fragment } from "@2/physics/Fracture";
import { CollisionGroups, PhysicsMaterials } from "@2/physics/PhysicsWorld";
import { game } from "@2/scene/Game";
import { DEBRIS_LIFETIME } from "@2/config";

/** Seconds a piece spends shrinking away at the end of its life. */
export const DEBRIS_SHRINK_TIME = 0.6;

/** Spread on the lifetime, so a pile doesn't disappear all at once. */
const LIFETIME_JITTER = 8;

/** Mass per unit of (bounding box) volume. */
const DENSITY = 0.5;
const MIN_MASS = 0.02;

/**
 * A piece collides as a ball, not as a box.
 *
 * This is the single biggest thing standing between a big explosion and a smooth frame. Box-on-box
 * is the most expensive test cannon-es does — a separating-axis search with clipping — and a fresh
 * pile of rubble is hundreds of those every frame. A ball is a subtraction and a comparison.
 * Measured on a pillar's worth of rubble (270 pieces flying, landing and settling):
 *
 *     boxes    5.21 ms/frame average, 18.1 ms worst, 100 of 270 still awake after 4 s
 *     balls    0.74 ms/frame average,  2.0 ms worst,   2 of 270 still awake after 4 s
 *
 * The pieces still look like the angular shards they are cut from — only what they collide *as*
 * changes — and they come to rest about a third of a tile further from where they landed.
 */
const RADIUS_FIT = 0.9;
const MIN_RADIUS = 0.03;

const _bounds = new Box3();
const _offset = new Vector3();

/**
 * A piece of something that was broken, made from that thing's own mesh (see Fracture.ts). It is
 * thrown away from the impact, tumbles to the ground, piles up and much later shrinks away.
 *
 * A piece is ordinary solid rubble: it collides with the floor, with props, with the player and
 * with other pieces, and a shot or a blast shoves it around. What it cannot do is break again —
 * it has no Breakable component, so a thing comes apart exactly once.
 */
export function spawnDebris(fragment: Fragment, velocity: Vector3, spin: Vector3): EntityId {
    const { ecs, physics, scene } = game();

    const mesh = new Mesh(fragment.geometry, fragment.material);
    mesh.position.copy(fragment.center);
    // Rubble is not in the shadow pass: a few hundred extra shadow draws for shadows the size of
    // a splinter is the worst trade in the scene. It still receives them.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: mesh.position,
        quaternion: mesh.quaternion,
        scale: mesh.scale,
    });
    // The geometry was cut just for this piece; the material is shared with whatever it came from
    ecs.add(entity, Renderable, { object: mesh, ownsGeometry: true });
    ecs.add(entity, Debris, true);

    const lifetime = DEBRIS_LIFETIME + (Math.random() - 0.5) * LIFETIME_JITTER;
    ecs.add(entity, Lifetime, { remaining: lifetime, total: lifetime, shrink: DEBRIS_SHRINK_TIME });

    const size = fragment.size;
    // The mean half-extent, so the ball neither swallows the piece nor rattles around inside it
    const radius = Math.max(MIN_RADIUS, ((size.x + size.y + size.z) / 6) * RADIUS_FIT);

    // Box3 of the actual geometry keeps the body centred on the visible piece
    _bounds.copy(fragment.geometry.boundingBox ?? _bounds.makeEmpty());
    _bounds.getCenter(_offset);

    const body = new Body({
        mass: Math.max(MIN_MASS, size.x * size.y * size.z * DENSITY),
        material: PhysicsMaterials.debris,
        // Its own group, so a rocket in flight can be told to ignore rubble (see PROJECTILE_MASK).
        // The mask is left wide open: a piece collides with everything, pieces included.
        collisionFilterGroup: CollisionGroups.debris,
        position: new Vec3(fragment.center.x, fragment.center.y, fragment.center.z),
        // Rubble bleeds off its energy quickly and is quick to give up and sleep. A pile of small
        // boxes resting on each other will nudge itself awake forever otherwise, and a sleeping
        // body is almost free while an awake one is not — this is what makes a big, long-lived
        // pile affordable at all.
        linearDamping: 0.4,
        angularDamping: 0.9,
        sleepSpeedLimit: 0.7,
        sleepTimeLimit: 0.2,
    });
    body.addShape(new SphereShape(radius), new Vec3(_offset.x, _offset.y, _offset.z));
    body.velocity.set(velocity.x, velocity.y, velocity.z);
    body.angularVelocity.set(spin.x, spin.y, spin.z);

    ecs.add(entity, PhysicsBody, { body });
    physics.add(entity, body);
    return entity;
}
