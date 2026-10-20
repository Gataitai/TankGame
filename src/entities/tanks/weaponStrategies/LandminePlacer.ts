import { Vector3 } from "three";
import type Scene from "@/scene/Scene";
import WeaponStrategy from "./WeaponStrategy";
import ActiveEntityLimit from "./ActiveEntityLimit";
import Landmine from "@/entities/weapons/Landmine";

class LandminePlacer implements WeaponStrategy {
    private readonly _mines = new ActiveEntityLimit(2);

    public spawn(scene: Scene, position: Vector3): void {
        if (!this._mines.hasRoom()) return;
        void scene.add(this._mines.track(new Landmine(position)));
    }

    public update(): void {}
}

export default LandminePlacer;
