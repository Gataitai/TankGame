import { Vector3 } from "three";
import EnemyTank from "@/entities/tanks/EnemyTank";

/** An enemy tank without AI: it just stands there, to push around and shoot at. */
class TargetTank extends EnemyTank {
    constructor(position: Vector3, heading = 0) {
        super(position, 0);
        this.setBodyRotation(heading);
    }

    protected think(): void {}
}

export default TargetTank;
