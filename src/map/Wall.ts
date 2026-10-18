import { Box3, Mesh, MeshStandardMaterial, Texture, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";

// All walls share one geometry and one material per texture.
const GEOMETRY = markShared(new RoundedBoxGeometry(1, 1, 1, 2, 0.05));
const materials = new Map<Texture, MeshStandardMaterial>();

function materialFor(texture: Texture): MeshStandardMaterial {
    let material = materials.get(texture);
    if (!material) {
        material = markShared(new MeshStandardMaterial({ map: texture }));
        materials.set(texture, material);
    }
    return material;
}

class Wall extends Entity {
    constructor(position: Vector3) {
        super(position);
        this.isStatic = true;
    }

    public async load(): Promise<void> {
        this.setMesh(new Mesh(GEOMETRY, materialFor(this.getTexture())));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Box3().setFromObject(this.mesh);
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getRandomWallTexture();
    }
}

export default Wall;
