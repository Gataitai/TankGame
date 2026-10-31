import { Camera, Vector3 } from "three";

/** Where the game wants the camera to look from, and which way. */
export type ViewTarget = {
    /** The eye position in world space. */
    position: Vector3;
    /** Turn around +Z, starting at +X. */
    yaw: number;
    /** Tilt up towards +Z. */
    pitch: number;
};

/** A camera setup. Each strategy owns its camera (and any controls) until disposed. */
interface CameraStrategy {
    readonly camera: Camera;

    /** Whether gameplay should be paused while this camera is active. */
    readonly pausesGame: boolean;

    /** Called every frame with the view the game wants (e.g. the player's eyes). */
    update?(deltaT: number, view: ViewTarget): void;

    resize(width: number, height: number): void;
    dispose(): void;
}

export default CameraStrategy;
