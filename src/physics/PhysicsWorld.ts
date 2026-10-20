import { Body, ContactMaterial, Material, RaycastResult, SAPBroadphase, Vec3, World } from "cannon-es";
import { Vector3 } from "three";
import type Entity from "@/entities/Entity";
import { GRAVITY, PHYSICS_MAX_STEP } from "@/config";

/**
 * Surface types. How each pair behaves when touching (friction, bounciness) is set up in
 * PhysicsWorld's constructor.
 */
export const PhysicsMaterials = {
    /** Things that never move: the ground, walls and static blocks. */
    scenery: new Material("scenery"),
    /** Loose objects: crates, balls, pushable walls. */
    prop: new Material("prop"),
    /**
     * Tanks have no friction: they're driven by setting their velocity (so they drive exactly as
     * fast as they want) and slide along walls instead of sticking to them.
     */
    tank: new Material("tank"),
    /** Pieces of broken objects. */
    shard: new Material("shard"),
} as const;

/** Collision groups (bit flags), e.g. so ground checks can ignore tanks and debris. */
export const CollisionGroups = {
    default: 1,
    tank: 2,
    shard: 4,
} as const;

/** What ground checks hit: everything except tanks and shards. */
const GROUND_MASK = ~(CollisionGroups.tank | CollisionGroups.shard);

/** How long after its last contact from below a body still counts as standing on something. */
const SUPPORT_GRACE = 0.15;
/** Contacts whose normal points up at least this much (z of the unit normal) count as support. */
const SUPPORT_NORMAL_Z = 0.5;

/**
 * Wraps the cannon-es world. Owned by the EntityManager, which adds and removes the bodies of
 * entities and steps the simulation once per frame.
 */
class PhysicsWorld {
    public readonly world: World;

    private readonly _owners = new Map<Body, Entity>();
    private readonly _lastSupported = new Map<Body, number>();
    private _time = 0;
    private readonly _rayResult = new RaycastResult();
    private readonly _rayFrom = new Vec3();
    private readonly _rayTo = new Vec3();
    private readonly _groundNormal = new Vector3();

    constructor() {
        this.world = new World({ gravity: new Vec3(0, 0, -GRAVITY), allowSleep: true });
        this.world.broadphase = new SAPBroadphase(this.world);
        this.world.defaultContactMaterial.friction = 0.4;
        this.world.defaultContactMaterial.restitution = 0.1;

        const { scenery, prop, tank, shard } = PhysicsMaterials;
        const pair = (a: Material, b: Material, friction: number, restitution: number) =>
            this.world.addContactMaterial(new ContactMaterial(a, b, { friction, restitution }));

        pair(tank, scenery, 0, 0);
        pair(tank, tank, 0, 0);
        pair(tank, prop, 0, 0.05);
        pair(tank, shard, 0, 0);
        pair(prop, scenery, 0.5, 0.1);
        pair(prop, prop, 0.4, 0.1);
        pair(shard, scenery, 0.6, 0.15);
        pair(shard, prop, 0.5, 0.1);
        pair(shard, shard, 0.5, 0.05);
    }

    public add(entity: Entity, body: Body): void {
        this._owners.set(body, entity);
        this.world.addBody(body);
    }

    public remove(body: Body): void {
        this._owners.delete(body);
        this._lastSupported.delete(body);
        this.world.removeBody(body);

        // Sleeping bodies resting on it wouldn't notice it's gone, so wake everything up
        for (const other of this.world.bodies) {
            if (other.type === Body.DYNAMIC) other.wakeUp();
        }
    }

    /** The entity a body belongs to. */
    public ownerOf(body: Body): Entity | undefined {
        return this._owners.get(body);
    }

    /** Advances the simulation by `deltaT` seconds, in equal sub-steps of at most PHYSICS_MAX_STEP. */
    public step(deltaT: number): void {
        if (deltaT <= 0) return;

        const steps = Math.max(1, Math.ceil(deltaT / PHYSICS_MAX_STEP - 1e-9));
        const dt = deltaT / steps;
        for (let i = 0; i < steps; i++) {
            this.world.step(dt);
            this._time += dt;
            this.recordSupport();
        }
    }

    /** Whether the body is standing on something (the ground, a block, another tank...). */
    public isSupported(body: Body): boolean {
        const last = this._lastSupported.get(body);
        return last !== undefined && this._time - last <= SUPPORT_GRACE;
    }

    /**
     * The surface straight below `from`, if it's at most `maxDistance` away. Tanks and shards are
     * ignored. The returned normal is reused between calls.
     */
    public groundBelow(from: Vector3, maxDistance: number): { normal: Vector3; distance: number } | null {
        this._rayFrom.set(from.x, from.y, from.z);
        this._rayTo.set(from.x, from.y, from.z - maxDistance);
        this._rayResult.reset();

        const hit = this.world.raycastClosest(this._rayFrom, this._rayTo, {
            collisionFilterMask: GROUND_MASK,
            skipBackfaces: true,
        }, this._rayResult);
        if (!hit) return null;

        const n = this._rayResult.hitNormalWorld;
        return { normal: this._groundNormal.set(n.x, n.y, n.z), distance: this._rayResult.distance };
    }

    /** Gives a dynamic body a kick in `direction` (any length) with the given impulse. */
    public push(body: Body, direction: Vector3, impulse: number): void {
        if (body.type !== Body.DYNAMIC) return;
        const kick = new Vec3(direction.x, direction.y, direction.z);
        if (kick.lengthSquared() === 0) return;
        kick.normalize();
        kick.scale(impulse, kick);
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

            offset.scale(strength * (1 - distance / radius), offset);
            body.wakeUp();
            body.applyImpulse(offset);
        }
    }

    private recordSupport(): void {
        for (const contact of this.world.contacts) {
            // ni is the contact normal pointing from bi towards bj
            if (contact.ni.z > SUPPORT_NORMAL_Z) this._lastSupported.set(contact.bj, this._time);
            else if (contact.ni.z < -SUPPORT_NORMAL_Z) this._lastSupported.set(contact.bi, this._time);
        }
    }
}

export default PhysicsWorld;
