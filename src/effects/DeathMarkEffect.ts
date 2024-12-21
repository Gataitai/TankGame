import Entity from "@/entities/Entity.ts";
import { Mesh, PlaneGeometry, MeshStandardMaterial, Vector3 } from "three";

class DeathMarkEffect extends Entity {

    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        // Create the material for the death mark
        const material = new MeshStandardMaterial({
            color: 0xffffff, // White color
            transparent: true,
            opacity: 0.8, // Slightly transparent for a subtle effect
        });

        // Create the horizontal rectangle
        const horizontalGeometry = new PlaneGeometry(1.0, 0.2); // Width: 1.0, Height: 0.2
        const horizontalMesh = new Mesh(horizontalGeometry, material);
        horizontalMesh.rotation.z = 0; // No rotation for horizontal rectangle

        // Create the vertical rectangle
        const verticalGeometry = new PlaneGeometry(0.2, 1.0); // Width: 0.2, Height: 1.0
        const verticalMesh = new Mesh(verticalGeometry, material);
        verticalMesh.rotation.z = Math.PI / 2; // Rotate 90 degrees for vertical rectangle

        // Add both rectangles to this entity's mesh
        this.mesh.add(horizontalMesh);
        this.mesh.add(verticalMesh);
    }
}

export default DeathMarkEffect;
