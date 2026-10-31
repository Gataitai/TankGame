import { Vector3 } from "three";
import WeaponStrategy, { type Shot } from "@2/weapons/WeaponStrategy";
import { Breakable } from "@2/components/Gameplay";
import { PhysicsBody } from "@2/components/Spatial";
import { game } from "@2/scene/Game";
import { breakEntity } from "@2/systems/BreakSystem";
import { spawnSmoke, spawnSparks, spawnTracer } from "@2/prefabs/effects";
import { randomConeDirection } from "@2/utils/MathUtils";

const RANGE = 150;
/** Seconds between shots while the trigger is held. */
const COOLDOWN = 0.11;
/** Half the cone the shot can stray into, in radians. */
const SPREAD = 0.006;
/** Impulse given to a loose object that is hit (and survives). */
const HIT_IMPULSE = 2.5;
/** How fast the pieces of a fragile object that is shot fly apart. */
const BREAK_FORCE = 4;

/**
 * A plain gun: the shot lands the instant the trigger is pulled. Instead of spawning a projectile
 * it casts a ray through the physics world, so there is nothing to lead or wait for — only a
 * tracer streak, sparks and smoke to show where it went.
 */
class HitscanGun implements WeaponStrategy {
    public readonly name = "Gun";
    public readonly automatic = true;
    public readonly recoil = 0.035;

    private readonly _direction = new Vector3();
    private readonly _end = new Vector3();
    private _cooldown = 0;

    public fire(shot: Shot): boolean {
        if (this._cooldown > 0) return false;
        this._cooldown = COOLDOWN;

        const { ecs, physics } = game();
        randomConeDirection(shot.direction, SPREAD, this._direction);

        // Aim from the camera so the shot goes exactly where the crosshair points, but draw the
        // tracer from the muzzle of the weapon you can see in front of you.
        const hit = physics.raycast(shot.origin, this._direction, RANGE);
        if (hit) this._end.copy(hit.point);
        else this._end.copy(shot.origin).addScaledVector(this._direction, RANGE);

        spawnSparks(shot.muzzle, this._direction, 1);
        spawnSmoke(shot.muzzle, 0.7, 0.5);
        spawnTracer(shot.muzzle, this._end);

        if (!hit) return true;
        spawnSparks(hit.point, hit.normal, 0.8);

        const entity = hit.entity;
        if (entity !== undefined) {
            const body = ecs.get(entity, PhysicsBody)?.body;
            if (body) physics.push(body, this._direction, HIT_IMPULSE);

            // Only fragile things come apart from a single bullet; the rest shrug it off
            if (ecs.get(entity, Breakable)?.fragile) breakEntity(entity, hit.point, BREAK_FORCE);
        }
        return true;
    }

    public update(deltaT: number): void {
        this._cooldown = Math.max(0, this._cooldown - deltaT);
    }
}

export default HitscanGun;
