import type { EntityId } from "@2/ecs/Ecs";
import { game } from "@2/scene/Game";

/** Tracks entities a weapon has created and caps how many may exist at the same time. */
class ActiveLimit {
    private _active: EntityId[] = [];

    constructor(private readonly _max: number) {}

    public hasRoom(): boolean {
        const { ecs } = game();
        this._active = this._active.filter((entity) => ecs.isAlive(entity) && !ecs.isDoomed(entity));
        return this._active.length < this._max;
    }

    public track(entity: EntityId): EntityId {
        this._active.push(entity);
        return entity;
    }
}

export default ActiveLimit;
