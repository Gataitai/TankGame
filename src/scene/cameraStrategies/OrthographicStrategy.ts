import { OrthographicCamera, Vector2, Vector3, WebGLRenderer } from "three";
import CameraStrategy from "./CameraStrategy";
import { CAMERA_FOLLOW_RATE, ORTHO_CAMERA_BACK, ORTHO_CAMERA_HEIGHT, ORTHO_FRUSTUM_SIZE } from "@/config";

/**
 * Slightly tilted top-down view. Either fixed on a point (the middle of a small map, which then
 * fits on screen) or following the focus point (the player's tank on maps bigger than the screen).
 */
class OrthographicStrategy implements CameraStrategy {
    public readonly camera: OrthographicCamera;
    public readonly pausesGame = false;

    private readonly _offset = new Vector3(0, -ORTHO_CAMERA_BACK, ORTHO_CAMERA_HEIGHT);
    private readonly _lookAt = new Vector3();

    /**
     * @param center the point to look at (and to start at when following)
     * @param follow whether to follow the focus point given to update()
     */
    constructor(renderer: WebGLRenderer, center: Vector3, private readonly _follow = false) {
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

        const size = renderer.getSize(new Vector2());
        this.resize(size.x, size.y);

        this._lookAt.copy(center);
        this.camera.position.copy(center).add(this._offset);
        this.camera.lookAt(center);
    }

    public update(deltaT: number, focus: Vector3): void {
        if (!this._follow) return;

        // Smoothly catch up (frame-rate independent), keeping the same viewing angle
        this._lookAt.lerp(focus, 1 - Math.exp(-CAMERA_FOLLOW_RATE * deltaT));
        this.camera.position.copy(this._lookAt).add(this._offset);
    }

    public resize(width: number, height: number): void {
        const aspect = width / height;
        this.camera.left = (-ORTHO_FRUSTUM_SIZE * aspect) / 2;
        this.camera.right = (ORTHO_FRUSTUM_SIZE * aspect) / 2;
        this.camera.top = ORTHO_FRUSTUM_SIZE / 2;
        this.camera.bottom = -ORTHO_FRUSTUM_SIZE / 2;
        this.camera.updateProjectionMatrix();
    }

    public dispose(): void {}
}

export default OrthographicStrategy;
