import { Vector3 } from "three";

/** Returns a random integer in [min, max] (inclusive). */
export const randomIntInRange = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;

/** Returns a random float in [min, max). */
export const randomInRange = (min: number, max: number): number => min + Math.random() * (max - min);

/** Clamps `value` to [min, max]. */
export const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Unit vector for a yaw/pitch pair: yaw turns around +Z starting at +X, pitch tilts up towards +Z.
 * This is the convention the player and the first-person camera use.
 */
export const directionFromYawPitch = (yaw: number, pitch: number, target = new Vector3()): Vector3 => {
    const horizontal = Math.cos(pitch);
    return target.set(Math.cos(yaw) * horizontal, Math.sin(yaw) * horizontal, Math.sin(pitch));
};

/** Evenly distributed random point on the unit sphere. */
export const randomUnitVector = (target = new Vector3()): Vector3 => {
    const z = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(1 - z * z);
    return target.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
};

const _axis = new Vector3();

/**
 * A random direction inside a cone around `direction`, opening up to `spread` radians.
 * Used by the spark and explosion effects to throw particles out in 3D.
 */
export const randomConeDirection = (direction: Vector3, spread: number, target = new Vector3()): Vector3 => {
    randomUnitVector(target).multiplyScalar(Math.tan(clamp(spread, 0, 1.5)) * Math.random());
    return target.add(_axis.copy(direction).normalize()).normalize();
};
