import { DodecahedronGeometry, Mesh, MeshPhongMaterial, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import { markShared } from "@/utils/SharedResources";
import { directionFromAngle, randomIntInRange, randomSign } from "@/utils/MathUtils";

const DURATION = 0.5;
const START_OPACITY = 0.4;
const PARTICLE_GEOMETRY = markShared(new DodecahedronGeometry(1, 0));
const step = new Vector3();

class ExplosionEffect extends UpdatableEntity {
    private readonly _size: number;
    private _timeLeft = DURATION;
    private _material!: MeshPhongMaterial;

    constructor(position: Vector3, size: number) {
        super(position);
        this._size = size;
    }

    public async load(): Promise<void> {
        // One material for all particles: they all fade together
        this._material = new MeshPhongMaterial({ color: 0xfafafa, transparent: true, opacity: START_OPACITY });

        const count = randomIntInRange(7, 13);
        for (let i = 0; i < count; i++) {
            const particleSize = 0.3 * this._size + Math.random() * this._size * 0.4 * randomSign();
            const baseScale = this._size * particleSize;

            const particle = new Mesh(PARTICLE_GEOMETRY, this._material);
            particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            particle.scale.setScalar(baseScale);
            particle.userData = {
                angle: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 2.5,
                baseScale,
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

        const remaining = this._timeLeft / DURATION;
        this._material.opacity = START_OPACITY * remaining;

        for (const particle of this.mesh.children) {
            const { angle, speed, baseScale } = particle.userData;
            particle.scale.setScalar(baseScale * remaining);
            particle.position.add(directionFromAngle(angle, speed * deltaT, step));
        }
    }
}

export default ExplosionEffect;
