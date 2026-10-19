import { Box3, Mesh, MeshStandardMaterial, Quaternion, Sphere, Vector3 } from "three";
import { Cylinder } from "cannon-es";
import Entity from "@/entities/Entity";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";
import type { Impact } from "@/physics/ObjectBreaker";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import ExplosionEffect from "@/effects/ExplosionEffect";
import DeathMarkEffect from "@/effects/DeathMarkEffect";
import TreadsCanvas from "@/map/TreadsCanvas";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";
import { angleBetween, directionFromAngle, stepAngleTowards, wrapAngle } from "@/utils/MathUtils";

const BODY_MATERIAL = markShared(new MeshStandardMaterial({ metalness: 0.9, roughness: 0.2 }));
const TURRET_MATERIAL = markShared(new MeshStandardMaterial({ metalness: 0.8, roughness: 0.3 }));

/** Where shots leave the barrel, relative to the tank. */
export const MUZZLE_DISTANCE = 1;
const MUZZLE_HEIGHT = 0.5;

/** Distance driven between two tread marks. */
const TREAD_SPACING = 0.25;

/** Headings closer than this (radians) count as equal. */
const ALIGN_EPSILON = 1e-3;

// ---- Physics
const MASS = 10;
/** Radius of the (upright cylinder) physics body. */
const BODY_RADIUS = 0.42;
/** Cannon-es cylinders stand along Y; this turns them along Z (up in this game). */
const UPRIGHT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
/** Obstacles whose top is at most this far above the tank's bottom don't block it (it's on top of them). */
const STEP_HEIGHT = 0.1;
/** Above this upwards speed (e.g. jumping) a tank doesn't grip other tanks, so it can't get held down by them. */
const GRIP_MAX_RISE_SPEED = 0.5;
/** Treads are only drawn while the tank is (about) on the ground. */
const TREAD_MAX_HEIGHT = 0.05;

abstract class Tank extends UpdatableEntity {
    /** Body heading in radians, always kept in [-PI, PI]. */
    protected _rotation = 0;
    /** When true the tank drives backwards: it travels opposite to the way its body faces. */
    protected _reversing = false;
    /** World-space turret heading in radians. */
    protected _turretRotation = 0;
    protected _turretMesh!: Mesh;
    protected readonly _moveSpeed: number;

    private _distanceSinceLastTread = 0;
    private readonly _testSphere = new Sphere();
    /** How far the tank moved during the current update, used to work out its velocity. */
    private readonly _frameMovement = new Vector3();
    private readonly _velocity = new Vector3();
    protected constructor(position: Vector3, moveSpeed: number) {
        super(position);
        this._moveSpeed = moveSpeed;
        // Destroyed tanks shatter; the pieces disappear after a few seconds
        this.breakSettings = { pieces: 14, lifetime: 3 };
    }

    /** Tanks are simulated: they push each other and physics objects, fall, and can land on things. */
    public get defaultPhysics(): PhysicsMode {
        return "dynamic";
    }

    public get turretRotation(): number {
        return this._turretRotation;
    }

    /** Velocity over the last update (world units per second). Used e.g. to push physics objects. */
    public get velocity(): Vector3 {
        return this._velocity;
    }

    /** Runs the tank's own behaviour (input or AI), then hands the movement to its physics body. */
    public update(deltaT: number): void {
        this._frameMovement.set(0, 0, 0);
        this.updateTank(deltaT);
        if (deltaT > 0) this._velocity.copy(this._frameMovement).divideScalar(deltaT);
        this.driveBody();
    }

