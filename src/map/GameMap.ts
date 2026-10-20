import { Mesh, MeshStandardMaterial, MirroredRepeatWrapping, PlaneGeometry, Vector3 } from "three";
import { Plane } from "cannon-es";
import Entity from "@/entities/Entity";
import { PhysicsMaterials } from "@/physics/PhysicsWorld";
import ResourceManager from "@/utils/ResourceManager";
import { GROUND_EXTENSION, GROUND_HEIGHT, GROUND_WIDTH } from "@/config";

/** The ground: a textured plane, and an infinite static floor for physics. */
class GameMap extends Entity {
    constructor(center: Vector3) {
        super(center);
    }

    public async load(): Promise<void> {
        const texture = ResourceManager.instance.getTexture("ground");
        texture.wrapS = MirroredRepeatWrapping;
        texture.wrapT = MirroredRepeatWrapping;
        texture.needsUpdate = true;

        // The texture covers GROUND_WIDTH x GROUND_HEIGHT in the middle, exactly like it always did.
        // The plane is GROUND_EXTENSION times bigger and the texture continues mirrored, so wide
        // screens don't see where the ground ends.
        const geometry = new PlaneGeometry(GROUND_WIDTH * GROUND_EXTENSION, GROUND_HEIGHT * GROUND_EXTENSION);
        const uv = geometry.getAttribute("uv");
        const shift = (GROUND_EXTENSION - 1) / 2;
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) * GROUND_EXTENSION - shift, uv.getY(i) * GROUND_EXTENSION - shift);
        }

        this.setMesh(new Mesh(geometry, new MeshStandardMaterial({ map: texture })));
        this.mesh.receiveShadow = true;

        this.createBody({ mass: 0, material: PhysicsMaterials.scenery }).addShape(new Plane());
    }
}

export default GameMap;
