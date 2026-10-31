import { Vector3 } from "three";
import WeaponStrategy, { type Shot } from "@2/weapons/WeaponStrategy";
import ActiveLimit from "@2/weapons/ActiveLimit";
import { spawnRocket } from "@2/prefabs/rocket";
import { spawnSmoke, spawnSparks } from "@2/prefabs/effects";

/** Seconds before the next rocket can be fired. */
const RELOAD_TIME = 1.1;
const MAX_LIVE_ROCKETS = 8;
/** How far behind the muzzle the back-blast comes out of the tube. */
const BACK_BLAST_DISTANCE = 0.7;

/**
 * Sends a rocket on its way: unlike the gun it takes time to reach what you aimed at, and it
 * explodes when it gets there (see prefabs/rocket.ts). Firing puffs smoke out of both ends.
 */
class RocketLauncher implements WeaponStrategy {
    public readonly name = "Rocket launcher";
    public readonly automatic = false;
    public readonly recoil = 0.1;

    private readonly _rockets = new ActiveLimit(MAX_LIVE_ROCKETS);
    private readonly _backBlast = new Vector3();
    private _reloadRemaining = 0;

    public fire(shot: Shot): boolean {
        if (this._reloadRemaining > 0 || !this._rockets.hasRoom()) return false;
        this._reloadRemaining = RELOAD_TIME;

        this._rockets.track(spawnRocket(shot.muzzle, shot.direction));

        spawnSparks(shot.muzzle, shot.direction, 1.5);
        spawnSmoke(shot.muzzle, 2, 1.2);

        this._backBlast.copy(shot.muzzle).addScaledVector(shot.direction, -BACK_BLAST_DISTANCE);
        spawnSmoke(this._backBlast, 1.6, 1.1);
        return true;
    }

    public update(deltaT: number): void {
        this._reloadRemaining = Math.max(0, this._reloadRemaining - deltaT);
    }
}

export default RocketLauncher;
