import { Vector3 } from "three";
import Tank from "@/entities/tanks/Tank";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter";

/**
 * Base class for computer-controlled tanks. Subclasses implement the AI in think().
 * Scenes look for instances of this class, e.g. to know when a level is cleared.
 */
abstract class EnemyTank extends Tank {
    protected readonly _weapon = new BulletShooter();

    protected constructor(position: Vector3, speed: number) {
        super(position, speed);
    }

    protected updateTank(deltaT: number): void {
        this._weapon.update();
        this.think(deltaT);
    }

    protected abstract think(deltaT: number): void;
}

export default EnemyTank;
