import { Vector3 } from "three";
import Entity from "./Entity";

abstract class UpdatableEntity extends Entity {
    protected constructor(position: Vector3) {
        super(position);
    }

    public abstract update(deltaT: number): void;
}

export default UpdatableEntity;
