// CameraController.ts
import { Camera, WebGLRenderer, OrthographicCamera, PerspectiveCamera } from "three";
import CameraStrategy from "@/scene/cameraStrategies/CameraStrategy";
import OrthographicStrategy from "@/scene/cameraStrategies/OrthographicStratety";

class CameraController {
    private _cameraStrategy: CameraStrategy;
    private _camera!: Camera;
    private _mapSize: number = 25;
    private _shakeDuration: number = 0;
    private _shakeIntensity: number = 0.5;
    private _originalZ: number = 10;

    constructor() {
        // Default to OrthographicStrategy
        this._cameraStrategy = new OrthographicStrategy();
    }

    public setupCamera(renderer: WebGLRenderer, mapSize: number) {
        this._mapSize = mapSize;
        // Create a new camera from the current strategy
        this._camera = this._cameraStrategy.setupCamera(renderer, mapSize);
    }

    public get camera() {
        return this._camera;
    }

    public get cameraStrategy() {
        return this._cameraStrategy;
    }

    public shakeCamera(duration: number, intensity: number = 0.5): void {
        this._shakeDuration = duration;
        this._shakeIntensity = intensity;
    }

    public applyCameraShake(deltaT: number, elapsedTime: number): void {
        if (this._shakeDuration <= 0) return;

        this._shakeDuration -= deltaT;
        const frequencyMultiplier = 50;
        const mapCenterX = this._mapSize / 2;

        this._camera.position.set(mapCenterX, 0, this._originalZ);

        const shakeX = Math.sin(elapsedTime * frequencyMultiplier) * this._shakeIntensity;
        const shakeY = Math.sin(elapsedTime * frequencyMultiplier * 1.2) * this._shakeIntensity;

        this._camera.position.x += shakeX;
        this._camera.position.y += shakeY;
    }

    public handleResize(width: number, height: number) {
        const aspect = width / height;

        if (this._camera instanceof OrthographicCamera) {
            const frustumSize = 20;
            this._camera.left = (-frustumSize * aspect) / 2;
            this._camera.right = (frustumSize * aspect) / 2;
            this._camera.top = frustumSize / 2;
            this._camera.bottom = -frustumSize / 2;
            this._camera.updateProjectionMatrix();
        } else if (this._camera instanceof PerspectiveCamera) {
            this._camera.aspect = aspect;
            this._camera.updateProjectionMatrix();
        }
    }

    public setCameraStrategy(strategy: CameraStrategy, renderer: WebGLRenderer, mapSize: number): void {
        this._cameraStrategy = strategy;
        this.setupCamera(renderer, mapSize);
    }

    public isOrthographic(): boolean {
        return this._camera instanceof OrthographicCamera;
    }
}

export default CameraController;
