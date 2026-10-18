import { Camera } from "three";

/** A camera setup. Each strategy owns its camera (and any controls) until disposed. */
interface CameraStrategy {
    readonly camera: Camera;

    /** Whether gameplay should be paused while this camera is active. */
    readonly pausesGame: boolean;

    resize(width: number, height: number): void;
    dispose(): void;
}

export default CameraStrategy;
