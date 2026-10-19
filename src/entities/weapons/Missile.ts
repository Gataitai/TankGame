import { Vector2, Vector3 } from "three";
import Entity from "@/entities/Entity";
import Projectile from "@/entities/weapons/Projectile";
import BreakableWall from "@/map/BreakableWall";
import InputManager from "@/scene/managers/InputManager";
import { HIT_SHAKE, PROJECTILE_Z } from "@/config";

const LIFETIME = 5; // seconds
const ARRIVAL_DISTANCE_SQ = 0.5;

/**
 * Guided missile: flies straight until the mouse moves, then steers towards the cursor.
 * Destroys breakable walls.
 */
class Missile extends Projectile {
    protected readonly kickStrength = 12;
    private _lifetime = LIFETIME;
    private _followMouse = false;
    private readonly _launchMousePosition: Vector2;
    private readonly _target = new Vector3();
    private readonly _toTarget = new Vector3();

    constructor(position: Vector3, angle: number) {
        super(position, angle, 10, 0xff5555);
        this._launchMousePosition = InputManager.instance.mousePosition.clone();
    }

    public update(deltaT: number): void {
        this._lifetime -= deltaT;
        if (this._lifetime <= 0) {
            this.explodeAndDispose();
            return;
        }

        if (!this._followMouse && !InputManager.instance.mousePosition.equals(this._launchMousePosition)) {
            this._followMouse = true;
        }

        if (this._followMouse) {
            this._target.copy(this.scene.mouseWorldPosition);
        } else {
            // Aim far ahead so it keeps flying straight
            this._target.copy(this.position).addScaledVector(this._velocity, 10);
        }

        this._toTarget.subVectors(this._target, this.position).setZ(0);
        if (this._toTarget.lengthSq() < ARRIVAL_DISTANCE_SQ) {
            this.explodeAndDispose();
            return;
        }

        this._velocity.copy(this._toTarget.normalize().multiplyScalar(this.speed));
        this.position.z = PROJECTILE_Z;

        super.update(deltaT);
    }

    protected onHitObstacle(obstacle: Entity): void {
        if (obstacle instanceof BreakableWall) {
            obstacle.destroy(this.impact);
            this.scene.shakeCamera(HIT_SHAKE.duration, HIT_SHAKE.intensity);
        }
        this.explodeAndDispose();
    }
}

export default Missile;
