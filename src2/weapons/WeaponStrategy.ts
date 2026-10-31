import { Vector3 } from "three";

/**
 * One pull of the trigger. The vectors belong to the caller and are reused between shots, so a
 * weapon must copy anything it wants to keep (prefabs copy what they are given, so passing these
 * straight into one is fine).
 */
export type Shot = {
    /** Where to aim from: the camera, so shots go exactly where the crosshair points. */
    origin: Vector3;
    /** Normalised aim direction. */
    direction: Vector3;
    /** The visible muzzle of the held weapon. Projectiles and muzzle effects start here. */
    muzzle: Vector3;
};

/**
 * How a weapon turns a trigger pull into something happening in the world. Swap the strategy and
 * the same holder shoots something else: a hitscan gun hits instantly, a launcher sends a
 * projectile on its way (see HitscanGun and RocketLauncher).
 */
interface WeaponStrategy {
    /** Name shown in the HUD. */
    readonly name: string;

    /** Whether holding the trigger keeps firing. Single-shot weapons need a fresh click. */
    readonly automatic: boolean;

    /** How far the weapon is pushed back in the holder's view when it goes off, in world units. */
    readonly recoil: number;

    /**
     * Fires. Returns whether it actually went off: false while reloading or at the limit of live
     * projectiles, so the holder knows not to play the recoil.
     */
    fire(shot: Shot): boolean;

    /** Advances reload timers. Called every frame by whoever holds the weapon. */
    update(deltaT: number): void;
}

export default WeaponStrategy;
