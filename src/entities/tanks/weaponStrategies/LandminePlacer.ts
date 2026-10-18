import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy";
import ActiveEntityLimit from "./ActiveEntityLimit";
import Landmine from "@/entities/weapons/Landmine";
import GameScene from "@/scene/GameScene";

class LandminePlacer implements WeaponStrategy {
    private readonly _mines = new ActiveEntityLimit(2);

    public spawn(position: Vector3): void {
        if (!this._mines.hasRoom()) return;
        void GameScene.instance.spawn(this._mines.track(new Landmine(position)));
    }

    public update(): void {}
}

export default LandminePlacer;
