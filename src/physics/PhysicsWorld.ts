import { Body, ContactMaterial, GSSolver, Material, Plane, Quaternion as CannonQuaternion, SAPBroadphase, Vec3, World } from "cannon-es";
import { Vector3 } from "three";
import type Entity from "@/entities/Entity";
import RigidBody, { type CollisionGroup, type PhysicsDescription, type PhysicsMode, type Surface } from "@/physics/RigidBody";
import { PHYSICS } from "@/config";

const GROUP_DEFAULT = 1;
const GROUP_DEBRIS = 2;
const COLLIDE_WITH_EVERYTHING = -1;

const SURFACES: Record<Surface, { friction: number; restitution: number }> = {
    default: { friction: PHYSICS.friction, restitution: PHYSICS.restitution },
    frictionless: { friction: 0, restitution: PHYSICS.restitution },
    bouncy: { friction: 0.4, restitution: 0.45 },
    vehicle: { friction: 0, restitution: 0 },
};
/** Friction between two vehicles, so one pushes the other instead of sliding off to the side. */
const VEHICLE_GRIP = 0.8;

/**
 * A scene's physics simulation, built on the cannon-es engine (like the physics scene that
 * belongs to a Unity scene). The world is Z-up like the rest of the game.
 *
 * - The ground is an infinite plane at z = 0.
 * - Invisible, infinitely tall planes along the inside of the border walls keep everything in
 *   the arena, even when thrown high.
 * - Entities get bodies through `entity.setPhysics(mode)` (usually via `scene.add(entity, {physics})`).
 *   After each step the dynamic ones are copied back onto their entities.
 */
class PhysicsWorld {
    private readonly _world: World;
    private readonly _materials = new Map<Surface, Material>();
    private readonly _dynamic = new Set<RigidBody>();
    /** Bodies that rested on something during the last step() (any of its sub-steps). */
    private readonly _grounded = new Set<Body>();

    /** @param mapSize the map is mapSize x mapSize tiles, with a border wall around it */
    constructor(mapSize: number) {
        this._world = new World({ gravity: new Vec3(0, 0, -PHYSICS.gravity), allowSleep: true });
        this._world.broadphase = new SAPBroadphase(this._world);
        (this._world.solver as GSSolver).iterations = PHYSICS.solverIterations;
        this.createMaterials();

        // cannon-es planes face +Z by default, which is "up" in this game
        this._world.addBody(new Body({ mass: 0, shape: new Plane(), material: this.material("default") }));
        this.addArenaBounds(mapSize);

        // After every internal step: keep speeds sane and remember what stands on something
        this._world.addEventListener("postStep", this.afterSubStep);
    }

    /** Creates the body for an entity (called by Entity.setPhysics). */
    public createRigidBody(entity: Entity, mode: Exclude<PhysicsMode, "none">, description: PhysicsDescription): RigidBody {
        const rotation = entity.mesh.quaternion;
        const center = description.offset.clone().applyQuaternion(rotation).add(entity.position);
        const dynamic = mode === "dynamic";

        const body = new Body({
            mass: dynamic ? description.mass : 0,
            type: dynamic ? Body.DYNAMIC : Body.STATIC,
            position: new Vec3(center.x, center.y, center.z),
            quaternion: new CannonQuaternion(rotation.x, rotation.y, rotation.z, rotation.w),
            material: this.material(description.surface),
            linearDamping: description.linearDamping,
            angularDamping: description.angularDamping,
            fixedRotation: description.fixedRotation,
            collisionFilterGroup: description.group === "debris" ? GROUP_DEBRIS : GROUP_DEFAULT,
            collisionFilterMask: description.group === "debris" ? GROUP_DEFAULT : COLLIDE_WITH_EVERYTHING,
        });
        const shapeRotation = description.shapeRotation;
        body.addShape(description.shape, undefined, shapeRotation
            ? new CannonQuaternion(shapeRotation.x, shapeRotation.y, shapeRotation.z, shapeRotation.w)
            : undefined);
        if (description.fixedRotation) body.updateMassProperties();

        this._world.addBody(body);
        const rigidbody = new RigidBody(entity, body, mode, description.offset.clone(), this);
        if (dynamic) this._dynamic.add(rigidbody);
        return rigidbody;
    }

