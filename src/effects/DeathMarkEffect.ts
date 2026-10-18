import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";

const GEOMETRY = markShared(new PlaneGeometry(1, 1));
let sharedMaterial: MeshStandardMaterial | null = null;

/** Created lazily because the texture is only available after ResourceManager has loaded. */
function getMaterial(): MeshStandardMaterial {
    sharedMaterial ??= markShared(new MeshStandardMaterial({
        map: ResourceManager.instance.getTexture("death-mark"),
        transparent: true,
        depthWrite: false, // Avoid z-fighting with the ground / treads
        side: DoubleSide,
    }));
    return sharedMaterial;
}

/** Scorch mark left on the ground where a tank was destroyed. */
class DeathMarkEffect extends Entity {
    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        const decal = new Mesh(GEOMETRY, getMaterial());
        decal.position.z = 0.05; // Slightly above the ground
        this.mesh.add(decal);
    }
}

export default DeathMarkEffect;
