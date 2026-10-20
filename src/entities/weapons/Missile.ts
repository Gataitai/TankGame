import { Vector2, Vector3 } from "three";
import Entity from "@/entities/Entity";
import Projectile from "@/entities/weapons/Projectile";
import Tank from "@/entities/tanks/Tank";
import GameScene from "@/scene/GameScene";
import InputManager from "@/scene/managers/InputManager";
import { HIT_SHAKE } from "@/config";

const LIFETIME = 5; // seconds
const ARRIVAL_DISTANCE_SQ = 0.5;
/** How fast the pieces of things it destroys fly apart. */
const BREAK_FORCE = 4;

/**
 * Guided missile: flies straight until the mouse moves, then steers towards the cursor.
 * Destroys breakable walls and other destructible objects (but not the player's tank).
 * Keeps flying at the height it was fired from, so shots from up on a ramp fly over walls.
 */
class Missile extends Projectile {
    private _lifetime = LIFETIME;
    private _followMouse = false;
    private readonly _launchMousePosition: Vector2;
    private readonly _target = new Vector3();
    private readonly _toTarget = new Vector3();
    private readonly _height: number;

    constructor(position: Vector3, angle: number) {
        super(position, angle, 10, 0xff5555);
        this._launchMousePosition = InputManager.instance.mousePosition.clone();
        this._height = position.z;
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
            this._target.copy(GameScene.instance.mouseWorldPosition);
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
        this.position.z = this._height;

        super.update(deltaT);
    }

    protected onHitObstacle(obstacle: Entity): void {
        if (obstacle.destructible && !(obstacle instanceof Tank)) {
            obstacle.destroy(this.position, BREAK_FORCE);
            GameScene.instance.shakeCamera(HIT_SHAKE.duration, HIT_SHAKE.intensity);
        }
        this.explodeAndDispose();
    }
}

export default Missile;
