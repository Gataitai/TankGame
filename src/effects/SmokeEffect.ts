// SmokeEffect.ts
import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {
    DodecahedronGeometry,
    Mesh,
    MeshPhongMaterial,
    Vector3,
} from "three";
import { randomIntInRange, randomSign } from "@/utils/MathUtils.ts";

class SmokeEffect extends UpdatableEntity {
    private _size: number = 0.1;
    private _effectDuration: number = 1;

    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        const particleGeometry = new DodecahedronGeometry(this._size, 0);
        const smokeMaterial = new MeshPhongMaterial({
            color: 0xfafafa,
            transparent: true,
        });

        const totalParticles = randomIntInRange(2, 6);
        for (let i = 0; i < totalParticles; i++) {
            const smokePositionOffset = new Vector3(
                Math.random() * this._size * randomSign(),
                Math.random() * this._size * randomSign(),
                Math.random() * this._size * randomSign()
            );
            const smokeParticle = new Mesh(particleGeometry, smokeMaterial);
            smokeParticle.position.add(smokePositionOffset);
            this.mesh.add(smokeParticle);
        }
    }

    public update(deltaT: number): void {
        this._effectDuration -= deltaT;
        if (this._effectDuration <= 0) {
            this.shouldDispose = true;
            return;
        }

        this.mesh.children.forEach((element) => {
            const smokeParticle = element as Mesh;
            const material = smokeParticle.material as MeshPhongMaterial;
            material.opacity = this._effectDuration;
            smokeParticle.position.add(new Vector3(0, 0, 3 * deltaT));
        });
    }
}

export default SmokeEffect;
