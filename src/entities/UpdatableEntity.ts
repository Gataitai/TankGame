import { Vector3 } from "three";
import Entity from "./Entity";

/** An entity with per-frame behaviour. */
abstract class UpdatableEntity extends Entity {
    protected constructor(position: Vector3) {
        super(position);
    }

    /** Called every (unpaused) frame. */
    public abstract update(deltaT: number): void;

    /**
     * Called every (unpaused) frame after all entities have run update(), like LateUpdate in
     * Unity. Use it for things that must react to where everything else moved this frame.
     */
    public lateUpdate(_deltaT: number): void {}
}

export default UpdatableEntity;