    /**
     * The tank drives by setting its body's velocity: the movement of this frame (already applied
     * to the position, so the game logic sees it immediately) becomes the velocity for the physics
     * step, which then lets it push or be pushed by other tanks and objects. The rotation is
     * always controlled by the game.
     *
     * On the ground a tank that doesn't drive stands still; in the air it keeps its momentum
     * unless it's steered. Tanks on the ground grip each other so pushing one moves it straight
     * ahead; in the air they don't, so a tank jumping next to another isn't held back by it.
     */
    private driveBody(): void {
        const rigidbody = this.rigidbody;
        if (!rigidbody?.isDynamic) return;

        const grounded = rigidbody.isGrounded;
        rigidbody.setRotation(this.mesh.quaternion);
        rigidbody.setSurface(grounded && rigidbody.velocity.z < GRIP_MAX_RISE_SPEED ? "vehicle" : "frictionless");
        if (this._frameMovement.lengthSq() > 0 || grounded) {
            rigidbody.setHorizontalVelocity(this._velocity.x, this._velocity.y);
        }
    }

    /** The tank's behaviour for this frame: player input or AI. */
    protected abstract updateTank(deltaT: number): void;

    public async load(): Promise<void> {
        const model = ResourceManager.instance.getModel("tank").scene.clone();

        const body = model.children.find((child) => child.name === "Body") as Mesh | undefined;
        const turret = model.children.find((child) => child.name === "Turret") as Mesh | undefined;
        if (!body || !turret) {
            throw new Error("Tank model is missing its Body or Turret mesh");
        }

        body.material = BODY_MATERIAL;
        turret.material = TURRET_MATERIAL;
        for (const part of [body, turret]) {
            part.castShadow = true;
            part.receiveShadow = true;
            this.mesh.add(part);
        }
        this._turretMesh = turret;

        // Centred on the tank's pivot (not the model's bounding box, which is slightly off-centre),
        // so the collider is the same whichever way the tank faces and stays clear of the walls
        // next to a lane it drives down (radius ~0.44 < half a tile)
        const bounds = new Box3().setFromObject(this.mesh).getBoundingSphere(new Sphere());
        this.collider = new Sphere(new Vector3(this.position.x, this.position.y, bounds.center.z), bounds.radius * 0.5);
    }

    /** An upright cylinder (frictionless, except against other tanks) whose rotation only the game changes (it never tips over). */
    protected describePhysics(): PhysicsDescription {
        const height = Math.max(0.3, this.localBounds(this.mesh).max.z);
        return {
            shape: new Cylinder(BODY_RADIUS, BODY_RADIUS, height, 32),
            shapeRotation: UPRIGHT,
            offset: new Vector3(0, 0, height / 2),
            mass: MASS,
            surface: "vehicle",
            fixedRotation: true,
            linearDamping: 0,
            angularDamping: 0,
            group: "default",
        };
    }

    /** Whether the tank stands on something (the ground, a wall, another tank...). */
    public get isGrounded(): boolean {
        return this.rigidbody?.isGrounded ?? this.position.z <= TREAD_MAX_HEIGHT;
    }

    /** Blows the tank up: it shatters into pieces that disappear after a moment. Safe to call more than once. */
    public destroy(impact?: Impact): void {
        if (this.shouldDispose) return;

        void this.scene.add(new ExplosionEffect(this.position, 2));
        if (this.position.z <= TREAD_MAX_HEIGHT) {
            void this.scene.add(new DeathMarkEffect(new Vector3(this.position.x, this.position.y, 0)));
        }
        this.break(impact);
        this.shouldDispose = true; // In case it has no breakSettings
    }

    // ---- Helpers for subclasses ----------------------------------------------------------

    /** The direction the tank travels in: its body heading, or the opposite when reversing. */
    protected get travelHeading(): number {
        return wrapAngle(this._rotation + (this._reversing ? Math.PI : 0));
    }