    public removeRigidBody(rigidbody: RigidBody): void {
        this._world.removeBody(rigidbody.body);
        this._dynamic.delete(rigidbody);
    }

    /**
     * Advances the simulation by `deltaT` (in equal sub-steps of at most PHYSICS.fixedTimeStep,
     * so the total is exact), then moves the entities to their bodies. Does nothing while there's
     * nothing to simulate.
     */
    public step(deltaT: number): void {
        if (this._dynamic.size === 0 || deltaT <= 0) return;

        this._grounded.clear();
        const steps = Math.ceil(deltaT / PHYSICS.fixedTimeStep);
        for (let i = 0; i < steps; i++) this._world.step(deltaT / steps);

        this._dynamic.forEach((rigidbody) => rigidbody.entity.syncFromPhysics());
    }

    /**
     * Whether the body rests on something below it. Uses all sub-steps of the last step, since
     * a resting body doesn't touch the ground in every single sub-step.
     */
    public isGrounded(body: Body): boolean {
        return this._grounded.has(body) || body.sleepState === Body.SLEEPING;
    }

    // ---- Setup -------------------------------------------------------------------------

    /** The cannon-es material of a surface (see RigidBody.setSurface). */
    public surfaceMaterial(surface: Surface): Material {
        return this._materials.get(surface)!;
    }

    private material(surface: Surface): Material {
        return this.surfaceMaterial(surface);
    }

    /** One material per surface, and contact rules for every pair (lowest friction, highest bounce). */
    private createMaterials(): void {
        const surfaces = Object.keys(SURFACES) as Surface[];
        surfaces.forEach((surface) => this._materials.set(surface, new Material(surface)));

        for (const a of surfaces) {
            for (const b of surfaces) {
                if (surfaces.indexOf(b) < surfaces.indexOf(a)) continue;
                this._world.addContactMaterial(new ContactMaterial(this.material(a), this.material(b), {
                    friction: a === "vehicle" && b === "vehicle" ? VEHICLE_GRIP : Math.min(SURFACES[a].friction, SURFACES[b].friction),
                    restitution: Math.max(SURFACES[a].restitution, SURFACES[b].restitution),
                }));
            }
        }
    }

    /** Invisible frictionless planes at the inner faces of the border walls, facing into the arena. */
    private addArenaBounds(mapSize: number): void {
        const inner = 0.5;               // Inner face of the border walls at x/y = 0
        const outer = mapSize - 1 - 0.5; // Inner face of the border walls at x/y = mapSize - 1
        const bounds: [Vec3, Vec3][] = [
            [new Vec3(inner, 0, 0), new Vec3(1, 0, 0)],
            [new Vec3(outer, 0, 0), new Vec3(-1, 0, 0)],
            [new Vec3(0, inner, 0), new Vec3(0, 1, 0)],
            [new Vec3(0, outer, 0), new Vec3(0, -1, 0)],
        ];

        for (const [position, normal] of bounds) {
            const plane = new Body({ mass: 0, shape: new Plane(), position, material: this.material("frictionless") });
            plane.quaternion.setFromVectors(new Vec3(0, 0, 1), normal); // Turn the normal (+Z) into the arena
            this._world.addBody(plane);
        }
    }

    private afterSubStep = (): void => {
        for (const contact of this._world.contacts) {
            // The contact normal points from bi to bj
            if (contact.ni.z < -0.5) this._grounded.add(contact.bi);
            if (contact.ni.z > 0.5) this._grounded.add(contact.bj);
        }

        for (const body of this._world.bodies) {
            if (body.type !== Body.DYNAMIC) continue;
            const speed = body.velocity.length();
            if (speed > PHYSICS.maxSpeed) body.velocity.scale(PHYSICS.maxSpeed / speed, body.velocity);
        }
    };

    public static toVec3(vector: Vector3): Vec3 {
        return new Vec3(vector.x, vector.y, vector.z);
    }
}

export type { CollisionGroup };
export default PhysicsWorld;
