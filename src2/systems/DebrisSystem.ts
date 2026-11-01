import type System from "@2/ecs/System";
import type { EntityId } from "@2/ecs/Ecs";
import { Lifetime } from "@2/components/Visual";
import { Debris } from "@2/components/Gameplay";
import { DEBRIS_SHRINK_TIME } from "@2/prefabs/debris";
import { game } from "@2/scene/Game";
import { MAX_DEBRIS, MAX_DEBRIS_TOTAL } from "@2/config";

/**
 * Splits the live pieces into the ones still in their prime and the ones already shrinking away.
 * Entities marked for removal this frame are left out: they are gone as far as the caps care.
 */
function census(): { fresh: EntityId[]; fading: EntityId[] } {
    const { ecs } = game();
    const fresh: EntityId[] = [];
    const fading: EntityId[] = [];

    ecs.each(Debris, (entity) => {
        if (ecs.isDoomed(entity)) return;
        const lifetime = ecs.get(entity, Lifetime);
        if (!lifetime) return;
        (lifetime.remaining <= DEBRIS_SHRINK_TIME ? fading : fresh).push(entity);
    });
    return { fresh, fading };
}

/**
 * How many more pieces will fit before the cap starts retiring things. May be negative.
 *
 * BreakSystem asks before it cuts a mesh up, so a huge explosion makes fewer, chunkier pieces
 * instead of making the full number and having the surplus retired the instant it appears.
 */
export function debrisRoom(): number {
    return MAX_DEBRIS - census().fresh.length;
}

/**
 * Keeps the pile of pieces under control. There are two limits, and they deliberately count
 * different things:
 *
 * - MAX_DEBRIS counts only pieces still in their prime. Going over retires the oldest of them,
 *   which just starts them shrinking away. Pieces already on their way out must *not* count here.
 *   When they did, every call condemned a fresh batch while skipping the dying ones, so roughly
 *   twenty more pieces were sentenced every frame until the whole pile had been — which looked
 *   like rubble vanishing a heartbeat after the explosion that made it.
 * - MAX_DEBRIS_TOTAL counts everything, fading included, and is the backstop: past it pieces are
 *   dropped at once rather than given half a second to shrink, because several hundred extra
 *   bodies is a stalled frame.
 *
 * Entity ids only ever increase, so sorting by id ascending is exactly oldest-first — which is
 * what we want, and steadier than comparing time left, since that is jittered at birth.
 */
export function trimDebris(): void {
    const { ecs } = game();
    const { fresh, fading } = census();

    const over = fresh.length - MAX_DEBRIS;
    if (over > 0) {
        fresh.sort((a, b) => a - b);
        for (let i = 0; i < over; i++) {
            const lifetime = ecs.get(fresh[i], Lifetime);
            // Staggered across the shrink window, so a hundred pieces don't wink out together
            if (lifetime) lifetime.remaining = DEBRIS_SHRINK_TIME * (0.35 + 0.65 * Math.random());
        }
    }

    let overCeiling = fresh.length + fading.length - MAX_DEBRIS_TOTAL;
    if (overCeiling <= 0) return;

    // The most faded first, then the oldest of the rest if that still isn't enough
    fading.sort((a, b) => a - b);
    for (let i = 0; i < fading.length && overCeiling > 0; i++, overCeiling--) ecs.destroy(fading[i]);
    for (let i = 0; i < fresh.length && overCeiling > 0; i++, overCeiling--) ecs.destroy(fresh[i]);
}

class DebrisSystem implements System {
    public readonly name = "debris";

    public update(_deltaT: number): void {
        trimDebris();
    }
}

export default DebrisSystem;
