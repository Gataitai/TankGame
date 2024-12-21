import { OrthographicCamera, WebGLRenderer, Vector3 } from "three";
import CameraStrategy from "./CameraStrategy";

class OrthographicStrategy implements CameraStrategy {
    public setupCamera(renderer: WebGLRenderer, mapSize: number): OrthographicCamera {
        const aspect = renderer.domElement.width / renderer.domElement.height;
        const frustumSize = 20;

        const camera = new OrthographicCamera(
            (-frustumSize * aspect) / 2,
            (frustumSize * aspect) / 2,
            frustumSize / 2,
            -frustumSize / 2,
            0.1,
            1000
        );

        const centerX = mapSize / 2;
        const centerY = mapSize / 2;

        camera.position.set(centerX, 0, 10);
        camera.lookAt(new Vector3(centerX, centerY, 0));

        return camera;
    }
}

export default OrthographicStrategy;
