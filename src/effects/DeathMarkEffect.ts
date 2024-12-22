import Entity from "@/entities/Entity.ts";
import { Mesh, PlaneGeometry, MeshStandardMaterial, Vector3, DoubleSide, NormalBlending } from "three";
import ResourceManager from "@/utils/ResourceManager.ts";

class DeathMarkEffect extends Entity {
    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        // Retrieve the texture from the ResourceManager
        const deathMarkTexture = ResourceManager.instance.getTexture("death_mark_red");

        if (!deathMarkTexture) {
            console.warn("Death mark texture not found. Falling back to default material.");
        } else {
            // Premultiply alpha to avoid black outlines
            deathMarkTexture.premultiplyAlpha = true;
        }

        // Create the material with transparency and smooth blending
        const material = new MeshStandardMaterial({
            map: deathMarkTexture,
            transparent: true,       // Enable full transparency support
            depthWrite: false,       // Avoid z-fighting
            opacity: 1.0,            // Ensure core remains fully opaque
            side: DoubleSide,        // Render both sides to prevent cut-off
            blending: NormalBlending // Smooth blending for soft edges
        });

        // Create the plane geometry for the death mark
        const geometry = new PlaneGeometry(1, 1);
        const mesh = new Mesh(geometry, material);

        // Slightly raise the plane to avoid clipping with the ground
        mesh.position.set(0, 0, 0.05);  // Raise it slightly above the ground

        // Add the mesh to this entity
        this.mesh.add(mesh);
    }
}

export default DeathMarkEffect;
