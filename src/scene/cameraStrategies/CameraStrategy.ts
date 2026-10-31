import { Camera, Vector3 } from "three";

/** A camera setup. Each strategy owns its camera (and any controls) until disposed. */
interface CameraStrategy {
    readonly camera: Camera;

    /** Whether gameplay should be paused while this camera is active. */
    readonly pausesGame: boolean;

    /** Called every frame with the point the game wants in view (e.g. the player's tank). */
    update?(deltaT: number, focus: Vector3): void;

    resize(width: number, height: number): void;
    dispose(): void;
}

export default CameraStrategy;
