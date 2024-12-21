import { Vector3 } from "three";

interface WeaponStrategy {
    spawn(position: Vector3, turretRotation: number): void;
}

export default WeaponStrategy;
