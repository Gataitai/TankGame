import { Vector3 } from "three";
import Tank from "@/entities/tanks/Tank";
import BulletShooter from "@/entities/tanks/weaponStrategies/BulletShooter";
import { randomElement } from "@/utils/MathUtils";

/** How long an enemy lies knocked over before it gets back on its tracks by itself. */
const SELF_RIGHTING_DELAY = 1.5;

/**
 * Base class for computer-controlled tanks. Subclasses implement the AI in think().
 * GameScene counts instances of this class to know when a level is cleared.
 */
abstract class EnemyTank extends Tank {
    protected readonly _weapon = new BulletShooter();
    private _knockedOverTime = 0;

    protected constructor(position: Vector3, speed: number) {
        super(position, speed);
    }

    public update(deltaT: number): void {
        this._weapon.update();

        if (this.isDriving) {
            this._knockedOverTime = 0;
            this.think(deltaT);
        } else if (this.isKnockedOver) {
            // Blown over (e.g. by a mine): after a moment it flips itself back like the player can
            this._knockedOverTime += deltaT;
            if (this._knockedOverTime > SELF_RIGHTING_DELAY) {
                this.requestRighting(randomElement(["left", "right"] as const));
            }
        }
    }

    protected abstract think(deltaT: number): void;
}

export default EnemyTank;
