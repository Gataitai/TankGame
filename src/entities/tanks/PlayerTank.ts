import { Vector2, Vector3 } from "three";
import Tank from "@/entities/tanks/Tank";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter";
import MissileShooter from "@/entities/tanks/weaponStrategies/MissileShooter";
import LandminePlacer from "@/entities/tanks/weaponStrategies/LandminePlacer";
import InputManager, { type Unsubscribe } from "@/scene/managers/InputManager";

const ROTATION_SPEED = Math.PI * 4;
/** Upwards speed of a jump; high enough to land on top of a wall. */
const JUMP_SPEED = 5.5;

class PlayerTank extends Tank {
    private readonly _bulletShooter = new BulletShooter();
    private readonly _missileShooter = new MissileShooter();
    private readonly _minePlacer = new LandminePlacer();
    private _primaryWeapon: WeaponStrategy = this._bulletShooter;

    /** Heading the tank keeps turning towards after the keys are released. */
    private _targetAngle: number | null = null;
    private _unsubscribers: Unsubscribe[] = [];

    constructor(position: Vector3, speed = 10) {
        super(position, speed);
    }

    public async load(): Promise<void> {
        await super.load();

        // Listen to input only once the tank is actually in a scene
        const input = InputManager.instance;
        this._unsubscribers = [
            input.onMouseUp(() => this.whenActive(() => this.fire(this._primaryWeapon))),
            input.onRightMouseUp(() => this.whenActive(() => this._minePlacer.spawn(this.scene, this.position.clone()))),
            input.onWheel((deltaY) => this.whenActive(() => this.switchWeapon(deltaY))),
            input.onKeyDown("Space", () => this.whenActive(() => this.jump())),
        ];
    }

    protected updateTank(deltaT: number): void {
        this._bulletShooter.update();
        this._missileShooter.update(deltaT);
        this._minePlacer.update();

        this.updateMovement(deltaT);
        this.aimTurretAt(this.scene.mouseWorldPosition);
    }

    public dispose(): void {
        super.dispose();
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    }

    /** Ignores input while the game is paused or the tank is dead. */
    private whenActive(action: () => void): void {
        if (!this.scene.paused && !this.shouldDispose) action();
    }

    /** Jumps, but only when standing on something (no double jumps). */
    private jump(): void {
        if (!this.rigidbody?.isDynamic || !this.isGrounded) return;
        this.rigidbody.setSurface("frictionless"); // Don't stick to a tank it's touching
        this.rigidbody.setVerticalVelocity(JUMP_SPEED);
    }

    private switchWeapon(deltaY: number): void {
        const next = deltaY < 0 ? this._bulletShooter : deltaY > 0 ? this._missileShooter : this._primaryWeapon;
        if (next === this._primaryWeapon) return;

        this._primaryWeapon = next;
        this.scene.hud.flash(next === this._bulletShooter ? "Bullets" : "Missiles");
    }

    private readDirection(): Vector2 {
        const input = InputManager.instance;
        const axis = (positive: string, negative: string) =>
            (input.isKeyDown(positive) ? 1 : 0) - (input.isKeyDown(negative) ? 1 : 0);

        // W moves towards +Y on screen, which is a negative value on this axis
        return new Vector2(axis("KeyD", "KeyA"), axis("KeyS", "KeyW"));
    }

    /** Turns towards the pressed direction first (or reverses), then drives once aligned. */
    private updateMovement(deltaT: number): void {
        const direction = this.readDirection();
        const hasInput = direction.lengthSq() > 0;
        if (!hasInput && this._targetAngle === null) return;

        const desiredAngle = hasInput ? Math.atan2(direction.x, direction.y) : this._targetAngle!;

        // Turns towards the new direction, or flips to reverse if it's the exact opposite
        if (!this.steerTowards(desiredAngle, ROTATION_SPEED * deltaT)) {
            this._targetAngle = desiredAngle;
            return;
        }

        this._targetAngle = null;
        if (hasInput) this.drive(deltaT);
    }

    /**
     * Just drives: physics stops the tank at walls (it slides along them), pushes loose objects
     * and other tanks out of the way and lets it drive up ramps.
     */
    private drive(deltaT: number): void {
        this.applyMovement(this.movementFor(deltaT));
    }
}

export default PlayerTank;
