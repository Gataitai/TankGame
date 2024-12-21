import Entity from "@/entities/Entity.ts";
import {
    Box3,
    Mesh,
    MeshStandardMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import ResourceManager from "@/utils/ResourceManager.ts";


class Wall extends Entity {
    protected textureKey: string = "random-wall"; // Default texture key

    public async load(): Promise<void> {
        // Use RoundedBoxGeometry for subtle beveled edges
        const bevelRadius = 0.05; // Small bevel radius for subtle effect
        const geometry = new RoundedBoxGeometry(1, 1, 1, 2, bevelRadius); // Reduced segments for efficiency

        // Get the wall texture based on the texture key
        const texture =
            this.textureKey === "random-wall"
                ? ResourceManager.instance.getRandomWallTexture()
                : ResourceManager.instance.getTexture(this.textureKey);

        if (!texture) {
            throw new Error(`Texture not found for key: ${this.textureKey}`);
        }

        // Create the material
        const material = new MeshStandardMaterial({
            map: texture,
        });

        this.mesh = new Mesh(geometry, material);

        // Set position
        this.mesh.position.copy(this.position);

        // Create collider for this object
        this.collider = new Box3().setFromObject(this.mesh);
    }
}

export default Wall;
