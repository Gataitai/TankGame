import { Camera, WebGLRenderer, PerspectiveCamera, Vector3 } from "three";
import CameraStrategy from "./CameraStrategy";
import Tank from "@/entities/tanks/Tank.ts";

class FirstPersonStrategy implements CameraStrategy {
    private _tank: Tank;

    constructor(tank: Tank) {
        this._tank = tank;
    }

    public setupCamera(renderer: WebGLRenderer): Camera {
        const aspect = renderer.domElement.width / renderer.domElement.height;
        const camera = new PerspectiveCamera(75, aspect, 0.1, 1000);

        this.updateCamera(camera);

        return camera;
    }

    public updateCamera(camera: Camera): void {
        const tankPosition = this._tank.mesh.position.clone();
        const turretRotation = this._tank.turretRotation;

        // Position the camera more backwards from the turret's position
        const offset = new Vector3(
            Math.sin(turretRotation) * -2, // Move backwards along the turret's direction
            -Math.cos(turretRotation) * -2, // Move backwards along the turret's direction
            1
        );
        camera.position.copy(tankPosition).add(offset);

        // Make the camera look in the direction the turret is facing
        const lookAtPosition = tankPosition.clone().add(new Vector3(
            Math.sin(turretRotation) * 10,
            -Math.cos(turretRotation) * 10,
            0
        ));
        camera.lookAt(lookAtPosition);

        // Ensure the camera's up direction is correct to avoid barrel roll
        camera.up.set(0, 0, 1);
    }
}

export default FirstPersonStrategy;