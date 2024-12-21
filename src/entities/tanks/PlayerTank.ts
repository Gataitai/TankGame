import Tank from "@/entities/tanks/Tank.ts";
import { Plane, Raycaster, Sphere, Vector2, Vector3 } from "three";
import GameScene from "@/scene/GameScene.ts";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter.ts";
import WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy.ts";
import MissileShooter from "@/entities/tanks/weaponStrategies/MissileShooter.ts";
import InputManager from "@/scene/managers/InputManager.ts";
import LandminePlacer from "@/entities/tanks/weaponStrategies/LandminePlacer.ts";
import Landmine from "@/entities/weapons/Landmine.ts";

type KeyboardState = {
    W: boolean;
    A: boolean;
    S: boolean;
    D: boolean;
};

class PlayerTank extends Tank {
    private _turretRotation: number = 0;
    private _weaponStrategy: WeaponStrategy;
    private _bulletShooter: BulletShooter = new BulletShooter();
    private _missileShooter: MissileShooter = new MissileShooter();
    private _minePlacer: LandminePlacer = new LandminePlacer();
    private _currentTargetAngle: number | null = null;

    private _keyboardState: KeyboardState = {
        W: false,
        A: false,
        S: false,
        D: false,
    };

    constructor(position: Vector3, speed: number = 3.5) {
        super(position, speed);
        this._weaponStrategy = this._bulletShooter; // Default is bullet shooter for left click

        const input = InputManager.instance;

        // Register key down callbacks
        input.onKeyPress("w", () => { this._keyboardState.W = true; });
        input.onKeyPress("a", () => { this._keyboardState.A = true; });
        input.onKeyPress("s", () => { this._keyboardState.S = true; });
        input.onKeyPress("d", () => { this._keyboardState.D = true; });

        // Register key up callbacks
        input.onKeyUp("w", () => { this._keyboardState.W = false; });
        input.onKeyUp("a", () => { this._keyboardState.A = false; });
        input.onKeyUp("s", () => { this._keyboardState.S = false; });
        input.onKeyUp("d", () => { this._keyboardState.D = false; });

        // Left mouse up for shooting bullets/missiles
        input.onMouseUp(() => {
            this.shoot();
        });

        // Right mouse up for placing mines via LandminePlacer
        input.onRightMouseUp(() => {
            this.placeMine();
        });

        // Wheel to switch bullet/missile shooter if needed
        input.onWheelEvent((deltaY: number) => {
            if (deltaY < 0) {
                this._weaponStrategy = this._bulletShooter;
                console.log("Switched to Bullet Shooter");
            } else if (deltaY > 0) {
                this._weaponStrategy = this._missileShooter;
                console.log("Switched to Missile Shooter");
            }
            input.resetWheelDelta();
        });
    }

    private shoot(): void {
        const spawnDistance = 1;
        const offset = new Vector3(
            Math.sin(this._turretRotation) * spawnDistance,
            -Math.cos(this._turretRotation) * spawnDistance,
            0.5
        );
        const shootingPosition = this.mesh.position.clone().add(offset);
        this._weaponStrategy.spawn(shootingPosition, this._turretRotation);
    }

    private placeMine(): void {
        const minePosition = this.mesh.position.clone();
        // Use the mine placer strategy for placing mines
        this._minePlacer.spawn(minePosition); // rotation not needed for mine
    }

    private calculateDesiredDirection(): Vector2 {
        let direction = new Vector2(0, 0);
        if (this._keyboardState.W) direction.y -= 1;
        if (this._keyboardState.S) direction.y += 1;
        if (this._keyboardState.A) direction.x -= 1;
        if (this._keyboardState.D) direction.x += 1;
        direction.normalize();
        return direction;
    }

    public update(deltaT: number): void {
        const moveSpeed = this._moveSpeed;
        const rotationSpeed = Math.PI * 4;
        const desiredDirection = this.calculateDesiredDirection();

        if (desiredDirection.length() > 0 || this._currentTargetAngle !== null) {
            const desiredAngle = desiredDirection.length() > 0
                ? Math.atan2(desiredDirection.x, desiredDirection.y)
                : this._currentTargetAngle!;

            const angleDifference = ((desiredAngle - this._rotation + Math.PI) % (2 * Math.PI)) - Math.PI;

            if (Math.abs(angleDifference) > 0.01) {
                // Rotate smoothly toward target angle
                this._rotation += Math.sign(angleDifference) * Math.min(rotationSpeed * deltaT, Math.abs(angleDifference));
                this.mesh.setRotationFromAxisAngle(new Vector3(0, 0, 1), this._rotation);
                this._currentTargetAngle = desiredAngle;
            } else {
                // Stop rotating once aligned
                this._currentTargetAngle = null;

                if (desiredDirection.length() > 0) {
                    const movement = new Vector3(
                        Math.sin(this._rotation) * moveSpeed * deltaT,
                        -Math.cos(this._rotation) * moveSpeed * deltaT,
                        0
                    );

                    if (this.canMove(movement)) {
                        this.applyMovement(movement);
                    } else {
                        const movementX = new Vector3(movement.x, 0, 0);
                        const movementY = new Vector3(0, movement.y, 0);

                        if (this.canMove(movementX)) {
                            movementX.multiplyScalar(0.5);
                            this.applyMovement(movementX);
                        } else if (this.canMove(movementY)) {
                            movementY.multiplyScalar(0.5);
                            this.applyMovement(movementY);
                        }
                    }
                }
            }
        }

        const input = InputManager.instance;
        const mouseNDC = input.mousePosition.clone();
        const raycaster = new Raycaster();
        raycaster.setFromCamera(mouseNDC, GameScene.instance.camera);

        const planeZ = new Plane(new Vector3(0, 0, 1), 0);
        const mouseWorldPosition = new Vector3();
        raycaster.ray.intersectPlane(planeZ, mouseWorldPosition);

        const tankPosition = this.mesh.position.clone();
        const direction = mouseWorldPosition.clone().sub(tankPosition);
        this._turretRotation = Math.atan2(direction.x, -direction.y);

        let turretLocalRotation = this._turretRotation - this._rotation;
        if (turretLocalRotation > Math.PI) {
            turretLocalRotation -= Math.PI * 2;
        } else if (turretLocalRotation < -Math.PI) {
            turretLocalRotation += Math.PI * 2;
        }
        this._tankTurretMesh.rotation.z = turretLocalRotation;
    }

    private canMove(movement: Vector3): boolean {
        const testingSphere = (this.collider as Sphere).clone();
        testingSphere.center.add(movement);

        const colliders = GameScene.instance.gameEntities.filter(
            (e) =>
                e !== this &&
                e.collider &&
                e.collider!.intersectsSphere(testingSphere) &&
                !(e instanceof Landmine)
        );

        return colliders.length === 0;
    }

    private applyMovement(movement: Vector3): void {
        this.mesh.position.add(movement);
        (this.collider as Sphere).center.add(movement);
        this.spawnTreads(movement); // Distance-based tread spawning
    }

    public dispose(): void {
        super.dispose();

        const input = InputManager.instance;
        // Remove all key bindings
        input.offKeyPress("w");
        input.offKeyPress("a");
        input.offKeyPress("s");
        input.offKeyPress("d");

        input.offKeyUp("w");
        input.offKeyUp("a");
        input.offKeyUp("s");
        input.offKeyUp("d");

        input.offMouseUp();
        input.offRightMouseUp();
        input.offWheelEvent();
    }
}

export default PlayerTank;
