import { Vector3 } from "three";
import type { EntityId } from "@2/ecs/Ecs";
import { AreaCollider, Transform } from "@2/components/Spatial";
import { game } from "@2/scene/Game";

const _closest = new Vector3();

/**
 * Every entity with an AreaCollider whose box reaches into the sphere. This is what an explosion
 * asks to find out what it caught.
 *
 * It's a plain pass over the colliders rather than a spatial grid: area questions only come up
 * when something explodes, so a few hundred cheap box tests then are less work overall than
 * keeping a grid up to date every frame as things tumble around.
 */
export function entitiesInSphere(center: Vector3, radius: number, exclude?: EntityId): EntityId[] {
    const { ecs } = game();
    const radiusSq = radius * radius;
    const found: EntityId[] = [];

    ecs.each(AreaCollider, (entity, collider) => {
        if (entity === exclude || ecs.isDoomed(entity)) return;

        const transform = ecs.get(entity, Transform);
        if (!transform) return;

        // Closest point of the entity's box to the centre of the sphere
        const { position } = transform;
        _closest.set(
            clampTo(center.x, position.x, collider.half.x),
            clampTo(center.y, position.y, collider.half.y),
            clampTo(center.z, position.z, collider.half.z),
        );
        if (_closest.distanceToSquared(center) <= radiusSq) found.push(entity);
    });

    return found;
}

const clampTo = (value: number, center: number, half: number): number =>
    Math.min(center + half, Math.max(center - half, value));
