import { Body, ContactMaterial, Material, RaycastResult, SAPBroadphase, Vec3, World } from "cannon-es";
import { Vector3 } from "three";
import type { EntityId } from "@2/ecs/Ecs";
import { GRAVITY, PHYSICS_MAX_STEP, PHYSICS_SOLVER_ITERATIONS } from "@2/config";

/**
 * Surface types. How each pair behaves when touching (friction, bounciness) is set up in
 * PhysicsWorld's constructor.
 */
export const PhysicsMaterials = {
    /** Things that never move: the ground and static blocks. */
    scenery: new Material("scenery"),
    /** Loose objects: crates, balls, pushable blocks. */
    prop: new Material("prop"),
    /**
     * The player (and anything else that walks). It has no friction: it's driven by setting its
     * velocity directly, so it moves exactly as fast as it wants and slides along walls instead
     * of sticking to them.
     */
    actor: new Material("actor"),
    /** Pieces of broken objects. */
    debris: new Material("debris"),
} as const;

/** Collision groups (bit flags), so rays can ignore the shooter and loose debris. */
export const CollisionGroups = {
    default: 1,
    actor: 2,
    debris: 4,
} as const;

/**
 * What a shot can hit: everything except whoever fired it. Pieces of broken things are included,
 * so you can shoot a piece to break it down into smaller ones.
 */
export const WEAPON_MASK = ~CollisionGroups.actor;

/**
 * What a projectile in flight can hit. Same as WEAPON_MASK, minus the debris: a rocket flies
 * through a cloud of splinters instead of detonating on the first one that drifts into its path.
 */
export const PROJECTILE_MASK = ~(CollisionGroups.actor | CollisionGroups.debris);

/**
 * A push or a blast never changes a body's speed by more than this. An impulse is shared out by
 * mass, and a splinter of a broken object weighs almost nothing, so without a cap the smallest
 * pieces would be flung off the map by a shot that merely shoves a crate.
 */
const MAX_IMPULSE_SPEED = 10;

/**
 * How far from a body that was removed other bodies get woken. Anything resting on it is within a
 * tile or so; waking the whole world instead means a pile of debris never gets to settle.
 */
const WAKE_RADIUS = 2.5;

/**
 * Removal points considered per frame. Beyond this the rest are dropped rather than waking
 * everything: a sweep that wakes every body puts the whole scene back into full simulation for a
 * frame, which measured as a 87 ms stall when a burst of explosions retired pieces in bulk.
 * Missing a wake just leaves a piece asleep a moment longer than it should be, and the next
 * nearby event picks it up.
 */
const MAX_WAKE_POINTS = 24;

/** How long after its last contact from below a body still counts as standing on something. */
const SUPPORT_GRACE = 0.15;
/** Contacts whose normal points up at least this much (z of the unit normal) count as support. */
const SUPPORT_NORMAL_Z = 0.5;

/** Where a ray hit the world. */
export type RayHit = {
    /** The entity the body belongs to. */
    entity: EntityId | undefined;
    point: Vector3;
    normal: Vector3;
    distance: number;
};

/**
 * Wraps the cannon-es world. PhysicsSystem adds and removes bodies and steps the simulation once
 * per frame; everything else uses it to ask questions (raycasts) or apply forces.
 */
class PhysicsWorld {
    public readonly world: World;

    private readonly _owners = new Map<Body, EntityId>();
    private readonly _lastSupported = new Map<Body, number>();
    private _time = 0;
    /** Where bodies were removed this frame, so whatever was resting on them gets woken. */
    private readonly _wakeAround: Vec3[] = [];
    /** Bodies whose footing is worth tracking. Only the player cares (see isSupported). */
    private readonly _tracksSupport = new Set<Body>();

    private readonly _rayResult = new RaycastResult();
    private readonly _rayFrom = new Vec3();
    private readonly _rayTo = new Vec3();

    constructor() {
        this.world = new World({ gravity: new Vec3(0, 0, -GRAVITY), allowSleep: true });
        this.world.broadphase = new SAPBroadphase(this.world);
        this.world.defaultContactMaterial.friction = 0.4;
        this.world.defaultContactMaterial.restitution = 0.1;
        (this.world.solver as unknown as { iterations: number }).iterations = PHYSICS_SOLVER_ITERATIONS;

        const { scenery, prop, actor, debris } = PhysicsMaterials;
        const pair = (a: Material, b: Material, friction: number, restitution: number) =>
            this.world.addContactMaterial(new ContactMaterial(a, b, { friction, restitution }));

        pair(actor, scenery, 0, 0);
        pair(actor, prop, 0, 0.05);
        pair(actor, debris, 0, 0);
        // No bounce between props and what they rest on. A stack of crates with any restitution
        // at all micro-bounces forever, never settles, never sleeps, and slowly leans over.
        pair(prop, scenery, 0.6, 0);
        pair(prop, prop, 0.55, 0);
        pair(debris, scenery, 0.6, 0.15);
        pair(debris, prop, 0.5, 0.1);
        pair(debris, debris, 0.5, 0.05);
    }

    public add(entity: EntityId, body: Body): void {
        this._owners.set(body, entity);
        this.world.addBody(body);
    }

