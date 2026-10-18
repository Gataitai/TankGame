import Entity from "@/entities/Entity";

/** Tracks entities a weapon has created and caps how many may exist at the same time. */
class ActiveEntityLimit {
    private _active: Entity[] = [];

    constructor(private readonly _max: number) {}

    public hasRoom(): boolean {
        this._active = this._active.filter((entity) => !entity.shouldDispose);
        return this._active.length < this._max;
    }

    public track<T extends Entity>(entity: T): T {
        this._active.push(entity);
        return entity;
    }
}

export default ActiveEntityLimit;
