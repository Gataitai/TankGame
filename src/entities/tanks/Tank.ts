import { Box3, Mesh, MeshStandardMaterial, Quaternion, Sphere, Vector3 } from "three";
import { Body, Box, Sphere as SphereShape, Vec3 } from "cannon-es";
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
import { GRAVITY } from "@/config";

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

// ---- Flying and tumbling
// In the air (and when knocked over) the tank is a box around the model that rotates freely.
/** Height of the middle of the model above its bottom: the box rotates around this point. */
const CENTER_HEIGHT = 0.32;
const HALF_EXTENTS = new Vec3(0.44, 0.52, 0.32);
/** Being in the air longer than this (seconds) lets the tank tumble (short drops don't). */
const TUMBLE_AFTER_AIRTIME = 0.35;
/** Upward acceleration while thrusting (gravity is subtracted from it). */
const THRUST_ACCELERATION = GRAVITY * 2.2;
const MAX_RISE_SPEED = 7;
/** Thrust stops working above this height. */
const MAX_ALTITUDE = 25;
/** Flying tanks are pushed back at this speed when they try to leave the map. */
const MAP_EDGE_PUSH_SPEED = 3;
/** How quickly the tank can change its horizontal speed in the air. */
const AIR_ACCELERATION = 14;
/**
 * In the air the tank topples in the direction it's moving: it spins this many radians per second
 * for every unit of horizontal speed, around the horizontal axis across its motion.
 */
const TUMBLE_PER_SPEED = 0.35;
/** How quickly the spin follows the motion. */
const TUMBLE_RESPONSE = 3;
/** Only real flights make it topple, not bouncing on the ground (seconds without ground contact). */
const TUMBLE_MIN_FLIGHT = 0.25;
/** Tanks whose up direction is at least this vertical (z of the unit vector) count as upright. */
const UPRIGHT_Z = 0.85;
/** It only drives again once it has (almost) stopped spinning. */
const LANDING_MAX_SPIN = 6;
/** Getting back on the tracks: a small hop, then rotating upright. */
const RIGHTING_HOP_SPEED = 4;
const RIGHTING_TIME = 0.9;
const RIGHTING_GAIN = 7;
const RIGHTING_MAX_SPIN = 9;
const RIGHTING_COOLDOWN = 0.5;

/** Which way to roll a tank that's upside down (as seen from the tank). */
export type FlipDirection = "left" | "right" | "forward" | "back";

const UP = new Vector3(0, 0, 1);
/** The model points towards -Y and its right side is +X. */
const MODEL_FORWARD = new Vector3(0, -1, 0);
const MODEL_RIGHT = new Vector3(1, 0, 0);
const _yaw = new Quaternion();
const _targetTilt = new Quaternion();
const _center = new Vector3();
const _bodyQuaternion = new Quaternion();
const _offset = new Vector3();
const _up = new Vector3();
const _axis = new Vector3();

