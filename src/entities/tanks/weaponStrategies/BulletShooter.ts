import { Vector3 } from "three";
import type Scene from "@/scene/Scene";
import WeaponStrategy from "./WeaponStrategy";
import ActiveEntityLimit from "./ActiveEntityLimit";
import Bullet from "@/entities/weapons/Bullet";
import FireEffect from "@/effects/FireEffect";
import SmokeEffect from "@/effects/SmokeEffect";

class BulletShooter implements WeaponStrategy {
    private readonly _bullets = new ActiveEntityLimit(5);

    public spawn(scene: Scene, position: Vector3, rotation: number): void {
        if (!this._bullets.hasRoom()) return;

        void scene.add(this._bullets.track(new Bullet(position, rotation)));
        void scene.add(new FireEffect(position, rotation));
        void scene.add(new SmokeEffect(position));
    }

    public update(): void {}
}

export default BulletShooter;
