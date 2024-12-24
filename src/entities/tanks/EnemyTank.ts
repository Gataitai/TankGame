import Tank from "@/entities/tanks/Tank.ts";
import {Vector3} from "three";
import GameScene from "@/scene/GameScene.ts";
import PlayerTank from "@/entities/tanks/PlayerTank.ts";
import WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy.ts";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter.ts";

enum TankState {
    PATROLLING,
    CHASING,
    ATTACKING
}

class EnemyTank extends Tank {
    private _state = TankState.PATROLLING;
    private _nextRotation = this.randomDesiredDirection();
    private _waitingToMove = false;
    private readonly _attackCooldown = .5; // 2 seconds cooldown
    private _timeSinceDirectionChange = 0;
    private _timeSinceLastShot = this._attackCooldown;
    private readonly _directionChangeInterval = 1;
    private readonly _detectionRadius = 15;
    private readonly _attackRadius = 3;
    private _weaponStrategy: WeaponStrategy;
    private _bulletShooter: BulletShooter = new BulletShooter();


    constructor(position: Vector3, speed = 3) {
        super(position, speed);
        this._rotation = this._nextRotation;
        this.mesh.rotation.z = this._rotation;
        this._weaponStrategy = this._bulletShooter;
    }

    public update(deltaT: number): void {
        if (this.shouldDispose || !this.mesh || !this.collider) return;

        this._timeSinceDirectionChange += deltaT;

        this.updateState();

        switch (this._state) {
            case TankState.PATROLLING:
                this.patrol(deltaT);
                break;
            case TankState.CHASING:
                this.attack(deltaT);
                this.chase(deltaT);
                break;
            case TankState.ATTACKING:
                this.attack(deltaT);
                break;
        }
    }

    private updateState(): void {
        const playerPosition = this.getPlayerPosition();

        // If playerPosition is Vector3(0, 0, 0), assume player is dead or not found
        if (playerPosition.equals(new Vector3(0, 0, 0))) {
            this._state = TankState.PATROLLING;
            return;
        }

        const distanceToPlayer = playerPosition.distanceTo(this.mesh.position);

        if (distanceToPlayer < this._attackRadius) {
            this._state = TankState.ATTACKING;
        } else if (distanceToPlayer < this._detectionRadius) {
            console.log(distanceToPlayer)
            this._state = TankState.CHASING;
        } else {
            this._state = TankState.PATROLLING;
        }
    }


    private patrol(deltaT: number): void {
        this.resetTurretRotation(deltaT);
        if (this._waitingToMove && this.rotateToTarget(this._nextRotation, deltaT)) return;

        const movement = this.calculateMovement(deltaT);
        if (this.canMove(movement)) {
            this.applyMovement(movement);
            if (this._timeSinceDirectionChange > this._directionChangeInterval) {
                this._nextRotation = this.randomDriftDirection(this._rotation);
                this._waitingToMove = true;
                this._timeSinceDirectionChange = 0;
            }
        } else {
            this._nextRotation = this.pickAlternativeDirection();
            this._waitingToMove = true;
        }
    }

    private chase(deltaT: number): void {
        const target = this.getPlayerPosition();
        this._nextRotation = this.calculateAngleToTarget(target);

        // Rotate the body towards the target
        this.rotateToTarget(this._nextRotation, deltaT);

        // Update turret to smoothly rotate towards player
        this.updateTurretRotation(target);

        const movement = this.calculateMovement(deltaT);
        if (this.canMove(movement)) {
            this.applyMovement(movement);
        }
    }

