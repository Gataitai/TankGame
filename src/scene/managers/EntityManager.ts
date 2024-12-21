import Entity from "@/entities/Entity.ts";
import UpdatableEntity from "@/entities/UpdatableEntity.ts";

class EntityManager {
    private _entities: Entity[] = [];

    public addEntity(entity: Entity) {
        this._entities.push(entity);
    }

    public update(deltaT: number): void {
        for (let entity of this._entities) {
            if (entity instanceof UpdatableEntity) {
                entity.update(deltaT);
            }
        }
    }

    public dispose(): Entity[] {
        const disposed: Entity[] = [];
        this._entities = this._entities.filter((entity) => {
            if (entity.shouldDispose) {
                disposed.push(entity);
                entity.dispose();
                return false;
            }
            return true;
        });
        return disposed;
    }

    public get entities() {
        return this._entities;
    }
}

export default EntityManager;
