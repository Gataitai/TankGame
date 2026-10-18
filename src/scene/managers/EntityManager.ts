import { Box3, Sphere } from "three";
import Entity from "@/entities/Entity";
import UpdatableEntity from "@/entities/UpdatableEntity";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const boundsOf = (collider: Box3 | Sphere): Bounds => {
    const box = collider instanceof Box3 ? collider : collider.getBoundingBox(new Box3());
    return { minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y };
};

/**
 * Owns the list of live entities and answers collision queries.
 *
 * Static colliders (walls) live in a 1x1 grid so a query only checks nearby cells;
 * moving colliders (tanks, projectiles, mines) are few and are checked linearly.
 */
class EntityManager {
    private _entities: Entity[] = [];
    private _dynamicColliders: Entity[] = [];
    private _staticGrid = new Map<string, Entity[]>();

    public get entities(): readonly Entity[] {
        return this._entities;
    }

    public add(entity: Entity): void {
        this._entities.push(entity);

        if (!entity.collider) return;
        if (entity.isStatic) {
            this.forEachCell(boundsOf(entity.collider), (key) => {
                const cell = this._staticGrid.get(key);
                if (cell) cell.push(entity);
                else this._staticGrid.set(key, [entity]);
            });
        } else {
            this._dynamicColliders.push(entity);
        }
    }

    public update(deltaT: number): void {
        // Entities spawned during this loop are added asynchronously (after load), so the array
        // doesn't change while we iterate it.
        for (const entity of this._entities) {
            if (entity instanceof UpdatableEntity && !entity.shouldDispose) {
                entity.update(deltaT);
            }
        }
    }

    /** Removes and disposes every entity flagged with shouldDispose. */
    public removeDisposed(): Entity[] {
        return this.removeWhere((entity) => entity.shouldDispose);
    }

    /** Removes and disposes every entity matching the predicate. */
    public removeWhere(predicate: (entity: Entity) => boolean): Entity[] {
        const removed: Entity[] = [];
        this._entities = this._entities.filter((entity) => {
            if (!predicate(entity)) return true;
            removed.push(entity);
            return false;
        });

        for (const entity of removed) {
            entity.shouldDispose = true;
            this.unindex(entity);
            entity.dispose();
        }
        return removed;
    }

    /** Returns every collider (except `exclude` and entities being disposed) that touches the sphere. */
    public queryColliders(sphere: Sphere, exclude?: Entity): Entity[] {
        const hits: Entity[] = [];
        const accept = (entity: Entity) =>
            entity !== exclude &&
            !entity.shouldDispose &&
            entity.collider!.intersectsSphere(sphere);

        for (const entity of this._dynamicColliders) {
            if (accept(entity)) hits.push(entity);
        }

        const { center, radius } = sphere;
        const seen = new Set<Entity>();
        this.forEachCell(
            { minX: center.x - radius, minY: center.y - radius, maxX: center.x + radius, maxY: center.y + radius },
            (key) => {
                const cell = this._staticGrid.get(key);
                if (!cell) return;
                for (const entity of cell) {
                    if (seen.has(entity)) continue;
                    seen.add(entity);
                    if (accept(entity)) hits.push(entity);
                }
            }
        );

        return hits;
    }

    private unindex(entity: Entity): void {
        if (!entity.collider) return;

        if (entity.isStatic) {
            this.forEachCell(boundsOf(entity.collider), (key) => {
                const cell = this._staticGrid.get(key);
                if (!cell) return;
                const index = cell.indexOf(entity);
                if (index >= 0) cell.splice(index, 1);
                if (cell.length === 0) this._staticGrid.delete(key);
            });
        } else {
            const index = this._dynamicColliders.indexOf(entity);
            if (index >= 0) this._dynamicColliders.splice(index, 1);
        }
    }

    private forEachCell(bounds: Bounds, callback: (key: string) => void): void {
        for (let x = Math.floor(bounds.minX); x <= Math.floor(bounds.maxX); x++) {
            for (let y = Math.floor(bounds.minY); y <= Math.floor(bounds.maxY); y++) {
                callback(`${x},${y}`);
            }
        }
    }
}

export default EntityManager;
