import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy.ts";
import Missile from "@/entities/weapons/Missile.ts";
import GameScene from "@/scene/GameScene.ts";
import FireEffect from "@/effects/FireEffect.ts";

class MissileShooter implements WeaponStrategy {
    private _reloadTime: number = 5000; // 5 seconds
    private _isReloading: boolean = false;

    public spawn(position: Vector3, turretRotation: number): void {
        if (this._isReloading) return;

        const missile = new Missile(position, turretRotation);
        missile.load().then(() => {
            GameScene.instance.addToScene(missile);

            // Set a timeout for the missile's lifetime
            setTimeout(() => {
                if(!missile.shouldDispose){
                    missile.explodeAndDispose();
                }
            }, 5000); // 5 seconds lifetime
        });

        const fireEffect = new FireEffect(position, turretRotation);
        fireEffect.load().then(() => GameScene.instance.addToScene(fireEffect));

        this.startReload();
    }

    private startReload(): void {
        this._isReloading = true;
        setTimeout(() => {
            this._isReloading = false;
        }, this._reloadTime);
    }
}

export default MissileShooter;
