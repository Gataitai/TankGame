import { Box3, Mesh, MeshStandardMaterial, Texture, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";

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

/**
 * A wall block. By default an immovable ("static") physics body, so physics objects bounce off
 * it and tanks can land on it. Add it with `{ physics: "dynamic" }` (or call
 * `setPhysics("dynamic")` later) to make it a block that can be pushed over.
 */
class Wall extends Entity {
    constructor(position: Vector3) {
        super(position);
        this.isStatic = true;
    }

    public get defaultPhysics(): PhysicsMode {
        return "static";
    }

    public async load(): Promise<void> {
        this.setMesh(new Mesh(GEOMETRY, materialFor(this.getTexture())));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Box3().setFromObject(this.mesh);
    }

    /** Frictionless, so rolling things can't climb up the walls by spinning against them. */
    protected describePhysics(): PhysicsDescription {
        return { ...super.describePhysics(), surface: "frictionless" };
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getRandomWallTexture();
    }
}

export default Wall;
