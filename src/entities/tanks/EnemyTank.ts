import Tank from "@/entities/tanks/Tank.ts";
import {Vector3} from "three";
import GameScene from "@/scene/GameScene.ts";
import PlayerTank from "@/entities/tanks/PlayerTank.ts";

enum TankState {
    PATROLLING,
    CHASING,
}

class EnemyTank extends Tank {
    private _state = TankState.PATROLLING;
    private _nextRotation = this.randomDesiredDirection();
    private _waitingToMove = false;
    private _timeSinceDirectionChange = 0;
    private readonly _directionChangeInterval = 1;
    private readonly _detectionRadius = 10;

    constructor(position: Vector3, speed = 3) {
        super(position, speed);
        this._rotation = this._nextRotation;
        this.mesh.rotation.z = this._rotation;
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
                this.chase(deltaT);
                break;
        }
    }

    private updateState(): void {
        const playerPosition = this.getPlayerPosition();
        const distanceToPlayer = playerPosition.distanceTo(this.mesh.position);

        if (distanceToPlayer < this._detectionRadius) {
            this._state = TankState.CHASING;
        } else {
            this._state = TankState.PATROLLING;
        }
    }


    private patrol(deltaT: number): void {
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
        const target = this.getPlayerPosition()
        this._nextRotation = this.calculateAngleToTarget(target);

        // Rotate the body towards the target
        this.rotateToTarget(this._nextRotation, deltaT);

        const movement = this.calculateMovement(deltaT);
        if (this.canMove(movement)) {
            this.applyMovement(movement);
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
