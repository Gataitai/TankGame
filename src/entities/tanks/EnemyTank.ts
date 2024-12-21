import Tank from "@/entities/tanks/Tank.ts";
import { Vector3, Sphere } from "three";
import GameScene from "@/scene/GameScene.ts";
import Bullet from "@/entities/weapons/Bullet.ts";

class EnemyTank extends Tank {
    constructor(position: Vector3, speed: number = 3) {
        super(position, speed);
        this._rotation = Math.random() * Math.PI * 2; // Random starting rotation
    }

    public update(deltaT: number): void {
        if (this.shouldDispose || !this.mesh || !this.collider) return; // Skip if disposed or invalid

        const computedMovement = new Vector3(
            this._moveSpeed * deltaT * Math.sin(this._rotation),
            -this._moveSpeed * deltaT * Math.cos(this._rotation),
            0
        );

        const testingSphere = (this.collider as Sphere).clone();
        testingSphere.center.add(computedMovement);

        const colliders = GameScene.instance.gameEntities.filter(
            (e) =>
                e !== this &&
                e.collider &&
                e.collider!.intersectsSphere(testingSphere) &&
                !(e instanceof Bullet)
        );

        if (colliders.length) {
            // Collision detected; pick a new random direction
            this._rotation = Math.random() * Math.PI * 2;
            return;
        }

        // Move the tank
        this.mesh.position.add(computedMovement);
        (this.collider as Sphere).center.add(computedMovement);

        // Rotate the tank
        this.mesh.rotation.z = this._rotation;

        // Spawn treads effect (distance-based)
        this.spawnTreads(computedMovement);
    }

}

export default EnemyTank;
