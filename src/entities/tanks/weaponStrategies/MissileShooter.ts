import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy";
import Missile from "@/entities/weapons/Missile";
import FireEffect from "@/effects/FireEffect";
import GameScene from "@/scene/GameScene";

class MissileShooter implements WeaponStrategy {
    private readonly _reloadTime = 5; // seconds
    private _reloadRemaining = 0;

    public spawn(position: Vector3, rotation: number): void {
        if (this._reloadRemaining > 0) return;

        const scene = GameScene.instance;
        void scene.spawn(new Missile(position, rotation));
        void scene.spawn(new FireEffect(position, rotation));
        this._reloadRemaining = this._reloadTime;
    }

    /** Uses game time, so reloading stops while the game is paused. */
    public update(deltaT: number): void {
        this._reloadRemaining = Math.max(0, this._reloadRemaining - deltaT);
    }
}

export default MissileShooter;
