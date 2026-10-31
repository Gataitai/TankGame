import { Vector2, Vector3 } from "three";
import Tank, { type FlipDirection } from "@/entities/tanks/Tank";
import type WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter";
import MissileShooter from "@/entities/tanks/weaponStrategies/MissileShooter";
import LandminePlacer from "@/entities/tanks/weaponStrategies/LandminePlacer";
import GameScene from "@/scene/GameScene";
import InputManager, { type Unsubscribe } from "@/scene/managers/InputManager";
import { wrapAngle } from "@/utils/MathUtils";

const ROTATION_SPEED = Math.PI * 4;

// The turret spins like a helicopter rotor while flying
const ROTOR_MAX_SPEED = Math.PI * 10;
const ROTOR_SPIN_UP = Math.PI * 12;
const ROTOR_SPIN_DOWN = Math.PI * 6;
/** Below this speed the rotor stops and the turret follows the mouse again. */
const ROTOR_STOP_SPEED = Math.PI;

/** Arrow keys put a knocked-over tank back on its tracks, rolling the way of the key. */
const RIGHTING_KEYS: [string, FlipDirection][] = [
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["ArrowUp", "forward"],
    ["ArrowDown", "back"],
];

class PlayerTank extends Tank {
    private readonly _bulletShooter = new BulletShooter();
    private readonly _missileShooter = new MissileShooter();
    private readonly _minePlacer = new LandminePlacer();
    private _primaryWeapon: WeaponStrategy = this._bulletShooter;

    /** Heading the tank keeps turning towards after the keys are released. */
    private _targetAngle: number | null = null;
    private _rotorSpeed = 0;
    private readonly _unsubscribers: Unsubscribe[];

    constructor(position: Vector3, speed = 5) {
        super(position, speed);

        const input = InputManager.instance;
        this._unsubscribers = [
            input.onMouseUp(() => this.whenActive(() => this.fire(this._primaryWeapon))),
            input.onRightMouseUp(() => this.whenActive(() => this.placeMine())),
            input.onWheel((deltaY) => this.whenActive(() => this.switchWeapon(deltaY))),
        ];
    }

    public update(deltaT: number): void {
        this._bulletShooter.update();
        this._missileShooter.update(deltaT);
        this._minePlacer.update();

        const input = InputManager.instance;
        const direction = this.readDirection();

        // Space: fly. WASD steers in the air.
        this._thrusting = input.isKeyDown("Space");
        this._airControl.set(direction.x, -direction.y, 0);
        if (this._airControl.lengthSq() > 1) this._airControl.normalize();

        for (const [key, roll] of RIGHTING_KEYS) {
            if (input.isKeyDown(key)) this.requestRighting(roll);
        }

        if (this.isDriving) this.updateMovement(direction, deltaT);
        this.updateTurret(deltaT);
    }

    public dispose(): void {
        super.dispose();
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    }

    /** Ignores input while the game is paused or the tank is dead. */
    private whenActive(action: () => void): void {
        if (!GameScene.instance.paused && !this.shouldDispose) action();
    }

    private placeMine(): void {
        if (this.isDriving) this._minePlacer.spawn(this.position.clone());
    }

    private switchWeapon(deltaY: number): void {
        const next = deltaY < 0 ? this._bulletShooter : deltaY > 0 ? this._missileShooter : this._primaryWeapon;
        if (next === this._primaryWeapon) return;

        this._primaryWeapon = next;
        GameScene.instance.notify(next === this._bulletShooter ? "Bullets" : "Missiles");
    }

    /** Spins the turret like a rotor while flying; otherwise it follows the mouse. */
    private updateTurret(deltaT: number): void {
        this._rotorSpeed = this._thrusting
            ? Math.min(ROTOR_MAX_SPEED, this._rotorSpeed + ROTOR_SPIN_UP * deltaT)
            : Math.max(0, this._rotorSpeed - ROTOR_SPIN_DOWN * deltaT);

        if (this._rotorSpeed > ROTOR_STOP_SPEED) {
            this._turretMesh.rotation.z = wrapAngle(this._turretMesh.rotation.z + this._rotorSpeed * deltaT);
            this._turretRotation = this.barrelHeading(); // Shots go wherever the barrel points
        } else if (this.isDriving) {
            this.aimTurretAt(GameScene.instance.mouseWorldPosition);
        } else {
            this._turretRotation = this.barrelHeading();
        }
    }

    private readDirection(): Vector2 {
        const input = InputManager.instance;
        const axis = (positive: string, negative: string) =>
            (input.isKeyDown(positive) ? 1 : 0) - (input.isKeyDown(negative) ? 1 : 0);

        // W moves towards +Y on screen, which is a negative value on this axis
        return new Vector2(axis("KeyD", "KeyA"), axis("KeyS", "KeyW"));
    }

    /** Turns towards the pressed direction first (or reverses), then drives once aligned. */
    private updateMovement(direction: Vector2, deltaT: number): void {
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