    private attack(deltaT: number): void {
        const target = this.getPlayerPosition();
        this.updateTurretRotation(target);

        // Accumulate time since last shot
        this._timeSinceLastShot += deltaT;

        // Shoot only if cooldown period has passed
        if (this._timeSinceLastShot >= this._attackCooldown) {
            this.shoot();
            this._timeSinceLastShot = 0;  // Reset cooldown timer
        }
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

    // Smoothly rotates the turret towards the player
    private updateTurretRotation(target: Vector3): void {
        const direction = target.clone().sub(this.mesh.position);
        const desiredTurretAngle = Math.atan2(direction.x, -direction.y);

        // Calculate local turret rotation relative to body
        let turretLocalRotation = desiredTurretAngle - this._rotation;

        if (turretLocalRotation > Math.PI) {
            turretLocalRotation -= Math.PI * 2;
        } else if (turretLocalRotation < -Math.PI) {
            turretLocalRotation += Math.PI * 2;
        }

        // Apply rotation to turret mesh
        this._turretRotation = desiredTurretAngle;
        this._tankTurretMesh.rotation.z = turretLocalRotation;
    }

    // Reset turret to face forward when patrolling
    private resetTurretRotation(deltaT: number): void {
        const rotationSpeed = Math.PI;  // Adjust this for smoother/faster return
        const angleDiff = Math.atan2(
            Math.sin(-this._tankTurretMesh.rotation.z),
            Math.cos(-this._tankTurretMesh.rotation.z)
        );

        if (Math.abs(angleDiff) > 0.01) {
            this._tankTurretMesh.rotation.z += Math.sign(angleDiff) * Math.min(rotationSpeed * deltaT, Math.abs(angleDiff));
        } else {
            this._tankTurretMesh.rotation.z = 0;  // Snap to 0 if very close
        }
    }

    private calculateAngleToTarget(target: Vector3): number {
        const direction = target.clone().sub(this.mesh.position).normalize();
        const angle = Math.atan2(direction.x, -direction.y);

        // Snap to the nearest 45-degree increment
        const step = Math.PI / 4;  // 45 degrees in radians
        return Math.round(angle / step) * step;
    }


    private getPlayerPosition(): Vector3 {
        const player = GameScene.instance.gameEntities.find(
            (entity) => entity instanceof PlayerTank
        ) as PlayerTank;

        return player ? player.mesh.position.clone() : new Vector3(0, 0, 0);
    }

    private calculateMovement(deltaT: number): Vector3 {
        return new Vector3(
            Math.sin(this._rotation) * this._moveSpeed * deltaT,
            -Math.cos(this._rotation) * this._moveSpeed * deltaT,
            0
        );
    }

    private rotateToTarget(targetAngle: number, deltaT: number): boolean {
        const rotationSpeed = Math.PI * 2;
        const angleDiff = Math.atan2(Math.sin(targetAngle - this._rotation), Math.cos(targetAngle - this._rotation));

        if (Math.abs(angleDiff) > 0.01) {
            this._rotation += Math.sign(angleDiff) * Math.min(rotationSpeed * deltaT, Math.abs(angleDiff));
            this.mesh.rotation.z = this._rotation;
            return true;
        }
        return false;
    }

    //method to give each tank an initial random direction.
    private randomDesiredDirection(): number {
        const angles = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
        return angles[Math.floor(Math.random() * angles.length)];
    }

    //to randomly turn the tank diagonally while driving
    private randomDriftDirection(currentRotation: number): number {
        const step = Math.PI / 4;
        const steps = Math.round(currentRotation / step);
        const driftOptions = [(steps + 1) % 8, (steps + 7) % 8]; // Right or left drift
        return driftOptions[Math.floor(Math.random() * 2)] * step;
    }

    //to turn around when hitting an obstacle
    private pickAlternativeDirection(): number {
        const offsets = [0, Math.PI / 4, -Math.PI / 4];
        for (const offset of offsets) {
            const testRotation = this._rotation + offset;
            if (this.canMove(this.calculateMovement(0.1))) return testRotation;  // Small step to test direction
        }
        this._timeSinceDirectionChange = 0;
        return this._rotation + Math.PI;  // Full turn if no valid direction
    }
}

export default EnemyTank;
