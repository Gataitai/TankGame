import { Box3, Mesh, MeshStandardMaterial, Quaternion, Sphere, Vector3 } from "three";
import { Body, Sphere as SphereShape, Vec3 } from "cannon-es";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type { Impact } from "@/entities/Entity";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import ExplosionEffect from "@/effects/ExplosionEffect";
import DeathMarkEffect from "@/effects/DeathMarkEffect";
import GameScene from "@/scene/GameScene";
import { CollisionGroups, PhysicsMaterials } from "@/physics/PhysicsWorld";
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
/**
 * The physics shape is a ball that doesn't roll (its rotation is fixed): it turns on the spot without
 * bumping into anything, rolls smoothly onto ramps and over small debris, and can't climb walls.
 * The radius stays under half a tile so tanks fit through one-tile lanes.
 */
const BODY_RADIUS = 0.42;
const MASS = 5;
/**
 * Driving up a ramp gives the tank upward speed, which would launch it off the top. While there's
 * ground at most this far below it, it sticks to it instead. Real drops (like the end of a jump
 * ramp) are further away, so the tank still flies off those.
 */
const GROUND_SNAP_DISTANCE = 0.3;
/** Ground further below than this doesn't tilt the tank (it levels out in the air). */
const TILT_PROBE_DISTANCE = 0.6;
/** How quickly the tank tilts to match the ground under it. */
const TILT_RATE = 12;
/** Treads are only drawn while the tank is (about) on the ground. */
const TREAD_MAX_HEIGHT = 0.05;
/** How fast the pieces of a destroyed tank fly apart. */
export const TANK_BREAK_FORCE = 4;

const UP = new Vector3(0, 0, 1);
const _yaw = new Quaternion();
const _targetTilt = new Quaternion();
const _center = new Vector3();

/**
 * Base class of all tanks.
 *
 * Tanks have a dynamic physics body, so they collide with everything, push loose objects and other
 * tanks around, drive up ramps and fall off edges. They're driven by velocity: movement asked for
 * during update() (applyMovement) becomes the body's horizontal velocity for the physics step, so
 * when nothing is in the way a tank ends up exactly where it wanted to go (the AI relies on that).
 * The body never rotates: the tank sets its own heading, and the model tilts to match the ground
 * under it (e.g. on a ramp).
 */
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
    /** Movement asked for this frame, turned into velocity before the physics step. */
    private readonly _pendingMovement = new Vector3();
    /** How the model is tilted to match the ground (on top of its heading). */
    private readonly _tilt = new Quaternion();

    protected constructor(position: Vector3, moveSpeed: number) {
        super(position);
        this._moveSpeed = moveSpeed;
        this.destructible = true;
    }

    public get turretRotation(): number {
        return this._turretRotation;
    }

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

        const physicsBody = this.createBody({
            mass: MASS,
            material: PhysicsMaterials.tank,
            collisionFilterGroup: CollisionGroups.tank,
            allowSleep: false,
            linearDamping: 0,
            fixedRotation: true,
        });
        // The tank's origin is at the bottom of the model, so the ball sits on top of it
        physicsBody.addShape(new SphereShape(BODY_RADIUS), new Vec3(0, 0, BODY_RADIUS));
    }

    /** Blows up and breaks into pieces made from the tank's body and turret. */
    public destroy(point: Vector3 = this.position, force = TANK_BREAK_FORCE): void {
        super.destroy(point, force);
    }

    protected onDestroyed(_impact: Impact): void {
        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
        void GameScene.instance.spawn(new DeathMarkEffect(this.position));
    }

    // ---- Physics -------------------------------------------------------------------------

    /** Turns the movement asked for this frame into velocity. */
    public beforePhysicsStep(deltaT: number): void {
        const body = this.body;
        if (!body) return;

        // Driving only works with the tracks on something. In the air the tank keeps its momentum.
        if (deltaT > 0 && GameScene.instance.physics.isSupported(body)) {
            body.velocity.x = this._pendingMovement.x / deltaT;
            body.velocity.y = this._pendingMovement.y / deltaT;
            this.stickToGround(body);
        }
        this._pendingMovement.set(0, 0, 0);
    }

    /** Takes over where physics put the tank, and tilts the model to match the ground. */
    public afterPhysicsStep(deltaT: number): void {
        const body = this.body;
        if (!body) return;

        this.position.set(body.position.x, body.position.y, body.position.z);

        const ground = GameScene.instance.physics.groundBelow(this.centerOf(body), BODY_RADIUS + TILT_PROBE_DISTANCE);
        const up = ground && ground.normal.z > 0.5 ? ground.normal : UP;
        _targetTilt.setFromUnitVectors(UP, up);
        this._tilt.slerp(_targetTilt, Math.min(1, TILT_RATE * deltaT));

        this.applyOrientation();
        this.updateCollider();
    }

    /** Removes velocity that would make the tank leave the ground it's driving on. */
    private stickToGround(body: Body): void {
        const ground = GameScene.instance.physics.groundBelow(this.centerOf(body), BODY_RADIUS + GROUND_SNAP_DISTANCE);
        if (!ground) return;

        const { normal } = ground;
        const away = body.velocity.x * normal.x + body.velocity.y * normal.y + body.velocity.z * normal.z;
        if (away <= 0) return;
        body.velocity.x -= normal.x * away;
        body.velocity.y -= normal.y * away;
        body.velocity.z -= normal.z * away;
    }

    private centerOf(body: Body): Vector3 {
        return _center.set(body.position.x, body.position.y, body.position.z + BODY_RADIUS);
    }

    private applyOrientation(): void {
        _yaw.setFromAxisAngle(UP, this._rotation);
        this.mesh.quaternion.multiplyQuaternions(this._tilt, _yaw);
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
        this.applyOrientation();
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
        weapon.spawn(muzzle, angle);
    }

    /** Movement vector for driving `deltaT` seconds along a heading (defaults to the travel direction). */
    protected movementFor(deltaT: number, heading = this.travelHeading): Vector3 {
        return directionFromAngle(heading, this._moveSpeed * deltaT);
    }

    /** Whether the tank could move by `movement` without hitting anything solid. */
    protected canMove(movement: Vector3): boolean {
        const test = this._testSphere.copy(this.collider as Sphere);
        test.center.add(movement);
        return !GameScene.instance.queryColliders(test, this).some((entity) => entity.blocksMovement);
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

    /**
     * Drives by `movement` this frame. The position is updated right away (so the AI can keep
     * planning from it) and physics then moves the body there, unless something is in the way.
     */
    protected applyMovement(movement: Vector3): void {
        this.position.add(movement);
        (this.collider as Sphere).center.add(movement);
        this._pendingMovement.add(movement);
        this.leaveTreads(movement.length());
    }

    private leaveTreads(distance: number): void {
        if (this.position.z > TREAD_MAX_HEIGHT) return; // Up on a ramp or block
        this._distanceSinceLastTread += distance;
        if (this._distanceSinceLastTread < TREAD_SPACING) return;

        GameScene.instance.treadsCanvas?.drawTreads(this.position, this._rotation);
        this._distanceSinceLastTread = 0;
    }
}

export default Tank;
