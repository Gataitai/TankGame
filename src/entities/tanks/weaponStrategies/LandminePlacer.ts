import { Vector3 } from "three";
import WeaponStrategy from "./WeaponStrategy.ts";
import Landmine from "@/entities/weapons/Landmine.ts";
import GameScene from "@/scene/GameScene.ts";

class LandminePlacer implements WeaponStrategy {
    private _maxMines: number = 2;
    private _activeMines: Landmine[] = [];

    public spawn(position: Vector3): void {
        // Clean up disposed mines
        this._activeMines = this._activeMines.filter(mine => !mine.shouldDispose);

        // Check if max mines reached
        if (this._activeMines.length >= this._maxMines) return;

        // Create and add a new mine
        const mine = new Landmine(position);
        mine.load().then(() => GameScene.instance.addToScene(mine));
        this._activeMines.push(mine);
    }
}

export default LandminePlacer;
