import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {
    DodecahedronGeometry,
    MeshPhongMaterial,
    Vector3,
} from "three";
import { randomSign } from "@/utils/MathUtils.ts"; // Assuming you have this utility function

class TrailEffect extends UpdatableEntity {
    private _duration: number;
    private _initialDuration: number;

    constructor(position: Vector3, duration: number = 0.5) {
        super(position);
        this._duration = duration;
        this._initialDuration = duration;
    }

    public async load(): Promise<void> {
        // Create a dodecahedron geometry for a smoke puff shape
        const smokeGeometry = new DodecahedronGeometry(0.1, 0); // Small initial size for smoke puff
        const smokeMaterial = new MeshPhongMaterial({
            color: 0xfafafa, // Corrected hex color code
            transparent: true,
            opacity: 0.4, // Start with a medium opacity
        });

        // Set the mesh for this entity
        this.mesh.geometry = smokeGeometry;
        this.mesh.material = smokeMaterial;

        // Apply a random angle offset to the initial position
        const angleOffset = Math.PI * Math.random() * randomSign();
        const offsetDirection = new Vector3(
            Math.sin(angleOffset),
            Math.cos(angleOffset),
            0
        );
        this.mesh.position.add(offsetDirection.multiplyScalar(0.1)); // Adjust distance as needed
    }

    public update(deltaT: number): void {
        // Decrease the duration
        this._duration -= deltaT;

        // Calculate progress for scaling and fading (0 to 1)
        const progress = 1 - this._duration / this._initialDuration;

        // Gradually decrease opacity to fade out the smoke
        const material = this.mesh.material as MeshPhongMaterial;
        material.opacity = Math.max(0, 0.4 - progress * 0.4);

        // Scale the particle up slightly over time to simulate dispersion
        const scale = 1 + progress * 1.2; // Expands up to 2.2 times initial size
        this.mesh.scale.set(scale, scale, scale);

        // Mark for disposal when the duration ends
        if (this._duration <= 0) {
            this.shouldDispose = true;
        }
    }
}

export default TrailEffect;
