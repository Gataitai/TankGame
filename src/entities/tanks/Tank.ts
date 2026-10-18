import { Box3, Mesh, MeshStandardMaterial, Sphere, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import ExplosionEffect from "@/effects/ExplosionEffect";
import DeathMarkEffect from "@/effects/DeathMarkEffect";
import GameScene from "@/scene/GameScene";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";
import { angleBetween, directionFromAngle, wrapAngle } from "@/utils/MathUtils";

const BODY_MATERIAL = markShared(new MeshStandardMaterial({ metalness: 0.9, roughness: 0.2 }));
const TURRET_MATERIAL = markShared(new MeshStandardMaterial({ metalness: 0.8, roughness: 0.3 }));

/** Where shots leave the barrel, relative to the tank. */
const MUZZLE_DISTANCE = 1;
const MUZZLE_HEIGHT = 0.5;

/** Distance driven between two tread marks. */
const TREAD_SPACING = 0.25;

abstract class Tank extends UpdatableEntity {
    /** Body heading in radians, always kept in [-PI, PI]. */
    protected _rotation = 0;
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

        const collider = new Box3().setFromObject(this.mesh).getBoundingSphere(new Sphere());
        collider.radius *= 0.5;
        this.collider = collider;
    }

    /** Blows the tank up. Safe to call more than once. */
    public destroy(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;

        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
        void GameScene.instance.spawn(new DeathMarkEffect(this.position));
    }

    // ---- Helpers for subclasses ----------------------------------------------------------

    protected setBodyRotation(angle: number): void {
        this._rotation = wrapAngle(angle);
        this.mesh.rotation.z = this._rotation;
    }

    /** Points the turret at a world position. */
    protected aimTurretAt(target: Vector3): void {
        this._turretRotation = angleBetween(this.position, target);
        this._turretMesh.rotation.z = wrapAngle(this._turretRotation - this._rotation);
    }

    /** Fires the given weapon from the end of the barrel. */
    protected fire(weapon: WeaponStrategy): void {
        const muzzle = directionFromAngle(this._turretRotation, MUZZLE_DISTANCE).add(this.position);
        muzzle.z = this.position.z + MUZZLE_HEIGHT;
        weapon.spawn(muzzle, this._turretRotation);
    }

    /** Movement vector for driving `deltaT` seconds along a heading (defaults to the current one). */
    protected movementFor(deltaT: number, heading = this._rotation): Vector3 {
        return directionFromAngle(heading, this._moveSpeed * deltaT);
    }

    /** Whether the tank could move by `movement` without hitting anything solid. */
    protected canMove(movement: Vector3): boolean {
        const test = this._testSphere.copy(this.collider as Sphere);
        test.center.add(movement);
        return !GameScene.instance.queryColliders(test, this).some((entity) => entity.blocksMovement);
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
