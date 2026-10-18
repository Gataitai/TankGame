import { PerspectiveCamera, Vector2, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import CameraStrategy from "./CameraStrategy";

/** Free orbit camera for looking around the map. Gameplay is paused while it's active. */
class PerspectiveStrategy implements CameraStrategy {
    public readonly camera: PerspectiveCamera;
    public readonly pausesGame = true;
    private readonly _controls: OrbitControls;

    constructor(renderer: WebGLRenderer, mapSize: number) {
        const size = renderer.getSize(new Vector2());
        this.camera = new PerspectiveCamera(75, size.x / size.y, 0.1, 1000);
        this.camera.position.set(mapSize / 2, mapSize / 2 - 20, 20);
        this.camera.up.set(0, 0, 1); // Z is up in this game

        this._controls = new OrbitControls(this.camera, renderer.domElement);
        this._controls.enablePan = false;
        this._controls.minPolarAngle = Math.PI / 10; // Keep a slight tilt
        this._controls.maxPolarAngle = Math.PI / 2;  // Never look from below the ground
        this._controls.target.set(mapSize / 2, mapSize / 2, 0);
        this._controls.update();
    }

    public resize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    /** Removes the OrbitControls' event listeners from the canvas. */
    public dispose(): void {
        this._controls.dispose();
    }
}

export default PerspectiveStrategy;