    /**
     * Anything sleeping on top of the removed body wouldn't notice it's gone, so it has to be
     * woken — pieces of rubble hold each other up, so pulling one out of a pile has to let the
     * rest settle. Only the immediate neighbourhood is woken, and only once per frame however many
     * bodies went away, because waking the whole world on every removal would mean a pile never
     * got to sleep at all.
     */
    public remove(body: Body): void {
        this._owners.delete(body);
        this._lastSupported.delete(body);
        this._tracksSupport.delete(body);
        this.world.removeBody(body);
        this._wakeAround.push(body.position.clone());
    }

    /** Starts answering isSupported() for this body. */
    public trackSupport(body: Body): void {
        this._tracksSupport.add(body);
    }

    /** The entity a body belongs to. */
    public ownerOf(body: Body): EntityId | undefined {
        return this._owners.get(body);
    }

    public get bodyCount(): number {
        return this.world.bodies.length;
    }

    /** Advances the simulation by `deltaT` seconds, in equal sub-steps of at most PHYSICS_MAX_STEP. */
    public step(deltaT: number): void {
        if (deltaT <= 0) return;

        this.wakeAroundRemovals();

        const steps = Math.max(1, Math.ceil(deltaT / PHYSICS_MAX_STEP - 1e-9));
        const dt = deltaT / steps;
        for (let i = 0; i < steps; i++) {
            this.world.step(dt);
            this._time += dt;
            this.recordSupport();
        }
    }

    /** Whether the body is standing on something (the ground, a block, a crate...). */
    public isSupported(body: Body): boolean {
        const last = this._lastSupported.get(body);
        return last !== undefined && this._time - last <= SUPPORT_GRACE;
    }

    /**
     * The first thing hit by a ray from `from` along `direction` (any length), at most
     * `maxDistance` away. `mask` selects which collision groups can be hit. This is how the
     * hitscan gun and a rocket's swept motion find what they run into.
     */
    public raycast(from: Vector3, direction: Vector3, maxDistance: number, mask = WEAPON_MASK): RayHit | null {
        const length = direction.length();
        if (length === 0 || maxDistance <= 0) return null;

        const scale = maxDistance / length;
        this._rayFrom.set(from.x, from.y, from.z);
        this._rayTo.set(
            from.x + direction.x * scale,
            from.y + direction.y * scale,
            from.z + direction.z * scale,
        );
        this._rayResult.reset();

        const hit = this.world.raycastClosest(this._rayFrom, this._rayTo, {
            collisionFilterMask: mask,
            skipBackfaces: true,
        }, this._rayResult);
        if (!hit) return null;

        const { hitPointWorld: p, hitNormalWorld: n, body, distance } = this._rayResult;
        return {
            entity: body ? this.ownerOf(body) : undefined,
            point: new Vector3(p.x, p.y, p.z),
            normal: new Vector3(n.x, n.y, n.z),
            distance,
        };
    }

    /** Gives a dynamic body a kick in `direction` (any length) with the given impulse. */
    public push(body: Body, direction: Vector3, impulse: number): void {
        if (body.type !== Body.DYNAMIC) return;
        const kick = new Vec3(direction.x, direction.y, direction.z);
        if (kick.lengthSquared() === 0) return;
        kick.normalize();
        kick.scale(Math.min(impulse, MAX_IMPULSE_SPEED * body.mass), kick);
        body.wakeUp();
        body.applyImpulse(kick);
    }

    /**
     * Blows dynamic bodies away from `center`. The impulse is `strength` at the centre and falls off
     * to nothing at `radius`. Things are thrown slightly upwards.
     */
    public explode(center: Vector3, radius: number, strength: number): void {
        const offset = new Vec3();
        for (const body of this.world.bodies) {
            if (body.type !== Body.DYNAMIC) continue;

            offset.set(body.position.x - center.x, body.position.y - center.y, body.position.z - center.z);
            const distance = offset.length();
            if (distance >= radius) continue;

            if (distance < 1e-6) offset.set(0, 0, 1);
            else offset.scale(1 / distance, offset);
            offset.z += 0.5;
            offset.normalize();

            const falloff = strength * (1 - distance / radius);
            offset.scale(Math.min(falloff, MAX_IMPULSE_SPEED * body.mass), offset);
            body.wakeUp();
            body.applyImpulse(offset);
        }
    }

    private wakeAroundRemovals(): void {
        if (this._wakeAround.length === 0) return;

        const points = this._wakeAround.length > MAX_WAKE_POINTS
            ? this._wakeAround.slice(0, MAX_WAKE_POINTS)
            : this._wakeAround;
        const radiusSq = WAKE_RADIUS * WAKE_RADIUS;

        for (const body of this.world.bodies) {
            if (body.type !== Body.DYNAMIC || body.sleepState !== Body.SLEEPING) continue;
            for (const where of points) {
                if (body.position.distanceSquared(where) < radiusSq) {
                    body.wakeUp();
                    break;
                }
            }
        }
        this._wakeAround.length = 0;
    }

    /** Only the handful of bodies that asked are recorded, so a pile of debris costs nothing here. */
    private recordSupport(): void {
        if (this._tracksSupport.size === 0) return;

        for (const contact of this.world.contacts) {
            // ni is the contact normal pointing from bi towards bj
            if (contact.ni.z > SUPPORT_NORMAL_Z) {
                if (this._tracksSupport.has(contact.bj)) this._lastSupported.set(contact.bj, this._time);
            } else if (contact.ni.z < -SUPPORT_NORMAL_Z) {
                if (this._tracksSupport.has(contact.bi)) this._lastSupported.set(contact.bi, this._time);
            }
        }
    }
}

export default PhysicsWorld;
