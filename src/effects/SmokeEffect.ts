import { DodecahedronGeometry, Mesh, MeshPhongMaterial, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import { markShared } from "@/utils/SharedResources";
import { randomIntInRange, randomSign } from "@/utils/MathUtils";

const DURATION = 1;
const SIZE = 0.1;
const RISE_SPEED = 3;
const GEOMETRY = markShared(new DodecahedronGeometry(SIZE, 0));

/** Small puff of smoke rising from the barrel. */
class SmokeEffect extends UpdatableEntity {
    private _timeLeft = DURATION;
    private _material!: MeshPhongMaterial;

    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        this._material = new MeshPhongMaterial({ color: 0xfafafa, transparent: true });

        const jitter = () => Math.random() * SIZE * randomSign();
        const count = randomIntInRange(2, 6);
        for (let i = 0; i < count; i++) {
            const particle = new Mesh(GEOMETRY, this._material);
            particle.position.set(jitter(), jitter(), jitter());
            this.mesh.add(particle);
        }
    }

    public update(deltaT: number): void {
        this._timeLeft -= deltaT;
        if (this._timeLeft <= 0) {
            this.shouldDispose = true;
            return;
        }

        this._material.opacity = this._timeLeft / DURATION;
        for (const particle of this.mesh.children) {
            particle.position.z += RISE_SPEED * deltaT;
        }
    }
}

export default SmokeEffect;
