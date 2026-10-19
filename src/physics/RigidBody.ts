import { Body, Shape, Vec3 } from "cannon-es";
import { Quaternion, Vector3 } from "three";
import type Entity from "@/entities/Entity";
import type PhysicsWorld from "@/physics/PhysicsWorld";

/**
 * How an entity takes part in physics:
 * - "none": no physics body (the default for most things)
 * - "static": an immovable body; physics objects collide with it but it never moves (walls)
 * - "dynamic": simulated: falls, gets pushed, bounces and collides with everything
 */
export type PhysicsMode = "none" | "static" | "dynamic";

/**
 * Surface behaviour of a body. "vehicle" slides without friction over everything (vehicles
 * drive themselves), except against other vehicles, which they grip so they can push each other.
 */
export type Surface = "default" | "frictionless" | "bouncy" | "vehicle";

/** Debris (pieces of shattered objects) collides with everything except other debris. */
export type CollisionGroup = "default" | "debris";

/** Everything the physics world needs to build an entity's body (see Entity.describePhysics). */
export type PhysicsDescription = {
    shape: Shape;
    /** Rotation of the shape within the body, e.g. to stand a cylinder upright. */
    shapeRotation?: Quaternion;
    /** Centre of the body relative to the entity's position, in the entity's own rotation. */
    offset: Vector3;
    /** Only used for dynamic bodies. */
    mass: number;
    surface: Surface;
    /** Physics never rotates the body; the game sets its rotation (e.g. tanks). */
    fixedRotation: boolean;
    linearDamping: number;
    angularDamping: number;
    group: CollisionGroup;
};

/**
 * An entity's body in the physics simulation (like a Rigidbody component in Unity).
 * Get it via `entity.rigidbody`; create or remove it with `entity.setPhysics(mode)`.
 */
class RigidBody {
    private readonly _velocity = new Vector3();

    constructor(
        public readonly entity: Entity,
        public readonly body: Body,
        public readonly mode: Exclude<PhysicsMode, "none">,
        /** Body centre relative to the entity position (in the entity's rotation). */
        public readonly offset: Vector3,
        private readonly _world: PhysicsWorld,
    ) {}

    public get isDynamic(): boolean {
        return this.mode === "dynamic";
    }

    /** Current velocity in world units per second. */
    public get velocity(): Vector3 {
        const { x, y, z } = this.body.velocity;
        return this._velocity.set(x, y, z);
    }

    public setVelocity(velocity: Vector3): void {
        this.body.velocity.set(velocity.x, velocity.y, velocity.z);
        this.body.wakeUp();
    }

    /** Sets the horizontal velocity and keeps the vertical one (gravity, jumps). */
    public setHorizontalVelocity(x: number, y: number): void {
        this.body.velocity.x = x;
        this.body.velocity.y = y;
        this.body.wakeUp();
    }

    public setVerticalVelocity(z: number): void {
        this.body.velocity.z = z;
        this.body.wakeUp();
    }

    public setAngularVelocity(angularVelocity: Vector3): void {
        this.body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    }

    /**
     * Instantly changes the motion (a kick, a hit or a blast). Applied at `worldPoint` (e.g. where
     * a projectile hit), the body also starts to spin; at its centre if omitted.
     */
    public applyImpulse(impulse: Vector3, worldPoint?: Vector3): void {
        const offset = worldPoint
            ? new Vec3(worldPoint.x - this.body.position.x, worldPoint.y - this.body.position.y, worldPoint.z - this.body.position.z)
            : new Vec3(0, 0, 0);
        this.body.wakeUp();
        this.body.applyImpulse(new Vec3(impulse.x, impulse.y, impulse.z), offset);
    }

    /** Changes how the body's surface behaves in contacts (friction, bounce). */
    public setSurface(surface: Surface): void {
        this.body.material = this._world.surfaceMaterial(surface);
    }

    /** Sets the rotation (for bodies whose rotation the game controls, like tanks). */
    public setRotation(rotation: Quaternion): void {
        this.body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }

    /** Whether the body is standing on something (the ground, a wall, another object). */
    public get isGrounded(): boolean {
        return this._world.isGrounded(this.body);
    }
}

export default RigidBody;
