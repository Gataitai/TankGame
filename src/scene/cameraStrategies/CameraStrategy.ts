import { Camera, WebGLRenderer } from "three";

interface CameraStrategy {
    setupCamera(renderer: WebGLRenderer, mapSize: number): Camera;
}

export default CameraStrategy;
