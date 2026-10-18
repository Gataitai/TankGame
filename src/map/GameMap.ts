import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import { GROUND_HEIGHT, GROUND_WIDTH } from "@/config";

/** The ground plane. Walls and tanks are created by LevelManager. */
class GameMap extends Entity {
    constructor(center: Vector3) {
        super(center);
    }

    public async load(): Promise<void> {
        const material = new MeshStandardMaterial({
            map: ResourceManager.instance.getTexture("ground"),
        });
        this.setMesh(new Mesh(new PlaneGeometry(GROUND_WIDTH, GROUND_HEIGHT), material));
        this.mesh.receiveShadow = true;
    }
}

export default GameMap;
