import { Box3, Mesh, MeshStandardMaterial, Sphere, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import ExplosionEffect from "@/effects/ExplosionEffect";
import DeathMarkEffect from "@/effects/DeathMarkEffect";
import GameScene from "@/scene/GameScene";
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

    protected constructor(position: Vector3, moveSpeed: number) {
        super(position);
        this._moveSpeed = moveSpeed;
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
    }

    /** Blows the tank up. Safe to call more than once. */
    public destroy(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;

        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
        void GameScene.instance.spawn(new DeathMarkEffect(this.position));
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

    protected applyMovement(movement: Vector3): void {
        this.position.add(movement);
        (this.collider as Sphere).center.add(movement);
        this.leaveTreads(movement.length());
    }

    private leaveTreads(distance: number): void {
        this._distanceSinceLastTread += distance;
        if (this._distanceSinceLastTread < TREAD_SPACING) return;

        GameScene.instance.treadsCanvas?.drawTreads(this.position, this._rotation);
        this._distanceSinceLastTread = 0;
    }
}

export default Tank;
