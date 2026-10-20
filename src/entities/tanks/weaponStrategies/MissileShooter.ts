import { Vector3 } from "three";
import type Scene from "@/scene/Scene";
import WeaponStrategy from "./WeaponStrategy";
import Missile from "@/entities/weapons/Missile";
import FireEffect from "@/effects/FireEffect";

class MissileShooter implements WeaponStrategy {
    private readonly _reloadTime = 5; // seconds
    private _reloadRemaining = 0;

    public spawn(scene: Scene, position: Vector3, rotation: number): void {
        if (this._reloadRemaining > 0) return;

        void scene.add(new Missile(position, rotation));
        void scene.add(new FireEffect(position, rotation));
        this._reloadRemaining = this._reloadTime;
    }

    /** Uses game time, so reloading stops while the game is paused. */
    public update(deltaT: number): void {
        this._reloadRemaining = Math.max(0, this._reloadRemaining - deltaT);
    }
}

export default MissileShooter;