/**
 * Base class of all tanks.
 *
 * Tanks have a dynamic physics body, so they collide with everything, push loose objects and other
 * tanks around, drive up ramps and fall off edges. They're driven by velocity: movement asked for
 * during update() (applyMovement) becomes the body's horizontal velocity for the physics step, so
 * when nothing is in the way a tank ends up exactly where it wanted to go (the AI relies on that).
 * The body never rotates while driving: the tank sets its own heading, and the model tilts to
 * match the ground under it (e.g. on a ramp).
 *
 * In the air (flying, or after a long drop) the tank switches to "tumbling": its body becomes a box
 * that rotates freely, and it topples in the direction it's moving. When it lands on its tracks it
 * drives again; when it lands on its side or roof it has to be put back on its tracks (see
 * requestRighting).
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

    private _mode: "driving" | "tumbling" = "driving";
    private _airTime = 0;
    private _tumbleTime = 0;
    /** Seconds without ground contact while tumbling. */
    private _flightTime = 0;
    /** Set by subclasses each frame: fly upwards. */
    protected _thrusting = false;
    /** Set by subclasses each frame: where to accelerate in the air (world XY, length 0..1). */
    protected readonly _airControl = new Vector3();
    private _rightingRequest: FlipDirection | null = null;
    private _rightingTime = 0;
    private _rightingCooldown = 0;
    private _rightingDirection: FlipDirection = "right";

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
        physicsBody.quaternion.set(0, 0, 0, 1); // The heading is the tank's own business
        this.setPhysicsShape("driving");
    }

    /** Whether it's on its tracks and can drive (not flying, falling or knocked over). */
    public get isDriving(): boolean {
        return this._mode === "driving";
    }

    /** Lying on its side or roof. */
    public get isKnockedOver(): boolean {
        return this._mode === "tumbling" && this.upVector().z < UPRIGHT_Z;
    }

    /**
     * When knocked over and on the ground: hops and turns itself back onto its tracks (like
     * flipping a car back over in GTA). `direction` picks the way to roll when it's exactly upside
     * down; otherwise it takes the shortest way. Safe to call every frame.
     */
    public requestRighting(direction: FlipDirection): void {
        this._rightingRequest = direction;
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

    /** Turns the movement asked for this frame into velocity (or flies, tumbles and rights itself). */
    public beforePhysicsStep(deltaT: number): void {
        const body = this.body;
        if (!body) return;

        if (this._mode === "driving" && this._thrusting) this.startTumbling();

        if (this._mode === "driving") {
            // Driving only works with the tracks on something. In the air the tank keeps its momentum.
            if (deltaT > 0 && GameScene.instance.physics.isSupported(body)) {
                body.velocity.x = this._pendingMovement.x / deltaT;
                body.velocity.y = this._pendingMovement.y / deltaT;
                this.stickToGround(body);
            }
        } else {
            this.fly(body, deltaT);
        }
        this._pendingMovement.set(0, 0, 0);
        this._rightingRequest = null;
    }

    /** Takes over where physics put the tank, and tilts the model to match the ground. */
    public afterPhysicsStep(deltaT: number): void {
        const body = this.body;
        if (!body) return;

        if (this._mode === "tumbling") {
            this.afterTumbling(body, deltaT);
            return;
        }

        this.position.set(body.position.x, body.position.y, body.position.z);

        const ground = GameScene.instance.physics.groundBelow(this.centerOf(body), BODY_RADIUS + TILT_PROBE_DISTANCE);
        const up = ground && ground.normal.z > 0.5 ? ground.normal : UP;
        _targetTilt.setFromUnitVectors(UP, up);
        this._tilt.slerp(_targetTilt, Math.min(1, TILT_RATE * deltaT));

        this.applyOrientation();
        this.updateCollider();

        // A long time in the air (off a ramp, blown up): let it tumble
        this._airTime = GameScene.instance.physics.isSupported(body) ? 0 : this._airTime + deltaT;
        if (this._airTime > TUMBLE_AFTER_AIRTIME) this.startTumbling();
    }

    // ---- Tumbling ------------------------------------------------------------------------

    /** Thrust, air control, toppling with the motion, and getting back on the tracks. */
    private fly(body: Body, deltaT: number): void {
        const physics = GameScene.instance.physics;
        const onGround = physics.isSupported(body);
        this._flightTime = onGround ? 0 : this._flightTime + deltaT;
        this._rightingCooldown -= deltaT;

        if (this._thrusting && body.position.z < MAX_ALTITUDE) {
            body.velocity.z = Math.min(MAX_RISE_SPEED, body.velocity.z + THRUST_ACCELERATION * deltaT);
        }

        this.stayAboveMap(body);

        if (!onGround && this._airControl.lengthSq() > 0) {
            body.velocity.x += this._airControl.x * AIR_ACCELERATION * deltaT;
            body.velocity.y += this._airControl.y * AIR_ACCELERATION * deltaT;
            const speed = Math.hypot(body.velocity.x, body.velocity.y);
            if (speed > this._moveSpeed) {
                body.velocity.x *= this._moveSpeed / speed;
                body.velocity.y *= this._moveSpeed / speed;
            }
        }

        // Knocked over on the ground and asked to get up: hop, then turn upright (below)
        if (this._rightingRequest && onGround && this.isKnockedOver && this._rightingTime <= 0 && this._rightingCooldown <= 0) {
            this._rightingTime = RIGHTING_TIME;
            this._rightingDirection = this._rightingRequest;
            body.velocity.z = RIGHTING_HOP_SPEED;
        }

        if (this._rightingTime > 0) {
            this._rightingTime -= deltaT;
            this.turnUpright(body);
            if (this._rightingTime <= 0) this._rightingCooldown = RIGHTING_COOLDOWN;
        } else if (this._flightTime > TUMBLE_MIN_FLIGHT || this._thrusting) {
            // Topple in the direction of motion: spin around the horizontal axis across it, so the
            // front goes down when flying forwards
            _axis.set(-body.velocity.y, body.velocity.x, 0).multiplyScalar(TUMBLE_PER_SPEED);
            const blend = Math.min(1, TUMBLE_RESPONSE * deltaT);
            body.angularVelocity.x += (_axis.x - body.angularVelocity.x) * blend;
            body.angularVelocity.y += (_axis.y - body.angularVelocity.y) * blend;
        }
    }

    /** Invisible walls in the air: flying tanks can't leave the map. */
    private stayAboveMap(body: Body): void {
        const min = 1;
        const max = GameScene.instance.stage.mapSize - 2;
        if (body.position.x < min) body.velocity.x = Math.max(body.velocity.x, MAP_EDGE_PUSH_SPEED);
        if (body.position.x > max) body.velocity.x = Math.min(body.velocity.x, -MAP_EDGE_PUSH_SPEED);
        if (body.position.y < min) body.velocity.y = Math.max(body.velocity.y, MAP_EDGE_PUSH_SPEED);
        if (body.position.y > max) body.velocity.y = Math.min(body.velocity.y, -MAP_EDGE_PUSH_SPEED);
    }

    /** Spins the body so its up direction turns towards the sky. */
    private turnUpright(body: Body): void {
        const up = this.upVector();
        const angle = up.angleTo(UP);
        if (angle < 0.05) {
            body.angularVelocity.set(0, 0, 0);
            this._rightingTime = 0;
            return;
        }

        // Rotating around up x sky turns up towards the sky. Exactly upside down that axis is
        // undefined, so roll the way that was asked for instead.
        _axis.crossVectors(up, UP);
        if (_axis.lengthSq() < 0.04) {
            const sideways = this._rightingDirection === "left" || this._rightingDirection === "right";
            const sign = this._rightingDirection === "right" || this._rightingDirection === "forward" ? 1 : -1;
            _axis.copy(sideways ? MODEL_FORWARD : MODEL_RIGHT).applyQuaternion(this.bodyQuaternion()).multiplyScalar(sign);
        }
        _axis.normalize().multiplyScalar(Math.min(RIGHTING_MAX_SPIN, angle * RIGHTING_GAIN));
        body.angularVelocity.set(_axis.x, _axis.y, _axis.z);
    }

    private afterTumbling(body: Body, deltaT: number): void {
        this._tumbleTime += deltaT;

        // The body's origin is the middle of the model; the entity's position is its bottom
        const q = this.bodyQuaternion();
        _offset.set(0, 0, CENTER_HEIGHT).applyQuaternion(q);
        this.position.set(body.position.x - _offset.x, body.position.y - _offset.y, body.position.z - _offset.z);
        this.mesh.quaternion.copy(q);
        this.updateCollider();

        const landed = GameScene.instance.physics.isSupported(body)
            && !this._thrusting
            && this._tumbleTime > 0.2
            && this.upVector().z >= UPRIGHT_Z
            && body.angularVelocity.length() < LANDING_MAX_SPIN;
        if (landed) this.startDriving();
    }

    /** From driving to a freely rotating box (keeps the current position, tilt and heading). */
    private startTumbling(): void {
        const body = this.body!;
        this._mode = "tumbling";
        this._tumbleTime = 0;
        this._flightTime = this._airTime;
        this._rightingTime = 0;

        const q = this.mesh.quaternion;
        _offset.set(0, 0, CENTER_HEIGHT).applyQuaternion(q);
        body.position.vadd(new Vec3(_offset.x, _offset.y, _offset.z), body.position);
        body.quaternion.set(q.x, q.y, q.z, q.w);
        this.setPhysicsShape("tumbling");
    }

    /** Back on its tracks: the heading is wherever it ended up facing. */
    private startDriving(): void {
        const body = this.body!;
        const q = this.bodyQuaternion();

        const forward = MODEL_FORWARD.clone().applyQuaternion(q);
        this._rotation = wrapAngle(Math.atan2(forward.x, -forward.y));
        this._reversing = false;
        this._tilt.setFromUnitVectors(UP, this.upVector());

        // Back to the origin at the bottom of the model, and no more rotation
        body.position.set(this.position.x, this.position.y, this.position.z);
        body.quaternion.set(0, 0, 0, 1);
        body.angularVelocity.set(0, 0, 0);
        this.setPhysicsShape("driving");

        this._mode = "driving";
        this._airTime = 0;
        this.applyOrientation();
    }

    /** Driving: a ball that doesn't rotate. Tumbling: a box around the model that does. */
    private setPhysicsShape(mode: "driving" | "tumbling"): void {
        const body = this.body!;
        while (body.shapes.length > 0) body.removeShape(body.shapes[0]);

        if (mode === "driving") {
            // The tank's origin is at the bottom of the model, so the ball sits on top of it
            body.addShape(new SphereShape(BODY_RADIUS), new Vec3(0, 0, BODY_RADIUS));
            body.material = PhysicsMaterials.tank;
            body.angularDamping = 0;
        } else {
            body.addShape(new Box(HALF_EXTENTS));
            body.material = PhysicsMaterials.prop; // Has friction, so it doesn't slide around on its roof
            body.angularDamping = 0.1;
        }
        body.fixedRotation = mode === "driving";
        body.updateMassProperties();
        body.aabbNeedsUpdate = true;
    }

    private bodyQuaternion(): Quaternion {
        const q = this.body!.quaternion;
        return _bodyQuaternion.set(q.x, q.y, q.z, q.w);
    }

    /** The model's up direction in the world. */
    private upVector(): Vector3 {
        return _up.copy(UP).applyQuaternion(this.mesh.quaternion);
    }

    /** The direction the barrel points in (as a heading), wherever the tank is facing. */
    protected barrelHeading(): number {
        this._turretMesh.updateWorldMatrix(true, false);
        const direction = MODEL_FORWARD.clone().transformDirection(this._turretMesh.matrixWorld);
        return Math.atan2(direction.x, -direction.y);
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
