import Entity from "@/entities/Entity.ts";
import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";

class LightIndicator extends Entity {
    private _color: number;

    constructor(position: Vector3, color: number) {
        super(position);
        this._color = color;
    }

    async load(): Promise<void> {
        const sphereGeometry = new SphereGeometry(0.3, 16, 16);
        const sphereMaterial = new MeshBasicMaterial({ color: this._color });
        this.mesh = new Mesh(sphereGeometry, sphereMaterial);
        this.mesh.position.copy(this.position);
    }
}

export default LightIndicator;
