import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy";
import ActiveEntityLimit from "./ActiveEntityLimit";
import Bullet from "@/entities/weapons/Bullet";
import FireEffect from "@/effects/FireEffect";
import SmokeEffect from "@/effects/SmokeEffect";
import GameScene from "@/scene/GameScene";

class BulletShooter implements WeaponStrategy {
    private readonly _bullets = new ActiveEntityLimit(5);

    public spawn(position: Vector3, rotation: number): void {
        if (!this._bullets.hasRoom()) return;

        const scene = GameScene.instance;
        void scene.spawn(this._bullets.track(new Bullet(position, rotation)));
        void scene.spawn(new FireEffect(position, rotation));
        void scene.spawn(new SmokeEffect(position));
    }

    public update(): void {}
}

export default BulletShooter;
