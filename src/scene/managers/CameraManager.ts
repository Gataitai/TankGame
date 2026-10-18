import { Camera, Vector3 } from "three";
import CameraStrategy from "@/scene/cameraStrategies/CameraStrategy";

/** Holds the active camera strategy and applies camera shake on top of it. */
class CameraManager {
    private _strategy: CameraStrategy;

    private _shakeTimeLeft = 0;
    private _shakeIntensity = 0;
    /** Offset currently applied to the camera; removed again before the next one is applied. */
    private readonly _shakeOffset = new Vector3();

    constructor(initialStrategy: CameraStrategy) {
        this._strategy = initialStrategy;
    }

    public get camera(): Camera {
        return this._strategy.camera;
    }

    public get strategy(): CameraStrategy {
        return this._strategy;
    }

    public setStrategy(strategy: CameraStrategy): void {
        this.clearShakeOffset();
        this._shakeTimeLeft = 0;
        this._strategy.dispose();
        this._strategy = strategy;
    }

    public shake(duration: number, intensity = 0.5): void {
        this._shakeTimeLeft = duration;
        this._shakeIntensity = intensity;
    }

    /**
     * The shake is applied as an offset relative to wherever the camera is, so it works for any
     * strategy and the camera ends up exactly where it started.
     */
    public update(deltaT: number, elapsedTime: number): void {
        this.clearShakeOffset();
        if (this._shakeTimeLeft <= 0) return;

        this._shakeTimeLeft -= deltaT;
        if (this._shakeTimeLeft <= 0) return;

        const frequency = 50;
        this._shakeOffset.set(
            Math.sin(elapsedTime * frequency) * this._shakeIntensity,
            Math.sin(elapsedTime * frequency * 1.2) * this._shakeIntensity,
            0
        );
        this.camera.position.add(this._shakeOffset);
    }

    public resize(width: number, height: number): void {
        this._strategy.resize(width, height);
    }

    private clearShakeOffset(): void {
        this.camera.position.sub(this._shakeOffset);
        this._shakeOffset.set(0, 0, 0);
    }
}

export default CameraManager;
