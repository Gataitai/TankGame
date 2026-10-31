import type System from "@2/ecs/System";
import type { EntityId } from "@2/ecs/Ecs";
import { Lifetime } from "@2/components/Visual";
import { Debris } from "@2/components/Gameplay";
import { DEBRIS_SHRINK_TIME } from "@2/prefabs/debris";
import { game } from "@2/scene/Game";
import { MAX_DEBRIS, MAX_DEBRIS_TOTAL } from "@2/config";

/**
 * Keeps the pile of pieces under MAX_DEBRIS by cutting the oldest ones' lives short, so they start
 * shrinking away. That looks like the oldest debris tidying itself up, because that is what it is.
 *
 * Every piece is a geometry, a draw call and a physics body, and bodies that touch cost more than
 * bodies that don't, so this ceiling is the main thing standing between a few rockets and a
 * stuttering frame. BreakSystem calls this as it works too, so a big explosion can't shoot past
 * the cap and then be trimmed back a moment later.
 */
export function trimDebris(): void {
    const { ecs } = game();

    // Entities already marked for removal this frame are gone as far as the cap is concerned;
    // counting them would mean condemning more pieces on every call until the pile was empty
    const pieces: { entity: EntityId; remaining: number }[] = [];
    ecs.each(Debris, (entity) => {
        if (ecs.isDoomed(entity)) return;
        const lifetime = ecs.get(entity, Lifetime);
        if (lifetime) pieces.push({ entity, remaining: lifetime.remaining });
    });
    if (pieces.length <= MAX_DEBRIS) return;

    // Least time left first: the oldest, most faded pieces are the ones to let go of
    pieces.sort((a, b) => a.remaining - b.remaining);

    // Past the hard ceiling, pieces are dropped outright rather than given another half second to
    // shrink. This is what stops a run of explosions from doubling the pile.
    const overCeiling = Math.max(0, pieces.length - MAX_DEBRIS_TOTAL);
    for (let i = 0; i < overCeiling; i++) ecs.destroy(pieces[i].entity);

    // Whatever is still over the soft cap is retired gently, and staggered across the shrink
    // window: removing a hundred bodies and geometries on one frame is its own stutter
    let over = pieces.length - overCeiling - MAX_DEBRIS;
    for (let i = overCeiling; i < pieces.length && over > 0; i++) {
        const lifetime = ecs.get(pieces[i].entity, Lifetime);
        if (!lifetime || lifetime.remaining <= DEBRIS_SHRINK_TIME) continue;
        lifetime.remaining = DEBRIS_SHRINK_TIME * (0.35 + 0.65 * Math.random());
        over--;
    }
}

class DebrisSystem implements System {
    public readonly name = "debris";

    public update(_deltaT: number): void {
        trimDebris();
    }
}

export default DebrisSystem;
