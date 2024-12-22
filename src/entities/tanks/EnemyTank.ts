import Tank from "@/entities/tanks/Tank.ts";
import { Vector3, Sphere } from "three";
import GameScene from "@/scene/GameScene.ts";
import PlayerTank from "@/entities/tanks/PlayerTank.ts";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter.ts";
import WeaponStrategy from "@/entities/tanks/weaponStrategies/WeaponStrategy.ts";

enum TankState {
    PATROLLING,
    ATTACK,
}
class EnemyTank extends Tank {
    private _state: TankState = TankState.PATROLLING;
    private _nextRotation: number = 0;
    private _waitingToMove = false;
    private _timeSinceDirectionChange = 0;
    private _directionChangeInterval = 1;
    private _turretRotation: number = 0;
    private _shootCooldown = 0;
    private _detectionRange = 12;

    // Weapon Strategy
    private _weaponStrategy: WeaponStrategy;
    private _bulletShooter: BulletShooter = new BulletShooter();

    constructor(position: Vector3, speed: number = 3) {
        super(position, speed);
        this._nextRotation = this.randomDesiredDirection();
        this._rotation = this._nextRotation;
        this.mesh.rotation.z = this._rotation;

        this._weaponStrategy = this._bulletShooter;
    }

    public update(deltaT: number): void {
        if (this.shouldDispose || !this.mesh || !this.collider) return;

        this._timeSinceDirectionChange += deltaT;

        switch (this._state) {
            case TankState.PATROLLING:
                this.detectPlayer();
                this.patrol(deltaT);
                break;
            case TankState.ATTACK:
                this.attackPlayer(deltaT);
                break;
        }
    }

    private attackPlayer(deltaT: number): void {
        const player = GameScene.instance.gameEntities.find(
            (e) => e instanceof PlayerTank
        ) as PlayerTank | undefined;

        if (!player) {
            this._state = TankState.PATROLLING;
            return;
        }

        const playerPosition = player.mesh.position;
        const directionToPlayer = playerPosition.clone().sub(this.mesh.position).normalize();
        const distanceToPlayer = playerPosition.distanceTo(this.mesh.position);

        // Return to patrol mode if player is out of detection range
        if (distanceToPlayer > this._detectionRange) {
            this._state = TankState.PATROLLING;
            return;
        }

        // Calculate cardinal direction towards player
        const desiredAngle = Math.atan2(directionToPlayer.y, directionToPlayer.x);
        const closestAngle = this.getClosestDesiredDirection(desiredAngle);

        // Rotate fully before moving
        if (this.rotateToCardinalDirection(closestAngle, deltaT)) {
            return;  // Stop and rotate first
        }

        // Once aligned, move directly towards the player without adjusting rotation mid-movement
        const movement = new Vector3(
            Math.cos(closestAngle) * this._moveSpeed * deltaT,
            Math.sin(closestAngle) * this._moveSpeed * deltaT,
            0
        );

        if (this.canMove(movement)) {
            this.applyMovement(movement);
        }

        // Rotate turret towards the player while moving
        const targetTurretAngle = Math.atan2(directionToPlayer.x, -directionToPlayer.y);
        this._turretRotation += Math.sign(targetTurretAngle - this._turretRotation) * Math.min(Math.PI * deltaT, Math.abs(targetTurretAngle - this._turretRotation));
        this._tankTurretMesh.rotation.z = this._turretRotation - this._rotation;

        // // Fire if within attack range
        // if (this._shootCooldown <= 0 && distanceToPlayer <= this._detectionRange) {
        //     this.shoot();
        //     this._shootCooldown = 1.5;
        // } else {
        //     this._shootCooldown -= deltaT;
        // }
    }


    // Detect player and switch between states based on distance
    private detectPlayer(): void {
        const player = GameScene.instance.gameEntities.find(
            (e) => e instanceof PlayerTank
        ) as PlayerTank | undefined;

        if (!player) {
            this._state = TankState.PATROLLING;
            return;
        }

        const detectionSphere = new Sphere(this.mesh.position, this._detectionRange);

        if (player.collider?.intersectsSphere(detectionSphere)) {
            this._state = TankState.ATTACK;
        } else {
            this._state = TankState.PATROLLING;
        }
    }

    // Patrol mode: Move in random directions
    private patrol(deltaT: number): void {

        if (this._waitingToMove) {
            if (this.rotateToCardinalDirection(this._nextRotation, deltaT)) return;
        }

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


    // Helper Methods
    private calculateMovement(deltaT: number): Vector3 {
        return new Vector3(
            Math.sin(this._rotation) * this._moveSpeed * deltaT,
            -Math.cos(this._rotation) * this._moveSpeed * deltaT,
            0
        );
    }

    // Get the closest cardinal direction to the player
    private getClosestDesiredDirection(targetAngle: number): number {
        const desiredAngles = [
            0, Math.PI / 4, Math.PI / 2,
            (3 * Math.PI) / 4, Math.PI,
            -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4
        ];
        return desiredAngles.reduce((closest, angle) =>
            Math.abs(targetAngle - angle) < Math.abs(targetAngle - closest) ? angle : closest
        );
    }

    // Random direction from 8 possibilities (N, NE, E, SE, S, SW, W, NW)
    private randomDesiredDirection(): number {
        const angles = [
            0, Math.PI / 4, Math.PI / 2,
            (3 * Math.PI) / 4, Math.PI,
            -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4
        ];
        return angles[Math.floor(Math.random() * angles.length)];
    }

// Rotate tank to the closest cardinal direction
    private rotateToCardinalDirection(targetAngle: number, deltaT: number): boolean {
        const rotationSpeed = Math.PI * 2;

        // Calculate the shortest path to the target angle
        let angleDifference = targetAngle - this._rotation;
        angleDifference = Math.atan2(Math.sin(angleDifference), Math.cos(angleDifference));  // Normalize to -π to π

        // Rotate towards the target angle
        if (Math.abs(angleDifference) > 0.01) {
            this._rotation += Math.sign(angleDifference) * Math.min(rotationSpeed * deltaT, Math.abs(angleDifference));
            this.mesh.setRotationFromAxisAngle(new Vector3(0, 0, 1), this._rotation);
            return true;  // Still rotating
        }
        return false;  // Rotation complete
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

    private canMove(movement: Vector3): boolean {
        const testingSphere = (this.collider as Sphere).clone();
        testingSphere.center.add(movement);

        const colliders = GameScene.instance.gameEntities.filter(
            (e) => e !== this && e.collider && e.collider!.intersectsSphere(testingSphere)
        );

        return colliders.length === 0;
    }

    private applyMovement(movement: Vector3): void {
        this.mesh.position.add(movement);
        (this.collider as Sphere).center.add(movement);
        this.spawnTreads(movement);
    }

    private randomDriftDirection(currentRotation: number): number {
        const angleStep = Math.PI / 4;
        const steps = Math.round(currentRotation / angleStep);
        const leftOrRightSteps = [(steps + 1) % 8, (steps - 1 + 8) % 8];
        const chosenStep = leftOrRightSteps[Math.floor(Math.random() * 2)];
        return chosenStep * angleStep;
    }

    private pickAlternativeDirection(): number {
        const options = [Math.PI / 4, 0, -Math.PI / 4];
        for (const offset of options) {
            const testRotation = this._rotation + offset;
            const testMovement = new Vector3(
                Math.sin(testRotation),
                -Math.cos(testRotation),
                0
            );
            if (this.canMove(testMovement)) return testRotation;
        }
        return this._rotation + Math.PI;
    }
}

export default EnemyTank;
