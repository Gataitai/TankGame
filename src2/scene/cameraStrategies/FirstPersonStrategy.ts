import { PerspectiveCamera, Vector2, Vector3, WebGLRenderer } from "three";
import CameraStrategy, { type ViewTarget } from "@2/scene/cameraStrategies/CameraStrategy";
import { directionFromYawPitch } from "@2/utils/MathUtils";

const FOV = 78;
/** Small near plane so the weapon held in front of the camera isn't clipped away. */
const NEAR = 0.05;
const FAR = 500;

/**
 * Looks out of the player's eyes. It only follows the view it is given; the yaw and pitch
 * themselves belong to the player (see Player), so the camera stays dumb.
 */
class FirstPersonStrategy implements CameraStrategy {
    public readonly camera: PerspectiveCamera;
    public readonly pausesGame = false;

    private readonly _lookAt = new Vector3();
    private readonly _forward = new Vector3();

    constructor(renderer: WebGLRenderer, view: ViewTarget) {
        const size = renderer.getSize(new Vector2());
        this.camera = new PerspectiveCamera(FOV, size.x / size.y, NEAR, FAR);
        this.camera.up.set(0, 0, 1); // Z is up in this world
        this.apply(view);
    }

    public update(_deltaT: number, view: ViewTarget): void {
        this.apply(view);
    }

    public resize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public dispose(): void {}

    private apply(view: ViewTarget): void {
        this.camera.position.copy(view.position);
        directionFromYawPitch(view.yaw, view.pitch, this._forward);
        // With up = +Z, lookAt gives the right orientation for any pitch the player can reach
        this._lookAt.copy(view.position).add(this._forward);
        this.camera.lookAt(this._lookAt);
    }
}

export default FirstPersonStrategy;
