import { Vector3 } from "three";
import EnemyTank from "@/entities/tanks/EnemyTank";
import GameScene from "@/scene/GameScene";
import { angleBetween, randomIntInRange, randomSign, stepAngleTowards, wrapAngle } from "@/utils/MathUtils";

enum TankState {
    Patrolling,
    Chasing,
    Attacking,
}

/** Enemies drive along 8 directions (multiples of 45 degrees). */
const HEADING_STEP = Math.PI / 4;
const BODY_ROTATION_SPEED = Math.PI * 2;
const TURRET_RETURN_SPEED = Math.PI;
const ALIGN_THRESHOLD = 0.01;

/**
 * The original, simple AI: drives in random directions and shoots straight at the player
 * whenever it's close enough (even through walls). Select it with ENEMY_AI in config.ts.
 */
class BasicEnemyTank extends EnemyTank {
    private readonly _attackCooldown = 0.5;
    private readonly _directionChangeInterval = 1;
    private readonly _detectionRadius = 15;
    private readonly _attackRadius = 3;

    private _state = TankState.Patrolling;
    private _nextRotation: number;
    private _timeSinceDirectionChange = 0;
    private _timeSinceLastShot: number;

    constructor(position: Vector3, speed = 3) {
        super(position, speed);
        this._nextRotation = randomIntInRange(0, 7) * HEADING_STEP;
        this.setBodyRotation(this._nextRotation);
        this._timeSinceLastShot = this._attackCooldown;
    }

    protected think(deltaT: number): void {
        this._timeSinceDirectionChange += deltaT;

        const target = GameScene.instance.player?.position ?? null;
        this._state = this.decideState(target);

        switch (this._state) {
            case TankState.Patrolling:
                this.patrol(deltaT);
                break;
            case TankState.Chasing:
                this.attack(target!, deltaT);
                this.chase(target!, deltaT);
                break;
            case TankState.Attacking:
                this.attack(target!, deltaT);
                break;
        }
    }

    private decideState(target: Vector3 | null): TankState {
        if (!target) return TankState.Patrolling;

        const distance = target.distanceTo(this.position);
        if (distance < this._attackRadius) return TankState.Attacking;
        if (distance < this._detectionRadius) return TankState.Chasing;
        return TankState.Patrolling;
    }

    private patrol(deltaT: number): void {
        this.returnTurretToCenter(deltaT);
        if (this.rotateBodyTowards(this._nextRotation, deltaT)) return;

        const movement = this.movementFor(deltaT);
        if (!this.canMove(movement)) {
            this._nextRotation = this.pickAlternativeDirection();
            return;
        }

        this.applyMovement(movement);
        if (this._timeSinceDirectionChange > this._directionChangeInterval) {
            // Occasionally drift 45 degrees left or right
            this._nextRotation = wrapAngle(this.snapToHeading(this.travelHeading) + randomSign() * HEADING_STEP);
            this._timeSinceDirectionChange = 0;
        }
    }

    private chase(target: Vector3, deltaT: number): void {
        this._nextRotation = this.snapToHeading(angleBetween(this.position, target));
        if (this.rotateBodyTowards(this._nextRotation, deltaT)) return; // Finish turning before driving

        const movement = this.movementFor(deltaT);
        if (this.canMove(movement)) {
            this.applyMovement(movement);
        }
    }

    private attack(target: Vector3, deltaT: number): void {
        this.aimTurretAt(target);

        this._timeSinceLastShot += deltaT;
        if (this._timeSinceLastShot >= this._attackCooldown) {
            this.fire(this._weapon);
            this._timeSinceLastShot = 0;
        }
    }

    /** Smoothly turns the turret back to face forward. */
    private returnTurretToCenter(deltaT: number): void {
        const local = stepAngleTowards(this._turretMesh.rotation.z, 0, TURRET_RETURN_SPEED * deltaT);
        this._turretMesh.rotation.z = Math.abs(local) <= ALIGN_THRESHOLD ? 0 : local;
        this._turretRotation = this._rotation + this._turretMesh.rotation.z;
    }

    /** Steers towards travelling in `targetAngle` (reversing if it's the opposite). Returns true while still turning. */
    private rotateBodyTowards(targetAngle: number, deltaT: number): boolean {
        return !this.steerTowards(targetAngle, BODY_ROTATION_SPEED * deltaT);
    }

    /** When blocked: try 45 then 90 degrees to either side, otherwise turn around. */
    private pickAlternativeDirection(): number {
        const side = randomSign();
        const offsets = [side * HEADING_STEP, -side * HEADING_STEP, side * 2 * HEADING_STEP, -side * 2 * HEADING_STEP];
        const probeTime = 0.1; // Look a little further ahead than one frame

        for (const offset of offsets) {
            const heading = this.snapToHeading(this.travelHeading) + offset;
            if (this.canMove(this.movementFor(probeTime, heading))) {
                return wrapAngle(heading);
            }
        }

        // Go back the way it came: tanks just reverse, no turning needed
        this._timeSinceDirectionChange = 0;
        return wrapAngle(this.travelHeading + Math.PI);
    }

    private snapToHeading(angle: number): number {
        return Math.round(angle / HEADING_STEP) * HEADING_STEP;
    }
}

export default BasicEnemyTank;
