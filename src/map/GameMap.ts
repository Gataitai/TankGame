import { Mesh, MeshStandardMaterial, MirroredRepeatWrapping, PlaneGeometry, Vector3 } from "three";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import { GROUND_TILE_HEIGHT, GROUND_TILE_WIDTH, GROUND_TILES } from "@/config";

/**
 * The ground plane. The texture covers one tile centred on the map (as before) and repeats
 * around it, mirrored so the edges join seamlessly, far enough to fill even ultra-wide screens.
 */
class GameMap extends Entity {
    constructor(center: Vector3) {
        super(center);
    }

    public async load(): Promise<void> {
        // Own copy of the texture, since the repeat settings belong to the texture
        const texture = ResourceManager.instance.getTexture("ground").clone();
        texture.userData = {}; // Not shared: disposed together with the map
        texture.wrapS = MirroredRepeatWrapping;
        texture.wrapT = MirroredRepeatWrapping;
        texture.repeat.set(GROUND_TILES, GROUND_TILES);
        texture.needsUpdate = true;

        const geometry = new PlaneGeometry(GROUND_TILE_WIDTH * GROUND_TILES, GROUND_TILE_HEIGHT * GROUND_TILES);
        this.setMesh(new Mesh(geometry, new MeshStandardMaterial({ map: texture })));
        this.mesh.receiveShadow = true;
    }
}

export default GameMap;
