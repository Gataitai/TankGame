import { Vector3 } from "three";

interface WeaponStrategy {
    /** Fires from `position` towards `rotation`. Does nothing while reloading or at the limit. */
    spawn(position: Vector3, rotation: number): void;

    /** Advances reload timers. Called every frame by the tank that owns the weapon. */
    update(deltaT: number): void;
}

export default WeaponStrategy;
