import { Box3, Sphere } from "three";
import Entity from "@/entities/Entity";
import UpdatableEntity from "@/entities/UpdatableEntity";
import NavGrid from "@/ai/NavGrid";
import PhysicsWorld from "@/physics/PhysicsWorld";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const boundsOf = (collider: Box3 | Sphere): Bounds => {
    const box = collider instanceof Box3 ? collider : collider.getBoundingBox(new Box3());
    return { minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y };
};

/**
 * Owns the list of live entities, the physics world and answers collision queries.
 *
 * Static colliders (walls) live in a 1x1 grid so a query only checks nearby cells;
 * moving colliders (tanks, projectiles, mines, physics props) are few and are checked linearly.
 * Walls are also registered in the NavGrid, which the AI uses to plan paths.
 *
 * Every frame: entities update (tanks decide where to drive), then physics steps, then the
 * meshes of physics-driven entities are moved to their bodies.
 */
class EntityManager {
    public readonly navGrid: NavGrid;
    public readonly physics = new PhysicsWorld();

    private _entities: Entity[] = [];
    private _dynamicColliders: Entity[] = [];
    private _staticGrid = new Map<string, Entity[]>();

    constructor(mapSize: number) {
        this.navGrid = new NavGrid(mapSize);
    }

    public get entities(): readonly Entity[] {
        return this._entities;
    }

    public add(entity: Entity): void {
        this._entities.push(entity);
        if (entity.body) this.physics.add(entity, entity.body);

        if (!entity.collider) return;
        entity.captureColliderOffset();
        if (entity.isStatic) {
            this.forEachCell(boundsOf(entity.collider), (key) => {
                const cell = this._staticGrid.get(key);
                if (cell) cell.push(entity);
                else this._staticGrid.set(key, [entity]);
            });
            if (entity.blocksMovement) this.navGrid.block(entity.position);
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

        for (const entity of this._entities) {
            if (entity.body && !entity.shouldDispose) entity.beforePhysicsStep(deltaT);
        }
        this.physics.step(deltaT);
        for (const entity of this._entities) {
            if (entity.body && !entity.shouldDispose) entity.afterPhysicsStep(deltaT);
        }
    }

    /**
     * Removes and disposes every entity flagged with shouldDispose. `beforeDispose` is called for
     * each of them while it's still intact (used to break destroyed entities into pieces).
     */
    public removeDisposed(beforeDispose?: (entity: Entity) => void): Entity[] {
        return this.removeWhere((entity) => entity.shouldDispose, beforeDispose);
    }

    /** Removes and disposes every entity matching the predicate. */
    public removeWhere(predicate: (entity: Entity) => boolean, beforeDispose?: (entity: Entity) => void): Entity[] {
        const removed: Entity[] = [];
        this._entities = this._entities.filter((entity) => {
            if (!predicate(entity)) return true;
            removed.push(entity);
            return false;
        });

        for (const entity of removed) {
            entity.shouldDispose = true;
            beforeDispose?.(entity);
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
            entity.intersectsSphere(sphere);

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
        if (entity.body) {
            this.physics.remove(entity.body);
            entity.body = null;
        }
        if (!entity.collider) return;

        if (entity.isStatic) {
            this.forEachCell(boundsOf(entity.collider), (key) => {
                const cell = this._staticGrid.get(key);
                if (!cell) return;
                const index = cell.indexOf(entity);
                if (index >= 0) cell.splice(index, 1);
                if (cell.length === 0) this._staticGrid.delete(key);
            });
            if (entity.blocksMovement) this.navGrid.unblock(entity.position);
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
