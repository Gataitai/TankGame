import { Vector2, Vector3 } from "three";
import Tank from "@/entities/tanks/Tank";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter";
import MissileShooter from "@/entities/tanks/weaponStrategies/MissileShooter";
import LandminePlacer from "@/entities/tanks/weaponStrategies/LandminePlacer";
import GameScene from "@/scene/GameScene";
import InputManager, { type Unsubscribe } from "@/scene/managers/InputManager";
import { stepAngleTowards, wrapAngle } from "@/utils/MathUtils";

const ROTATION_SPEED = Math.PI * 4;
const ALIGN_THRESHOLD = 0.01;

class PlayerTank extends Tank {
    private readonly _bulletShooter = new BulletShooter();
    private readonly _missileShooter = new MissileShooter();
    private readonly _minePlacer = new LandminePlacer();
    private _primaryWeapon: WeaponStrategy = this._bulletShooter;

    /** Heading the tank keeps turning towards after the keys are released. */
    private _targetAngle: number | null = null;
    private readonly _unsubscribers: Unsubscribe[];

    constructor(position: Vector3, speed = 3.5) {
        super(position, speed);

        const input = InputManager.instance;
        this._unsubscribers = [
            input.onMouseUp(() => this.whenActive(() => this.fire(this._primaryWeapon))),
            input.onRightMouseUp(() => this.whenActive(() => this._minePlacer.spawn(this.position.clone()))),
            input.onWheel((deltaY) => this.whenActive(() => this.switchWeapon(deltaY))),
        ];
    }

    public update(deltaT: number): void {
        this._bulletShooter.update();
        this._missileShooter.update(deltaT);
        this._minePlacer.update();

        this.updateMovement(deltaT);
        this.aimTurretAt(GameScene.instance.mouseWorldPosition);
    }

    public dispose(): void {
        super.dispose();
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    }

    /** Ignores input while the game is paused or the tank is dead. */
    private whenActive(action: () => void): void {
        if (!GameScene.instance.paused && !this.shouldDispose) action();
    }

    private switchWeapon(deltaY: number): void {
        const next = deltaY < 0 ? this._bulletShooter : deltaY > 0 ? this._missileShooter : this._primaryWeapon;
        if (next === this._primaryWeapon) return;

        this._primaryWeapon = next;
        GameScene.instance.notify(next === this._bulletShooter ? "Bullets" : "Missiles");
    }

    private readDirection(): Vector2 {
        const input = InputManager.instance;
        const axis = (positive: string, negative: string) =>
            (input.isKeyDown(positive) ? 1 : 0) - (input.isKeyDown(negative) ? 1 : 0);

        // W moves towards +Y on screen, which is a negative value on this axis
        return new Vector2(axis("KeyD", "KeyA"), axis("KeyS", "KeyW"));
    }

    /** Turns towards the pressed direction first, then drives once aligned. */
    private updateMovement(deltaT: number): void {
        const direction = this.readDirection();
        const hasInput = direction.lengthSq() > 0;
        if (!hasInput && this._targetAngle === null) return;

        const desiredAngle = hasInput ? Math.atan2(direction.x, direction.y) : this._targetAngle!;

        if (Math.abs(wrapAngle(desiredAngle - this._rotation)) > ALIGN_THRESHOLD) {
            this.setBodyRotation(stepAngleTowards(this._rotation, desiredAngle, ROTATION_SPEED * deltaT));
            this._targetAngle = desiredAngle;
            return;
        }

        this._targetAngle = null;
        if (hasInput) this.drive(deltaT);
    }

    private drive(deltaT: number): void {
        const movement = this.movementFor(deltaT);
        if (this.canMove(movement)) {
            this.applyMovement(movement);
            return;
        }

        // Blocked: slide along the wall at half speed on whichever axis is free
        const alongX = new Vector3(movement.x, 0, 0);
        const alongY = new Vector3(0, movement.y, 0);
        if (this.canMove(alongX)) {
            this.applyMovement(alongX.multiplyScalar(0.5));
        } else if (this.canMove(alongY)) {
            this.applyMovement(alongY.multiplyScalar(0.5));
        }
    }
}

export default PlayerTank;
