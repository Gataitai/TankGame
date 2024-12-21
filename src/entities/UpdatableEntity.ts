import Entity from "./Entity.ts";
import {Vector3} from "three";

abstract class UpdatableEntity extends Entity {

    protected constructor(position: Vector3) {
        super(position); // Call the parent class constructor explicitly.
    }

    public abstract update(deltaT: number): void;
}

export default UpdatableEntity;
