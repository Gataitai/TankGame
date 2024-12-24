import {Box3, Sphere, Vector3} from "three";
import Projectile from "@/entities/weapons/Projectile.ts";
import GameScene from "@/scene/GameScene.ts";
import FireEffect from "@/effects/FireEffect.ts";
import Entity from "@/entities/Entity.ts";
import projectile from "@/entities/weapons/Projectile.ts";
import Landmine from "@/entities/weapons/Landmine.ts";
import Tank from "@/entities/tanks/Tank.ts";


class Bullet extends Projectile {
    private _bounceCount: number = 0;
    private _maxBounces: number = 1;

    constructor(position: Vector3, angle: number) {
        const speed = 6; // Bullet-specific speed
        const color = 0xffd8ad; // Bullet-specific color
        super(position, speed, color);

        // Calculate velocity based on speed and angle
        this._velocity = new Vector3(
            speed * Math.sin(angle),
            -speed * Math.cos(angle),
            0
        );
    }

    protected checkCollisions(): void {
        const colliders = GameScene.instance.gameEntities.filter(
            (c) =>
                c.collider &&
                c !== this &&
                c.collider.intersectsSphere(this.collider as Sphere)
        );

        if (colliders.length) {
            const collider = colliders[0];

            if (collider instanceof projectile) {
                collider.explodeAndDispose();
                this.explodeAndDispose();
                return;
            }

            if (collider instanceof Landmine) {
                collider.hit();
                this.explodeAndDispose();
                return;
            }

            // if (collider instanceof BreakableWall) {
            //     collider.destroy();
            //     this.explodeAndDispose();
            //     GameScene.instance.shakeCamera(0.3, 0.1);
            //     return;
            // }

            // Destroy PlayerTank or other tanks on impact
            if (collider instanceof Tank) {
                collider.destroy();
                this.explodeAndDispose();
                GameScene.instance.shakeCamera(0.3, 0.1);
                return;
            }

            // Handle bouncing for normal walls
            if (this._bounceCount < this._maxBounces) {
                const collisionNormal = this.getCollisionNormal(collider);
                this._velocity.reflect(collisionNormal);
                this.alignWithVelocity();
                this._bounceCount++;

                const fireAngle = this.getFireEffectAngle(collider);
                const fireEffect = new FireEffect(this.mesh.position.clone(), fireAngle);
                fireEffect.load().then(() => {
                    GameScene.instance.addToScene(fireEffect);
                });
            } else {
                this.explodeAndDispose();
            }
        }
    }

    private getCollisionNormal(collider: Entity): Vector3 {
        const delta = this.mesh.position.clone().sub(collider.mesh.position);

        const colliderBox = new Box3().setFromObject(collider.mesh);
        const colliderSize = colliderBox.getSize(new Vector3());

        const overlapX =
            Math.abs(delta.x) -
            ((this.collider as Sphere).radius + colliderSize.x / 2);
        const overlapY =
            Math.abs(delta.y) -
            ((this.collider as Sphere).radius + colliderSize.y / 2);

        if (overlapX > overlapY) {
            return new Vector3(Math.sign(delta.x), 0, 0);
        } else {
            return new Vector3(0, Math.sign(delta.y), 0);
        }
    }

    private getFireEffectAngle(collider: Entity): number {
        const delta = this.mesh.position.clone().sub(collider.mesh.position);
        const isHorizontal = Math.abs(delta.x) > Math.abs(delta.y);

        return isHorizontal
            ? delta.x > 0
                ? Math.PI / 2
                : -Math.PI / 2
            : delta.y > 0
                ? Math.PI
                : 0;
    }
}

export default Bullet;
