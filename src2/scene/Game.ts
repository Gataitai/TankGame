import type { Scene } from "three";
import type Ecs from "@2/ecs/Ecs";
import type PhysicsWorld from "@2/physics/PhysicsWorld";
import type CameraManager from "@2/scene/managers/CameraManager";
import type Hud from "@2/ui/Hud";

/**
 * The handful of things that everything needs: the entity registry, the physics simulation, the
 * three.js scene, the camera and the HUD.
 *
 * World builds these once at startup and calls setGame(). Prefabs, systems and weapons reach them
 * through game() rather than importing World, which would import them straight back.
 */
export type GameContext = {
    ecs: Ecs;
    physics: PhysicsWorld;
    scene: Scene;
    camera: CameraManager;
    hud: Hud;
};

let context: GameContext | null = null;

export function setGame(next: GameContext | null): void {
    context = next;
}

export function game(): GameContext {
    if (!context) throw new Error("The game context is not set up yet");
    return context;
}