    /**
     * Steers so the tank travels in `heading`. Returns true when the tank may drive this frame.
     *
     * - Already travelling in `heading`: returns true.
     * - `heading` is exactly opposite: tanks can drive their tracks both ways, so it just switches
     *   between forwards and reverse, without turning, and may drive straight away.
     * - Otherwise the body turns on the spot by at most `maxTurn` radians and returns false, also
     *   in the frame that completes the turn: the tank only starts driving once it has fully
     *   finished turning, never while still rotating.
     */
    protected steerTowards(heading: number, maxTurn: number): boolean {
        const bodyTarget = () => heading + (this._reversing ? Math.PI : 0);
        const difference = Math.abs(wrapAngle(heading - this.travelHeading));

        if (Math.abs(difference - Math.PI) <= ALIGN_EPSILON) {
            this._reversing = !this._reversing;
        } else if (difference > ALIGN_EPSILON) {
            this.setBodyRotation(stepAngleTowards(this._rotation, bodyTarget(), maxTurn));
            if (Math.abs(wrapAngle(heading - this.travelHeading)) <= ALIGN_EPSILON) {
                this.setBodyRotation(bodyTarget()); // Snap away rounding errors
            }
            return false;
        }

        // Snap away rounding errors so it travels exactly along `heading`
        this.setBodyRotation(bodyTarget());
        return true;
    }

    protected setBodyRotation(angle: number): void {
        this._rotation = wrapAngle(angle);
        this.mesh.rotation.z = this._rotation;
    }

    /** Points the turret at a world position. */
    protected aimTurretAt(target: Vector3): void {
        this._turretRotation = angleBetween(this.position, target);
        this._turretMesh.rotation.z = wrapAngle(this._turretRotation - this._rotation);
    }

    /** Fires the given weapon from the end of the barrel (optionally at a slightly different angle). */
    protected fire(weapon: WeaponStrategy, angle = this._turretRotation): void {
        const muzzle = directionFromAngle(angle, MUZZLE_DISTANCE).add(this.position);
        muzzle.z = this.position.z + MUZZLE_HEIGHT;
        weapon.spawn(this.scene, muzzle, angle);
    }

    /** Movement vector for driving `deltaT` seconds along a heading (defaults to the travel direction). */
    protected movementFor(deltaT: number, heading = this.travelHeading): Vector3 {
        return directionFromAngle(heading, this._moveSpeed * deltaT);
    }

    /**
     * Whether the tank could move by `movement` without hitting anything solid. Things it's
     * standing on top of (e.g. after jumping onto a wall) don't count.
     */
    protected canMove(movement: Vector3): boolean {
        const test = this._testSphere.copy(this.collider as Sphere);
        test.center.add(movement);
        return !this.scene.queryColliders(test, this)
            .some((entity) => entity.blocks(this, movement) && !this.isOnTopOf(entity));
    }

    private isOnTopOf(entity: Entity): boolean {
        const collider = entity.collider;
        const top = collider instanceof Box3 ? collider.max.z : collider ? collider.center.z + collider.radius : -Infinity;
        return top <= this.position.z + STEP_HEIGHT;
    }

    /**
     * Moves if possible. When blocked, slides along the wall on whichever axis is free
     * (scaled by `slideFactor`). Returns whether the tank moved.
     */
    protected moveWithSlide(movement: Vector3, slideFactor = 1): boolean {
        if (this.canMove(movement)) {
            this.applyMovement(movement);
            return true;
        }

        const alongX = new Vector3(movement.x, 0, 0);
        const alongY = new Vector3(0, movement.y, 0);
        if (movement.x !== 0 && this.canMove(alongX)) {
            this.applyMovement(alongX.multiplyScalar(slideFactor));
            return true;
        }
        if (movement.y !== 0 && this.canMove(alongY)) {
            this.applyMovement(alongY.multiplyScalar(slideFactor));
            return true;
        }
        return false;
    }

    protected applyMovement(movement: Vector3): void {
        this.position.add(movement);
        this._frameMovement.add(movement);
        (this.collider as Sphere).center.add(movement);
        this.leaveTreads(movement.length());
    }

    private leaveTreads(distance: number): void {
        if (this.position.z > TREAD_MAX_HEIGHT) return; // In the air or on top of something

        this._distanceSinceLastTread += distance;
        if (this._distanceSinceLastTread < TREAD_SPACING) return;

        this.scene.find(TreadsCanvas)?.drawTreads(this.position, this._rotation);
        this._distanceSinceLastTread = 0;
    }
}

export default Tank;
