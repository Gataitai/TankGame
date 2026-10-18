import { DodecahedronGeometry, Mesh, MeshPhongMaterial, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import { markShared } from "@/utils/SharedResources";
import { directionFromAngle, randomIntInRange, randomSign } from "@/utils/MathUtils";

const DURATION = 1;
const GEOMETRY = markShared(new DodecahedronGeometry(0.1, 0));
const MATERIAL = markShared(new MeshPhongMaterial({ color: 0xffb400 }));
const step = new Vector3();

/** Muzzle flash / sparks shooting out in a narrow cone. */
class FireEffect extends UpdatableEntity {
    private readonly _angle: number;
    private _timeLeft = DURATION;

    constructor(position: Vector3, angle: number) {
        super(position);
        this._angle = angle;
    }

    public async load(): Promise<void> {
        const count = randomIntInRange(2, 6);
        for (let i = 0; i < count; i++) {
            const particle = new Mesh(GEOMETRY, MATERIAL);
            particle.userData = {
                angle: this._angle + Math.PI * 0.08 * Math.random() * randomSign(),
                speed: 1.75 * Math.random() * 3,
            };
            this.mesh.add(particle);
        }
    }

    public update(deltaT: number): void {
        this._timeLeft -= deltaT;
        if (this._timeLeft <= 0) {
            this.shouldDispose = true;
            return;
        }

        for (const particle of this.mesh.children) {
            const { angle, speed } = particle.userData;
            particle.position.add(directionFromAngle(angle, speed * deltaT * this._timeLeft * 0.75, step));
            particle.scale.setScalar(this._timeLeft);
        }
    }
}

export default FireEffect;
