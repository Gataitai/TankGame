import { OrthographicCamera, Vector2, WebGLRenderer } from "three";
import CameraStrategy from "./CameraStrategy";
import { ORTHO_CAMERA_HEIGHT, ORTHO_FRUSTUM_SIZE } from "@/config";

/** Fixed, slightly tilted top-down view of the whole map. */
class OrthographicStrategy implements CameraStrategy {
    public readonly camera: OrthographicCamera;
    public readonly pausesGame = false;

    constructor(renderer: WebGLRenderer, mapSize: number) {
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

        const size = renderer.getSize(new Vector2());
        this.resize(size.x, size.y);

        const center = mapSize / 2;
        this.camera.position.set(center, 0, ORTHO_CAMERA_HEIGHT);
        this.camera.lookAt(center, center, 0);
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
