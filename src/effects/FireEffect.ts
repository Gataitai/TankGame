import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {
    DodecahedronGeometry,
    Mesh,
    MeshPhongMaterial,
    Vector3,
} from "three";
import { randomIntInRange, randomSign } from "@/utils/MathUtils.ts";

class FireEffect extends UpdatableEntity {
    private _angle: number;
    private _size: number = 0.1;
    private _effectDuration: number = 1;

    constructor(position: Vector3, angle: number) {
        super(position);
        this._angle = angle;
    }

    public async load(): Promise<void> {
        const particleGeometry = new DodecahedronGeometry(this._size, 0);
        const fireMaterial = new MeshPhongMaterial({
            color: 0xffb400,
        });

        const totalParticles = randomIntInRange(2, 6);
        for (let i = 0; i < totalParticles; i++) {
            const angleOffset = Math.PI * 0.08 * Math.random() * randomSign();
            const particleSpeed = 1.75 * Math.random() * 3;
            const fireParticle = new Mesh(particleGeometry, fireMaterial);
            fireParticle.userData = {
                angle: this._angle + angleOffset,
                speed: particleSpeed,
            };
            this.mesh.add(fireParticle);
        }
    }

    public update(deltaT: number): void {
        this._effectDuration -= deltaT;
        if (this._effectDuration <= 0) {
            this.shouldDispose = true;
            return;
        }

        this.mesh.children.forEach((element) => {
            const fireParticle = element as Mesh;
            const angle = fireParticle.userData["angle"];
            const speed = fireParticle.userData["speed"];
            const computedMovement = new Vector3(
                speed *
                Math.sin(angle) *
                deltaT *
                this._effectDuration *
                0.75,
                -speed *
                Math.cos(angle) *
                deltaT *
                this._effectDuration *
                0.75,
                0
            );
            fireParticle.position.add(computedMovement);
            fireParticle.scale.set(
                this._effectDuration,
                this._effectDuration,
                this._effectDuration
            );
        });
    }
}

export default FireEffect;
