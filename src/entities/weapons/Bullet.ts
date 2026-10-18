import { Box3, Sphere, Vector3 } from "three";
import Entity from "@/entities/Entity";
import Projectile from "@/entities/weapons/Projectile";
import FireEffect from "@/effects/FireEffect";
import GameScene from "@/scene/GameScene";

/** Fast shot that bounces off walls once before exploding. */
class Bullet extends Projectile {
    private readonly _maxBounces = 1;
    private _bounceCount = 0;

    constructor(position: Vector3, angle: number) {
        super(position, angle, 6, 0xffd8ad);
    }

    protected onHitObstacle(obstacle: Entity): void {
        if (this._bounceCount >= this._maxBounces) {
            this.explodeAndDispose();
            return;
        }

        this._velocity.reflect(this.getCollisionNormal(obstacle));
        this.alignWithVelocity();
        this._bounceCount++;

        void GameScene.instance.spawn(new FireEffect(this.position, this.getSparkAngle(obstacle)));
    }

    /** Picks the wall face that was hit (axis-aligned, since walls are boxes). */
    private getCollisionNormal(obstacle: Entity): Vector3 {
        const delta = this.position.clone().sub(obstacle.position);
        const box = obstacle.collider instanceof Box3 ? obstacle.collider : new Box3().setFromObject(obstacle.mesh);
        const size = box.getSize(new Vector3());
        const radius = (this.collider as Sphere).radius;

        const overlapX = Math.abs(delta.x) - (radius + size.x / 2);
        const overlapY = Math.abs(delta.y) - (radius + size.y / 2);

        return overlapX > overlapY
            ? new Vector3(Math.sign(delta.x), 0, 0)
            : new Vector3(0, Math.sign(delta.y), 0);
    }

    /** Direction for the spark effect: pointing away from the wall face. */
    private getSparkAngle(obstacle: Entity): number {
        const delta = this.position.clone().sub(obstacle.position);
        if (Math.abs(delta.x) > Math.abs(delta.y)) {
            return delta.x > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        return delta.y > 0 ? Math.PI : 0;
    }
}

export default Bullet;
