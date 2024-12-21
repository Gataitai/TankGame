import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {
    PlaneGeometry,
    Mesh,
    MeshStandardMaterial,
    Vector3,
    BufferAttribute,
} from "three";

class TreadsEffect extends UpdatableEntity {
    private _angle: number;
    private _lifetime: number = 5; // Lifetime of each tread in seconds
    private _treadSeparation: number = 0.6; // Distance between the two treads
    private _treadElevation: number = 0.01; // Elevation above the map surface

    constructor(position: Vector3, angle: number) {
        super(position);
        this._angle = angle;
    }

    public async load(): Promise<void> {
        // Define the size of the tread plane
        const treadWidth = 0.2; // Width of the tread
        const treadHeight = 0.1; // Height of the tread, adjust as needed

        // Create a flat plane geometry with additional segments for fading control
        const treadGeometry = new PlaneGeometry(treadWidth, treadHeight, 2, 2);

        // Add color attribute for fading effect around the edges
        const colors = new Float32Array([
            0.3, 0.2, 0.1, 0.0, // Bottom-left corner (RGBA, dark brown, fully transparent)
            0.3, 0.2, 0.1, 0.5, // Bottom-center (RGBA, dark brown, semi-transparent)
            0.3, 0.2, 0.1, 0.0, // Bottom-right corner (RGBA, dark brown, fully transparent)

            0.4, 0.3, 0.2, 0.5, // Middle-left (RGBA, brown, semi-transparent)
            0.5, 0.3, 0.2, 0.7, // Center (RGBA, lighter brown, fully opaque)
            0.4, 0.3, 0.2, 0.5, // Middle-right (RGBA, brown, semi-transparent)

            0.3, 0.2, 0.1, 0.0, // Top-left corner (RGBA, dark brown, fully transparent)
            0.3, 0.2, 0.1, 0.5, // Top-center (RGBA, dark brown, semi-transparent)
            0.3, 0.2, 0.1, 0.0, // Top-right corner (RGBA, dark brown, fully transparent)
        ]);
        treadGeometry.setAttribute(
            "color",
            new BufferAttribute(colors, 4) // 4 components per color (RGBA)
        );

        const treadMaterial = new MeshStandardMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 1.0, // Full opacity to ensure vertex colors control transparency
        });

        // Calculate separation offset based on tank angle
        const offsetX = Math.cos(this._angle) * (this._treadSeparation / 2);
        const offsetY = Math.sin(this._angle) * (this._treadSeparation / 2);

        // Left tread
        const leftTread = new Mesh(treadGeometry, treadMaterial);
        leftTread.position.set(-offsetX, -offsetY, this._treadElevation); // Offset to the left and elevate
        leftTread.rotation.z = this._angle; // Align with tank's direction

        // Right tread
        const rightTread = new Mesh(treadGeometry, treadMaterial);
        rightTread.position.set(offsetX, offsetY, this._treadElevation); // Offset to the right and elevate
        rightTread.rotation.z = this._angle; // Align with tank's direction

        // Add both treads to the effect mesh
        this.mesh.add(leftTread);
        this.mesh.add(rightTread);
    }

    public update(deltaT: number): void {
        this._lifetime -= deltaT;
        if (this._lifetime <= 0) {
            this.shouldDispose = true;
        }
    }
}

export default TreadsEffect;
