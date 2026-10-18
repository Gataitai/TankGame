import { DodecahedronGeometry, Mesh, MeshPhongMaterial, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import { markShared } from "@/utils/SharedResources";
import { randomSign } from "@/utils/MathUtils";

const START_OPACITY = 0.4;
const MAX_GROWTH = 1.2; // Expands to 2.2x its initial size
const GEOMETRY = markShared(new DodecahedronGeometry(0.1, 0));

/** Single smoke puff left behind by projectiles. */
class TrailEffect extends UpdatableEntity {
    private readonly _duration: number;
    private _timeLeft: number;
    private _material!: MeshPhongMaterial;

    constructor(position: Vector3, duration = 0.5) {
        super(position);
        this._duration = duration;
        this._timeLeft = duration;
    }

    public async load(): Promise<void> {
        this._material = new MeshPhongMaterial({ color: 0xfafafa, transparent: true, opacity: START_OPACITY });
        this.setMesh(new Mesh(GEOMETRY, this._material));

        // Small random offset so the trail doesn't look like a straight line
        const angle = Math.PI * Math.random() * randomSign();
        this.position.add(new Vector3(Math.sin(angle), Math.cos(angle), 0).multiplyScalar(0.1));
    }

    public update(deltaT: number): void {
        this._timeLeft -= deltaT;
        if (this._timeLeft <= 0) {
            this.shouldDispose = true;
            return;
        }

        const progress = 1 - this._timeLeft / this._duration;
        this._material.opacity = START_OPACITY * (1 - progress);
        this.mesh.scale.setScalar(1 + progress * MAX_GROWTH);
    }
}

export default TrailEffect;
