import { PerspectiveCamera, WebGLRenderer, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import CameraStrategy from "./CameraStrategy";

class PerspectiveStrategy implements CameraStrategy {
    public setupCamera(renderer: WebGLRenderer, mapSize: number): PerspectiveCamera {
        const aspect = renderer.domElement.width / renderer.domElement.height;
        const camera = new PerspectiveCamera(75, aspect, 0.1, 1000);

        // Set the camera position above and slightly offset from the map
        camera.position.set(mapSize / 2, mapSize / 2 - 20, 20); // Adjust Z for zoomed-in height
        camera.up.set(0, 0, 1); // Align Z-axis as up

        // Set up OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);

        // Disable right-click panning
        // Disable right-click panning
        controls.enablePan = false;

        // Restrict vertical rotation to prevent flipping
        controls.minPolarAngle = Math.PI / 10; // Slight tilt for viewing angle
        controls.maxPolarAngle = Math.PI / 2; // Prevent underside view

        // Set the center of the map as the controls target
        const target = new Vector3(mapSize / 2, mapSize / 2, 0); // Map center
        controls.target.copy(target);

        // Make sure the controls update their state
        controls.update();

        // Return the camera configured with OrbitControls
        return camera;
    }
}

export default PerspectiveStrategy;
