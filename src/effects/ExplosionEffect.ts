import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {
    DodecahedronGeometry,
    Mesh,
    MeshPhongMaterial,
    Vector3,
} from "three";
import { randomIntInRange, randomSign } from "@/utils/MathUtils.ts";

class ExplosionEffect extends UpdatableEntity {
    private _size: number;
    private _effectDuration = 0.5;
    private _currentDuration: number;

    constructor(position: Vector3, size: number) {
        super(position);
        this._size = size;
        this._currentDuration = this._effectDuration;
    }

    public async load(): Promise<void> {
        const particleGeometry = new DodecahedronGeometry(this._size, 0);
        const totalParticles = randomIntInRange(7, 13);
        const explosionMaterial = new MeshPhongMaterial({
            color: 0xfafafa, // Corrected hex color code
            transparent: true,
            opacity: 0.4, // Initial opacity
        });

        for (let i = 0; i < totalParticles; i++) {
            const particleAngle = Math.random() * Math.PI * 2;
            const explosionGeometry = particleGeometry.clone();
            const particleSize =
                0.3 * this._size +
                Math.random() * this._size * 0.4 * randomSign();

            explosionGeometry.scale(particleSize, particleSize, particleSize);
            explosionGeometry.rotateX(Math.random() * Math.PI);
            explosionGeometry.rotateY(Math.random() * Math.PI);
            explosionGeometry.rotateZ(Math.random() * Math.PI);

            const fireParticle = new Mesh(
                explosionGeometry,
                explosionMaterial.clone() // Clone material for independent opacity control
            );
            fireParticle.userData = {
                angle: particleAngle,
                speed: 0.5 + Math.random() * 2.5,
            };
            this.mesh.add(fireParticle);
        }
    }

    public update(deltaT: number): void {
        this._currentDuration -= deltaT;
        if (this._currentDuration <= 0) {
            this.shouldDispose = true;
            return;
        }

        const progress = 1 - this._currentDuration / this._effectDuration;

        this.mesh.children.forEach((element) => {
            const fireParticle = element as Mesh;
            const angle = fireParticle.userData["angle"];
            const speed = fireParticle.userData["speed"];

            // Update opacity to gradually fade out
            const material = fireParticle.material as MeshPhongMaterial;
            material.opacity = Math.max(0, 0.4 - progress * 0.4);

            // Update scale and position
            const scale = this._currentDuration / this._effectDuration;
            fireParticle.scale.set(scale, scale, scale);
            const computedMovement = new Vector3(
                speed * Math.sin(angle) * deltaT,
                -speed * Math.cos(angle) * deltaT,
                0
            );
            fireParticle.position.add(computedMovement);
        });
    }
}

export default ExplosionEffect;
