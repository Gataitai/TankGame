import { Mesh, MeshStandardMaterial, MirroredRepeatWrapping, PlaneGeometry, Vector3 } from "three";
import { Plane } from "cannon-es";
import Entity from "@/entities/Entity";
import { PhysicsMaterials } from "@/physics/PhysicsWorld";
import ResourceManager from "@/utils/ResourceManager";
import { GROUND_EXTENSION, GROUND_HEIGHT, GROUND_WIDTH, MAP_SIZE } from "@/config";

/** The ground: a textured plane, and an infinite static floor for physics. */
class GameMap extends Entity {
    private readonly _width: number;
    private readonly _height: number;

    /** The ground for a map of `mapSize` tiles, centred on `center`. */
    constructor(center: Vector3, mapSize = MAP_SIZE) {
        super(center);
        // The standard map gets the standard ground; bigger maps get the same margin around them
        this._width = Math.max(GROUND_WIDTH, mapSize + GROUND_WIDTH - MAP_SIZE);
        this._height = Math.max(GROUND_HEIGHT, mapSize + GROUND_HEIGHT - MAP_SIZE);
    }

    public async load(): Promise<void> {
        const texture = ResourceManager.instance.getTexture("ground");
        texture.wrapS = MirroredRepeatWrapping;
        texture.wrapT = MirroredRepeatWrapping;
        texture.needsUpdate = true;

        // The texture covers GROUND_WIDTH x GROUND_HEIGHT once (bigger maps repeat it at the same
        // size). The plane is GROUND_EXTENSION times bigger and the texture continues mirrored, so
        // wide screens don't see where the ground ends.
        const geometry = new PlaneGeometry(this._width * GROUND_EXTENSION, this._height * GROUND_EXTENSION);
        const uv = geometry.getAttribute("uv");
        const shift = (GROUND_EXTENSION - 1) / 2;
        const repeatX = this._width / GROUND_WIDTH;
        const repeatY = this._height / GROUND_HEIGHT;
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(
                i,
                (uv.getX(i) * GROUND_EXTENSION - shift) * repeatX,
                (uv.getY(i) * GROUND_EXTENSION - shift) * repeatY,
            );
        }

        this.setMesh(new Mesh(geometry, new MeshStandardMaterial({ map: texture })));
        this.mesh.receiveShadow = true;

        this.createBody({ mass: 0, material: PhysicsMaterials.scenery }).addShape(new Plane());
    }
}

export default GameMap;
