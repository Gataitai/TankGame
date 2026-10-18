import { Vector3 } from "three";

/** Returns -1 or 1 with equal probability. */
export const randomSign = (): number => (Math.random() < 0.5 ? -1 : 1);

/** Returns a random integer in [min, max] (inclusive). */
export const randomIntInRange = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;

/** Picks a random element from a non-empty array. */
export const randomElement = <T>(items: readonly T[]): T =>
    items[Math.floor(Math.random() * items.length)];

/** Normalises an angle to the range [-PI, PI]. */
export const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Direction vector for a heading angle, using the game's convention
 * (angle 0 points towards -Y, positive angles rotate towards +X).
 */
export const directionFromAngle = (angle: number, length = 1, target = new Vector3()): Vector3 =>
    target.set(Math.sin(angle) * length, -Math.cos(angle) * length, 0);

/** Heading angle pointing from `from` to `to` (inverse of directionFromAngle). */
export const angleBetween = (from: Vector3, to: Vector3): number =>
    Math.atan2(to.x - from.x, -(to.y - from.y));

/**
 * Rotates `current` towards `target` by at most `maxStep` radians, taking the short way round.
 * Returns the new (wrapped) angle.
 */
export const stepAngleTowards = (current: number, target: number, maxStep: number): number => {
    const diff = wrapAngle(target - current);
    return wrapAngle(current + Math.sign(diff) * Math.min(maxStep, Math.abs(diff)));
};

/** Distance (in the XY plane) from point `p` to the line segment `a`-`b`. */
export const distanceToSegment2D = (p: Vector3, a: Vector3, b: Vector3): number => {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq)) : 0;
    return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
};
