import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import Entity from "@/entities/Entity";

/** Small unlit sphere showing where a light is. Survives level resets. */
class LightIndicator extends Entity {
    private readonly _color: number;

    constructor(position: Vector3, color: number) {
        super(position);
        this._color = color;
        this.persistent = true;
    }

    public async load(): Promise<void> {
        this.setMesh(new Mesh(new SphereGeometry(0.3, 16, 16), new MeshBasicMaterial({ color: this._color })));
    }
}

export default LightIndicator;
