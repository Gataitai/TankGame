import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy.ts";
import Bullet from "@/entities/weapons/Bullet.ts";
import GameScene from "@/scene/GameScene.ts";
import FireEffect from "@/effects/FireEffect.ts";
import SmokeEffect from "@/effects/SmokeEffect.ts";
import Entity from "@/entities/Entity.ts";

class BulletShooter implements WeaponStrategy {
    private _maxShots: number = 5;

    private _activeEntities: Entity[] = [];

    public spawn(position: Vector3, turretRotation: number): void {
        // Clean up disposed entities
        this._activeEntities = this._activeEntities.filter(entity => !entity.shouldDispose);

        // Check if the max number of active bullets is reached
        if (this._activeEntities.length >= this._maxShots) return;

        // Create and add a new bullet
        const bullet = new Bullet(position, turretRotation);
        bullet.load().then(() => GameScene.instance.addToScene(bullet));
        this._activeEntities.push(bullet);

        // Create and add a fire effect
        const fireEffect = new FireEffect(position, turretRotation);
        fireEffect.load().then(() => GameScene.instance.addToScene(fireEffect));

        // Create and add a smoke effect
        const smokeEffect = new SmokeEffect(position);
        smokeEffect.load().then(() => GameScene.instance.addToScene(smokeEffect));
    }
}

export default BulletShooter;
